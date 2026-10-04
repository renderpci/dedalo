import { describe, expect, test } from 'bun:test';
import { config } from '../src/config';
import { BASE_PATH, ROUTES, isPublicRequest, routePath, routeRequest } from '../src/router';
import { instanceFingerprint } from '../src/security/pairing';

const AUTH = { authorization: `Bearer ${config.SERVICE_TOKEN}` };

function call(method: string, path: string, headers: Record<string, string> = {}): Promise<Response> {
  return routeRequest(new Request(`http://x${path}`, { method, headers }));
}

describe('the closed route table', () => {
  test('is exactly the §6 command set, nothing else', () => {
    expect(BASE_PATH).toBe('/publication/host_agent');
    expect(ROUTES.map(r => `${r.method} ${r.path} ${r.command}${r.public ? ' public' : ''}`)).toEqual([
      'GET /health health public',
      'GET /v1/status status',
      'GET /v1/media/probe media.probe',
      'POST /v1/rules/apply rules.apply',
      'POST /v1/releases/v1 release.install',
      'POST /v1/releases/v2 release.install',
      'POST /v1/releases/v1/rollback release.rollback',
      'POST /v1/releases/v2/rollback release.rollback',
    ]);
    expect(Object.isFrozen(ROUTES)).toBe(true);
  });

  test('no route path carries a parameter', () => {
    for (const r of ROUTES) expect(r.path).toMatch(/^(\/[a-z0-9_]+)+$/);
  });

  test('public is derived from the table, method included', () => {
    expect(isPublicRequest('GET', '/health')).toBe(true);
    expect(isPublicRequest('POST', '/health')).toBe(false);
    expect(isPublicRequest('GET', '/v1/status')).toBe(false);
    expect(isPublicRequest('GET', null)).toBe(false);
  });

  test('BASE_PATH is required and peeled exactly', () => {
    expect(routePath(`${BASE_PATH}/health`)).toBe('/health');
    expect(routePath(BASE_PATH)).toBe('/');
    expect(routePath('/health')).toBeNull();
    expect(routePath(`${BASE_PATH}x/health`)).toBeNull();
  });
});

describe('the gate runs before the matcher', () => {
  test('no unauthenticated request can be told from any other (401 = 404 = 405)', async () => {
    const probes = [
      ['GET', `${BASE_PATH}/v1/nope`],
      ['GET', `${BASE_PATH}/v1/status`],
      ['PUT', `${BASE_PATH}/v1/status`],
      ['POST', `${BASE_PATH}/health`],
      ['GET', '/health'],
      ['GET', `${BASE_PATH}/v1/releases/v3`],
    ] as const;
    const answers = await Promise.all(
      probes.map(async ([method, path]) => {
        const res = await call(method, path);
        return {
          status: res.status,
          allow: res.headers.get('allow'),
          contentType: res.headers.get('content-type'),
          body: await res.text(),
        };
      }),
    );
    for (const [index, answer] of answers.entries()) {
      expect({ probe: probes[index], ...answer }).toEqual({
        probe: probes[index],
        status: 401,
        allow: null,
        contentType: 'application/problem+json; charset=utf-8',
        body: answers[0]!.body,
      });
    }
  });

  test('a wrong token is 401 on every path too', async () => {
    const bad = { authorization: `Bearer ${'y'.repeat(40)}` };
    expect((await call('GET', `${BASE_PATH}/v1/nope`, bad)).status).toBe(401);
    expect((await call('GET', `${BASE_PATH}/v1/status`, bad)).status).toBe(401);
  });

  test('with the token: unknown is 404, wrong verb is 405 with Allow', async () => {
    expect((await call('GET', `${BASE_PATH}/v1/nope`, AUTH)).status).toBe(404);
    expect((await call('GET', '/v1/status', AUTH)).status).toBe(404);
    const wrong = await call('PUT', `${BASE_PATH}/v1/status`, AUTH);
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('GET');
  });

  // Task 7 deletes this test together with router.ts notYetBuilt.
  test('an unbuilt command answers a 500 naming it', async () => {
    const res = await call('POST', `${BASE_PATH}/v1/releases/v2/rollback`, AUTH);
    expect(res.status).toBe(500);
    expect(((await res.json()) as { detail: string }).detail).toContain("'release.rollback'");
  });
});

describe('GET /health', () => {
  test('is public and carries the fingerprint and neither of its inputs', async () => {
    const res = await call('GET', `${BASE_PATH}/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toEqual({
      status: 'ok',
      service: 'dedalo-publication-host-agent',
      instance_fingerprint: instanceFingerprint(config.INSTANCE, config.SERVICE_TOKEN),
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(config.SERVICE_TOKEN);
    expect(serialized).not.toContain(`"${config.INSTANCE}"`);
  });
});
