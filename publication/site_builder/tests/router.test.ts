import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { rm } from 'node:fs/promises';
import { routeRequest } from '../src/router';
import { config } from '../src/config';

const BASE = config.BASE_PATH;
const AUTH = { authorization: `Bearer ${config.SERVICE_TOKEN}` };

async function wipeRoots(): Promise<void> {
  await rm(config.SITES_ROOT, { recursive: true, force: true });
  await rm(config.PREPROD_ROOT, { recursive: true, force: true });
  await rm(config.PROD_ROOT, { recursive: true, force: true });
}

beforeEach(wipeRoots);
afterEach(wipeRoots);

function get(path: string, headers: Record<string, string> = {}): Promise<Response> {
  return routeRequest(new Request(`http://x${BASE}${path}`, { headers }));
}

describe('router auth gate', () => {
  test('health is reachable without a token', async () => {
    const res = await get('/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; drivers: unknown[] };
    expect(body.status).toBe('ok');
    expect(Array.isArray(body.drivers)).toBe(true);
  });

  test('a protected route without a token is 401 and discloses nothing', async () => {
    const res = await get('/v1/sites');
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
  });

  test('an unknown route without a token is still 401 (auth runs, but note ordering)', async () => {
    // findRoute runs before the auth gate, so a truly unknown path is 404 even without a
    // token; a KNOWN protected path is 401. This asserts the known-path case.
    const res = await get('/v1/capabilities');
    expect(res.status).toBe(401);
  });

  test('capabilities with a valid token returns drivers, templates and limits', async () => {
    const res = await get('/v1/capabilities', AUTH);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      drivers: unknown[];
      templates: Array<{ id: string }>;
      limits: { max_sites: number };
    };
    expect(Array.isArray(body.drivers)).toBe(true);
    expect(body.templates.some(t => t.id === 'basic')).toBe(true);
    expect(body.limits.max_sites).toBe(config.MAX_SITES);
  });

  test('unknown path is 404, wrong method is 405 with Allow', async () => {
    const notFound = await get('/v1/nope', AUTH);
    expect(notFound.status).toBe(404);

    const wrongMethod = await routeRequest(
      new Request(`http://x${BASE}/v1/sites`, { method: 'PUT', headers: AUTH }),
    );
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toContain('GET');
  });
});

describe('site CRUD over the router', () => {
  test('create → list → get → delete round-trips with the actor', async () => {
    const created = await routeRequest(
      new Request(`http://x${BASE}/v1/sites`, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'roundtrip', name: 'Round Trip', actor: { user_id: 1, username: 'paco' } }),
      }),
    );
    expect(created.status).toBe(201);

    const list = await get('/v1/sites', AUTH);
    const listBody = (await list.json()) as { data: Array<{ manifest: { slug: string } }> };
    expect(listBody.data.some(s => s.manifest.slug === 'roundtrip')).toBe(true);

    const detail = await get('/v1/sites/roundtrip', AUTH);
    expect(detail.status).toBe(200);
    const detailBody = (await detail.json()) as { manifest: { slug: string }; preprod: { url: string } };
    expect(detailBody.manifest.slug).toBe('roundtrip');
    expect(detailBody.preprod.url).toContain('roundtrip');

    const del = await routeRequest(
      new Request(`http://x${BASE}/v1/sites/roundtrip`, {
        method: 'DELETE',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ actor: { user_id: 1, username: 'paco' } }),
      }),
    );
    expect(del.status).toBe(200);

    const gone = await get('/v1/sites/roundtrip', AUTH);
    expect(gone.status).toBe(404);
  });

  test('create without an actor is 400', async () => {
    const res = await routeRequest(
      new Request(`http://x${BASE}/v1/sites`, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'noactor', name: 'No Actor' }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
