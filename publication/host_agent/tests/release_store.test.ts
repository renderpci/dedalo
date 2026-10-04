import { beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../src/config';
import {
  BUNDLE_SHA_FILE,
  RELEASE_ID,
  ReleaseStoreError,
  apiLayout,
  bundleLimits,
  commitStaging,
  createStaging,
  currentRelease,
  listReleases,
  previousRelease,
  promote,
  pruneReleases,
  releaseExists,
  reservedBundlePaths,
} from '../src/releases/store';
import { extractBundle } from '../src/releases/ustar';
import { resetInstance } from './fixtures/instance';
import { bundle, streamOf } from './fixtures/ustar_writer';

const A = '7.0.1_aaaaaaa';
const B = '7.0.2_bbbbbbb';
const C = '7.0.3_ccccccc';
const D = '7.0.3_ddddddd';

beforeEach(resetInstance);

/** The install flow Task 7 runs: createStaging → extractBundle → commitStaging. */
async function install(id: string): Promise<void> {
  const staged = await createStaging('v2');
  await extractBundle(streamOf(bundle([{ path: 'id.txt', data: id }])), staged, bundleLimits(), reservedBundlePaths('v2'));
  await commitStaging('v2', staged, id);
}

async function reason(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err).toBeInstanceOf(ReleaseStoreError);
  return (err as ReleaseStoreError).reason;
}

describe('layout + ids', () => {
  test('apiLayout lives under <STATE_ROOT>/publication_api/<api>/', () => {
    const l = apiLayout('v1');
    expect(l.root).toBe(join(config.STATE_ROOT, 'publication_api', 'v1'));
    expect(l.releases).toBe(join(l.root, 'releases'));
    expect(l.shared).toBe(join(l.root, 'shared'));
    expect(l.staging).toBe(join(l.root, 'staging'));
    expect(l.current).toBe(join(l.root, 'current'));
  });

  test('RELEASE_ID (D9)', () => {
    for (const ok of ['7.0.3_a1b2c3d', '7.0_0000000', '7.0.3.1_abcdef0']) expect(RELEASE_ID.test(ok)).toBe(true);
    for (const bad of ['7_a1b2c3d', '7.0.3_A1B2C3D', '7.0.3_a1b2c3', '../x', '7.0.3_a1b2c3d/..', '7.0.3.1.2_abcdef0']) {
      expect(RELEASE_ID.test(bad)).toBe(false);
    }
  });

  test('reserved bundle paths (D8): v1 config always, its headers only when shared/ has them; v2 env files; the sha record everywhere', async () => {
    expect(BUNDLE_SHA_FILE).toBe('.bundle_sha256');
    expect(reservedBundlePaths('v1')).toEqual([BUNDLE_SHA_FILE, 'config_api/server_config_api.php']);
    // The rule reads shared/ itself: no caller can pass a stale or wrong answer.
    await mkdir(apiLayout('v1').shared, { recursive: true });
    await writeFile(join(apiLayout('v1').shared, 'server_config_headers.php'), '<?php // shared headers');
    expect(reservedBundlePaths('v1')).toEqual([
      BUNDLE_SHA_FILE,
      'config_api/server_config_api.php',
      'config_api/server_config_headers.php',
    ]);
    expect(reservedBundlePaths('v2')).toEqual([
      BUNDLE_SHA_FILE,
      '.env',
      '.env.local',
      '.env.production',
      '.env.production.local',
    ]);
  });
});

