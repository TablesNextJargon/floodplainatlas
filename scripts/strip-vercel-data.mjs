import { rmSync } from 'node:fs';
import { resolve } from 'node:path';

// The Vercel rollback fetches the private archive through the R2-backed
// Cloudflare Worker rewrite in vercel.json. Keep static tile archives out of
// Vercel's build output while preserving them for local Vite development.
rmSync(resolve('dist/data'), { recursive: true, force: true });
console.log('Removed static flood archives from the Vercel build output.');
