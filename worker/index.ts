/// <reference path="../.cloudflare/types/index.d.ts" />

const MANIFEST_KEYS = new Set(['flood-zones.json', 'wales-flood-zones.json']);
const CHUNK_COUNT = 14;
const WALES_CHUNK_PREFIX = 'f13a6c083270';
const WALES_CHUNK_COUNT = 2;

interface ByteRange {
  start: number;
  end: number;
}

const cacheControlFor = (key: string): string =>
  MANIFEST_KEYS.has(key)
    ? 'public, max-age=3600'
    : 'public, max-age=31536000, immutable';

const parseRange = (header: string, size: number): ByteRange | null => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
};

const isAllowedKey = (key: string): boolean => {
  if (MANIFEST_KEYS.has(key)) return true;
  const england = /^flood-zones-7d0c6cc226b8-(\d{3})\.bin$/.exec(key);
  if (england) return Number(england[1]) < CHUNK_COUNT;
  const wales = new RegExp(
    `^wales-flood-zones-${WALES_CHUNK_PREFIX}-(\\d{3})\\.bin$`,
  ).exec(key);
  return Boolean(wales && Number(wales[1]) < WALES_CHUNK_COUNT);
};

const errorResponse = (status: number, headers?: HeadersInit): Response =>
  new Response(null, { status, headers });

const serveFloodData = async (
  request: Request,
  bucket: R2Bucket,
  key: string,
): Promise<Response> => {
  if (!isAllowedKey(key)) return errorResponse(404);
  if (request.method === 'OPTIONS') {
    return errorResponse(204, { Allow: 'GET, HEAD, OPTIONS' });
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return errorResponse(405, { Allow: 'GET, HEAD' });
  }

  const headersFor = (size: number, etag: string): Headers => new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControlFor(key),
    'Content-Length': String(size),
    'Content-Type': MANIFEST_KEYS.has(key) ? 'application/json; charset=utf-8' : 'application/octet-stream',
    ETag: etag,
  });

  if (request.method === 'HEAD') {
    const object = await bucket.head(key);
    if (!object) return errorResponse(404);
    return new Response(null, { headers: headersFor(object.size, object.httpEtag) });
  }

  const rangeHeader = request.headers.get('Range');
  if (!rangeHeader) {
    const fullObject = await bucket.get(key);
    if (!fullObject?.body) return errorResponse(404);
    return new Response(fullObject.body, {
      headers: headersFor(fullObject.size, fullObject.httpEtag),
    });
  }

  const object = await bucket.head(key);
  if (!object) return errorResponse(404);
  const range = parseRange(rangeHeader, object.size);
  if (!range) {
    const headers = headersFor(object.size, object.httpEtag);
    headers.set('Content-Range', `bytes */${object.size}`);
    headers.delete('Content-Length');
    return new Response(null, { status: 416, headers });
  }

  const length = range.end - range.start + 1;
  const rangedObject = await bucket.get(key, {
    range: { offset: range.start, length },
  });
  if (!rangedObject?.body) return errorResponse(404);

  const headers = headersFor(object.size, object.httpEtag);
  headers.set('Content-Length', String(length));
  headers.set('Content-Range', `bytes ${range.start}-${range.end}/${object.size}`);
  return new Response(rangedObject.body, { status: 206, headers });
};

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/data/')) {
      if (url.pathname.includes('%') || url.pathname.slice(6).includes('/')) {
        return errorResponse(404);
      }
      return serveFloodData(request, env.FLOOD_DATA, url.pathname.slice(6));
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
