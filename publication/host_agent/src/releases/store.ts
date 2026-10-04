/**
 * THE RELEASE STORE — one API's releases on disk, the ONE spelling of what a bundle may not
 * carry (D8), the ONE way a release directory comes into being, and the ONE way `current`
 * moves.
 *
 *   <STATE_ROOT>/publication_api/<api>/
 *     releases/<id>/     extracted, immutable releases (id = RELEASE_ID, D9), each holding
 *                        its BUNDLE_SHA_FILE record
 *     shared/            state outside the code (D8 links for v1, v2.env for v2)
 *     staging/<tmp>/     where a bundle is extracted before it is a release
 *     current -> releases/<id>   RELATIVE symlink; the web server / unit read through it
 *
 * THE INSTALL FLOW (install.ts, serialized per API): createStaging → extractBundle(…,
 * reservedBundlePaths(api)) → sha check → per-API prep → commitStaging into releases/<id>
 * → (v2) scratch boot from releases/<id> → the sha record written LAST → promote →
 * pruneReleases. A releases/<id> without its record is an interrupted install (install.ts
 * sweeps it under its per-API lock).
 *
 * ATOMICITY. `current` only ever moves by creating a temp symlink beside it and
 * `rename(2)`-ing it over: a reader sees the old target or the new one, never no link.
 * A crash leaves at worst a `.current.*.tmp` link and a `staging/*` dir, both swept by the
 * next `createStaging` — never a half-pointed `current`.
 *
 * SERIALIZATION. `promote` and `pruneReleases` run under one in-process lock per API, so
 * two concurrent promotes report a consistent `from → to` chain (the audit records it) and
 * prune never deletes the release a promote is about to point at.
 *
 * ORDER. "Newest" is the most recently PROMOTED (or committed) release: `promote` and
 * `commitStaging` stamp the release dir's mtime monotonically, because a release id does
 * not sort by time (D9: dev-channel installs keep the version).
 *
 * Nothing here follows a link it did not create: every level is `lstat`-proved a real
 * directory, and a `releases/<id>` that is anything but one is `not_a_directory`.
 */

import { randomUUID } from 'node:crypto';
import { constants as FS, existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readdir, rename, rm, symlink, utimes } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { config } from '../config';
import { type ApiName, type BundleLimits, DEFAULT_MAX_PATH_LENGTH } from './ustar';

export const RELEASE_ID = /^\d+(\.\d+){1,3}_[0-9a-f]{7}$/;

export interface ApiLayout {
  root: string;
  releases: string;
  shared: string;
  current: string;
  staging: string;
}

/**
 * The per-release record of the bundle's sha256. The AGENT writes it into `releases/<id>`
 * as the LAST step before promote, after every check passed (install.ts): a release with its
 * record passed them all. Reserved in every bundle, so no bundle can forge it.
 */
export const BUNDLE_SHA_FILE = '.bundle_sha256';

/** v1 resolves its config at dirname(__FILE__, 2)/config_api/ (json/index.php) — D8. */
export const V1_CONFIG_DIR = 'config_api';
export const V1_SHARED_CONFIG = 'server_config_api.php';
export const V1_SHARED_HEADERS = 'server_config_headers.php';

/** v2's environment, outside every release: the unit's EnvironmentFile= and the scratch boot read it. */
export const V2_SHARED_ENV = 'v2.env';
/** Bun auto-loads these from the release cwd; v2's env comes from `shared/v2.env` only. */
export const V2_ENV_FILES: readonly string[] = Object.freeze([
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
]);

/**
 * THE D8 RULE, ONE SPELLING — the paths a bundle may NOT carry (passed to `extractBundle`),
 * read from what `shared/` holds NOW (no caller passes its own answer):
 *   - every API: BUNDLE_SHA_FILE;
 *   - v1: `config_api/server_config_api.php` ALWAYS (it lives in shared/ and is linked in),
 *     and `config_api/server_config_headers.php` ONLY when shared/ has a headers file: v1's
 *     json/index.php includes the headers file unconditionally, so without a shared copy the
 *     release's tracked default must serve;
 *   - v2: the env files Bun auto-loads (V2_ENV_FILES).
 * install.ts derives its v1 links from this same list: a reserved `config_api/` file is
 * exactly a file shared/ provides.
 */
