# Floodplain Atlas project setup

## Project at a glance

- Repository: `TablesNextJargon/floodplainatlas`, checked out at `~/floodplainatlas`.
- Public site: <https://floodplainatlas.com>.
- Stack: React, TypeScript, Vite, MapLibre, and PMTiles.
- Current coverage: Environment Agency river and sea Flood Zones 2 and 3 for England. It is not a UK-wide or property-level risk service.
- Product stance: keep copy short, neutral, and descriptive. The map can prompt questions about land and wetland change; do not claim flood zones identify historic wetlands or restoration suitability.

## Hosting and data path

Production is a Cloudflare Worker named `floodplainatlas`, attached directly to `floodplainatlas.com`. The Worker serves the built single-page app and reads flood archive objects from the private R2 bucket `floodplainatlas-data`. The bucket is not public. `/data/*` is handled by the Worker so the client can make byte-range reads without downloading the whole archive. The Vercel project is retained as a rollback deployment; it is not the production origin. The `www` hostname is not part of the configured production domain.

The R2 archive consists of the manifest `flood-zones.json` and 14 chunks. Chunk names contain the archive hash prefix `7d0c6cc226b8`. The allowlist in `worker/index.ts` is tied to that prefix and the 14-chunk count; update it whenever the archive changes. Keep the manifest and all chunks from the same build together. Verify range behavior (`206` with `Content-Range`) after deployments. The Worker rejects unknown data keys and invalid ranges.

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

- Keep the England data scope and limitations clear while considering any future Scotland, Wales, or Ireland expansion; those datasets and classification schemes must be validated separately.
- Confirm flood-data source date, licence, and required attribution with the supplier; see [data notes](flood-data-notes.md).
- Use Google Search Console for indexing, query, and coverage baselines. Keep SEO copy concise and tied to what the map actually shows.
- Manually verify the live map, satellite basemap option, map controls, and flood-data loading after production releases.
- Preserve the Google Search Console DNS verification record and unrelated Cloudflare DNS/R2 resources during infrastructure work.
