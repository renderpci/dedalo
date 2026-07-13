import { describe, test, expect } from 'bun:test';
import { withHttpCache } from '../src/middleware/http-cache';
import { config } from '../src/config';

const BASE = `http://localhost:3100${config.BASE_PATH}`;

function jsonHandler(body: unknown, status = 200) {
  return async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('withHttpCache', () => {
  test('adds ETag and Cache-Control to cacheable GET responses', async () => {
    const handler = withHttpCache(jsonHandler({ data: [1, 2, 3] }));
    const res = await handler(new Request(`${BASE}/databases`));

    expect(res.status).toBe(200);
    expect(res.headers.get('ETag')).toMatch(/^W\/"[0-9a-f]+"$/);
    expect(res.headers.get('Cache-Control')).toBe(`public, max-age=${config.CACHE_MAX_AGE}`);
    expect(res.headers.get('Vary')).toBe('Accept-Encoding');
  });

  test('ETag is stable for identical bodies and changes with content', async () => {
    const handler = withHttpCache(jsonHandler({ a: 1 }));
    const first = await handler(new Request(`${BASE}/databases`));
    const second = await handler(new Request(`${BASE}/databases`));
    expect(first.headers.get('ETag')).toBe(second.headers.get('ETag'));

    const other = await withHttpCache(jsonHandler({ a: 2 }))(new Request(`${BASE}/databases`));
    expect(other.headers.get('ETag')).not.toBe(first.headers.get('ETag'));
  });

  test('returns 304 when If-None-Match matches', async () => {
    const handler = withHttpCache(jsonHandler({ a: 1 }));
    const first = await handler(new Request(`${BASE}/databases`));
    const etag = first.headers.get('ETag')!;

    const revalidated = await handler(new Request(`${BASE}/databases`, {
      headers: { 'If-None-Match': etag },
    }));
    expect(revalidated.status).toBe(304);
    expect(revalidated.headers.get('ETag')).toBe(etag);
    expect(await revalidated.text()).toBe('');
  });

  test('304 matching handles lists, strong-form tags, and *', async () => {
    const handler = withHttpCache(jsonHandler({ a: 1 }));
    const first = await handler(new Request(`${BASE}/databases`));
    const etag = first.headers.get('ETag')!;
    const strong = etag.replace(/^W\//, '');

    for (const header of [`"zzz", ${etag}`, strong, '*']) {
      const res = await handler(new Request(`${BASE}/databases`, {
        headers: { 'If-None-Match': header },
      }));
      expect(res.status).toBe(304);
    }
  });

  test('mismatched If-None-Match returns 200 with body', async () => {
    const handler = withHttpCache(jsonHandler({ a: 1 }));
    const res = await handler(new Request(`${BASE}/databases`, {
      headers: { 'If-None-Match': 'W/"deadbeef"' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ a: 1 });
  });

  test('skips non-GET requests', async () => {
    const handler = withHttpCache(jsonHandler({ a: 1 }));
    const res = await handler(new Request(`${BASE}/batch`, { method: 'POST' }));
    expect(res.headers.get('ETag')).toBeNull();
  });

  test('skips non-200 responses', async () => {
    const handler = withHttpCache(jsonHandler({ error: true }, 404));
    const res = await handler(new Request(`${BASE}/databases`));
    expect(res.headers.get('ETag')).toBeNull();
  });

  test('skips /health', async () => {
    const handler = withHttpCache(jsonHandler({ status: 'ok' }));
    const res = await handler(new Request(`${BASE}/health`));
    expect(res.headers.get('ETag')).toBeNull();
  });

  test('skips non-JSON content types', async () => {
    const handler = withHttpCache(async () => new Response(new Uint8Array([1, 2]), {
      headers: { 'Content-Type': 'image/png' },
    }));
    const res = await handler(new Request(`${BASE}/docs/swagger/x.png`));
    expect(res.headers.get('ETag')).toBeNull();
  });
});
