# Floodplain Atlas project setup

## Project at a glance

- Repository: `TablesNextJargon/floodplainatlas`, checked out at `~/floodplainatlas`.
- Public site: <https://floodplainatlas.com>.
- Stack: React, TypeScript, Vite, MapLibre, and PMTiles.
- Production shows Environment Agency river and sea Flood Zones 2 and 3 for England, Natural Resources Wales planning zones for Wales, SEPA v3.0 river/coastal extent scenarios for Scotland, and OPW current-scenario river/coastal return periods for the Republic of Ireland. Ireland coverage excludes Northern Ireland; Scotland surface-water products are not included.
- Product stance: keep copy short, neutral, and descriptive. The map can prompt questions about land and wetland change; do not claim flood zones identify historic wetlands or restoration suitability.

## Hosting and data path

Production is a Cloudflare Worker named `floodplainatlas`, attached directly to `floodplainatlas.com`. The Worker serves the built single-page app and reads flood archive objects from the private R2 bucket `floodplainatlas-data`. The bucket is not public. `/data/*` is handled by the Worker so the client can make byte-range reads without downloading the whole archive. The Vercel project is retained as a rollback deployment; it is not the production origin. Its checked-in static archive currently contains England only, so it is not a full Wales rollback. The `www` hostname is not part of the configured production domain.

The England archive uses `england-flood-zones.json` and 14 chunks with hash prefix `7d0c6cc226b8`. The Worker accepts either the old or country-prefixed England R2 object names during the rename. Wales uses `wales-flood-zones.json` and two chunks with prefix `f13a6c083270`; Scotland uses `scotland-flood-zones.json` and four chunks with prefix `1490b5ac469f`; Ireland uses `ireland-flood-zones.json` and five chunks with prefix `72c20b41734b`. `worker/index.ts` pins each hash and count. Keep each manifest with its matching chunks and verify range behavior (`206` with `Content-Range`) after deployments.

Scotland's prepared R2 package and production verification are documented in [scotland-data-notes.md](scotland-data-notes.md). Production returns the expected manifest and all four chunks; the first chunk was verified with a `206` byte-range response. Ireland's source processing, caveats and production verification are documented in [ireland-data-notes.md](ireland-data-notes.md).

R2 keeps the large data objects out of Vercel's deployment bundle, but each `/data/*` request invokes the Worker and accesses R2. Watch Cloudflare usage on the free plan; if limits are approached, consider cache behavior and delivery architecture before changing providers. Do not expose the bucket publicly as a workaround.

## Local development and release commands

Use Node.js 22.12 or newer:

```sh
npm ci
npm run dev
npm run build
npm run build:cloudflare:preview
npm run build:cloudflare:production
```

The local app runs at `http://127.0.0.1:4322`. `npm run build` is the regular Vite build and retains data files for the Vercel rollback. Cloudflare uses the explicit `preview` or `cloudflare` build mode. Website builds do not regenerate flood tiles. Read [flood data notes](flood-data-notes.md) before rebuilding or replacing the archive. The original 15.8 GB GeoJSON is local input, not a Git artifact.

## Connected services and credentials

Cloudflare CLI, Cloudflare MCP, Vercel, GitHub, Google Search Console, and OpenSEO are separate connections. A successful login to one does not refresh the others. Never write access tokens, OAuth codes, cookies, or credential files into this repository or a handoff document. Inspect the relevant connection status before using a service; request the smallest permission needed if access is missing. Search Console access is needed for query/indexing data; OpenSEO is already connected to the `floodplainatlas.com` project.

## Herdr pane and context handoff

The main project workspace is `w1`, tab `w1:t1`:

| Pane | Role | Expected directory and model |
| --- | --- | --- |
| `w1:p1` | Project lead / coordination | `~/floodplainatlas`, OpenCode, GLM-5.3-Flash Free |
| `w1:p2` | SEO and content | `~/floodplainatlas`, OpenCode, GLM-5.3-Flash Free |
| `w1:p3` | Map and data | `~/floodplainatlas`, OpenCode, GLM-5.3-Flash Free |
| `w1:p4` | Cloudflare and R2 | `~/floodplainatlas`, OpenCode, GLM-5.3-Flash Free |

Pane labels and model/runtime details can change; confirm them in Herdr before relying on this table. Older panes may remain in other workspaces with different directories and histories. Do not close, replace, or recreate those sessions as a context-refresh shortcut.

To bring an existing pane up to date, give it the repository path and ask it to read `AGENTS.md`, this file, and any relevant domain-specific notes. Context compaction is different from authentication-token renewal: compacting should keep the same session and its stored history, while credentials must be renewed through their own provider connection. Herdr does not provide a general credential-refresh command. Before asking an agent to compact, ensure durable project facts and outstanding tasks are written here or in a role handoff; never use session deletion as a refresh method.

## Current priorities and open checks

- Keep each country's data scope and limitations clear; national datasets and classification schemes must be validated and described separately.
- Wales is now part of production through a separate archive. Read [the Wales preview and deployment handoff](wales-preview-validation.md) before repeating feasibility work or changing its data.
- Scotland's local archive and combined-map UI are deployed. The live manifest reports the expected archive SHA-256 and size; all four chunks return their expected lengths and the first chunk returns a valid `206` range response. Ireland is deployed in release `49c909c`; the live manifest matches the expected SHA-256 and size, and all five chunks return valid `206` range responses.
- Confirm flood-data source date, licence, and required attribution with the supplier; see [data notes](flood-data-notes.md).
- Use Google Search Console for indexing, query, and coverage baselines. Keep SEO copy concise and tied to what the map actually shows.
- Manually verify the live map, satellite basemap option, map controls, and flood-data loading after production releases.
- Preserve the Google Search Console DNS verification record and unrelated Cloudflare DNS/R2 resources during infrastructure work.
