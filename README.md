# Floodplain Atlas

An England, Wales and Scotland map of flood zones and a Republic of Ireland map
of current-scenario river and coastal return periods, with satellite imagery,
GB postcode search, Ireland place shortcuts and area inspection. Northern
Ireland is not covered. Built with React, TypeScript, MapLibre and Vite.
The production site is served by a Cloudflare Worker at floodplainatlas.com;
the private flood tile archive is served from R2. Vercel remains available as
the rollback deployment.

```sh
npm ci
npm run dev
```

Node 22.12 or newer is required. The local map uses port 4322.

```sh
npm run build
npm run typecheck
npm test
npm run test:browser
```

The browser check needs a Playwright Chromium installation (`npx playwright
install chromium`). Set `BASE_URL` to check a deployment. Its postcode responses
are deterministic; flood tiles, basemap and satellite imagery are real.

The 15.8 GB source GeoJSON stays outside Git. The existing PMTiles archive is
included as versioned static chunks. See [data notes](docs/flood-data-notes.md).
Rebuild data offline with `scripts/build_flood_tiles.py`; website builds never
run the conversion.

See [project operations](docs/project-operations.md) for hosting, data delivery,
connected services, and the Herdr pane handoff setup.
