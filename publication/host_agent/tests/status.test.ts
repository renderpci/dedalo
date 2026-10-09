/**
 * GET /v1/status — AgentStatus assembled from the REAL release store (Task 6) and the REAL
 * rules module (Task 5) over the scratch state root; no stubs, so a layout or stamp change
 * in those modules is seen here.
 */
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import packageJson from '../package.json';
import { config, setV2OnlyForTests } from '../src/config';
import { probeMedia } from '../src/media/probe';
import { apiLayout, promote } from '../src/releases/store';
import { AGENT_VERSION, STATUS_APIS, buildStatus, stateRootFreeBytes, type AgentStatus } from '../src/routes/status';
import { routeRequest } from '../src/router';
import { instanceFingerprint } from '../src/security/pairing';
import { setRulesDepsForTests } from '../src/rules/apply';
import { resetInstance, roots, scratchPath } from './fixtures/instance';

const BASE = '/publication/host_agent';
const AUTH = { authorization: `Bearer ${config.SERVICE_TOKEN}` };

beforeEach(resetInstance);
afterEach(resetInstance);

async function getStatus(): Promise<AgentStatus> {
  const res = await routeRequest(new Request(`http://localhost${BASE}/v1/status`, { headers: AUTH }));
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  return (await res.json()) as AgentStatus;
}

async function plantRelease(api: 'v1' | 'v2', releaseId: string): Promise<void> {
  await mkdir(join(apiLayout(api).releases, releaseId), { recursive: true });
}