export function reservedBundlePaths(api: ApiName): readonly string[] {
  if (api === 'v2') return Object.freeze([BUNDLE_SHA_FILE, ...V2_ENV_FILES]);
  const paths = [BUNDLE_SHA_FILE, `${V1_CONFIG_DIR}/${V1_SHARED_CONFIG}`];
  if (existsSync(join(apiLayout('v1').shared, V1_SHARED_HEADERS))) paths.push(`${V1_CONFIG_DIR}/${V1_SHARED_HEADERS}`);
  return Object.freeze(paths);
}

export type ReleaseStoreReason =
  | 'bad_release_id'
  | 'not_a_directory'
  | 'unknown_release'
  | 'release_exists'
  | 'corrupt_current'
  | 'not_confined'
  | 'keep_too_small';

export class ReleaseStoreError extends Error {
  constructor(
    readonly reason: ReleaseStoreReason,
    detail: string,
  ) {
    super(`release store: ${reason}: ${detail}`);
    this.name = 'ReleaseStoreError';
  }
}

const DIR_MODE = 0o755;
const TMP_LINK = /^\.current\..+\.tmp$/;

export function apiLayout(api: ApiName): ApiLayout {
  const root = join(config.STATE_ROOT, 'publication_api', api);
  return {
    root,
    releases: join(root, 'releases'),
    shared: join(root, 'shared'),
    current: join(root, 'current'),
    staging: join(root, 'staging'),
  };
}

export function bundleLimits(): BundleLimits {
  return {
    maxBytes: config.MAX_BUNDLE_BYTES,
    maxEntries: config.MAX_BUNDLE_ENTRIES,
    maxPathLength: DEFAULT_MAX_PATH_LENGTH,
  };
}

function assertReleaseId(id: string): void {
  if (!RELEASE_ID.test(id)) throw new ReleaseStoreError('bad_release_id', JSON.stringify(id));
}

async function realDir(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: DIR_MODE });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
  const st = await lstat(path);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new ReleaseStoreError('not_a_directory', path);
}

/** Creates (or proves) every directory of the layout, one level at a time, never through a link. */
export async function ensureLayout(api: ApiName): Promise<ApiLayout> {
  const l = apiLayout(api);
  await realDir(join(config.STATE_ROOT, 'publication_api'));
  for (const p of [l.root, l.releases, l.shared, l.staging]) await realDir(p);
  return l;
}

const locks = new Map<ApiName, Promise<unknown>>();

function withApiLock<T>(api: ApiName, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(api) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  locks.set(
    api,
    run.catch(() => {}),
  );
  return run;
}

/** A release dir's state: absent, a real directory, or something else (refused). */
function releaseDirState(api: ApiName, id: string): 'absent' | 'dir' {
  try {
    const st = lstatSync(join(apiLayout(api).releases, id));
    if (st.isSymbolicLink() || !st.isDirectory()) {
      throw new ReleaseStoreError('not_a_directory', `releases/${id}`);
    }
    return 'dir';
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 'absent';
    throw err;
  }
}

/** True when `releases/<id>` is an extracted release (re-install only re-points `current`, D9). */
export function releaseExists(api: ApiName, id: string): boolean {
  assertReleaseId(id);
  return releaseDirState(api, id) === 'dir';
}

