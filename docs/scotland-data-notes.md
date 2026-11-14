# Scotland flood map data

## Source and scope

The local inputs are SEPA's River Flood Maps v3.0 and Coastal Flood Maps v3.0
File Geodatabases. Both were released on 25 February 2025. The app uses only
the `Extent` MultiPolygon layers for high, medium, low, and medium probability
plus climate change. It does not include depth, velocity, or the separate
Surface Water & Small Watercourses products. The source documentation describes
the maps as strategic/community-scale information and cautions against
property-level use.

SEPA probabilities are retained as their own classes; they are not translated
to England or Wales planning Flood Zones. The source documentation describes
present-day return periods as high (10 years), medium (200 years), and low
(1,000 years). The medium climate-change class is a separate 2080 high-emissions
scenario. River and coastal climate scenarios use different source parameters;
the original `SCENARIO` value is retained on every tile feature and shown on
inspection.

## Attribution and licence

The source guidance states: “© SEPA 2025; this SEPA product is licenced under
the Open Government Licence 3.0.” It also requires the accompanying dataset
attribution documents to be linked locally. The site includes copies of the
river and coastal attribution PDFs at `/sources/sepa-river-attribution-v3.pdf`
and `/sources/sepa-coastal-attribution-v3.pdf`. These name third-party
contributors and their specific credits. Retain both documents with any future
release and recheck their wording when updating source data.

Official release and download page: <https://www2.sepa.org.uk/FloodData/>.

## Processing

`scripts/build_scotland_flood_tiles.py` streams the selected layers from the
File Geodatabases, retains features whose extent band is `Appropriate`,
reprojects from EPSG:27700 to WGS84, and writes vector tiles with Tippecanoe
for zooms 4–12. The four SEPA classes share one archive and remain separate by
`flood_zone`; `origin`, `scenario`, `version`, `pub_date`, and (for river
features) `reference` are retained. It then creates a SHA-256 manifest and
32 MiB chunks using `scripts/split_flood_archive.py`.

The pipeline is offline and is not part of a website build. It requires
`pyogrio` with the OpenFileGDB driver, `pyarrow`, `shapely`, `pyproj`, and
Tippecanoe. Use the report emitted by the builder to record exact feature
counts, archive size/hash, chunk names, and invalid geometry count for each
release. Do not commit the generated PMTiles or chunks; upload the generated
manifest and chunks to the root of the private `floodplainatlas-data` R2 bucket.

The tile output generalizes and clips geometry. It is for a national/regional
visual overview, not an authoritative boundary, planning decision, or
property-level assessment. Scotland's surface-water and small-watercourse
coverage is not present in this release.

## v3.0 package prepared for production

The supplied File Geodatabases contain 190,757 river extent features and 65
coastal extent features across the four classes. All selected features were
marked `Appropriate`; the builder reported zero invalid geometries. These are
conversion checks, not a review of SEPA's modelling or a property-scale
validation.

The generated PMTiles archive is 127,558,469 bytes with SHA-256
`1490b5ac469f1840547cda969d3b9504981c7d1bd1d22be99317a96ee9189312`. The
manifest and four chunks are in `/tmp/floodplainatlas-scotland-upload-ready/`.
The user uploaded those five files to the root of `floodplainatlas-data`. The
Scotland-enabled Worker and map UI are live on `floodplainatlas.com`. Production
returns this manifest with the expected SHA-256 and size; all four chunks return
their expected content lengths, and a byte-range request to chunk 000 returns
HTTP 206 with the expected `Content-Range`.
