"""Build Ireland's OPW current-scenario flood extent vector archive."""
import argparse
from datetime import date, datetime
import gzip
import json
from pathlib import Path
import subprocess
import tempfile
import time

import pyogrio
import shapely
from pyproj import Transformer

from split_flood_archive import publish

pyogrio.set_gdal_config_options({"OGR_ORGANIZE_POLYGONS": "ONLY_CCW"})

INPUTS = (
    ("cfram-river", "CFRAM river", "esds_floodmap_ext_f_c.zip", "esds_floodmap_ext_f_c", "EPSG:29903", (("0010", 10), ("0100", 100), ("1000", 1000))),
    ("nifm-river", "NIFM river", "nifm_ext_f_c.zip", "nifm_ext_f_c/nifm_ext_f_c", "EPSG:2157", (("0020", 20), ("0100", 100), ("1000", 1000))),
    ("national-coastal", "National coastal", "ncfhm_itm_ext_c_c_1000yr_200yr_10yr.zip", "NCFHM_2022_Current_Scenario_1000yr_200yr_10ry/ncfhm_itm_ext_c_c", "EPSG:2157", (("0010", 10), ("0200", 200), ("1000", 1000))),
    ("cfram-coastal", "CFRAM coastal", "esds_floodmap_ext_c_c.zip", "esds_floodmap_ext_c_c", "EPSG:29903", (("0010", 10), ("0200", 200), ("1000", 1000))),
)
RETURN_PERIODS = {10: "High · 10 yr", 20: "High · 20 yr", 100: "Medium · 100 yr", 200: "Medium · 200 yr", 1000: "Low · 1,000 yr"}
AEP_PERCENT = {10: 10.0, 20: 5.0, 100: 1.0, 200: 0.5, 1000: 0.1}


def iso_date(value) -> str:
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    return str(value)[:10] if value is not None else ""


def stream_layer(path: Path, layer: str, source: str, return_period: int, output, report) -> None:
    info = pyogrio.read_info(path)
    if info["crs"] not in ("EPSG:29903", "EPSG:2157") or info["geometry_type"] not in ("Polygon", "MultiPolygon"):
        raise ValueError(f"Unexpected source schema in {layer}: {info['crs']} {info['geometry_type']}")
    transformer = Transformer.from_crs(info["crs"], "EPSG:4326", always_xy=True)
    fields = set(info["fields"])
    id_field = next((name for name in ("UUID", "ext_id", "dm_uuid", "DM_UUID") if name in fields), None)
    date_field = "UPLOADED" if "UPLOADED" in fields else None
    report[layer] = {
        "features": int(info["features"]),
        "crs": info["crs"],
        "geometry_type": info["geometry_type"],
        "invalid_geometries": 0,
        "null_geometries": 0,
    }
    with pyogrio.open_arrow(path, batch_size=1024, use_pyarrow=True) as (meta, reader):
        geometry_name = meta.get("geometry_name") or "wkb_geometry"
        for batch in reader:
            geometries = shapely.from_wkb(batch[geometry_name].to_pylist())
            geometries = shapely.transform(geometries, transformer.transform, interleaved=False)
            valid = shapely.is_valid(geometries)
            report[layer]["invalid_geometries"] += int((~valid).sum())
            ids = batch[id_field].to_pylist() if id_field else [None] * batch.num_rows
            dates = batch[date_field].to_pylist() if date_field else [None] * batch.num_rows
            geojson = shapely.to_geojson(geometries)
            for index, geometry in enumerate(geojson):
                if geometry == "null":
                    report[layer]["null_geometries"] += 1
                    continue
                output.write(json.dumps({
                    "type": "Feature",
                    "geometry": json.loads(geometry),
                    "properties": {
                        "flood_zone": f"IE_{return_period}",
                        "return_period": return_period,
                        "probability": RETURN_PERIODS[return_period],
                        "aep_percent": AEP_PERCENT[return_period],
                        "origin": source,
                        "scenario": "Current",
                        "source_date": iso_date(dates[index]),
                        "reference": str(ids[index]) if ids[index] is not None else "",
                    },
                }, separators=(",", ":")) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_directory", type=Path)
    parser.add_argument("--tippecanoe", default="tippecanoe")
    parser.add_argument("--output", type=Path, default=Path.home() / "floodplainatlas-r2-upload" / "ireland")
    parser.add_argument("--temporary-root", type=Path, default=Path("/tmp"))
    args = parser.parse_args()
    source_directory = args.source_directory.resolve(strict=True)
    inputs = []
    for origin, label, archive, layer_prefix, expected_crs, layers in INPUTS:
        archive_path = source_directory / archive
        if not archive_path.is_file():
            raise FileNotFoundError(archive_path)
        for suffix, return_period in layers:
            shp = f"/vsizip/{archive_path}/{layer_prefix}_{suffix}.shp"
            if origin == "nifm-river":
                shp = f"/vsizip/{archive_path}/nifm_ext_f_c/nifm_ext_f_c_{suffix}.shp"
            info = pyogrio.read_info(shp)
            if info["crs"] != expected_crs:
                raise ValueError(f"{shp} expected {expected_crs}, found {info['crs']}")
            inputs.append((shp, origin, label, return_period))

    args.output.mkdir(parents=True, exist_ok=True)
    args.temporary_root.mkdir(parents=True, exist_ok=True)
    report = {}
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="fpa-ireland-", dir=args.temporary_root) as temporary:
        temporary = Path(temporary)
        sequence = temporary / "ireland-flood-zones.geojsonl.gz"
        with gzip.open(sequence, "wt", encoding="utf-8", compresslevel=1) as output:
            for shp, origin, label, return_period in inputs:
                layer = Path(shp.split("/")[-1]).stem
                print(f"Reading {label} {return_period}-year extents…", flush=True)
                stream_layer(shp, layer, label, return_period, output, report)
        archive = temporary / "ireland-flood-zones.pmtiles"
        attribution = (
            "Contains Office of Public Works information © Office of Public Works. "
            "Ireland flood extents from OPW CFRAM, NIFM and National Coastal Flood Hazard Mapping. "
            "Current-scenario strategic extents; see the Floodplain Atlas source notes."
        )
        command = [
            args.tippecanoe, "-P", "-o", str(archive), "-l", "flood_zones",
            "-Z4", "-z12", "--no-feature-limit", "--no-tile-size-limit",
            "--no-tiny-polygon-reduction-at-maximum-zoom",
            "--include=flood_zone", "--include=return_period", "--include=probability",
            "--include=aep_percent", "--include=origin", "--include=scenario",
            "--include=source_date", "--include=reference",
            f"--attribution={attribution}",
            "--name=Ireland Flood Extents (OPW current scenarios)",
            "--description=Current-scenario river and coastal flood extent layers from OPW CFRAM, NIFM and NCFHM. Separate sources and return periods are retained.",
            f"--temporary-directory={temporary}", "--progress-interval=10", str(sequence),
        ]
        subprocess.run(command, check=True)
        manifest = publish(archive, args.output, "ireland-flood-zones")
    print(json.dumps({
        "source_directory": str(source_directory),
        "source_crs": ["EPSG:29903", "EPSG:2157"],
        "tile_crs": "EPSG:4326",
        "scenario": "Current",
        "layer_counts": report,
        "archive_bytes": manifest["size"],
        "archive_sha256": manifest["version"],
        "chunks": manifest["chunks"],
        "source_layer": "flood_zones",
        "min_zoom": 4,
        "max_zoom": 12,
        "elapsed_seconds": round(time.monotonic() - started),
        "tippecanoe_command": command,
    }, indent=2))


if __name__ == "__main__":
    main()
