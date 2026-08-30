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
import { readlink, readdir, rm, symlink, mkdir, writeFile } from 'node:fs/promises';
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
import {
  promoteRelease,
  activateRelease,
  listReleases,
  currentRelease,
  pruneReleases,
  newReleaseId,
  deleteRelease,
} from '../src/build/promote';
import { runBinary } from '../src/util/spawn';

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

  /**
   * THE ROLLBACK DOOR IS THE ONE WHERE THE RELEASE ID COMES FROM THE WIRE.
   *
   * `POST /v1/sites/:slug/rollback` hands `rollbackSite` whatever the caller sent and it
   * reaches `activateRelease` unexamined, so the confinement there is not defence in depth
   * — it is the check. A lexical join would resolve a climbing name to a directory
   * somewhere else on the host and, when that directory exists, point a PUBLIC document
   * root at it.
   *
   * The escaping name is aimed at a directory that really EXISTS, so `existsSync` is not
   * what refuses. Measured honestly: with `confinedPath` downgraded to a lexical `join`
   * these cases still refuse, because `swapSymlink`'s relative-target check catches every
   * one of them a step later — so the confinement here is genuine defence in depth and the
   * property this test holds is the composite one its name states, which is the property a
   * museum actually has. Both guards are individually gated: this file's
   * "a surface whose store is outside its own webspace" case holds the second.
   */
  test.each(['../../..', '../not-a-release-store', '/etc'])(
    'a rollback to the name %s is refused, and the served link does not move',
    async name => {
      const neighbour = join(preprod().webspace, 'not-a-release-store');
      await mkdir(neighbour, { recursive: true });
      await makeSource('<h1>live</h1>');
      const good = await promoteRelease(preprod(), SRC);

      await expect(activateRelease(preprod(), name)).rejects.toThrow();

      expect(await currentRelease(preprod())).toBe(good);
      expect(await readServed('preprod', SLUG, 'index.html')).toBe('<h1>live</h1>');
    },
  );

  test('prunes releases beyond RELEASES_RETAINED, keeping the newest', async () => {
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
    // The most recent release survived pruning. NOTE what this does NOT assert: retention
    // alone guarantees it, because the newest is never inside `releases.slice(keep)`. The
    // served-release EXCLUSION is a different property and is held below, by
    // `pruneReleases` called directly on a surface that has been rolled back.
    expect(remaining).toContain(made[made.length - 1]);
  });

  test('a rollback serves the older release, whose bytes survived the churn', async () => {
    // Promote past the cap, then roll back to the oldest release that survived pruning. Its
    // bytes must still be on disk and still be what the link hands a visitor. This is the
    // RETENTION property; the pruning-never-unlinks-what-is-served property is the next
    // test, which had to be written as its own case because this sequence stops before
    // pruning can ever consider an aged, served release.
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

  /**
   * PRUNING NEVER UNLINKS WHAT IS SERVED — asserted on the state that produces it.
   *
   * `pruneReleases` excludes the currently-served release even when it has aged past the
   * cap, and its own comment says that is "exactly what a rollback produces". Nothing
   * asserted it: the two tests above were named for the property and could not observe it,
   * because through `promoteRelease` the prune always runs immediately after the link was
   * pointed at the NEWEST release, which retention keeps anyway. Deleting the exclusion
   * left the whole suite green.
   *
   * So the state is built and the door is called: promote past the cap, roll production
   * back to the OLDEST retained release (now aged well past it), then prune. The served
   * bytes must still be there and still be served — a 404 out of a directory that no longer
   * exists, at a moment nobody connects to a publish, is the failure two release stores
   * exist to prevent.
   */
  test('a rolled-back release is never pruned, however far past the cap it has aged', async () => {
    // The release the museum rolled back to, and what it serves.
    await makeSource('<h1>the rolled-back page</h1>');
    const served = await promoteRelease(preprod(), SRC);
    expect(await currentRelease(preprod())).toBe(served);

    // Newer releases accumulate in the store WITHOUT the served link moving — the state a
    // rollback leaves behind, and the only one in which the exclusion is load-bearing. They
    // are made the way a promote makes one (a directory appearing in the store under a
    // fresh, lexically-later id), because going through `promoteRelease` would repoint the
    // link and destroy the very situation under test.
    const newer: string[] = [];
    for (let i = 0; i < config.RELEASES_RETAINED + 2; i++) {
      await new Promise(r => setTimeout(r, 2));
      const id = newReleaseId();
      await mkdir(join(preprod().storeDir, id), { recursive: true });
      await writeFile(join(preprod().storeDir, id, 'index.html'), `<h1>v${i}</h1>`, 'utf8');
      newer.push(id);
    }

    // The served release is now the OLDEST of more entries than the cap allows: squarely
    // inside `releases.slice(keep)`, a prune candidate in every respect but one.
    const before = await listReleases(preprod()); // newest first
    expect(before.length).toBeGreaterThan(config.RELEASES_RETAINED);
    expect(before.indexOf(served)).toBeGreaterThanOrEqual(config.RELEASES_RETAINED);

    await pruneReleases(preprod());

    // It survived, and it still SERVES: the link is not dangling over a removed directory.
    expect(existsSync(releaseStorePath('preprod', SLUG, served))).toBe(true);
    expect(await currentRelease(preprod())).toBe(served);
    expect(await readServed('preprod', SLUG, 'index.html')).toBe('<h1>the rolled-back page</h1>');
    // And pruning did happen — otherwise this would pass against a prune that does nothing.
    const after = await listReleases(preprod());
    expect(after.length).toBeLessThan(before.length);
    expect(after).not.toContain(newer[0]);
  });

  /**
   * THE DELETE GOES THROUGH `confinedPath`, NOT `join`.
   *
   * The names come from a directory listing, and a delete is the one operation where "it
   * was only ever going to be a release id" is not good enough. A store holding an entry
   * whose name climbs out of it must make the prune REFUSE that entry rather than remove
   * whatever it resolves to — so the assertion is on the neighbour that survives, not on
   * an error message.
   */
  test.each([
    ['..', 'the store itself'],
    ['../not-a-release-store', "the other surface's tree"],
    ['../../..', 'the whole webspace base'],
    ['/etc', 'an absolute path'],
  ])('deleteRelease refuses the name %s (%s) and unlinks nothing', async (name, _what) => {
    // The neighbour the escaping name resolves to. Nothing under it may be touched.
    const neighbour = join(preprod().webspace, 'not-a-release-store');
    await mkdir(neighbour, { recursive: true });
    await writeFile(join(neighbour, 'keep.txt'), 'the other surface lives here', 'utf8');
    // A real release beside it, so the store exists and the door has somewhere lawful to act.
    await makeSource('<h1>v1</h1>');
    const real = await promoteRelease(preprod(), SRC);

    await expect(deleteRelease(preprod(), name)).rejects.toThrow();

    expect(existsSync(join(neighbour, 'keep.txt'))).toBe(true);
    expect(existsSync(preprod().webspace)).toBe(true);
    // And the door still works on a lawful name — the refusal is about escape, not about
    // refusing everything, which is how a guard passes a test by being broken.
    await deleteRelease(preprod(), real);
    expect(existsSync(releaseStorePath('preprod', SLUG, real))).toBe(false);
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

  /**
   * THE SOURCE ROOT ITSELF IS NOT A LINK — the half `copyTree` does not cover.
   *
   * `copyTree` refuses a symlinked ENTRY; `assertSourceRoot` refuses a symlinked TREE, and
   * the distinction cost a real hole: `ln -s /etc dist` produced an output directory that
   * existed, was lexically inside the workspace, and whose `readdir` listed somebody else's
   * files — none of them links — so the copy landed in the release store and was served.
   *
   * The existing build-path test could not hold it: the builder's own `resolveOutputDir`
   * lstats first and refuses with a different message, so `promoteRelease` is never reached.
   * `publishSite` and every future caller reach it directly, which is why the refusal is
   * asserted HERE, on the door itself.
   */
  test('a source directory that IS a symlink is refused, and nothing is copied', async () => {
    // A real tree somewhere else, and a link to it standing where the build output should be.
    const elsewhere = join(preprod().webspace, '..', 'somebody-elses-tree');
    await mkdir(elsewhere, { recursive: true });
    await writeFile(join(elsewhere, 'index.html'), '<h1>not ours</h1>', 'utf8');
    const linkedSource = join(SRC, '..', 'linked-output');
    await rm(linkedSource, { recursive: true, force: true });
    await symlink(elsewhere, linkedSource);

    await expect(promoteRelease(preprod(), linkedSource)).rejects.toThrow(/SYMBOLIC LINK/);

    expect(await listReleases(preprod())).toEqual([]);
    expect(existsSync(servedPath('preprod', SLUG))).toBe(false);
    // The decisive assertion: the other tree's bytes are not in the store.
    const store = preprod().storeDir;
    expect(existsSync(store) ? await readdir(store) : []).toEqual([]);
  });

  test('a fifo in the build output is refused — only files and directories are promotable', async () => {
    // Whatever put a fifo, socket or device node in a build output did not put it there as
    // part of a web page, and a web server reading one blocks the worker that opened it.
    await makeSourceDir({ 'index.html': '<h1>v1</h1>' });
    const fifo = join(SRC, 'pipe');
    const mk = await runBinary(['/usr/bin/mkfifo', fifo], { timeoutMs: 10_000 });
    expect(mk.exitCode).toBe(0);

    await expect(promoteRelease(preprod(), SRC)).rejects.toThrow(/not a regular\s+file or a directory/);
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

/**
 * THE SERVED LINK'S TARGET STAYS RELATIVE.
 *
 * A surface is a PAIR, and a pair whose store does not sit under the link's own directory
 * would need a target that climbs out of the webspace. Such a link survives no move and no
 * bind-mount, and it is refused by the very web-server configuration the provisioner
 * renders — `disable_symlinks off` on nginx, `Options -FollowSymLinks +SymLinksIfOwnerMatch`
 * on Apache — both of which are written on the assumption the link stays inside the tree the
 * server owns. The refusal is the only thing holding that assumption, and nothing held the
 * refusal: disarming it left the suite green.
 */
describe('a surface whose store is outside its own webspace', () => {
  test('is refused rather than served through a link that climbs out', async () => {
    const good = preprod();
    // The store moved OUT of the webspace; the link stays where the vhost expects it.
    const outside = join(good.webspace, '..', 'store-outside-the-webspace');
    await mkdir(outside, { recursive: true });
    const broken = { ...good, storeDir: outside };

    await makeSource('<h1>v1</h1>');
    await expect(promoteRelease(broken, SRC)).rejects.toThrow(/relative/);

    // And nothing was served: no link was created over the webspace's link path.
    expect(existsSync(good.linkPath)).toBe(false);
  });
});
