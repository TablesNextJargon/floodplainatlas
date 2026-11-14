# Wales local preview and production handoff

## What has already been validated

The source layer is [NRW Flood Map for Planning: Flood Zones 2 and 3](https://datamap.gov.wales/layergroups/inspire-nrw:FloodMapforPlanningFloodZones2and3/metadata_detail).
Its metadata lists the Open Government Licence, publication date 21 May 2026,
EPSG:27700, and a required attribution statement naming NRW and the third-party
contributors. NRW says the planning map is updated in May and November and its
zones include climate-change allowances. Recheck the source publication and
attribution before future rebuilds.

A temporary local preview at `http://127.0.0.1:4323/` rendered Natural Resources
Wales river and sea planning Flood Zones 2 and 3. The conversion streamed
324,163 river features and 30,743 sea features, reprojected the data from
EPSG:27700 to WGS84, and wrote local vector tiles. The preview confirmed that
tiles loaded in the browser without browser errors and exposed River/Sea and
zone controls. This confirms local conversion and visual rendering; it is not
full source-data QA, production integration, or permission to redistribute.

Temporary artifacts (not repository assets):

- Archive: `/tmp/wales-preview.pmtiles`
- Size: 41,974,684 bytes
- SHA-256: `5fff7f688ee9f763d11a8d37a84810056d2f08146453a6e7f6249cbc1ef84b9b`
- Conversion notes/script and intermediate data: `/tmp/wales-preview-convert.py`
  and `/tmp/wales-preview.ndjson`
- Downloaded sources: `~/Downloads/features(1).json` (River) and
  `~/Downloads/wales-sea-flood-zones-epsg27700.geojson` (Sea).

The preview used separate River and Sea records, normalized zone values to
`FZ2`/`FZ3`, and kept a source field. Wales planning zones include climate-change
allowances and must be described separately from England's EA zones.

The source-processing pipeline and lazy Wales source selection are deployed.
The generated PMTiles header reports bounds `[-5.353493, 51.377862,
-2.6497989, 53.430997]`, confirming the archive covers Wales despite the
metadata's `Region=Global` label. It contains 324,163 River and 30,743 Sea
features; each feature retains its `pub_date` for inspection. Wales Zone 2 is
0.1% to under 1% annual chance for rivers and 0.1% to under 0.5% for the sea;
Zone 3 is at least 1% for rivers and 0.5% for the sea. These thresholds include
climate-change allowances.

The source metadata lists OGL. The app's data details and the PMTiles
attribution carry the full NRW statement and link to the licence. This is a
separate planning layer from England's present-day EA zones. The Wales package
is live on the production Worker, with its manifest and chunks served through
the pinned allowlist. The user should manually inspect the live map.

## R2 package and deployment

The production package was prepared in
`/tmp/floodplainatlas-wales-upload-ready/`. Its 41,971,297-byte archive has
SHA-256 `f13a6c083270f40ec4d6287fea41bfebb40ad8a0c576abe45585897b8e201dc6`.
The manifest and chunks were reassembled and verified against that hash.

Upload these three objects to the **root** of the private R2 bucket
`floodplainatlas-data`:

- `wales-flood-zones.json`
- `wales-flood-zones-f13a6c083270-000.bin`
- `wales-flood-zones-f13a6c083270-001.bin`

The user uploaded this set to R2. The Cloudflare pane then deployed the app and
Worker support (production tags `wales-enable` and `wales-harden`) and checked
Wales manifest/range responses plus England manifest/chunk responses. Wrong
Wales hashes and out-of-range chunk indexes return 404. Do not upload the
earlier `wales-preview.pmtiles`, preview package, source GeoJSON, NDJSON,
screenshot, or converter script.

The repeatable local production builder is
`scripts/build_wales_flood_tiles.py`. It takes the River and Sea source files,
reprojects and normalizes them, creates PMTiles, then writes the manifest and
chunks to `/tmp/floodplainatlas-wales-upload-ready/`. Check the NRW publication
date before each rebuild because the source is refreshed twice yearly. Required
Python packages are `ijson`, `pyproj`, and `shapely`; Tippecanoe 2.79 or later
is also required.
