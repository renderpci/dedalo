/**
 * The release routes (Task 7): headers in, bundle as the raw body, closed v1|v2 table.
 * The actor rides Task 3's X-Dedalo-Actor header (one actor convention on the wire).
 * The bearer gate itself is Task 3's (tests/router.test.ts); every request here carries it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { config } from '../src/config';
import { PROBLEM_TYPE_BASE } from '../src/errors';
import { setExecForTests } from '../src/exec';
import { setInstallSeamsForTests } from '../src/releases/install';
import { apiLayout, currentRelease } from '../src/releases/store';
import { routeRequest } from '../src/router';
import { ACTOR_HEADER } from '../src/security/auth';
import { FAST_TIMING, fakeReleaseHost, makeBundle, prepareReleaseRoots, sha256Hex, V1_TREE } from './fixtures/release_host';
import { resetInstance } from './fixtures/instance';

const BASE = '/publication/host_agent';
const A = '7.0.3_aaaaaaa';
const B = '7.0.4_bbbbbbb';
const bundle = makeBundle(V1_TREE);
const sha = sha256Hex(bundle);

const host = fakeReleaseHost();
let restoreExec: () => void;
let restoreSeams: () => void;

beforeAll(() => {
  restoreExec = setExecForTests(host.exec);
  restoreSeams = setInstallSeamsForTests({ timing: FAST_TIMING, v2HealthUrl: host.healthUrl });
});
afterAll(() => {
  restoreSeams();
  restoreExec();
  host.close();
});
beforeEach(async () => {
  await resetInstance();
  await prepareReleaseRoots();
  host.reset();
});

function post(path: string, headers: Record<string, string>, body?: Uint8Array): Request {
  return new Request(`http://agent.test${BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.SERVICE_TOKEN}`, ...headers },
    body,
  });
}

function installHeaders(releaseId: string, overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [ACTOR_HEADER]: 'tester',
    'x-release-id': releaseId,
    'x-bundle-sha256': sha,
    'content-type': 'application/gzip',
    ...overrides,
  };
}

describe('POST /v1/releases/{api}', () => {
  test('installs and answers the InstallResult', async () => {
    const response = await routeRequest(post('/v1/releases/v1', installHeaders(A), bundle));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ api: 'v1', from: null, to: A, reused: false, health: 'ok' });
    expect(currentRelease('v1')).toBe(A);
  });

  test('a missing X-Dedalo-Actor is a 400 actor_missing and installs nothing', async () => {
    const headers = installHeaders(A);
    delete headers[ACTOR_HEADER];
    const response = await routeRequest(post('/v1/releases/v1', headers, bundle));
    expect(response.status).toBe(400);
    const body = (await response.json()) as { type: string; reason: string };
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}validation-error`);
    expect(body.reason).toBe('actor_missing');
    expect(await readdir(apiLayout('v1').releases)).toEqual([]);
  });

  test('a malformed release id or a non-bundle content type is a 400', async () => {
    const badId = await routeRequest(post('/v1/releases/v1', installHeaders('latest'), bundle));
    expect(badId.status).toBe(400);
    const badType = await routeRequest(post('/v1/releases/v1', installHeaders(A, { 'content-type': 'text/plain' }), bundle));
    expect(badType.status).toBe(400);
  });

  test('a refusal is a 422 release-refused problem with its reason', async () => {
    const response = await routeRequest(post('/v1/releases/v1', installHeaders(A, { 'x-bundle-sha256': 'f'.repeat(64) }), bundle));
    expect(response.status).toBe(422);
    expect(response.headers.get('content-type')).toStartWith('application/problem+json');
    const body = (await response.json()) as { type: string; reason: string };
    expect(body.type).toBe(`${PROBLEM_TYPE_BASE}release-refused`);
    expect(body.reason).toBe('sha_mismatch');
  });

  test('an api outside the closed table is a 404', async () => {
    const response = await routeRequest(post('/v1/releases/v3', installHeaders(A), bundle));
    expect(response.status).toBe(404);
  });
});

describe('POST /v1/releases/{api}/rollback', () => {
  test('takes no body, swaps back and answers {from, to}', async () => {
    await routeRequest(post('/v1/releases/v1', installHeaders(A), bundle));
    await routeRequest(post('/v1/releases/v1', installHeaders(B), bundle));
    const response = await routeRequest(post('/v1/releases/v1/rollback', { [ACTOR_HEADER]: 'tester' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ from: B, to: A });
  });

  test('requires X-Dedalo-Actor', async () => {
    const response = await routeRequest(post('/v1/releases/v1/rollback', {}));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { reason: string }).reason).toBe('actor_missing');
  });
});
