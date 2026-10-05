/**
 * The four media routes (src/routes/media.ts): the router's gate on this suite's
 * MEDIA_MODE=shared agent (every media route 409 media_mode), the HTTP shapes through the
 * route factories over a copy target, and the Bun.serve body cap a copy host needs.
 * Generic `test` TLD names only.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { requestBodyCap } from '../src/boot';
import { config } from '../src/config';
import type { CopyTarget } from '../src/media/copy';
import { MAX_MEDIA_FILE_BYTES } from '../src/media/grammar';
import { resetShaIndexForTests } from '../src/media/sha_index';
import { BASE_PATH, type RouteHandler, routeRequest } from '../src/router';
import {
  MAX_DELETE_BODY_BYTES,
  mediaDeleteRoute,
  mediaManifestRoute,
  mediaMarkRoute,
  mediaPutRoute,
} from '../src/routes/media';
import { ACTOR_HEADER } from '../src/security/auth';
import { problem } from '../src/util/response';
import { resetInstance, roots } from './fixtures/instance';

const ROOT = roots.mediaRoot as string;
const COPY: CopyTarget = { mode: 'copy', root: ROOT };
const AUTH = { authorization: `Bearer ${config.SERVICE_TOKEN}` };
const ACTOR = { [ACTOR_HEADER]: 'tester' };
const P1 = 'image/1.5MB/0/test99_test3_1.jpg';
const K1 = 'test3_1';

function sha(text: string): string {
  return new Bun.CryptoHasher('sha256').update(text).digest('hex');
}

function request(method: string, path: string, headers: Record<string, string> = {}, body: string | null = null): Request {
  return new Request(`http://agent.test${path}`, { method, headers, body });
}

function putRequest(path: string, text: string, headers: Record<string, string> = ACTOR, prefix = ''): Request {
  return request(
    'PUT',
    `${prefix}/v1/media/file?path=${encodeURIComponent(path)}`,
    { ...headers, 'x-sha256': sha(text), 'x-size': String(Buffer.byteLength(text)), 'content-type': 'application/octet-stream' },
    text,
  );
}

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = ACTOR): Request {
  return request('POST', path, { ...headers, 'content-type': 'application/json' }, typeof body === 'string' ? body : JSON.stringify(body));
}

/** Call a handler the way the router does: a throw becomes its problem document. */
async function call(handler: RouteHandler, req: Request): Promise<Response> {
  try {
    return await handler(req, new URL(req.url));
  } catch (error) {
    return problem(error);
  }
}

async function reasonOf(res: Response): Promise<unknown> {
  return ((await res.json()) as { reason?: unknown }).reason;
}

beforeEach(async () => {
  await resetInstance();
  resetShaIndexForTests();
});

describe("through the router: this suite's agent is MEDIA_MODE=shared", () => {
  test('every media route answers 409 media_mode, after the bearer and before any work', async () => {
    expect(config.MEDIA_MODE).toBe('shared');
    const probes = [
      putRequest(P1, 'bytes', { ...AUTH, ...ACTOR }, BASE_PATH),
      jsonRequest(`${BASE_PATH}/v1/media/delete`, { paths: [P1] }, { ...AUTH, ...ACTOR }),
      jsonRequest(`${BASE_PATH}/v1/media/mark`, { key: K1, published: true }, { ...AUTH, ...ACTOR }),
      request('GET', `${BASE_PATH}/v1/media/manifest`, AUTH),
    ];
    for (const probe of probes) {
      const res = await routeRequest(probe);
      expect({ url: probe.url, status: res.status }).toEqual({ url: probe.url, status: 409 });
      expect(await reasonOf(res)).toBe('media_mode');
    }
    expect(existsSync(join(ROOT, '.publication'))).toBe(false);
  });

  test('without the bearer a media route is the same 401 as an unknown path', async () => {
    const unknown = await (await routeRequest(request('GET', `${BASE_PATH}/v1/nope`))).text();
    const put = await routeRequest(putRequest(P1, 'bytes', ACTOR, BASE_PATH));
    const manifest = await routeRequest(request('GET', `${BASE_PATH}/v1/media/manifest`));
    expect([put.status, manifest.status]).toEqual([401, 401]);
    expect(await put.text()).toBe(unknown);
    expect(await manifest.text()).toBe(unknown);
  });
});