describe('promote', () => {
  test('first promote: from null; current is a RELATIVE symlink', async () => {
    await install(A);
    expect(currentRelease('v2')).toBeNull();
    expect(await promote('v2', A)).toEqual({ from: null, to: A });
    const { current, root } = apiLayout('v2');
    expect(lstatSync(current).isSymbolicLink()).toBe(true);
    expect(readlinkSync(current)).toBe(`releases/${A}`);
    expect(await readFile(join(current, 'id.txt'), 'utf8')).toBe(A);
    expect((await readdir(root)).filter((n) => n.startsWith('.current.'))).toEqual([]);
  });

  test('swap, previous, rollback-by-promote', async () => {
    await install(A);
    await promote('v2', A);
    await install(B);
    expect(await promote('v2', B)).toEqual({ from: A, to: B });
    expect(previousRelease('v2')).toBe(A);
    expect(await promote('v2', A)).toEqual({ from: B, to: A });
    expect(previousRelease('v2')).toBe(B);
  });

  test('refusals: bad id, unknown release, releases/<id> not a real directory', async () => {
    expect(await reason(promote('v2', '../../etc'))).toBe('bad_release_id');
    expect(await reason(promote('v2', A))).toBe('unknown_release');
    const { releases } = apiLayout('v2');
    await mkdir(releases, { recursive: true });
    await writeFile(join(releases, A), 'not a dir');
    expect(await reason(promote('v2', A))).toBe('not_a_directory');
    await mkdir(join(config.STATE_ROOT, 'elsewhere'));
    await symlink(join(config.STATE_ROOT, 'elsewhere'), join(releases, B));
    expect(await reason(promote('v2', B))).toBe('not_a_directory');
    expect(currentRelease('v2')).toBeNull();
  });

  test('a current that is not our symlink is corrupt, never overwritten', async () => {
    await install(A);
    const { current } = apiLayout('v2');
    await mkdir(current);
    expect(() => currentRelease('v2')).toThrow(ReleaseStoreError);
    expect(await reason(promote('v2', A))).toBe('corrupt_current');
    expect(lstatSync(current).isDirectory()).toBe(true);
  });

  test('concurrency: two promotes serialize into one from→to chain, no temp links left', async () => {
    await install(A);
    await install(B);
    const [first, second] = await Promise.all([promote('v2', A), promote('v2', B)]);
    expect(first).toEqual({ from: null, to: A });
    expect(second).toEqual({ from: A, to: B });
    expect(currentRelease('v2')).toBe(B);
    const { root } = apiLayout('v2');
    expect((await readdir(root)).filter((n) => n.startsWith('.current.'))).toEqual([]);
  });

  test('concurrency: 20 interleaved promotes keep a consistent chain and a valid current', async () => {
    await install(A);
    await install(B);
    const ids = Array.from({ length: 20 }, (_, i) => (i % 2 ? A : B));
    const results = await Promise.all(ids.map((id) => promote('v2', id)));
    for (let i = 1; i < results.length; i++) expect(results[i]?.from).toBe(results[i - 1]?.to);
    expect(currentRelease('v2')).toBe(ids[ids.length - 1] as string);
  });
});

