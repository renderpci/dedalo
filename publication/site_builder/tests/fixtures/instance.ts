/**
 * THE TEST INSTANCE — the one place the suite learns where its scratch roots are,
 * how to reset them, and what declares them the suite's to destroy.
 *
 * WHY THIS EXISTS. Until now every test that touched the filesystem read
 * `config.SITES_ROOT` / `config.PREPROD_ROOT` / `config.PROD_ROOT` straight off the
 * frozen config singleton and carried its own three-line `wipeRoots()`. Seven copies of
 * the same knowledge: seven files to edit whenever the daemon's idea of "where my roots
 * are" changes, and seven chances to edit six of them. The per-instance (per-museum)
 * isolation work changes exactly that idea — the roots become instance-scoped
 * (AGENT_HOME / AUDIT_DIR / WEBSPACE_BASE, one instance per daemon). This module is the
 * seam that work lands against: the config shape moves HERE, once, and the eleven test
 * files keep reading `roots.sitesRoot` and calling `resetInstance()` unchanged.
 *
 * That is the whole point of building the fixture BEFORE the refactor rather than after.
 * A test suite that reaches through to the config singleton has no seam, so a config
 * change breaks every file at once and the real regressions are unreadable inside the
 * noise. With the seam in place, a broken root wiring is ONE red file, and a broken
 * behaviour is the test that actually asserts that behaviour.
 *
 * THE MARKER IS WRITTEN NOW, THOUGH NOTHING READS IT YET. Each root carries a
 * `.dedalo_site_instance` file naming the instance it belongs to. Today nothing asks for
 * it; the daemon will (it must refuse to boot against a root that has not declared
 * itself, exactly as the engine refuses a media root without `.dedalo_test_media` and a
 * database without its `dedalo_test_marker` row — a PATH is a claim, a MARKER is the
 * directory itself saying what it is and whose it is). Writing it here today means the
 * boot assertion arrives to a fixture that already satisfies it, instead of arriving
 * with eleven red files and the temptation to weaken the assertion.
 *
 * SCOPE. This module owns ROOTS and their lifecycle. It deliberately does NOT wrap the
 * rest of the config (SERVICE_TOKEN, MAX_SITES, BASE_PATH …): those keys are not moving,
 * and a wrapper around a stable thing is indirection without a seam.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { config } from '../../src/config';
import { INSTANCE_MARKER, markerContent } from '../../src/provision/layout';

/**
 * The instance these scratch roots belong to. Generic on purpose — the same law as the
 * engine's generic `test` TLD: a fixture named after a real museum passes on one machine
 * and nowhere else.
 */
export const INSTANCE = 'test';

/**
 * The marker filename and its content come from `src/provision/layout.ts`, which owns
 * every naming convention on this subsystem — they are RE-EXPORTED here, never restated.
 *
 * This is the seam the fixture was built to be. The suite writes the marker, the daemon's
 * boot check will read it, and the provisioner plants it; three readers of one filename,
 * and a fixture that spelled its own copy would be the fourth — passing green while the
 * daemon refused to boot against the very roots the suite had just declared. The
 * guarantee is not "the marker is written", it is "everyone means the same file".
 *
 * The content is the INSTANCE NAME and nothing else (newline-terminated), so the boot
 * check can be a string compare rather than a parse: a root that names another instance is
 * as wrong as a root that names none, and must be refusable on that basis.
 */
export { INSTANCE_MARKER };
export const INSTANCE_MARKER_CONTENT = markerContent(INSTANCE);

/**
 * The scratch roots, read from config ONCE, in this one module, and frozen.
 *
 * Read once because the daemon's own config is parsed once at import (src/config.ts) and
 * a test that re-reads it mid-run would be asserting against a value nothing else in the
 * process can see. Frozen because a test that reassigns a root is not testing the daemon
 * any more — it is testing a root the daemon never had.
 */
export const roots = Object.freeze({
  /** Workspaces: the git repos the agents work in (and, today, the .audit log). */
  sitesRoot: config.SITES_ROOT,
  /** Preprod: immutable release copies + the served symlink per site. */
  preprodRoot: config.PREPROD_ROOT,
  /** Production: the COPY the web server serves; survives its workspace being deleted. */
  prodRoot: config.PROD_ROOT,
});

/** The two SERVED surfaces, addressed by name rather than by root variable. */
export type Surface = 'preprod' | 'prod';

/** The root behind a served surface — for the APIs that take a root as an argument. */
export function surfaceRoot(surface: Surface): string {
  return surface === 'preprod' ? roots.preprodRoot : roots.prodRoot;
}

/** Every root, in the order a reset walks them. */
export function allRoots(): readonly string[] {
  return [roots.sitesRoot, roots.preprodRoot, roots.prodRoot];
}

/** Where a root's instance marker lives. */
export function markerPath(root: string): string {
  return join(root, INSTANCE_MARKER);
}

