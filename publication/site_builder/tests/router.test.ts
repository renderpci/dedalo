import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { routeRequest } from '../src/router';
import { config } from '../src/config';
import { writeFile } from 'node:fs/promises';
import { markerPath, provisionSite, resetInstance, siteDomain, webspaceOf } from './fixtures/instance';
import { instanceFingerprint } from '../src/security/pairing';

const BASE = config.BASE_PATH;
const AUTH = { authorization: `Bearer ${config.SERVICE_TOKEN}` };

beforeEach(resetInstance);
afterEach(resetInstance);

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

  /**
   * THE PAIRING FINGERPRINT, on the one route that answers without a token.
   *
   * The engine recomputes this from its own DEDALO_SITE_BUILDER_INSTANCE +
   * DEDALO_SITE_BUILDER_TOKEN and refuses to send anything if it differs, so this field is
   * the whole of the mutual-pairing proof on this side. What the assertions below pin is
   * that it is (a) present, (b) the exact recipe both sides implement, and (c) NOT a
   * disclosure: the body must never carry the instance name or the token in the clear,
   * or the hash would be an oracle for the half a caller does not have.
   */
  test('health carries the pairing fingerprint and neither of its inputs', async () => {
    const res = await get('/health');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.instance_fingerprint).toBe(
      instanceFingerprint(config.DEDALO_SITE_INSTANCE, config.SERVICE_TOKEN),
    );
    // A wrong instance or a wrong token must produce a DIFFERENT hex — the property the
    // engine's refusal is built on.
    expect(body.instance_fingerprint).not.toBe(
      instanceFingerprint('other-museum', config.SERVICE_TOKEN),
    );
    expect(body.instance_fingerprint).not.toBe(
      instanceFingerprint(config.DEDALO_SITE_INSTANCE, `${config.SERVICE_TOKEN}x`),
    );
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(config.SERVICE_TOKEN);
    expect(serialized).not.toContain(`"${config.DEDALO_SITE_INSTANCE}"`);
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
    // The operator's half, done first: the provisioner has made this site's webspace and
    // its two vhosts. The create names the domain that pairs the two.
    const { domain } = await provisionSite('roundtrip');
    const created = await routeRequest(
      new Request(`http://x${BASE}/v1/sites`, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'roundtrip',
          name: 'Round Trip',
          domain,
          actor: { user_id: 1, username: 'paco' },
        }),
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
    // The site's OWN draft host, not a shared base URL with the slug as a path segment.
    expect(detailBody.preprod.url).toBe(`http://pre.${siteDomain('roundtrip')}/`);

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

  test('create without a domain is 400 — a site with nowhere to publish is not a site', async () => {
    await provisionSite('nodomain');
    const res = await routeRequest(
      new Request(`http://x${BASE}/v1/sites`, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'nodomain',
          name: 'No Domain',
          actor: { user_id: 1, username: 'paco' },
        }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test('a placement refusal reaches the operator as 409 + reason, never as a bare 500', async () => {
    // S1, and the shape of the bug: `WebspaceError` was mapped by no route, so every one of
    // those carefully written sentences ("the provisioner never created a webspace for this
    // site — run provision apply") arrived as `500 Internal server error` with the detail
    // scrubbed. A refusal an operator cannot read is an outage with extra steps.
    const res = await routeRequest(
      new Request(`http://x${BASE}/v1/sites`, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'undeclared',
          name: 'Undeclared',
          domain: siteDomain('undeclared'),
          actor: { user_id: 1, username: 'paco' },
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    const body = (await res.json()) as { detail: string; reason: string; type: string };
    // The machine half the engine branches on…
    expect(body.reason).toBe('webspace_unavailable');
    // …and the human half, intact.
    expect(body.detail).toContain('site table');
    expect(body.detail).toContain('provision apply');
    expect(body.detail).not.toContain('Internal server error');
  });

  test('a delete reports the surfaces it did NOT remove', async () => {
    // The other half of the same honesty: a delete that leaves a museum's live production in
    // place (because the webspace stopped declaring itself ours) must not look like one that
    // took it down.
    const { domain } = await provisionSite('reported');
    await routeRequest(
      new Request(`http://x${BASE}/v1/sites`, {
        method: 'POST',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'reported', name: 'Reported', domain, actor: { user_id: 1, username: 'paco' } }),
      }),
    );
    await writeFile(markerPath(webspaceOf('reported')), 'museum-b\n', 'utf8');

    const del = await routeRequest(
      new Request(`http://x${BASE}/v1/sites/reported`, {
        method: 'DELETE',
        headers: { ...AUTH, 'content-type': 'application/json' },
        body: JSON.stringify({ actor: { user_id: 1, username: 'paco' } }),
      }),
    );
    expect(del.status).toBe(200);
    const body = (await del.json()) as {
      removed_surfaces: string[];
      skipped_surfaces: Array<{ surface: string; reason: string }>;
    };
    expect(body.removed_surfaces).toEqual([]);
    expect(body.skipped_surfaces[0]!.surface).toBe('preprod');
    expect(body.skipped_surfaces[0]!.reason).toContain('museum-b');
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
