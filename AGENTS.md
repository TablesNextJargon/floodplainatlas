# Floodplain Atlas

A static React and TypeScript map built with Vite. MapLibre renders vector
flood tiles and an optional Esri satellite basemap. Vercel hosts the app;
Cloudflare manages the domain's DNS.

Keep product text minimal and descriptive. Do not infer historic wetlands or
restoration suitability from planning flood zones. Preserve attribution,
keyboard access, mobile controls and honest loading/error states.

The national GeoJSON stays outside this repository. `public/data/` contains
versioned chunks of a completed PMTiles archive plus its manifest. Preserve byte
identity and HTTP range support. Never load the full national archive in the
browser or regenerate tiles during a website build.

Use `npm run build`, `npm run typecheck`, and `npm test` for checks. The browser
journey is `npm run test:browser` against a running server (default port 4322;
override `BASE_URL` for deployments). Do not edit source or run builds during
browser checks. Keep credentials and local `.vercel` state out of Git.