/**
 * Declare `root` as belonging to this instance, creating it if needed.
 *
 * Idempotent, and it REWRITES rather than skipping an existing marker: a root left over
 * from another instance's run must end up naming this one, not keep its old claim.
 */
export async function markInstanceRoot(root: string): Promise<string> {
  await mkdir(root, { recursive: true });
  await writeFile(markerPath(root), INSTANCE_MARKER_CONTENT, 'utf8');
  return root;
}

/** Does `root` declare itself ours? (The shape the daemon's boot check will need.) */
export async function instanceRootIsMarked(root: string): Promise<boolean> {
  const marker = markerPath(root);
  if (!existsSync(marker)) return false;
  return (await readFile(marker, 'utf8')).trim() === INSTANCE;
}

/**
 * A root that exists but does NOT declare itself ours is REFUSED, never destroyed.
 *
 * The same law the engine applies to its test database and its test media root: a path
 * is only a claim, and a claim is not a guarantee. `.env.test` is an ordinary file, a
 * root is an ordinary string, and `resetInstance()` is an `rm -rf` — so the one thing
 * standing between a mistyped root and somebody's real site tree must be the directory
 * itself saying whose it is. An EMPTY directory is adopted rather than refused: there is
 * nothing there to destroy, and refusing it would only punish a clean checkout.
 */
async function assertDestroyable(root: string): Promise<void> {
  if (!existsSync(root)) return; // nothing to destroy
  if (await instanceRootIsMarked(root)) return; // ours, by its own declaration

  const entries = await readdir(root);
  if (entries.length === 0) return; // empty: nothing to lose by adopting it

  const marker = markerPath(root);
  const found = existsSync(marker) ? (await readFile(marker, 'utf8')).trim() : '(no marker)';
  throw new Error(
    `resetInstance refuses to wipe '${root}': it holds ${entries.length} entr` +
      `${entries.length === 1 ? 'y' : 'ies'} and does not declare itself instance ` +
      `'${INSTANCE}' (found: ${found}). Nothing was written. Expected a ` +
      `'${INSTANCE_MARKER}' file naming '${INSTANCE}' — if this really is a scratch ` +
      `root, delete it by hand and re-run.`,
  );
}

/**
 * WIPE AND RE-DECLARE ALL THREE ROOTS — the single replacement for every hand-rolled
 * `wipeRoots()` in the suite.
 *
 * Three properties the copies did not have:
 *
 *   - It REFUSES a root that is not ours (see assertDestroyable above). The copies were
 *     an unguarded `rm -rf` on whatever the config happened to resolve to.
 *   - It resets ALL THREE roots, always. The copies each wiped the subset their file
 *     happened to dirty, which quietly made every test depend on which file ran before
 *     it. A test starts from the same empty instance whatever else the suite did.
 *   - It leaves the instance BOOTABLE, not merely empty: `rm -rf` takes the marker with
 *     it, so the reset plants it again. A fixture that resets into an undeclared
 *     instance would fail the boot check the moment it exists.
 */
export async function resetInstance(): Promise<void> {
  // Check every root BEFORE destroying any, so a bad third root cannot leave the first
  // two already wiped.
  for (const root of allRoots()) await assertDestroyable(root);
  for (const root of allRoots()) {
    await rm(root, { recursive: true, force: true });
    await markInstanceRoot(root);
  }
}

/** A path inside the WORKSPACE root (a site's repo, or the scratch source below). */
export function workspacePath(...segments: string[]): string {
  return join(roots.sitesRoot, ...segments);
}

/** A path inside a served surface — `servedPath('prod', 'demo', 'index.html')`. */
export function servedPath(surface: Surface, ...segments: string[]): string {
  return join(surfaceRoot(surface), ...segments);
}

/**
 * Read a file THROUGH the served symlink — the assertion "what the web server would
 * hand a visitor right now", which is the only thing a promote/publish/rollback test
 * actually cares about. Reading the release directory directly would pass even if the
 * symlink swap never happened.
 */
export function readServed(surface: Surface, ...segments: string[]): Promise<string> {
  return readFile(servedPath(surface, ...segments), 'utf8');
}

/**
 * The default scratch source directory: a plain directory of files standing in for
 * "whatever a build produced". Inside the workspace root so `resetInstance()` sweeps it.
 * The `__…__` name is not a valid slug, so it can never collide with a real site.
 */
export const SCRATCH_SOURCE = workspacePath('__src__');

/**
 * Build a source directory from a {relative path → content} map, replacing whatever was
 * there. Returns the directory, so a caller can hand it straight to `promoteRelease`.
 *
 * Replacing rather than merging is deliberate: a promote test that writes v2 over v1
 * must promote v2 ALONE, or "the symlink now serves the new release" would pass on a
 * directory that still holds the old bytes too.
 */
export async function makeSourceDir(
  files: Record<string, string>,
  dir: string = SCRATCH_SOURCE,
): Promise<string> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = join(dir, relative);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
  return dir;
}
