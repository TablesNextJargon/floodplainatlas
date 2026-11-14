"""Publish a completed PMTiles archive as versioned 32 MiB static chunks.

Keeps each tracked asset below GitHub's per-file limit. The browser still uses
HTTP byte ranges and never joins or downloads the whole archive.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path


def publish(source, destination, prefix='flood-zones'):
    if not prefix or any(ch not in 'abcdefghijklmnopqrstuvwxyz0123456789-' for ch in prefix):
        raise ValueError('Prefix must contain lowercase letters, digits, and hyphens')
    with source.open('rb') as archive:
        if archive.read(8) != b'PMTiles\x03':
            raise ValueError('Expected a completed PMTiles v3 archive')
    with source.open('rb') as archive:
        digest = hashlib.file_digest(archive, 'sha256').hexdigest()
    chunk_size = 32 * 1024 * 1024
    destination.mkdir(parents=True, exist_ok=True)
    chunks = []
    with source.open('rb') as archive:
        while block := archive.read(chunk_size):
            name = f'{prefix}-{digest[:12]}-{len(chunks):03}.bin'
            temporary = destination / (name + '.tmp')
            temporary.write_bytes(block)
            os.replace(temporary, destination / name)
            chunks.append(name)
    manifest = {'version': digest, 'size': source.stat().st_size,
                'chunkSize': chunk_size, 'chunks': chunks}
    temporary = destination / f'{prefix}.json.tmp'
    temporary.write_text(json.dumps(manifest, indent=2) + '\n')
    os.replace(temporary, destination / f'{prefix}.json')
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    parser.add_argument('--output', type=Path, default=Path('public/data'))
    parser.add_argument('--prefix', default='flood-zones')
    args = parser.parse_args()
    print(json.dumps(publish(args.archive, args.output, args.prefix), indent=2))
