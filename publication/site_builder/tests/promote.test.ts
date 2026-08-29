/**
 * The promote layer, driven through the shape it now takes: a SURFACE PAIR — a release
 * store and a served link — rather than a root and a slug.
 *
 * Every guarantee asserted here is the one that was asserted before (the copy lands, the
 * swap is atomic and relative, an old release survives for rollback, pruning keeps the
 * served release), plus the three this phase adds: a symlink in the build output is refused
 * and leaves nothing behind, the provisioner's placeholder link is not mistaken for a
 * release, and one surface's pruning cannot reach the other's store.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { existsSync } from 'node:fs';
import { readlink, readdir, symlink, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { config } from '../src/config';
import {
  makeSourceDir,
  provisionSite,
  readServed,
  releaseStorePath,
  resetInstance,
  SCRATCH_SOURCE,
  servedPath,
  surfaceOf,
} from './fixtures/instance';
import { promoteRelease, activateRelease, listReleases, currentRelease } from '../src/build/promote';

const SLUG = 'demo';
const SRC = SCRATCH_SOURCE;

/** The preprod pair of the scratch site — the surface this file drives. */
function preprod() {
  return surfaceOf(SLUG, 'preprod');
}

/** One-file source tree — the promoted bytes every assertion below reads back. */
function makeSource(content: string): Promise<string> {
  return makeSourceDir({ 'index.html': content });
}

beforeEach(async () => {
  await resetInstance();
  await provisionSite(SLUG);
});
afterEach(resetInstance);

describe('promoteRelease', () => {
  test('copies the source into a release and points the served link at it', async () => {
    await makeSource('<h1>v1</h1>');
    const release = await promoteRelease(preprod(), SRC);

    const link = servedPath('preprod', SLUG);
    expect(existsSync(link)).toBe(true);
    // The symlink target is RELATIVE and inside this surface's own store — that is what
    // keeps the swap atomic and the whole webspace relocatable.
    const target = await readlink(link);
    expect(target.startsWith('/')).toBe(false);
    expect(target).toBe(relative(preprod().webspace, releaseStorePath('preprod', SLUG, release)));
    // Serving through the link yields the promoted content.
    expect(await readServed('preprod', SLUG, 'index.html')).toBe('<h1>v1</h1>');
    expect(await currentRelease(preprod())).toBe(release);
  });

  test('a second promote swaps the link atomically to the new release', async () => {
    await makeSource('<h1>v1</h1>');
    const r1 = await promoteRelease(preprod(), SRC);
    await makeSource('<h1>v2</h1>');
    const r2 = await promoteRelease(preprod(), SRC);

    expect(r2).not.toBe(r1);
    expect(await readServed('preprod', SLUG, 'index.html')).toBe('<h1>v2</h1>');
    expect(await currentRelease(preprod())).toBe(r2);
    // The old release still exists on disk (rollback target).
    expect(existsSync(releaseStorePath('preprod', SLUG, r1))).toBe(true);
  });

  test('activateRelease rolls back to a prior release', async () => {
    await makeSource('<h1>v1</h1>');
    const r1 = await promoteRelease(preprod(), SRC);
    await makeSource('<h1>v2</h1>');
    await promoteRelease(preprod(), SRC);

    await activateRelease(preprod(), r1);
    expect(await readServed('preprod', SLUG, 'index.html')).toBe('<h1>v1</h1>');
    expect(await currentRelease(preprod())).toBe(r1);
  });

  test('activateRelease throws for an unknown release', async () => {
    await makeSource('<h1>v1</h1>');
    await promoteRelease(preprod(), SRC);
    await expect(activateRelease(preprod(), 'nope')).rejects.toThrow();
  });

  test('prunes releases beyond RELEASES_RETAINED but keeps the current one', async () => {
    // Promote more than the retention limit; give each a distinct id.
    const made: string[] = [];
    for (let i = 0; i < config.RELEASES_RETAINED + 3; i++) {
      await makeSource(`<h1>v${i}</h1>`);
      made.push(await promoteRelease(preprod(), SRC));
      // release ids are millisecond-stamped; ensure ordering/uniqueness
      await new Promise(r => setTimeout(r, 2));
    }
    const remaining = await readdir(preprod().storeDir);
    expect(remaining.length).toBeLessThanOrEqual(config.RELEASES_RETAINED);
    // The most recent (current) release survived pruning.
    expect(remaining).toContain(made[made.length - 1]);
  });

  test('a rolled-back release is still there, and still served, after the churn', async () => {
    // Promote past the cap, then roll back to the oldest release that survived pruning. Its
    // bytes must still be on disk and still be what the link hands a visitor — the whole
    // point of retaining releases, and the thing pruning must never take away.
    for (let i = 0; i < config.RELEASES_RETAINED + 3; i++) {
      await makeSource(`<h1>v${i}</h1>`);
      await promoteRelease(preprod(), SRC);
      await new Promise(r => setTimeout(r, 2));
    }
    const retained = await listReleases(preprod()); // newest first
    const oldest = retained[retained.length - 1] as string;

    await activateRelease(preprod(), oldest);
    expect(existsSync(releaseStorePath('preprod', SLUG, oldest))).toBe(true);
    expect(await currentRelease(preprod())).toBe(oldest);
    // Its bytes, not the newest build's.
    expect(await readServed('preprod', SLUG, 'index.html')).toContain('<h1>v');
    expect(await readServed('preprod', SLUG, 'index.html')).not.toBe(
      `<h1>v${config.RELEASES_RETAINED + 2}</h1>`,
    );
  });

  test("pruning one surface cannot reach the other surface's store", async () => {
    // Two stores, not one: prod holds its own copies, so preprod churning past its cap
    // leaves production's bytes — and production's served link — untouched.
    await makeSource('<h1>live</h1>');
    const prodRelease = await promoteRelease(surfaceOf(SLUG, 'prod'), SRC);

    for (let i = 0; i < config.RELEASES_RETAINED + 3; i++) {
      await makeSource(`<h1>draft ${i}</h1>`);
      await promoteRelease(preprod(), SRC);
      await new Promise(r => setTimeout(r, 2));
    }

    expect(existsSync(releaseStorePath('prod', SLUG, prodRelease))).toBe(true);
    expect(await readServed('prod', SLUG, 'index.html')).toBe('<h1>live</h1>');
    expect(await currentRelease(surfaceOf(SLUG, 'prod'))).toBe(prodRelease);
  });

  test('listReleases returns newest first', async () => {
    await makeSource('a');
    const r1 = await promoteRelease(preprod(), SRC);
    await new Promise(r => setTimeout(r, 2));
    await makeSource('b');
    const r2 = await promoteRelease(preprod(), SRC);
    const releases = await listReleases(preprod());
    expect(releases[0]).toBe(r2);
    expect(releases).toContain(r1);
  });
});

