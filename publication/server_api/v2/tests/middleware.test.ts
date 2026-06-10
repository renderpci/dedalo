import { describe, test, expect } from 'bun:test';
import { withTiming } from '../src/middleware/timing';
import { withRequestId } from '../src/middleware/request-id';
import { withCompression } from '../src/middleware/compress';
import { raceWithTimeout } from '../src/middleware/timeout';
import { logRequest } from '../src/middleware/logger';
import { TimeoutError } from '../src/errors';
import { config } from '../src/config';

const ok = async () => new Response(JSON.stringify({ ok: true }), {
  headers: { 'Content-Type': 'application/json' },
});

describe('withTiming', () => {
  test('adds X-Response-Time header', async () => {
    const res = await withTiming(ok)(new Request('http://localhost/x'));
    expect(res.headers.get('X-Response-Time')).toMatch(/ms$/);
  });

  test('injects meta.response_time_ms into JSON success bodies', async () => {
    const res = await withTiming(ok)(new Request('http://localhost/x'));
    const body = await res.json() as { ok: boolean; meta: { response_time_ms: number } };
    expect(body.ok).toBe(true);
    expect(typeof body.meta.response_time_ms).toBe('number');
    expect(body.meta.response_time_ms).toBeGreaterThanOrEqual(0);
  });

  test('merges into an existing meta without clobbering', async () => {
    const handler = withTiming(async () => new Response(
      JSON.stringify({ data: [], meta: { section_id: 7, languages: ['lg-eng'] } }),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    const res = await handler(new Request('http://localhost/x'));
    const body = await res.json() as { meta: Record<string, unknown> };
    expect(body.meta.section_id).toBe(7);
    expect(body.meta.languages).toEqual(['lg-eng']);
    expect(typeof body.meta.response_time_ms).toBe('number');
  });

  test('leaves non-200 JSON bodies untouched', async () => {
    const handler = withTiming(async () => new Response(
      JSON.stringify({ title: 'Not Found' }),
      { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
    ));
    const res = await handler(new Request('http://localhost/x'));
    const body = await res.json() as Record<string, unknown>;
    expect(body.meta).toBeUndefined();
    expect(res.headers.get('X-Response-Time')).toMatch(/ms$/);
  });

  test('does not wrap JSON array bodies', async () => {
    const handler = withTiming(async () => new Response(
      JSON.stringify([1, 2, 3]),
      { headers: { 'Content-Type': 'application/json' } },
    ));
    const res = await handler(new Request('http://localhost/x'));
    expect(await res.json()).toEqual([1, 2, 3]);
  });

  test('leaves non-JSON bodies untouched', async () => {
    const handler = withTiming(async () => new Response('<html></html>', {
      headers: { 'Content-Type': 'text/html' },
    }));
    const res = await handler(new Request('http://localhost/x'));
    expect(await res.text()).toBe('<html></html>');
  });
});

describe('withRequestId', () => {
  test('adds X-Request-Id header and propagates it to the request', async () => {
    let seen: string | null = null;
    const handler = withRequestId(async (req: Request) => {
      seen = req.headers.get('x-request-id');
      return ok();
    });
    const res = await handler(new Request('http://localhost/x'));
    expect(res.headers.get('X-Request-Id')).toBeTruthy();
    expect(seen as string | null).toBe(res.headers.get('X-Request-Id'));
  });
});

describe('withCompression', () => {
  test('gzips large JSON when accepted', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(5000) });
    const handler = withCompression(async () => new Response(big, {
      headers: { 'Content-Type': 'application/json' },
    }));
    const res = await handler(new Request('http://localhost/x', {
      headers: { 'Accept-Encoding': 'gzip' },
    }));
    expect(res.headers.get('Content-Encoding')).toBe('gzip');
  });

  test('skips small responses', async () => {
    const res = await withCompression(ok)(new Request('http://localhost/x', {
      headers: { 'Accept-Encoding': 'gzip' },
    }));
    expect(res.headers.get('Content-Encoding')).toBeNull();
  });

  test('passes 304 responses through untouched', async () => {
    const handler = withCompression(async () => new Response(null, {
      status: 304,
      headers: { 'Content-Type': 'application/json' },
    }));
    const res = await handler(new Request('http://localhost/x', {
      headers: { 'Accept-Encoding': 'gzip' },
    }));
    expect(res.status).toBe(304);
  });

  test('skips non-compressible content types', async () => {
    const handler = withCompression(async () => new Response(new Uint8Array(2000), {
      headers: { 'Content-Type': 'image/png' },
    }));
    const res = await handler(new Request('http://localhost/x', {
      headers: { 'Accept-Encoding': 'gzip' },
    }));
    expect(res.headers.get('Content-Encoding')).toBeNull();
  });
});

describe('raceWithTimeout', () => {
  test('returns the handler response when fast enough', async () => {
    const res = await raceWithTimeout(new Request('http://localhost/x'), ok);
    expect(res.status).toBe(200);
  });

  test('throws TimeoutError when the handler is too slow', async () => {
    const original = config.REQUEST_TIMEOUT_MS;
    config.REQUEST_TIMEOUT_MS = 20;
    try {
      const slow = () => new Promise<Response>(resolve => setTimeout(() => resolve(new Response('late')), 200));
      await expect(raceWithTimeout(new Request('http://localhost/x'), slow)).rejects.toThrow(TimeoutError);
    } finally {
      config.REQUEST_TIMEOUT_MS = original;
    }
  });

  test('skips the race for the MCP streaming path', async () => {
    const original = config.REQUEST_TIMEOUT_MS;
    config.REQUEST_TIMEOUT_MS = 20;
    try {
      const slow = () => new Promise<Response>(resolve => setTimeout(() => resolve(new Response('stream')), 60));
      const req = new Request(`http://localhost:3100${config.BASE_PATH}${config.MCP_PATH}`);
      const res = await raceWithTimeout(req, slow);
      expect(await res.text()).toBe('stream');
    } finally {
      config.REQUEST_TIMEOUT_MS = original;
    }
  });
});

describe('logRequest', () => {
  test('does not throw for any status class', () => {
    const req = new Request('http://localhost/x?y=1', { headers: { 'x-request-id': 'r1' } });
    for (const status of [200, 404, 500]) {
      const res = new Response(null, status === 204 ? { status } : { status });
      expect(() => logRequest(req, res, 12.3)).not.toThrow();
    }
  });
});
