/**
 * Path confinement — every filesystem operation that touches a site goes through here.
 *
 * The daemon manipulates directories whose names come (indirectly) from users, and runs
 * agents that write arbitrary files into their workspace. The invariant these helpers
 * enforce: a resolved path is used only if it is lexically AND physically (realpath)
 * inside the root it is supposed to be inside. A symlink an agent plants inside its
 * workspace can therefore never redirect a daemon-side copy/delete outside of it.
 */

import { realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';

/** True when `child` is `parent` itself or lexically inside it. Both must be absolute. */
export function isWithin(parent: string, child: string): boolean {
  const normalParent = resolve(parent);
  const normalChild = resolve(child);
  return normalChild === normalParent || normalChild.startsWith(normalParent + sep);
}

/**
 * Resolves `...segments` under `root` and throws if the result escapes it.
 * Lexical check only — for paths that do not exist yet (a directory about to be created).
 */
export function confinedPath(root: string, ...segments: string[]): string {
  if (!isAbsolute(root)) {
    throw new Error(`confinedPath: root must be absolute, got ${root}`);
  }
  const joined = resolve(root, ...segments);
  if (!isWithin(root, joined)) {
    throw new Error(`confinedPath: resolved path escapes root: ${joined}`);
  }
  return joined;
}

/**
 * Like confinedPath but additionally resolves symlinks (realpath) and re-checks — for
 * paths that exist and are about to be read, copied or deleted. The realpath of the
 * ROOT is compared against the realpath of the TARGET so a symlinked root (common: a
 * /var/lib mount) does not false-positive.
 */
export function confinedRealPath(root: string, ...segments: string[]): string {
  const lexical = confinedPath(root, ...segments);
  const realRoot = realpathSync(resolve(root));
  const realTarget = realpathSync(lexical);
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) {
    throw new Error(`confinedRealPath: symlink escapes root: ${lexical} -> ${realTarget}`);
  }
  return realTarget;
}
