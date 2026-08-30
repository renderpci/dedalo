/**
 * Release promotion — copy a built artifact into a surface's release store and flip the
 * served symlink atomically.
 *
 * A SURFACE IS A PAIR, NOT A ROOT. Every function here takes the two paths one surface of
 * one site actually is (`SurfacePaths`, derived in `src/provision/layout.ts` and resolved
 * for a live site by `src/sites/webspace.ts`):
 *
 *   storeDir  <webspace>/.releases/<pre|web>/<release>/   — immutable copies of past builds
 *   linkPath  <webspace>/<pre|web> -> .releases/<pre|web>/<release>   — what a vhost serves
 *
 * It used to take `(root, slug)` — one tree per SURFACE, every site a directory inside it,
 * served at `<root>/<slug>/`. The provisioner builds no such tree and no generated vhost
 * ever served one: a converged host had two vhosts per site pointing at document roots this
 * daemon never wrote to. Passing the pair explicitly is what makes the two ends one shape;
 * the promote layer no longer knows a naming convention at all, which is the point — this
 * module moves bytes, `layout.ts` owns names.
 *
 * Promotion COPIES the source into a staging directory inside the store, renames it into
 * place, then swaps the symlink by creating a temp link and renaming it over the target.
 * rename(2) is atomic on the same filesystem, so the web server never sees a half-updated
 * site and never sees a half-copied release offered as a rollback target. The symlink target
 * is RELATIVE so the whole webspace can be moved or bind-mounted without breaking it.
 *
 * NOTHING SYMLINKED IS EVER PROMOTED — THE ROOT INCLUDED. An agent turn writes arbitrary
 * files into the workspace this copies from, and `cp -r` does not dereference: an absolute
 * symlink in a build output lands verbatim in the release store, where the web server would
 * resolve it as root's view of the filesystem. The vhosts' `disable_symlinks` /
 * `SymLinksIfOwnerMatch` are the second line of that defence; refusing to copy the link at
 * all is the first. It is a REFUSAL and not a silent strip, because a publish that quietly
 * dropped part of what was built is a museum's page missing a section nobody was told about.
 *
 * The walk refused every ENTRY it found and never asked about the directory it was HANDED —
 * the one path in the copy taken on trust, and the one an agent controls most directly
 * (`ln -s /anything dist`). It is lstat'd now, here, so the refusal holds however this
 * function is reached; `src/build/builder.ts` additionally proves the realpath stays inside
 * the workspace, which is the half only the caller can know.
 *
 * Prod is a separate copy from preprod and from the workspace, so deleting either can never
 * take down a published site — and pruning one surface's store can never unlink the bytes
 * the other one serves, because the two stores are different directories.
 */

