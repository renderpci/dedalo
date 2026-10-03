/**
 * THE TEST INSTANCE — the one place the suite learns where its scratch roots are, how to
 * reset them, and what declares them the suite's to destroy.
 *
 * Pattern: publication/site_builder/tests/fixtures/instance.ts (not imported — separate
 * packages). Every root comes from the agent's own resolved config (.env.test) ONCE, and
 * every root must sit inside `<package>/.test-tmp/`. The scratch tree declares itself with
 * the instance marker (src/instance/roots.ts); a non-empty scratch tree that does not is
 * REFUSED, never wiped. The state root carries the same marker — the shape the boot
 * preflight checks.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { config } from '../../src/config';
import { INSTANCE_MARKER, STATE_SUBDIRS, markerContent } from '../../src/instance/roots';

/** The instance the suite runs as. Generic on purpose (the engine's generic `test` TLD law). */
export const INSTANCE = 'test';

/** The scratch tree every root lives in. */
export const SCRATCH_DIR_NAME = '.test-tmp';
export const SCRATCH_ROOT = join(resolve(import.meta.dir, '..', '..'), SCRATCH_DIR_NAME);

function strictlyInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

function scratchOnly(key: string, path: string): string {
  if (!strictlyInside(SCRATCH_ROOT, path)) {
    throw new Error(`tests/fixtures/instance.ts refuses ${key}='${path}': it is not inside '${SCRATCH_ROOT}'.`);
  }
  return path;
}

if (config.NODE_ENV !== 'test') {
  throw new Error(`tests/fixtures/instance.ts refuses NODE_ENV='${config.NODE_ENV}': the suite runs only under NODE_ENV=test.`);
}
if (config.INSTANCE !== INSTANCE) {
  throw new Error(`tests/fixtures/instance.ts refuses instance '${config.INSTANCE}': the suite's instance is '${INSTANCE}'.`);
}

/** The roots, read from config once and frozen. `null` = the config does not have that root. */
export const roots = Object.freeze({
  stateRoot: scratchOnly('STATE_ROOT', config.STATE_ROOT),
  mediaRoot: config.MEDIA_ROOT === undefined ? null : scratchOnly('MEDIA_ROOT', config.MEDIA_ROOT),
  socketDir: config.SOCKET_PATH === undefined ? null : scratchOnly('SOCKET_PATH', dirname(config.SOCKET_PATH)),
});

/** Every root a reset rebuilds, in order. */
export function allRoots(): readonly string[] {
  return [roots.stateRoot, roots.mediaRoot, roots.socketDir].filter((root): root is string => root !== null);
}

/** Where `dir`'s instance marker lives. */
export function markerPath(dir: string): string {
  return join(dir, INSTANCE_MARKER);
}

/** Create `dir` (if needed) and declare it this instance's. Rewrites a stale marker. */
export async function markRoot(dir: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  await writeFile(markerPath(dir), markerContent(INSTANCE), 'utf8');
  return dir;
}

/** Does `dir` declare itself this instance's? */
export function isMarked(dir: string): boolean {
  const marker = markerPath(dir);
  return existsSync(marker) && readFileSync(marker, 'utf8') === markerContent(INSTANCE);
}

/** THROWS unless `dir` is absent, empty, or marked as this instance's. Writes nothing. */
export function assertDestroyable(dir: string): void {
  if (!existsSync(dir) || isMarked(dir)) return;
  const entries = readdirSync(dir);
  if (entries.length === 0) return;
  throw new Error(
    `tests/fixtures/instance.ts refuses to wipe '${dir}': it holds ${entries.length} entries and does not ` +
      `declare instance '${INSTANCE}' ('${INSTANCE_MARKER}'). Nothing was written.`,
  );
}

/** A path inside the scratch tree for a gate's own corner (not a root; the gate cleans it). */
export function scratchPath(...segments: string[]): string {
  return scratchOnly('scratchPath', join(SCRATCH_ROOT, ...segments));
}

/** A path inside the state root. */
export function statePath(...segments: string[]): string {
  return join(roots.stateRoot, ...segments);
}

/**
 * WIPE AND RE-DECLARE EVERY ROOT. The scratch tree is checked BEFORE anything is removed;
 * the state root comes back marked with its fixed children, the media root and the socket
 * directory come back empty.
 */
export async function resetInstance(): Promise<void> {
  assertDestroyable(SCRATCH_ROOT);
  await markRoot(SCRATCH_ROOT);
  for (const root of allRoots()) {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  }
  await markRoot(roots.stateRoot);
  for (const sub of STATE_SUBDIRS) await mkdir(statePath(sub), { recursive: true });
}
