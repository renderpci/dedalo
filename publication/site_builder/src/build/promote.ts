/**
 * Release promotion — copy a built artifact into a surface's release store and flip the
 * served symlink atomically.
 *
 * A "surface" is PREPROD_ROOT or PROD_ROOT. Each holds:
 *   <root>/.releases/<slug>/<release>/   — immutable copies of past builds
 *   <root>/<slug> -> .releases/<slug>/<release>   — the symlink the web server serves
 *
 * Promotion copies the source into a fresh release directory, then swaps the symlink by
 * creating a temp link and renaming it over the target — rename is atomic on the same
 * filesystem, so the web server never sees a half-updated site. The symlink target is
 * RELATIVE so the whole surface tree can be moved or bind-mounted without breaking links.
 * Old releases beyond RELEASES_RETAINED are pruned, keeping rollback targets bounded.
 *
 * Prod is a separate copy from the workspace, so deleting a workspace can never take down
 * a published site — the release store outlives it.
 */

import { cp, mkdir, readdir, readlink, rename, rm, symlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { confinedPath } from '../util/paths';
import { config } from '../config';

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

function releasesDir(root: string, slug: string): string {
  return confinedPath(root, '.releases', slug);
}

/** Absolute path of a specific release's directory on a surface (the promoted bytes). */
export function releasePath(root: string, slug: string, release: string): string {
  return confinedPath(releasesDir(root, slug), release);
}

/**
 * Copies `sourceDir` into a new release under `root` and points <root>/<slug> at it.
 * Returns the release id. Prunes to RELEASES_RETAINED.
 */
export async function promoteRelease(root: string, slug: string, sourceDir: string): Promise<string> {
  if (!existsSync(sourceDir)) {
    throw new Error(`promoteRelease: source does not exist: ${sourceDir}`);
  }
  const release = newReleaseId();
  const dir = releasesDir(root, slug);
  const releasePath = confinedPath(dir, release);

  await mkdir(dir, { recursive: true });
  await cp(sourceDir, releasePath, { recursive: true });

  await swapSymlink(root, slug, release);
  await pruneReleases(root, slug);
  return release;
}

/** Points <root>/<slug> at an existing release (rollback). Throws if it is missing. */
export async function activateRelease(root: string, slug: string, release: string): Promise<void> {
  const releasePath = confinedPath(releasesDir(root, slug), release);
  if (!existsSync(releasePath)) {
    throw new Error(`activateRelease: no such release '${release}' for '${slug}'`);
  }
  await swapSymlink(root, slug, release);
}

/** Newest-first list of a slug's releases on a surface. */
export async function listReleases(root: string, slug: string): Promise<string[]> {
  const dir = releasesDir(root, slug);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
    .reverse();
}

/** The release the served symlink currently points at, or null. */
export async function currentRelease(root: string, slug: string): Promise<string | null> {
  const link = confinedPath(root, slug);
  if (!existsSync(link)) return null;
  try {
    const target = await readlink(link);
    return target.split('/').filter(Boolean).pop() ?? null;
  } catch {
    return null;
  }
}

/**
 * Repoint <root>/<slug> at `release` without ever exposing a dangling or half-written
 * link: create a uniquely-named temp symlink alongside the target, then rename it over the
 * target. rename(2) is atomic on the same filesystem, so a concurrent web-server request
 * sees either the old release or the new one, never nothing. The temp name embeds the
 * release so two swaps cannot collide on the same tmp path.
 */
async function swapSymlink(root: string, slug: string, release: string): Promise<void> {
  const link = confinedPath(root, slug);
  const tmp = link + '.tmp-' + release;
  // Relative target so the surface tree stays relocatable.
  const relativeTarget = join('.releases', slug, release);
  await rm(tmp, { force: true }).catch(() => {});
  await symlink(relativeTarget, tmp);
  await rename(tmp, link); // atomic on the same filesystem
}

/**
 * Trims a surface's release store to RELEASES_RETAINED, deleting the oldest beyond the
 * cap. The currently-served release is explicitly excluded from deletion even if it has
 * aged past the cap (e.g. after a rollback to an old release), so pruning can never unlink
 * the bytes the web server is serving. Deletions are best-effort — a failed rm is skipped,
 * not fatal to the promotion that triggered it.
 */
async function pruneReleases(root: string, slug: string): Promise<void> {
  const releases = await listReleases(root, slug); // newest first
  const keep = config.RELEASES_RETAINED;
  const current = await currentRelease(root, slug);
  const doomed = releases.slice(keep).filter(r => r !== current);
  for (const release of doomed) {
    await rm(confinedPath(releasesDir(root, slug), release), { recursive: true, force: true }).catch(() => {});
  }
}
