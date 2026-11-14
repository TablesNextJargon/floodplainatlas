"""Build a Scotland river and coastal flood extent archive from SEPA v3.0 GDBs."""
import argparse
from datetime import date, datetime
import json
from pathlib import Path
import subprocess
import tempfile
import time

import pyogrio
import shapely
from pyproj import Transformer

from split_flood_archive import publish

# File Geodatabase rings follow the standard winding convention, so OGR can
# classify shells and holes without full pairwise ring-topology analysis.
pyogrio.set_gdal_config_options({"OGR_ORGANIZE_POLYGONS": "ONLY_CCW"})


LAYERS = (
    ("river", "FRM_FH_RIVER_EXTENT_H", "H"),
    ("river", "FRM_FH_RIVER_EXTENT_M", "M"),
    ("river", "FRM_FH_RIVER_EXTENT_L", "L"),
    ("river", "FRM_FH_RIVER_EXTENT_M_CC", "M_CC"),
    ("coastal", "FRM_FH_COASTAL_EXTENT_H", "H"),
    ("coastal", "FRM_FH_COASTAL_EXTENT_M", "M"),
    ("coastal", "FRM_FH_COASTAL_EXTENT_L", "L"),
    ("coastal", "FRM_FH_COASTAL_EXTENT_M_CC", "M_CC"),
)
PROBABILITY = {
    "H": "High",
    "M": "Medium",
    "L": "Low",
    "M_CC": "Medium + climate change",
}
FIELDS = ["SOURCE", "METRIC", "PROB", "BAND_DESC", "GRIDCODE", "SCENARIO", "VERSION", "ISSUE_DATE"]


def iso_date(value) -> str:
    if isinstance(value, (datetime, date)):
        return value.date().isoformat() if isinstance(value, datetime) else value.isoformat()
    return str(value)[:10]


def stream_layer(path: Path, layer: str, source: str, probability: str, output, transformer, report) -> None:
    info = pyogrio.read_info(path, layer=layer)
    if info["crs"] != "EPSG:27700" or info["geometry_type"] != "MultiPolygon":
        raise ValueError(f"Unexpected source schema in {layer}: {info['crs']} {info['geometry_type']}")
    report["layer_source_counts"][layer] = {"source_features": int(info["features"]), "included_features": 0, "excluded_not_appropriate": 0, "invalid_geometries": 0}
    columns = [field for field in FIELDS if field in info["fields"]]
    with pyogrio.open_arrow(path, layer=layer, columns=columns, batch_size=1024, use_pyarrow=True) as (meta, reader):
        geometry_name = meta["geometry_name"]
        reference_values = None
        for batch in reader:
            properties = {field: batch[field].to_pylist() for field in FIELDS}
            if "REFERENCE" in batch.schema.names:
                reference_values = batch["REFERENCE"].to_pylist()
            geometries = shapely.from_wkb(batch[geometry_name].to_pylist())
            keep = [
                index for index, band in enumerate(properties["BAND_DESC"])
                if band == "Appropriate" and properties["GRIDCODE"][index] == 1
            ]
            report["layer_source_counts"][layer]["excluded_not_appropriate"] += batch.num_rows - len(keep)
            if not keep:
                continue
            geometries = geometries[keep]
            geometries = shapely.transform(geometries, transformer.transform, interleaved=False)
            valid = shapely.is_valid(geometries)
            report["layer_source_counts"][layer]["invalid_geometries"] += int((~valid).sum())
            geojson = shapely.to_geojson(geometries)
            for out_index, source_index in enumerate(keep):
                geom = geojson[out_index]
                if geom == "null":
                    continue
                props = properties
                scenario = props["SCENARIO"][source_index]
                feature_properties = {
                    "flood_zone": f"SEPA_{probability}",
                    "probability": PROBABILITY[probability],
                    "origin": source.title(),
                    "scenario": scenario,
                    "version": props["VERSION"][source_index],
                    "pub_date": iso_date(props["ISSUE_DATE"][source_index]),
                }
                if reference_values is not None:
                    feature_properties["reference"] = reference_values[source_index]
                output.write(json.dumps({
                    "type": "Feature",
                    "geometry": json.loads(geom),
                    "properties": feature_properties,
                }, separators=(",", ":")) + "\n")
                report["layer_source_counts"][layer]["included_features"] += 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("river_gdb", type=Path)
    parser.add_argument("coastal_gdb", type=Path)
    parser.add_argument("--tippecanoe", default="tippecanoe")
    parser.add_argument("--output", type=Path, default=Path("/tmp/floodplainatlas-scotland-upload-ready"))
    parser.add_argument("--temporary-root", type=Path, default=Path("/tmp"))
    args = parser.parse_args()
    river = args.river_gdb.resolve(strict=True)
    coastal = args.coastal_gdb.resolve(strict=True)
    args.output.mkdir(parents=True, exist_ok=True)
    args.temporary_root.mkdir(parents=True, exist_ok=True)
    report = {"layer_source_counts": {}}
    transformer = Transformer.from_crs("EPSG:27700", "EPSG:4326", always_xy=True)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="fpa-scotland-", dir=args.temporary_root) as temporary:
        sequence = Path(temporary) / "scotland-flood-zones.geojsonl"
        with sequence.open("w", buffering=1024 * 1024) as output:
            for source, layer, probability in LAYERS:
                path = river if source == "river" else coastal
                stream_layer(path, layer, source, probability, output, transformer, report)
        archive = Path(temporary) / "scotland-flood-zones.pmtiles"
        attribution = (
            "© SEPA 2025; this SEPA product is licensed under the Open Government Licence 3.0. "
            "Contains SEPA river and coastal Flood Map v3.0 data. See the locally hosted dataset "
            "attribution statements for third-party credits."
        )
        command = [
            args.tippecanoe, "-P", "-o", str(archive), "-l", "flood_zones",
            "-Z4", "-z12", "--no-feature-limit", "--no-tile-size-limit",
            "--no-tiny-polygon-reduction-at-maximum-zoom",
            "--include=flood_zone", "--include=probability", "--include=origin",
            "--include=scenario", "--include=version", "--include=pub_date", "--include=reference",
            f"--attribution={attribution}",
            "--name=Scotland Flood Map v3.0 river and coastal extents",
            "--description=SEPA v3.0 strategic-scale river and coastal flood extents; scenarios retain SEPA probability classes.",
            "--temporary-directory=" + temporary, "--progress-interval=10", str(sequence),
        ]
        subprocess.run(command, check=True)
        manifest = publish(archive, args.output, "scotland-flood-zones")
    print(json.dumps({
        "river_gdb": str(river),
        "river_gdb_bytes": sum(path.stat().st_size for path in river.iterdir() if path.is_file()),
        "coastal_gdb": str(coastal),
        "coastal_gdb_bytes": sum(path.stat().st_size for path in coastal.iterdir() if path.is_file()),
        "source_crs": "EPSG:27700",
        "tile_crs": "EPSG:4326",
        "release_date": "2025-02-25",
        "probability_classes": PROBABILITY,
        **report,
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