import { copyFile, mkdir, readdir, readlink, rename, rm, symlink } from 'node:fs/promises';
import { existsSync, lstatSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';
import type { SurfacePaths } from '../provision/layout';

/**
 * The staging directory's prefix. Dot-prefixed for two reasons: `listReleases` skips it, so
 * a crash mid-copy can never leave something the rollback UI offers as a release; and the
 * generated vhosts already deny every hidden path, so it is unreachable by URL even in the
 * seconds it exists.
 */
const STAGING_PREFIX = '.staging-';

// A process-local monotonic counter disambiguates releases minted in the same millisecond
// and preserves lexical ordering (zero-padded), so listReleases stays correctly sorted.
let releaseCounter = 0;

/** A filesystem-safe, lexically-sortable, unique release id (UTC + monotonic counter). */
export function newReleaseId(): string {
  // 2026-07-15T10:20:30.123Z -> 20260715T102030123Z
  const iso = new Date().toISOString().replace(/[-:.]/g, '');
  const seq = String(releaseCounter++ % 1_000_000).padStart(6, '0');
  return `${iso}-${seq}`;
}

/** How a refusal names the surface it came from. */
function describe(surface: SurfacePaths): string {
  return `the ${surface.surface} surface at '${surface.linkPath}'`;
}

/** Absolute path of a specific release's directory in a surface's store. */
export function releasePath(surface: SurfacePaths, release: string): string {
  return confinedPath(surface.storeDir, release);
}

/**
 * Copies `sourceDir` into a new release in `surface`'s store and points the served link at
 * it. Returns the release id. Prunes to RELEASES_RETAINED.
 */
export async function promoteRelease(surface: SurfacePaths, sourceDir: string): Promise<string> {
  if (!existsSync(sourceDir)) {
    throw new Error(
      `promoteRelease: the source '${sourceDir}' does not exist, so there is nothing to ` +
        `promote to ${describe(surface)}. Nothing was written.`,
    );
  }
  assertSourceRoot(surface, sourceDir);
  const release = newReleaseId();
  const target = confinedPath(surface.storeDir, release);
  const staging = confinedPath(surface.storeDir, STAGING_PREFIX + release);

  await mkdir(surface.storeDir, { recursive: true });
  try {
    await copyTree(sourceDir, staging, sourceDir);
  } catch (error) {
    // A refused or failed copy leaves NOTHING behind: a half-copied directory renamed into
    // the store would be a rollback target that serves an incomplete site.
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  await rename(staging, target); // atomic: the release appears whole or not at all

  await swapSymlink(surface, release);
  await pruneReleases(surface);
  return release;
}

/**
 * THE SOURCE ROOT IS NOT A LINK.
 *
 * `copyTree` refuses a symlinked entry inside the tree; this refuses a symlinked tree. The
 * distinction cost a real hole: `ln -s /etc dist` produced a build whose output directory
 * passed every check — it existed, it was lexically inside the workspace, and `readdir`
 * happily listed somebody else's files, none of which were themselves links — and the copy
 * landed in the release store and was served. Verified through the real build pipeline
 * before this existed.
 */
function assertSourceRoot(surface: SurfacePaths, sourceDir: string): void {
  if (lstatSync(sourceDir).isSymbolicLink()) {
    throw new Error(
      `promoteRelease: the source '${sourceDir}' is a SYMBOLIC LINK, so what would be copied ` +
        `into ${describe(surface)} is whatever it points at rather than what was built. The ` +
        `link is not followed. Nothing was written.`,
    );
  }
}

/**
 * A recursive copy that walks the tree ITSELF instead of handing it to `cp`.
 *
 * Two properties `cp(…, {recursive:true})` does not have, and both of them are the reason:
 * it never follows or reproduces a symlink (it refuses, naming the offending path), and it
 * copies nothing but directories and regular files — a fifo, a socket or a device node in a
 * build output is refused for the same reason, because whatever put it there did not put it
 * there as part of a web page.
 */
async function copyTree(from: string, to: string, sourceRoot: string): Promise<void> {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(from, entry.name);
    const destination = join(to, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(
        `promoteRelease: '${relative(sourceRoot, source) || entry.name}' is a symbolic link. ` +
          `A build output is copied into an immutable release store that a web server reads, ` +
          `and a link copied verbatim would point out of it — at whatever the agent that ` +
          `wrote it named. Have the build emit the file itself. Nothing was written.`,
      );
    }
    if (entry.isDirectory()) {
      await copyTree(source, destination, sourceRoot);
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(
        `promoteRelease: '${relative(sourceRoot, source) || entry.name}' is not a regular ` +
          `file or a directory. Only the two are promotable — nothing else belongs in a ` +
          `served tree. Nothing was written.`,
      );
    }
    await copyFile(source, destination);
  }
}

/**
 * Points the served link at an existing release (rollback). Throws if it is missing.
 *
 * `confinedPath`, and the release id here arrives from the WIRE: `POST
 * /v1/sites/:slug/rollback` hands `rollbackSite` whatever the caller sent and it reaches
 * this line unexamined. It is DEFENCE IN DEPTH rather than the only check — measured, a
 * climbing name downgraded to a lexical join is caught a step later by `swapSymlink`'s
 * relative-target refusal — and it stays because the two guards answer different questions
 * and neither should be the last one. tests/promote.test.ts holds the composite behaviour
 * through this door and the relative-target refusal on its own.
 */
export async function activateRelease(surface: SurfacePaths, release: string): Promise<void> {
  const path = confinedPath(surface.storeDir, release);
  if (!existsSync(path)) {
    throw new Error(
      `activateRelease: ${describe(surface)} has no release '${release}' (looked in ` +
        `'${surface.storeDir}'). Nothing was written.`,
    );
  }
  await swapSymlink(surface, release);
}

/** Newest-first list of the releases retained on a surface. */
export async function listReleases(surface: SurfacePaths): Promise<string[]> {
  if (!existsSync(surface.storeDir)) return [];
  const entries = await readdir(surface.storeDir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.')) // '.' skips a staging directory
    .map(e => e.name)
    .sort()
    .reverse();
}

/**
 * The release the served link currently points at, or null.
 *
 * NULL COVERS THE PLACEHOLDER, and that is not a detail: the provisioner creates the link
 * pointing at the STORE ITSELF (`.releases/pre`) so the vhost has a document root before the
 * first publish. Reading the last path segment blindly would report that empty placeholder
 * as a release called 'pre' — and `publishSite` would then try to promote it. So the target
 * is resolved and accepted only when it is a direct child of this surface's own store.
 */
export async function currentRelease(surface: SurfacePaths): Promise<string | null> {
  if (!existsSync(surface.linkPath)) return null;
  try {
    const target = await readlink(surface.linkPath);
    const resolved = resolve(dirname(surface.linkPath), target);
    if (dirname(resolved) !== resolve(surface.storeDir)) return null;
    const name = resolved.split('/').filter(Boolean).pop() ?? null;
    return name && !name.startsWith('.') ? name : null;
  } catch {
    return null;
  }
}

/**
 * Repoint the served link at `release` without ever exposing a dangling or half-written
 * link: create a uniquely-named temp symlink alongside the target, then rename it over the
 * target. rename(2) is atomic on the same filesystem, so a concurrent web-server request
 * sees either the old release or the new one, never nothing. The temp name embeds the
 * release so two swaps cannot collide on the same tmp path.
 *
 * THE TARGET STAYS RELATIVE — that is what makes publish and rollback atomic within one
 * filesystem and the whole webspace relocatable. It is computed from the pair rather than
 * spelled, and a pair whose store does not sit under the link's own directory is REFUSED:
 * such a link would have to climb out of the webspace, which neither survives a move nor
 * passes a web server configured (as the generated vhosts are) to distrust links.
 */
async function swapSymlink(surface: SurfacePaths, release: string): Promise<void> {
  const relativeTarget = relative(dirname(surface.linkPath), join(surface.storeDir, release));
  if (relativeTarget.startsWith('..')) {
    throw new Error(
      `promoteRelease: ${describe(surface)} has its release store at '${surface.storeDir}', ` +
        `outside the directory holding its served link. The link's target must be relative ` +
        `for the webspace to stay relocatable. Nothing was written.`,
    );
  }
  const tmp = surface.linkPath + '.tmp-' + release;
  await rm(tmp, { force: true }).catch(() => {});
  await symlink(relativeTarget, tmp);
  await rename(tmp, surface.linkPath); // atomic on the same filesystem
}

/**
 * Trims a surface's release store to RELEASES_RETAINED, deleting the oldest beyond the cap.
 *
 * TWO THINGS KEEP THIS FROM UNLINKING WHAT IS SERVED. The currently-served release is
 * excluded explicitly, even when it has aged past the cap (which is exactly what a rollback
 * produces); and a surface prunes ONLY ITS OWN store, which under the webspace pair is a
 * different directory from the other surface's — so preprod's pruning cannot reach the bytes
 * production serves even in principle. That was the reason for two stores rather than one
 * shared store with two links, and it is why publish COPIES instead of re-pointing.
 *
 * Deletions are best-effort: a failed rm is skipped, not fatal to the promotion that
 * triggered it.
 *
 * EXPORTED FOR ITS OWN GATE, and that is not a testing convenience. Reached only through
 * `promoteRelease` this function runs immediately after `swapSymlink` pointed the link at
 * the NEWEST release, and `RELEASES_RETAINED` has a floor of 1 — so `releases.slice(keep)`
 * could never contain the served one and the exclusion below was unreachable, which is
 * exactly why every mutation of it left the suite green. A guard that cannot be reached is
 * a guard that cannot be held, and this subsystem does not keep those: it is a door now, so
 * `tests/promote.test.ts` can roll a surface back to an aged release and call it directly.
 */
export async function pruneReleases(surface: SurfacePaths): Promise<void> {
  const releases = await listReleases(surface); // newest first
  const keep = config.RELEASES_RETAINED;
  const current = await currentRelease(surface);
  const doomed = releases.slice(keep).filter(release => release !== current);
  for (const release of doomed) {
    await deleteRelease(surface, release);
  }
}

/**
 * DELETE ONE RELEASE FROM A SURFACE'S STORE — the daemon's only recursive delete inside a
 * tree a web server reads, and the reason it is a named door rather than two lines inside
 * the prune loop.
 *
 * `confinedPath`, never `join`. Today the names come from a directory listing and cannot
 * climb anywhere, so inside `pruneReleases` the confinement is defence in depth against a
 * caller that does not exist yet — which is precisely why substituting `join` there left
 * the suite green and would keep leaving it green until the day such a caller arrived. A
 * guard whose only value is for a future caller has to be reachable BY one, so it is: this
 * function takes the name and refuses it, and `tests/promote.test.ts` hands it the names a
 * corrupted listing or a future caller could produce.
 *
 * Best-effort on the removal itself, which is the prune's contract: a failed `rm` is
 * skipped, never fatal to the promotion that triggered it. The CONFINEMENT is not
 * best-effort — an escaping name throws, and throws before anything is unlinked.
 */
export async function deleteRelease(surface: SurfacePaths, release: string): Promise<void> {
  const path = confinedPath(surface.storeDir, release);
  await rm(path, { recursive: true, force: true }).catch(() => {});
}