describe('the routes over a copy target', () => {
  const put = mediaPutRoute(COPY);
  const del = mediaDeleteRoute(COPY);
  const mark = mediaMarkRoute(COPY);
  const manifest = mediaManifestRoute(COPY);

  test('mark → PUT (path in the query; sha, size, actor in headers) → manifest', async () => {
    const marked = await call(mark, jsonRequest('/v1/media/mark', { key: K1, published: true }));
    expect(marked.status).toBe(200);
    expect(await marked.json()).toEqual({ key: K1, published: true, changed: true });
    const landed = await call(put, putRequest(P1, 'jpeg'));
    expect(landed.status).toBe(200);
    expect(await landed.json()).toEqual({ path: P1, key: K1, size: 4, sha256: sha('jpeg'), replaced: false, unchanged: false });
    const page = await call(manifest, request('GET', '/v1/media/manifest'));
    expect(await page.json()).toEqual({
      entries: [{ path: P1, size: 4, sha256: sha('jpeg') }],
      irregular: [],
      markers: [K1],
      next: null,
    });
  });

  test('PUT without the actor is 400 actor_missing; a malformed X-Size is 400 body_invalid', async () => {
    const noActor = await call(put, putRequest(P1, 'jpeg', {}));
    expect(noActor.status).toBe(400);
    expect(await reasonOf(noActor)).toBe('actor_missing');
    const badSize = await call(
      put,
      request('PUT', `/v1/media/file?path=${encodeURIComponent(P1)}`, { ...ACTOR, 'x-sha256': sha('jpeg'), 'x-size': '4.0' }, 'jpeg'),
    );
    expect(badSize.status).toBe(400);
    expect(await reasonOf(badSize)).toBe('body_invalid');
  });

  test('POST delete takes {paths}; a body that is not a JSON object, or is too large, is 400', async () => {
    await call(mark, jsonRequest('/v1/media/mark', { key: K1, published: true }));
    await call(put, putRequest(P1, 'jpeg'));
    const deleted = await call(del, jsonRequest('/v1/media/delete', { paths: [P1] }));
    expect(await deleted.json()).toEqual({ deleted: [P1], absent: [], failed: [] });
    for (const body of ['not json', '[]', '"x"', '']) {
      const res = await call(del, jsonRequest('/v1/media/delete', body));
      expect({ body, status: res.status }).toEqual({ body, status: 400 });
    }
    const huge = await call(del, jsonRequest('/v1/media/delete', { paths: ['x'.repeat(MAX_DELETE_BODY_BYTES)] }));
    expect(huge.status).toBe(400);
  });

  test('POST mark refuses a key the grammar cannot produce (422 key_invalid)', async () => {
    const res = await call(mark, jsonRequest('/v1/media/mark', { key: '../etc', published: true }));
    expect(res.status).toBe(422);
    expect(await reasonOf(res)).toBe('key_invalid');
  });

  test('GET manifest validates limit and cursor, and pages with next', async () => {
    await call(mark, jsonRequest('/v1/media/mark', { key: K1, published: true }));
    const paths = ['av/404/test95_test3_1.mp4', 'image/1.5MB/0/test99_test3_1.jpg', 'image/thumb/0/test99_test3_1.jpg'];
    for (const path of paths) expect((await call(put, putRequest(path, path))).status).toBe(200);
    type Page = { entries: { path: string }[]; irregular: string[]; markers: string[]; next: string | null };
    const first = (await (await call(manifest, request('GET', '/v1/media/manifest?limit=2'))).json()) as Page;
    expect(first.entries.map(e => e.path)).toEqual(paths.slice(0, 2));
    expect(first.irregular).toEqual([]);
    expect(first.markers).toEqual([K1]);
    expect(first.next).not.toBeNull();
    const second = (await (await call(manifest, request('GET', `/v1/media/manifest?limit=2&cursor=${first.next}`))).json()) as Page;
    expect(second.entries.map(e => e.path)).toEqual(paths.slice(2));
    expect(second.markers).toEqual([]);
    expect(second.next).toBeNull();
    for (const query of ['limit=0', 'limit=abc', 'limit=5001', 'cursor=..%2Fx']) {
      const res = await call(manifest, request('GET', `/v1/media/manifest?${query}`));
      expect({ query, status: res.status }).toEqual({ query, status: 400 });
    }
  });
});

describe('requestBodyCap', () => {
  test('a copy host accepts a media file larger than a bundle; every other host keeps the bundle cap', () => {
    expect(requestBodyCap({ MAX_BUNDLE_BYTES: 1000, MEDIA_MODE: 'copy' })).toBe(MAX_MEDIA_FILE_BYTES);
    expect(requestBodyCap({ MAX_BUNDLE_BYTES: 1000, MEDIA_MODE: 'shared' })).toBe(1000);
    expect(requestBodyCap({ MAX_BUNDLE_BYTES: 1000 })).toBe(1000);
    expect(requestBodyCap({ MAX_BUNDLE_BYTES: MAX_MEDIA_FILE_BYTES * 2, MEDIA_MODE: 'copy' })).toBe(MAX_MEDIA_FILE_BYTES * 2);
  });
});
