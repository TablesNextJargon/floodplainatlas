"""Build a separate NRW Wales River/Sea Flood Zones 2 and 3 archive offline."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time

import ijson
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import transform

from split_flood_archive import publish


def stream_source(source: Path, origin: str, output, transformer, counts) -> None:
    with source.open('rb', buffering=1024 * 1024) as stream:
        for feature in ijson.items(stream, 'features.item'):
            properties = feature.get('properties') or {}
            risk = properties.get('risk')
            if risk not in ('Flood Zone 2', 'Flood Zone 3'):
                continue
            geometry = transform(transformer.transform, shape(feature['geometry']))
            zone = 'FZ2' if risk == 'Flood Zone 2' else 'FZ3'
            normalized = {
                'type': 'Feature',
                'geometry': mapping(geometry),
                'properties': {
                    'flood_zone': zone,
                    'origin': origin,
                    'risk': risk,
                    'mm_id': properties.get('mm_id'),
                    'pub_date': properties.get('pub_date'),
                },
            }
            output.write(json.dumps(normalized, separators=(',', ':')) + '\n')
            counts[origin] += 1


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('river_source', type=Path)
    parser.add_argument('sea_source', type=Path)
    parser.add_argument('--tippecanoe', default='tippecanoe')
    parser.add_argument('--output', type=Path, default=Path('/tmp/floodplainatlas-wales-upload-ready'))
    args = parser.parse_args()
    river = args.river_source.resolve(strict=True)
    sea = args.sea_source.resolve(strict=True)
    args.output.mkdir(parents=True, exist_ok=True)
    counts = {'River': 0, 'Sea': 0}
    transformer = Transformer.from_crs('EPSG:27700', 'EPSG:4326', always_xy=True)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='fpa-wales-') as temporary:
        sequence = Path(temporary) / 'wales-flood-zones.geojsonl'
        with sequence.open('w', buffering=1024 * 1024) as output:
            stream_source(river, 'River', output, transformer, counts)
            stream_source(sea, 'Sea', output, transformer, counts)
        archive = Path(temporary) / 'wales-flood-zones.pmtiles'
        command = [
            args.tippecanoe, '-P', '-o', str(archive), '-l', 'flood_zones',
            '-Z4', '-z12', '--no-feature-limit', '--no-tile-size-limit',
            '--no-tiny-polygon-reduction-at-maximum-zoom',
            '--include=flood_zone', '--include=origin', '--include=risk',
            '--include=mm_id', '--include=pub_date',
            '--attribution=Contains Natural Resources Wales information © Natural Resources Wales and database right. All rights reserved. Some features of this information are based on digital spatial data licensed from the UK Centre for Ecology & Hydrology © UKCEH. Defra, Met Office and DARD Rivers Agency © Crown copyright. © Cranfield University. © James Hutton Institute. Contains OS data © Crown copyright and database right.',
            '--name=Wales Flood Zones 2 and 3',
            '--description=NRW planning flood zones for rivers and the sea; includes climate-change allowances and assumes no defences.',
            '--temporary-directory=' + temporary,
            '--progress-interval=10', str(sequence),
        ]
        subprocess.run(command, check=True)
        manifest = publish(archive, args.output, 'wales-flood-zones')
        report = {
            'river_source': river.name,
            'river_source_bytes': river.stat().st_size,
            'sea_source': sea.name,
            'sea_source_bytes': sea.stat().st_size,
            'source_crs': 'EPSG:27700',
            'tile_crs': 'EPSG:4326',
            'feature_counts': counts,
            'archive_bytes': manifest['size'],
            'archive_sha256': manifest['version'],
            'chunks': manifest['chunks'],
            'source_layer': 'flood_zones',
            'min_zoom': 4,
            'max_zoom': 12,
            'source_publication_date': '2026-05-21 (verify current release before rebuilding)',
            'elapsed_seconds': round(time.monotonic() - started),
            'tippecanoe_command': command,
        }
        print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
