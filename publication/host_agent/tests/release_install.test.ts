/**
 * release.install / release.rollback (Task 7) — the §3 install, driven with an injected exec
 * (whose scratch boot still runs Task 3's REAL confinement) and real loopback health servers.
 * Review focus 3 is pinned here: a v2 release that fails its scratch health never reaches
 * `current`; one that fails AFTER the restart ends with `current` back on the previous
 * release and the unit restarted on it.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, lstatSync } from 'node:fs';
import { mkdir, readdir, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAudit } from '../src/audit';
import { config } from '../src/config';
import { type ApiError, ValidationError } from '../src/errors';
import { createExec, setExecForTests } from '../src/exec';
import { BUNDLE_SHA_FILE, installRelease, rollbackRelease, setInstallSeamsForTests } from '../src/releases/install';
import { apiLayout, createStaging, currentRelease } from '../src/releases/store';
import type { ApiName } from '../src/releases/ustar';
import {
  type BundleTree,
  FAST_TIMING,
  fakeReleaseHost,
  makeBundle,
  prepareReleaseRoots,
  recordingSpawner,
  sha256Hex,
  V1_TREE,
  V2_TREE,
  without,
} from './fixtures/release_host';
import { resetInstance } from './fixtures/instance';
import { streamOf } from './fixtures/ustar_writer';

const A = '7.0.3_aaaaaaa';
const B = '7.0.4_bbbbbbb';
const C = '7.0.5_ccccccc';
const D = '7.0.6_ddddddd';
const HEADERS = 'config_api/server_config_headers.php';

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

function install(api: ApiName, releaseId: string, tree: BundleTree, sha?: string) {
  const bytes = makeBundle(tree);
  return installRelease({ api, releaseId, sha256: sha ?? sha256Hex(bytes), actor: 'tester', body: streamOf(bytes) });
}

async function refusal(promise: Promise<unknown>): Promise<{ status: number; reason: unknown; ext: Record<string, unknown> }> {
  try {
    await promise;
  } catch (error) {
    const apiError = error as ApiError;
    return { status: apiError.status, reason: apiError.extensions?.reason, ext: apiError.extensions ?? {} };
  }
  throw new Error('expected a refusal, the operation succeeded');
}

async function releaseIds(api: ApiName): Promise<string[]> {
  return (await readdir(apiLayout(api).releases)).sort();
}

async function stagingEntries(api: ApiName): Promise<string[]> {
  return existsSync(apiLayout(api).staging) ? await readdir(apiLayout(api).staging) : [];
}

describe('v1 install', () => {
  test('extracts, lints every .php, links the shared config, records the sha, promotes', async () => {
    const bytes = makeBundle(V1_TREE);
    const sha = sha256Hex(bytes);
    const result = await installRelease({ api: 'v1', releaseId: A, sha256: sha, actor: 'tester', body: streamOf(bytes) });

    expect(result).toEqual({ api: 'v1', from: null, to: A, reused: false, health: 'ok' });
    expect(currentRelease('v1')).toBe(A);
    const dir = join(apiLayout('v1').releases, A);
    expect(await readFile(join(dir, BUNDLE_SHA_FILE), 'utf8')).toBe(`${sha}\n`);
    expect(await readlink(join(dir, 'config_api/server_config_api.php'))).toBe(
      join(apiLayout('v1').shared, 'server_config_api.php'),
    );
    // No shared headers file → the release's own tracked default stays a plain file.
    expect(lstatSync(join(dir, HEADERS)).isSymbolicLink()).toBe(false);
    expect(host.state.lints.length).toBe(3);
    expect(await stagingEntries('v1')).toEqual([]);
  });

  test('refuses before reading the body when shared/server_config_api.php is missing', async () => {
    await rm(join(apiLayout('v1').shared, 'server_config_api.php'));
    const r = await refusal(install('v1', A, V1_TREE));
    expect(r.status).toBe(422);
    expect(r.reason).toBe('shared_config_missing');
    expect(await releaseIds('v1')).toEqual([]);
    expect(currentRelease('v1')).toBeNull();
  });

  test('a php -l failure refuses and leaves the previous release serving', async () => {
    await install('v1', A, V1_TREE);
    const r = await refusal(install('v1', B, { ...V1_TREE, 'json/broken.php': '<?php SYNTAX_ERROR' }));
    expect(r.reason).toBe('php_lint_failed');
    expect(currentRelease('v1')).toBe(A);
    expect(await releaseIds('v1')).toEqual([A]);
    expect(await stagingEntries('v1')).toEqual([]);
  });

  test('a bundle carrying config_api/server_config_api.php is refused (D8)', async () => {
    const r = await refusal(install('v1', A, { ...V1_TREE, 'config_api/server_config_api.php': '<?php // planted' }));
    expect(r.reason).toBe('bundle_refused');
    expect(r.ext.bundle_reason).toBe('reserved_path');
    expect(await releaseIds('v1')).toEqual([]);
  });

  test('shared headers are linked, and then the bundle may not carry its own', async () => {
    await writeFile(join(apiLayout('v1').shared, 'server_config_headers.php'), '<?php // shared headers');
    const r = await refusal(install('v1', A, V1_TREE));
    expect(r.ext.bundle_reason).toBe('reserved_path');

    await install('v1', A, without(V1_TREE, HEADERS));
    expect(await readlink(join(apiLayout('v1').releases, A, HEADERS))).toBe(
      join(apiLayout('v1').shared, 'server_config_headers.php'),
    );
  });

  test('no headers file anywhere is refused with an operator sentence', async () => {
    const r = await refusal(install('v1', A, without(V1_TREE, HEADERS)));
    expect(r.reason).toBe('shared_config_missing');
    expect(await releaseIds('v1')).toEqual([]);
  });

  test('bytes that do not hash to X-Bundle-Sha256 are refused, nothing installed', async () => {
    const r = await refusal(install('v1', A, V1_TREE, 'f'.repeat(64)));
    expect(r.reason).toBe('sha_mismatch');
    expect(await releaseIds('v1')).toEqual([]);
    expect(await stagingEntries('v1')).toEqual([]);
  });

  test('re-installing an existing id only re-points current; another sha for it is refused', async () => {
    const bytesA = makeBundle(V1_TREE);
    await install('v1', A, V1_TREE);
    await install('v1', B, { ...V1_TREE, 'json/index.php': '<?php echo "B";' });
    const lintsBefore = host.state.lints.length;
    const untouched = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('a reused release must not read the body');
      },
    });

    const result = await installRelease({ api: 'v1', releaseId: A, sha256: sha256Hex(bytesA), actor: 'tester', body: untouched });
    expect(result).toEqual({ api: 'v1', from: B, to: A, reused: true, health: 'ok' });
    expect(currentRelease('v1')).toBe(A);
    expect(host.state.lints.length).toBe(lintsBefore);

    const r = await refusal(install('v1', B, V1_TREE, 'e'.repeat(64)));
    expect(r.reason).toBe('sha_mismatch');
    expect(currentRelease('v1')).toBe(A);
  });

  test('a release dir an interrupted install left without its record is swept, then re-staged', async () => {
    await install('v1', A, V1_TREE);
    const leftover = join(apiLayout('v1').releases, B);
    await mkdir(join(leftover, 'json'), { recursive: true });
    const bytes = makeBundle(V1_TREE);

    const result = await installRelease({ api: 'v1', releaseId: B, sha256: sha256Hex(bytes), actor: 'tester', body: streamOf(bytes) });
    expect(result).toEqual({ api: 'v1', from: A, to: B, reused: false, health: 'ok' });
    expect(await readFile(join(leftover, BUNDLE_SHA_FILE), 'utf8')).toBe(`${sha256Hex(bytes)}\n`);
  });
});

describe('v2 install', () => {
  test('a bundle without node_modules is refused (the host never runs bun install)', async () => {
    const r = await refusal(install('v2', A, without(V2_TREE, 'node_modules/', 'node_modules/zod/', 'node_modules/zod/package.json')));
    expect(r.reason).toBe('node_modules_missing');
    expect(host.state.scratchBoots).toEqual([]);
    expect(await releaseIds('v2')).toEqual([]);
  });

  test('a failed scratch health never reaches current, never restarts the unit, leaves no release dir', async () => {
    host.state.scratchHealthy.add(A);
    host.state.liveHealthy.add(A);
    await install('v2', A, V2_TREE);
    const restarts = host.state.restarts;

    const r = await refusal(install('v2', B, V2_TREE));
    expect(r.reason).toBe('scratch_health_failed');
    expect(host.state.scratchBoots).toEqual([A, B]);
    expect(currentRelease('v2')).toBe(A);
    expect(host.state.restarts).toBe(restarts);
    expect(await releaseIds('v2')).toEqual([A]);
    expect(await stagingEntries('v2')).toEqual([]);
  });

  test('a healthy release is promoted, the unit restarted once, health polled', async () => {
    host.state.scratchHealthy.add(A);
    host.state.liveHealthy.add(A);
    const result = await install('v2', A, V2_TREE);
    expect(result).toEqual({ api: 'v2', from: null, to: A, reused: false, health: 'ok' });
    expect(host.state.restarts).toBe(1);
    expect(host.state.live).toBe(A);
  });

  test('a release failing health after the restart is rolled back: current = previous, unit restarted on it', async () => {
    host.state.scratchHealthy.add(A);
    host.state.liveHealthy.add(A);
    await install('v2', A, V2_TREE);
    host.state.scratchHealthy.add(B); // boots in scratch, fails live

    const r = await refusal(install('v2', B, V2_TREE));
    expect(r.reason).toBe('health_failed');
    expect(r.ext.rolled_back_to).toBe(A);
    expect(currentRelease('v2')).toBe(A);
    expect(host.state.live).toBe(A);
    expect(host.state.restarts).toBe(3); // install A, install B, restore A
    expect(await releaseIds('v2')).toEqual([A]);
  });

  test('a previous release that is ALSO unhealthy is reported as rollback_unhealthy', async () => {
    host.state.scratchHealthy.add(A);
    host.state.liveHealthy.add(A);
    await install('v2', A, V2_TREE);
    host.state.liveHealthy.delete(A);
    host.state.scratchHealthy.add(B);

    const r = await refusal(install('v2', B, V2_TREE));
    expect(r.reason).toBe('rollback_unhealthy');
    expect(r.ext.rolled_back_to).toBe(A);
    expect(currentRelease('v2')).toBe(A);
  });
});

describe('the real exec confinement', () => {
  test('the scratch boot is handed releases/<id> (never staging), and the real v2ScratchBoot accepts it', async () => {
    host.state.scratchHealthy.add(A);
    host.state.liveHealthy.add(A);
    await install('v2', A, V2_TREE);
    expect(host.state.scratchDirs).toEqual([join(apiLayout('v2').releases, A)]);
    // The sha record is written LAST: a scratch-booted release has not passed every check yet.
    expect(host.state.scratchHadRecord).toEqual([false]);
    expect(existsSync(join(apiLayout('v2').releases, A, BUNDLE_SHA_FILE))).toBe(true);
  });

  test('the real v2ScratchBoot refuses a staging dir: an install that booted from staging would fail', async () => {
    const staged = await createStaging('v2');
    const { spawner, calls } = recordingSpawner();
    expect(() => createExec(config, spawner).v2ScratchBoot(staged, 3200)).toThrow(ValidationError);
    expect(calls).toEqual([]);
  });
});

describe('rollback', () => {
  test('v1 swaps current to the previous release', async () => {
    await install('v1', A, V1_TREE);
    await install('v1', B, V1_TREE);
    expect(await rollbackRelease('v1', 'tester')).toEqual({ from: B, to: A });
    expect(currentRelease('v1')).toBe(A);
  });

  test('v2 restarts on the previous release and checks its health', async () => {
    for (const id of [A, B]) {
      host.state.scratchHealthy.add(id);
      host.state.liveHealthy.add(id);
      await install('v2', id, V2_TREE);
    }
    const restarts = host.state.restarts;
    expect(await rollbackRelease('v2', 'tester')).toEqual({ from: B, to: A });
    expect(host.state.restarts).toBe(restarts + 1);
    expect(host.state.live).toBe(A);
  });

  test('a v2 rollback target failing health is put back', async () => {
    for (const id of [A, B]) {
      host.state.scratchHealthy.add(id);
      host.state.liveHealthy.add(id);
      await install('v2', id, V2_TREE);
    }
    host.state.liveHealthy.delete(A);
    const r = await refusal(rollbackRelease('v2', 'tester'));
    expect(r.reason).toBe('health_failed');
    expect(r.ext.rolled_back_to).toBe(B);
    expect(currentRelease('v2')).toBe(B);
    expect(host.state.live).toBe(B);
  });

  test('nothing to roll back to / from is refused', async () => {
    expect((await refusal(rollbackRelease('v1', 'tester'))).reason).toBe('no_current_release');
    await install('v1', A, V1_TREE);
    expect((await refusal(rollbackRelease('v1', 'tester'))).reason).toBe('no_previous_release');
  });
});

describe('audit', () => {
  test('every outcome is audited with the closed actions: ok, auto_rollback, failed, refused', async () => {
    host.state.scratchHealthy.add(A);
    host.state.liveHealthy.add(A);
    await install('v2', A, V2_TREE);
    host.state.scratchHealthy.add(B);
    await refusal(install('v2', B, V2_TREE));
    await refusal(install('v1', C, V1_TREE, 'f'.repeat(64)));

    const entries = (await readAudit()).map((e) => `${e.action}:${e.outcome}:${e.actor}`);
    expect(entries).toEqual([
      'release.install:refused:tester',
      'release.install:failed:tester',
      'release.auto_rollback:ok:tester',
      'release.install:ok:tester',
    ]);
  });
});

describe('single flight', () => {
  test('a second operation on the same api is 409 busy; the other api is not blocked', async () => {
    const bytes = makeBundle(V1_TREE);
    let push!: ReadableStreamDefaultController<Uint8Array>;
    const held = new ReadableStream<Uint8Array>({
      start(controller) {
        push = controller;
      },
    });
    const first = installRelease({ api: 'v1', releaseId: A, sha256: sha256Hex(bytes), actor: 'tester', body: held });

    const second = await refusal(install('v1', B, V1_TREE));
    expect(second.status).toBe(409);
    expect(second.reason).toBe('busy');
    const rollback = await refusal(rollbackRelease('v1', 'tester'));
    expect(rollback.reason).toBe('busy');
    // v2 has its own lock: it answers for itself (nothing installed), not "busy".
    expect((await refusal(rollbackRelease('v2', 'tester'))).reason).toBe('no_current_release');

    push.enqueue(bytes);
    push.close();
    expect((await first).to).toBe(A);
    // The lock is released: the next install proceeds.
    expect((await install('v1', B, V1_TREE)).to).toBe(B);
  });
});

describe('retention', () => {
  test('keeps RELEASES_RETAINED releases, the current one among them', async () => {
    const ids = [A, B, C, D];
    for (const id of ids.slice(0, config.RELEASES_RETAINED + 1)) await install('v1', id, V1_TREE);
    const kept = await releaseIds('v1');
    expect(kept.length).toBe(config.RELEASES_RETAINED);
    expect(kept).toContain(currentRelease('v1') as string);
  });
});