describe('staging + crash safety', () => {
  test('a committed release root is 0755; the staged root stays 0700 until commit', async () => {
    const staged = await createStaging('v2');
    expect(lstatSync(staged).mode & 0o777).toBe(0o700);
    await rm(staged, { recursive: true });
    await install(A);
    expect(lstatSync(join(apiLayout('v2').releases, A)).mode & 0o777).toBe(0o755);
  });

  test('commitStaging refuses an existing release, a non-dir release path, an unconfined dir', async () => {
    await install(A);
    const staged = await createStaging('v2');
    expect(await reason(commitStaging('v2', staged, A))).toBe('release_exists');
    await writeFile(join(apiLayout('v2').releases, B), 'x');
    expect(() => releaseExists('v2', B)).toThrow(ReleaseStoreError);
    expect(await reason(commitStaging('v2', staged, B))).toBe('not_a_directory');
    const loose = join(config.STATE_ROOT, 'loose');
    await mkdir(loose);
    expect(await reason(commitStaging('v2', loose, C))).toBe('not_confined');
    expect(releaseExists('v2', A)).toBe(true);
    expect(releaseExists('v2', C)).toBe(false);
  });

  test('leftovers of a crashed install are swept by the next createStaging; current untouched', async () => {
    await install(A);
    await promote('v2', A);
    const { root, staging, current } = apiLayout('v2');
    // crash mid-extraction …
    await mkdir(join(staging, 'stage-crashed', 'deep'), { recursive: true });
    await writeFile(join(staging, 'stage-crashed', 'deep', 'partial.js'), 'half');
    // … and crash between the temp symlink and the rename
    await install(B);
    await symlink(`releases/${B}`, join(root, '.current.999.dead.tmp'));
    expect(currentRelease('v2')).toBe(A);

    const fresh = await createStaging('v2');
    expect(await readdir(staging)).toEqual([fresh.split('/').pop() as string]);
    expect(await readdir(fresh)).toEqual([]);
    expect(existsSync(join(root, '.current.999.dead.tmp'))).toBe(false);
    expect(readlinkSync(current)).toBe(`releases/${A}`);
  });

  test('a refused bundle (a v2 env file, a forged sha record) leaves no staging dir and no release', async () => {
    for (const path of ['.env', BUNDLE_SHA_FILE]) {
      const staged = await createStaging('v2');
      const err = await extractBundle(
        streamOf(bundle([{ path, data: 'SECRET=1' }])),
        staged,
        bundleLimits(),
        reservedBundlePaths('v2'),
      ).catch((e) => e);
      expect((err as { reason?: string }).reason).toBe('reserved_path');
      expect(await readdir(apiLayout('v2').staging)).toEqual([]);
      expect(listReleases('v2')).toEqual([]);
    }
  });

  test('v1 (D8): its config is always refused; its headers only when shared/ has them', async () => {
    const cases: Array<[string, boolean, boolean]> = [
      ['config_api/server_config_api.php', false, true],
      ['config_api/server_config_api.php', true, true],
      ['config_api/server_config_headers.php', true, true],
      ['config_api/server_config_headers.php', false, false], // the release's tracked default serves
    ];
    const sharedHeaders = join(apiLayout('v1').shared, 'server_config_headers.php');
    for (const [path, sharedHasHeaders, refused] of cases) {
      const staged = await createStaging('v1');
      if (sharedHasHeaders) await writeFile(sharedHeaders, '<?php // shared headers');
      else await rm(sharedHeaders, { force: true });
      const outcome = await extractBundle(
        streamOf(bundle([{ path: 'index.php', data: '<?php' }, { path, data: '<?php $x=1;' }])),
        staged,
        bundleLimits(),
        reservedBundlePaths('v1'),
      ).then(
        () => 'extracted',
        (e) => (e as { reason?: string }).reason,
      );
      expect(outcome).toBe(refused ? 'reserved_path' : 'extracted');
      expect((await readdir(apiLayout('v1').staging)).length).toBe(refused ? 0 : 1);
    }
  });
});

describe('pruneReleases', () => {
  test('keeps the newest `keep`, never current or previous', async () => {
    for (const id of [A, B, C, D]) await install(id);
    await promote('v2', D);
    await promote('v2', A); // rollback-like: current = A, previous = D
    expect(previousRelease('v2')).toBe(D);
    const removed = await pruneReleases('v2', 2);
    expect(removed.sort()).toEqual([B, C].sort());
    expect(listReleases('v2').sort()).toEqual([A, D].sort());
    expect(currentRelease('v2')).toBe(A);
  });

  test('an OLD current (newer releases committed, never promoted) survives a prune', async () => {
    await install(A);
    await promote('v2', A);
    for (const id of [B, C, D]) await install(id); // committed after: newer than current
    expect(listReleases('v2')).toEqual([D, C, B, A]);
    const removed = await pruneReleases('v2', 2);
    expect(removed).toEqual([B]);
    expect(listReleases('v2')).toEqual([D, C, A]);
    expect(currentRelease('v2')).toBe(A);
  });

  test('keep < 2 is refused', async () => {
    expect(await reason(pruneReleases('v2', 1))).toBe('keep_too_small');
  });

  test('names that are not release ids are not ours to delete', async () => {
    await install(A);
    await install(B);
    await install(C);
    await promote('v2', C);
    await mkdir(join(apiLayout('v2').releases, 'operator-notes'));
    await pruneReleases('v2', 2);
    expect(existsSync(join(apiLayout('v2').releases, 'operator-notes'))).toBe(true);
    expect(listReleases('v2')).toEqual([C, B]);
  });
});
