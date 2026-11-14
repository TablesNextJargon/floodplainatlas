# Republic of Ireland flood data

## Sources and scope

Four OPW catalogue downloads are combined into one vector-tile archive:

- Community-scale CFRAM river current extents (`esds_floodmap_ext_f_c.zip`): 10, 100 and 1,000 year.
- NIFM river current extents (`nifm_ext_f_c.zip`): 20, 100 and 1,000 year.
- National Coastal Flood Hazard Mapping current extents (`ncfhm_itm_ext_c_c_1000yr_200yr_10yr.zip`): 10, 200 and 1,000 year.
- Community-scale CFRAM coastal current extents (`esds_floodmap_ext_c_c.zip`): 10, 200 and 1,000 year.

These are separate source products and return-period scenarios. They are not dissolved into one classification. The combined map shows one selected return-period category at a time for Ireland. Source names and references remain in feature properties. Data covers the Republic of Ireland only; no Northern Ireland dataset is included.

The products publish different return periods: 10-year combines the available CFRAM river and coastal plus national coastal products; 20-year is NIFM river only; 100-year combines CFRAM and NIFM river; 200-year combines the national and CFRAM coastal products; and 1,000-year combines all four products. Shared map colors are a visual grouping by source probability labels (High versus Medium/Low), not a claim that Irish return periods and UK Flood Zone classifications are equivalent.

OPW gave permission for adaptation and public hosting, as confirmed by the project owner. Archive attribution is `Contains Office of Public Works information © Office of Public Works.` See the [OPW data catalogue](https://www.floodinfo.ie/open-spatial-data-portal/data-catalogue/) and [flood mapping portal](https://www.floodinfo.ie/map/floodmaps/).

## Conversion

`scripts/build_ireland_flood_tiles.py` reads the source shapefiles directly from ZIP archives using GDAL/Pyogrio, reprojects EPSG:29903 and EPSG:2157 to EPSG:4326, and writes vector tiles for zooms 4–12 with source layer `flood_zones`. It retains return period, annual exceedance probability, source, scenario, source date and feature reference. It does not run as part of the website build.

The converted build contains 535,003 source features. The PMTiles archive is 141,438,789 bytes with SHA-256 `72c20b41734b5b1309d45f8c33389c03dce465b5fcabb904d8543503b3db092b`. Five 32 MiB-or-smaller chunks and a manifest are in `/home/hadow/floodplainatlas-r2-upload/ireland/`.

During conversion, GDAL corrected ring winding while reading. Shapely reported 7,014 invalid geometries among the source features and no null geometries. Tippecanoe accepted all features, but invalid source shapes were not repaired or individually reviewed. This should be considered when interpreting boundaries; the national-scale map is not a property-level or parcel-boundary assessment. The local archive has not yet been uploaded or deployed.

## R2 upload bundle

Upload these six files to the root of the private `floodplainatlas-data` bucket, keeping their names unchanged:

1. `ireland-flood-zones.json`
2. `ireland-flood-zones-72c20b41734b-000.bin`
3. `ireland-flood-zones-72c20b41734b-001.bin`
4. `ireland-flood-zones-72c20b41734b-002.bin`
5. `ireland-flood-zones-72c20b41734b-003.bin`
6. `ireland-flood-zones-72c20b41734b-004.bin`

The Worker allowlist pins the manifest key, hash prefix and five chunk indexes. After upload, verify the manifest size/version and byte ranges before deploying the app. Do not upload the source ZIP archives.