describe('GET /v1/status', () => {
  test('is behind the bearer', async () => {
    const res = await routeRequest(new Request(`http://localhost${BASE}/v1/status`));
    expect(res.status).toBe(401);
  });

  test('a fresh instance: identity, no releases, no rules, measured media and disk', async () => {
    const body = await getStatus();
    expect(body.agent_version).toBe(packageJson.version);
    expect(AGENT_VERSION).toBe(packageJson.version);
    expect(body.bun_version).toBe(Bun.version);
    expect(body.platform).toBe(`${process.platform}-${process.arch}`);
    expect(body.instance_fingerprint).toBe(instanceFingerprint(config.INSTANCE, config.SERVICE_TOKEN));
    expect(Object.keys(body.apis).sort()).toEqual([...STATUS_APIS].sort());
    expect(body.apis).toEqual({
      v1: { current: null, previous: null },
      v2: { current: null, previous: null },
    });
    // The suite is an Apache host: the host-wide nginx map is not this host's (rules.map null).
    expect(body.rules).toEqual({ server: config.WEB_SERVER, hash: null, map: null });
    expect(body.media).toEqual(await probeMedia());
    expect(Number.isSafeInteger(body.disk.state_root_free_bytes)).toBe(true);
    expect(body.disk.state_root_free_bytes).toBeGreaterThan(0);
  });

  test('never publishes the instance name or the token', async () => {
    const body = await getStatus();
    expect(Object.keys(body)).not.toContain('instance');
    expect(JSON.stringify(body)).not.toContain(config.SERVICE_TOKEN);
  });

  test('current and previous come from the release store', async () => {
    await plantRelease('v2', '7.0.1_aaaaaaa');
    await plantRelease('v2', '7.0.2_bbbbbbb');
    await promote('v2', '7.0.1_aaaaaaa');
    await promote('v2', '7.0.2_bbbbbbb');

    const body = await getStatus();
    expect(body.apis.v2).toEqual({ current: '7.0.2_bbbbbbb', previous: '7.0.1_aaaaaaa' });
    expect(body.apis.v1).toEqual({ current: null, previous: null });
  });

  test('served_apis: v1 and v2 with PHP_BIN; v2 only without — the v1 slot then empty, never read from disk', async () => {
    expect((await getStatus()).served_apis).toEqual(['v1', 'v2']);
    // A v1 release on disk is not reported by a host that does not serve v1.
    await plantRelease('v1', '7.0.1_aaaaaaa');
    await promote('v1', '7.0.1_aaaaaaa');
    expect((await getStatus()).apis.v1.current).toBe('7.0.1_aaaaaaa');
    const restore = setV2OnlyForTests(true);
    try {
      const body = await getStatus();
      expect(body.served_apis).toEqual(['v2']);
      expect(body.apis.v1).toEqual({ current: null, previous: null });
      expect(Object.keys(body.apis).sort()).toEqual(['v1', 'v2']);
    } finally {
      restore();
    }
  });

  test('a v1 install over HTTP on a v2-only host: 422 release-refused, reason api_not_served', async () => {
    const restore = setV2OnlyForTests(true);
    try {
      const res = await routeRequest(
        new Request(`http://localhost${BASE}/v1/releases/v1`, {
          method: 'POST',
          headers: {
            ...AUTH,
            'content-type': 'application/gzip',
            'x-dedalo-actor': 'tester',
            'x-release-id': '7.0.1_aaaaaaa',
            'x-bundle-sha256': 'a'.repeat(64),
          },
          body: new Uint8Array([1, 2, 3]),
        }),
      );
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ type: expect.stringContaining('release-refused'), reason: 'api_not_served' });
    } finally {
      restore();
    }
  });

  test('rules.hash is the config-hash stamp of the live include', async () => {
    const hash = createHash('sha256').update('status-test').digest('hex');
    const include = join(config.STATE_ROOT, 'rules', `dedalo_media_publication.${config.WEB_SERVER}.conf`);
    await mkdir(join(config.STATE_ROOT, 'rules'), { recursive: true });
    await writeFile(
      include,
      [
        '# Dédalo media access control, PUBLICATION-HOST profile. GENERATED by',
        '# src/core/media/publication_host_rules.ts. Do not edit: re-render instead.',
        `# config-hash: ${hash}`,
        '',
      ].join('\n'),
    );

    const body = await getStatus();
    expect(body.rules).toEqual({ server: config.WEB_SERVER, hash, map: null });
  });

  test('rules.map reports the host map on an nginx conf_d host, {managed:false} when placed by hand', async () => {
    const mapDir = scratchPath('status_map', 'nginx_map');
    const install = (mode: 'conf_d' | 'none') =>
      setRulesDepsForTests({
        instance: config.INSTANCE,
        webServer: 'nginx',
        nginxMapMode: mode,
        lockIo: undefined as never,
        locksDir: '/nonexistent',
        lockUid: 0,
        nginxMapDir: mapDir,
        uid: 0,
        lstat: () => null,
      });
    let undo = install('none');
    try {
      expect((await getStatus()).rules.map).toEqual({ managed: false });
      undo();
      undo = install('conf_d');
      expect((await getStatus()).rules.map).toEqual({
        managed: true,
        hash: null,
        host_hash: null,
        contributions: 0,
        invalid: 0,
        refused: null,
      });
    } finally {
      undo();
    }
  });
});

describe('status helpers', () => {
  test('buildStatus is what the route serialises', async () => {
    // Two reads, two statfs calls: free bytes is a LIVE gauge, and any concurrent
    // writer (the CI image runs the daemon packages side by side) moves it between
    // them — a 4 KiB drift once failed this as a serialisation mismatch. The shape
    // and every other field must match exactly; the gauge must be a real reading.
    const built = await buildStatus();
    const served = await getStatus();
    for (const status of [built, served]) {
      expect(Number.isInteger(status.disk.state_root_free_bytes)).toBe(true);
      expect(status.disk.state_root_free_bytes).toBeGreaterThan(0);
    }
    const gauge = { state_root_free_bytes: 0 };
    expect({ ...built, disk: gauge }).toEqual({ ...served, disk: gauge });
  });

  test('stateRootFreeBytes measures a real root and refuses a missing one', async () => {
    expect(await stateRootFreeBytes(roots.stateRoot)).toBeGreaterThan(0);
    await expect(stateRootFreeBytes(join(roots.stateRoot, 'absent', 'root'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