/** Release ids, newest (most recently promoted/committed) first. Non-matching names are not ours. */
export function listReleases(api: ApiName): string[] {
  const { releases } = apiLayout(api);
  let names: string[];
  try {
    names = readdirSync(releases);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const rows: Array<{ id: string; t: number }> = [];
  for (const id of names) {
    if (!RELEASE_ID.test(id)) continue;
    const st = lstatSync(join(releases, id));
    if (st.isSymbolicLink() || !st.isDirectory()) continue;
    rows.push({ id, t: st.mtimeMs });
  }
  rows.sort((a, b) => b.t - a.t || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  return rows.map((r) => r.id);
}

export function currentRelease(api: ApiName): string | null {
  const { current, releases } = apiLayout(api);
  try {
    const st = lstatSync(current);
    if (!st.isSymbolicLink()) throw new ReleaseStoreError('corrupt_current', 'current is not a symlink');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  const target = readlinkSync(current);
  const m = /^releases\/([^/]+)$/.exec(target);
  if (!m || !RELEASE_ID.test(m[1] as string)) {
    throw new ReleaseStoreError('corrupt_current', `current -> ${JSON.stringify(target)}`);
  }
  const id = m[1] as string;
  try {
    const st = lstatSync(join(releases, id));
    if (st.isSymbolicLink() || !st.isDirectory()) throw new ReleaseStoreError('corrupt_current', `releases/${id}`);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new ReleaseStoreError('corrupt_current', `current -> missing releases/${id}`);
    }
    throw err;
  }
  return id;
}

export function previousRelease(api: ApiName): string | null {
  const cur = currentRelease(api);
  return listReleases(api).find((id) => id !== cur) ?? null;
}

/** Mode of a committed `releases/<id>` root (its entries are normalized by extractBundle). */
const RELEASE_DIR_MODE = 0o755;

/** Stamps `releases/<id>` newer than every other release (monotonic, even within one ms). */
async function stampNewest(api: ApiName, id: string): Promise<void> {
  const { releases } = apiLayout(api);
  let newest = 0;
  for (const other of listReleases(api)) {
    if (other === id) continue;
    newest = Math.max(newest, lstatSync(join(releases, other)).mtimeMs);
  }
  const t = Math.max(Date.now(), Math.floor(newest) + 1) / 1000;
  await utimes(join(releases, id), t, t);
}

/**
 * A fresh, empty staging dir for one extraction. Sweeps crash leftovers first: every
 * `staging/*` and every `.current.*.tmp` link beside `current`. Callers serialize installs
 * per API (install.ts), so a sweep never removes a live extraction.
 */
export async function createStaging(api: ApiName): Promise<string> {
  const l = await ensureLayout(api);
  for (const name of await readdir(l.staging)) {
    await rm(join(l.staging, name), { recursive: true, force: true });
  }
  for (const name of await readdir(l.root)) {
    if (TMP_LINK.test(name)) await rm(join(l.root, name), { force: true });
  }
  return mkdtemp(join(l.staging, 'stage-'));
}

/** Moves an extracted staging dir to `releases/<id>` (one rename, same filesystem). */
export async function commitStaging(api: ApiName, stagedDir: string, releaseId: string): Promise<void> {
  assertReleaseId(releaseId);
  const l = await ensureLayout(api);
  const staged = resolve(stagedDir);
  if (dirname(staged) !== l.staging) throw new ReleaseStoreError('not_confined', staged);
  const st = await lstat(staged);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new ReleaseStoreError('not_a_directory', staged);
  if (releaseDirState(api, releaseId) === 'dir') throw new ReleaseStoreError('release_exists', releaseId);
  // mkdtemp made the root 0700: a release must be traversable by the web server (v1) and the
  // v2 user, so it is moded RELEASE_DIR_MODE on a handle opened O_NOFOLLOW before the rename.
  // Until here the staged root keeps mkdtemp's 0700 (and staging/ is 0700, layout.ts MODES), so
  // the tree is hidden while it is extracted.
  const h = await open(staged, FS.O_RDONLY | FS.O_NOFOLLOW);
  try {
    if (!(await h.stat()).isDirectory()) throw new ReleaseStoreError('not_a_directory', staged);
    await h.chmod(RELEASE_DIR_MODE);
  } finally {
    await h.close();
  }
  await rename(staged, join(l.releases, releaseId));
  await stampNewest(api, releaseId);
}

/** Points `current` at `releases/<id>`: temp symlink (relative target) + rename over `current`. */
export async function promote(api: ApiName, releaseId: string): Promise<{ from: string | null; to: string }> {
  assertReleaseId(releaseId);
  return withApiLock(api, async () => {
    const l = await ensureLayout(api);
    if (releaseDirState(api, releaseId) === 'absent') throw new ReleaseStoreError('unknown_release', releaseId);
    const from = currentRelease(api);
    const tmp = join(l.root, `.current.${process.pid}.${randomUUID()}.tmp`);
    await symlink(`releases/${releaseId}`, tmp);
    try {
      await rename(tmp, l.current);
    } catch (err) {
      await rm(tmp, { force: true });
      throw err;
    }
    await stampNewest(api, releaseId);
    return { from, to: releaseId };
  });
}

/** Removes all but the `keep` newest releases; never the current or the previous one. */
export async function pruneReleases(api: ApiName, keep: number): Promise<string[]> {
  if (!Number.isInteger(keep) || keep < 2) throw new ReleaseStoreError('keep_too_small', String(keep));
  return withApiLock(api, async () => {
    const { releases } = apiLayout(api);
    const protectedIds = new Set([currentRelease(api), previousRelease(api)].filter((x): x is string => x !== null));
    const kept: string[] = [];
    const removed: string[] = [];
    for (const id of listReleases(api)) {
      if (protectedIds.has(id) || kept.length < keep) kept.push(id);
      else removed.push(id);
    }
    for (const id of removed) await rm(join(releases, id), { recursive: true, force: true });
    return removed;
  });
}
