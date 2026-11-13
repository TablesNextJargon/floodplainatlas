# Floodplain Atlas

A static React and TypeScript map built with Vite. MapLibre renders vector
flood tiles and an optional Esri satellite basemap. Cloudflare Workers hosts
the production app at floodplainatlas.com; the private flood archive is served
from R2. Vercel remains available as a rollback deployment.

Keep product text minimal and descriptive. Do not infer historic wetlands or
restoration suitability from planning flood zones. Preserve attribution,
keyboard access, mobile controls and honest loading/error states.

The national GeoJSON stays outside this repository. `public/data/` contains
versioned chunks of a completed PMTiles archive plus its manifest. Preserve byte
identity and HTTP range support. Never load the full national archive in the
browser or regenerate tiles during a website build. The Cloudflare Worker reads
these same objects from the private `floodplainatlas-data` R2 bucket; its static
asset build must exclude `/data/` while the Vercel build keeps those files for
rollback.

Vercel remains the rollback deployment. The default `npm run build` must stay a
normal Vercel/Vite build. Cloudflare builds use the explicit `cloudflare` or
`preview` Vite mode. Cloudflare account changes require explicit user
authorization. For this migration, the user authorized the production Worker
and apex domain cutover; do not change unrelated DNS records or R2 resources.

Use `npm run build`, `npm run typecheck`, and `npm test` for checks. The browser
journey is `npm run test:browser` against a running server (default port 4322;
override `BASE_URL` for deployments). Do not edit source or run builds during
browser checks. Keep credentials and local `.vercel` state out of Git.