describe('what may not be promoted', () => {
  test('a symlink in the build output is refused, and nothing is left behind', async () => {
    // The shape an agent turn can author: an absolute link out of the workspace. `cp` would
    // copy it verbatim into a tree the web server reads.
    await makeSourceDir({ 'index.html': '<h1>v1</h1>' });
    await symlink('/etc/passwd', join(SRC, 'secrets.html'));

    await expect(promoteRelease(preprod(), SRC)).rejects.toThrow(/symbolic link/);

    // No release, no staging directory, no served link: a refused promote writes nothing.
    expect(await listReleases(preprod())).toEqual([]);
    const store = preprod().storeDir;
    const left = existsSync(store) ? await readdir(store) : [];
    expect(left).toEqual([]);
    expect(existsSync(servedPath('preprod', SLUG))).toBe(false);
  });

  test('a symlinked subdirectory is refused too', async () => {
    await makeSourceDir({ 'index.html': '<h1>v1</h1>' });
    await mkdir(join(SRC, 'real'), { recursive: true });
    await writeFile(join(SRC, 'real', 'a.txt'), 'a', 'utf8');
    await symlink('/etc', join(SRC, 'etc'));

    await expect(promoteRelease(preprod(), SRC)).rejects.toThrow(/symbolic link/);
    expect(await listReleases(preprod())).toEqual([]);
  });

  test('a missing source is refused by name', async () => {
    await expect(promoteRelease(preprod(), join(SRC, 'nope'))).rejects.toThrow(/does not exist/);
  });
});

describe('currentRelease', () => {
  test("the provisioner's placeholder link is not read as a release", async () => {
    // `provision apply` points the link at the STORE so the vhost has a document root
    // before the first publish. Reading the last path segment blindly would call that
    // placeholder a release named 'pre' — and publish would try to promote it.
    const surface = preprod();
    await mkdir(surface.storeDir, { recursive: true });
    await symlink(relative(surface.webspace, surface.storeDir), surface.linkPath);

    expect(await currentRelease(surface)).toBeNull();
  });

  test('a link pointing outside the store is not read as a release', async () => {
    const surface = preprod();
    await mkdir(join(surface.webspace, 'elsewhere', 'x'), { recursive: true });
    await symlink(join('elsewhere', 'x'), surface.linkPath);

    expect(await currentRelease(surface)).toBeNull();
  });

  test('an unpublished surface has no current release', async () => {
    expect(await currentRelease(preprod())).toBeNull();
    expect(await listReleases(preprod())).toEqual([]);
  });
});
