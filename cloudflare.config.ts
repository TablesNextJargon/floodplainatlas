import { bindings, defineConfig } from 'cf/config';
import * as entrypoint from './worker/index.ts' with { type: 'cf-worker' };

export default defineConfig(({ mode }) => {
  const preview = mode === 'preview';

  return {
    worker: {
      name: preview ? 'floodplainatlas-preview' : 'floodplainatlas',
      entrypoint,
      compatibilityDate: '2026-11-13',
      workersDev: true,
      assets: {
        notFoundHandling: 'single-page-application',
        runWorkerFirst: ['/data/*'],
      },
      env: {
        ASSETS: bindings.assets(),
        FLOOD_DATA: bindings.r2({ name: 'floodplainatlas-data' }),
      },
      ...(preview ? {} : { domains: ['floodplainatlas.com'] }),
      observability: {
        enabled: true,
        logs: { enabled: true, headSamplingRate: 0.01 },
        traces: { enabled: true, headSamplingRate: 0.01 },
      },
    },
  };
});
