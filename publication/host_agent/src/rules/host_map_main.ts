/**
 * ROOT'S HOST-MAP RENDERER — the entry of the oneshot `dedalo-pubhost-map.service` (spec §13.5).
 *
 * ONE CODE VERSION RENDERS THE HOST MAP: root's copy under HOST_MAP_RENDERER_DIR, installed by
 * `provision apply` and never downgraded (src/provision/host_map_renderer.ts). Agents never write
 * the live file; they write `contrib/<instance>.json` and `systemctl start` this unit (their one
 * polkit pair), then answer from `result.json`.
 *
 * ONE RUN (no argument, no environment, `User=root`):
 *   1. take the HOST WEB LOCK (30 s; then outcome `host_busy`; a missing lock file `lock_missing`);
 *   2. read `identities.json` (root-written by `provision apply`: instance → agent uid);
 *   3. list `contrib/`: lstat every entry (never followed), read JSON only from an entry whose
 *      name and owner passed (host_map.ts ownerProblem), and decide (planHostMap): a newer
 *      grammar refuses the whole render and leaves the live file; the bindings pin envelopes;
 *   4. render (renderHostMap), re-parse the result with root's own grammar, and install it
 *      through the shared transaction (./txn.ts): equal bytes and no marker = `unchanged`, no
 *      configtest; otherwise configtest, reload, active poll (nginx down → restore the loaded
 *      map, configtest, restart, confirm: outcome reload_failed, previous contributions kept);
 *   5. write `result.json` (and `bindings.json` when a binding was added; the seed is removed
 *      once a real contribution was rendered), release the lock. Exit 0 = applied / unchanged
 *      / empty; anything else exits 1 (the agent still reads the fresh result).
 *
 * NO CONFIG, NO ZOD, NO PASSWD LOOKUP: everything it trusts is root-written (identities.json,
 * its own records) or re-validated (every contribution). Its only spawns are rendererExec's
 * (src/exec.ts): `nginx -t`, `systemctl reload nginx.service`, `systemctl is-active`, and
 * `systemctl restart nginx.service` only to bring nginx back on the restored map when the active
 * poll found it down after a reload that returned 0 (txn.ts, spec §5.9). Every
 * path is a parameter of runHostMap (production: the layout.ts constants), so the gate
 * (tests/rules_host_map.test.ts) runs it on scratch directories with an injected lstat.
 *
 * ZERO-DEPENDENCY CLOSURE: src/provision/host_map_renderer.ts MAP_RENDERER_FILES lists every
 * file this entry reaches; tests/provision_host_map_renderer.test.ts holds the list equal to it.
 */

import { closeSync, constants, fstatSync, fsyncSync, lstatSync, openSync, readdirSync, readSync, renameSync, rmSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { rendererExec } from '../exec';
import { flockIo } from '../provision/flock';
import { HOST_LOCKS_DIR, HOST_MAP_RENDERER_DIR, HOST_NGINX_MAP_DIR } from '../provision/layout';
import { acquireHostLockAsync, LockBusy, type LockHandle, type LockIo } from '../provision/lock';
import { isMapRefusal, parseNginxMap, SEED_CONTRIBUTION, stampedHash } from './directives';
import {
  canonicalRecord,
  type ContribEntry,
  HOST_MAP_BINDINGS_FILE,
  HOST_MAP_CONTRIB_DIR,
  HOST_MAP_FILE,
  HOST_MAP_RESULT_FILE,
  IDENTITIES_FILE,
  type HostMapEntry,
  type HostMapOutcome,
  type HostMapRefusal,
  type HostMapResult,
  MAX_CONTRIBUTION_BYTES,
  ownerProblem,
  parseBindings,
  parseHostMapResult,
  parseIdentities,
  planHostMap,
  renderEntries,
} from './host_map';
import { runTxn, type TxnExec, txnOutput, txnPaths } from './txn';

/** The root records and the live map are 0644 (nginx's master reads the map; agents read result.json). */
export const HOST_MAP_FILE_MODE = 0o644;
const ROOT_RECORD_MAX = 1024 * 1024;

/** What one run touches outside itself. */
export interface HostMapIo {
  /** The names in a directory, or null when it cannot be listed. */
  readDir(dir: string): string[] | null;
  /** lstat (never followed), or null when absent. The gates model foreign uids here. */
  lstat(path: string): ContribEntry['facts'];
  /** A regular file's text, opened O_NOFOLLOW, at most `max` bytes; null when absent, not regular or larger. */
  readText(path: string, max: number): string | null;
  /** tmp (`.<name>.tmp`, O_EXCL|O_NOFOLLOW, fsynced) → rename, at exactly `mode`. */
  writeAtomic(path: string, text: string, mode: number): void;
  remove(path: string): void;
}

export interface HostMapDeps {
  /** HOST_NGINX_MAP_DIR: the live map, result.json, bindings.json, contrib/. */
  readonly mapDir: string;
  /** HOST_LOCKS_DIR. */
  readonly locksDir: string;
  /** `<HOST_MAP_RENDERER_DIR>/identities.json`. */
  readonly identitiesPath: string;
  readonly lockIo: LockIo;
  readonly exec: TxnExec;
  readonly io: HostMapIo;
  now(): Date;
  log(line: string): void;
}

function readJson(io: HostMapIo, path: string): unknown {
  const text = io.readText(path, MAX_CONTRIBUTION_BYTES);
  if (text === null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The `# config-hash:` of the LOADED live map (null: absent, or a reload pending). */
function loadedHash(deps: HostMapDeps): string | null {
  const paths = txnPaths(deps.mapDir, join(deps.mapDir, HOST_MAP_FILE));
  if (deps.io.lstat(paths.pending) !== null) return null;
  const text = deps.io.readText(paths.live, ROOT_RECORD_MAX);
  return text === null ? null : stampedHash(text);
}

function writeResult(
  deps: HostMapDeps,
  outcome: HostMapOutcome,
  fields: { host_hash: string | null; contributions?: readonly HostMapEntry[]; refused?: readonly HostMapRefusal[]; invalid?: number },
): HostMapResult {
  const resultPath = join(deps.mapDir, HOST_MAP_RESULT_FILE);
  const previous = parseHostMapResult(deps.io.readText(resultPath, ROOT_RECORD_MAX));
  const result: HostMapResult = {
    v: 1,
    seq: (previous?.seq ?? 0) + 1,
    at: deps.now().toISOString(),
    outcome,
    host_hash: fields.host_hash,
    contributions: fields.contributions ?? previous?.contributions ?? [],
    refused: fields.refused ?? [],
    invalid: fields.invalid ?? 0,
  };
  deps.io.writeAtomic(resultPath, canonicalRecord(result as unknown as Record<string, unknown>), HOST_MAP_FILE_MODE);
  deps.log(`[host-map] seq ${result.seq}: ${outcome} (host ${result.host_hash ?? 'none'}; ${result.contributions.length} kept, ${result.invalid} invalid)`);
  return result;
}

function listContributions(deps: HostMapDeps, identities: Readonly<Record<string, number>>): ContribEntry[] {
  const dir = join(deps.mapDir, HOST_MAP_CONTRIB_DIR);
  const entries: ContribEntry[] = [];
  for (const name of deps.io.readDir(dir) ?? []) {
    const path = join(dir, name);
    const facts = deps.io.lstat(path);
    const entry: ContribEntry = { name, facts };
    // Read only what passed the name/owner judgement: a foreign file's bytes are never parsed.
    entries.push(ownerProblem(entry, identities) === null ? { ...entry, json: readJson(deps.io, path) } : entry);
  }
  return entries;
}

/** Steps 2–5, under the lock. */
async function renderLocked(deps: HostMapDeps): Promise<HostMapResult> {
  const previous = parseHostMapResult(deps.io.readText(join(deps.mapDir, HOST_MAP_RESULT_FILE), ROOT_RECORD_MAX));
  const identities = parseIdentities(deps.io.readText(deps.identitiesPath, ROOT_RECORD_MAX));
  if (identities === null) return writeResult(deps, 'identities_invalid', { host_hash: loadedHash(deps) });
  const bindingsPath = join(deps.mapDir, HOST_MAP_BINDINGS_FILE);
  const plan = planHostMap({
    entries: listContributions(deps, identities),
    identities,
    bindings: parseBindings(deps.io.readText(bindingsPath, ROOT_RECORD_MAX)),
    previous,
  });
  if (plan.kind === 'newer') {
    return writeResult(deps, 'map_contribution_newer', { host_hash: loadedHash(deps), refused: plan.refused, invalid: plan.invalid });
  }
  const common = { contributions: plan.kept, refused: plan.refused, invalid: plan.invalid };
  if (plan.kept.length === 0) return writeResult(deps, 'empty', { ...common, host_hash: loadedHash(deps) });

  const { text, hash } = renderEntries(plan.kept);
  // Root's own grammar over root's own output: what nginx loads is never unvalidated text.
  const parsed = parseNginxMap(text);
  if (isMapRefusal(parsed) || parsed.hash !== hash) {
    throw new Error(`host map: the rendered map fails its own grammar (${isMapRefusal(parsed) ? parsed.why : 'hash'})`);
  }
  const paths = txnPaths(deps.mapDir, join(deps.mapDir, HOST_MAP_FILE));
  const outcome = await runTxn(paths, Buffer.from(text, 'utf8'), deps.exec, {
    fileMode: HOST_MAP_FILE_MODE,
    dirMode: 0o755,
    marker: hash,
  });
  if (outcome.result === 'configtest_failed') {
    deps.log(`[host-map] nginx configtest refused the map (exit ${outcome.configtest.code}); ${outcome.restored}:\n${txnOutput(outcome.configtest)}`);
    return writeResult(deps, 'configtest_failed', { ...common, host_hash: loadedHash(deps) });
  }
  if (outcome.result === 'reload_failed' && outcome.rollback !== undefined) {
    // nginx died at the reload and the map was ROLLED BACK (txn.ts): the rendered file is not on
    // disk, so neither its bindings nor the seed's sweep hold; the loaded contributions are the previous ones.
    const back = outcome.rollback;
    deps.log(
      `[host-map] nginx was down after a reload that returned 0; ${back.restored}, configtest exit ${back.configtest.code}, ` +
        `restart ${back.restart === null ? 'not attempted' : `exit ${back.restart.code}`}, active ${String(back.active)}:\n${txnOutput(back.restart ?? back.configtest)}`,
    );
    return writeResult(deps, 'reload_failed', { refused: plan.refused, invalid: plan.invalid, host_hash: back.active ? loadedHash(deps) : null });
  }
  // From here the rendered file is on disk: its bindings hold, and the seed has done its job.
  if (plan.bindingsChanged) deps.io.writeAtomic(bindingsPath, canonicalRecord(plan.bindings), HOST_MAP_FILE_MODE);
  if (plan.dropSeed) deps.io.remove(join(deps.mapDir, HOST_MAP_CONTRIB_DIR, `${SEED_CONTRIBUTION}.json`));
  if (outcome.result === 'reload_failed') {
    deps.log(`[host-map] reloading nginx failed (exit ${outcome.reload.code}, active ${String(outcome.active)}):\n${txnOutput(outcome.reload)}`);
    return writeResult(deps, 'reload_failed', { ...common, host_hash: null });
  }
  return writeResult(deps, outcome.result, { ...common, host_hash: hash });
}

/** One render (see the header). Returns the result it recorded. */
export async function runHostMap(deps: HostMapDeps): Promise<HostMapResult> {
  let lock: LockHandle;
  try {
    lock = await acquireHostLockAsync('web', { dir: deps.locksDir, io: deps.lockIo, uid: 0, gid: null, create: false });
  } catch (error) {
    deps.log(`[host-map] ${error instanceof Error ? error.message : String(error)}`);
    return writeResult(deps, error instanceof LockBusy ? 'host_busy' : 'lock_missing', { host_hash: loadedHash(deps) });
  }
  try {
    return await renderLocked(deps);
  } finally {
    lock.release();
  }
}

/** A run's exit code: 0 when the host serves the rendered map (or there was nothing to render). */
export function exitCodeOf(result: HostMapResult): number {
  return result.outcome === 'applied' || result.outcome === 'unchanged' || result.outcome === 'empty' ? 0 : 1;
}

/* ── the real filesystem ──────────────────────────────────────────────────────────── */

function readNoFollow(path: string, max: number): string | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > max) return null;
    const buffer = Buffer.alloc(st.size);
    let offset = 0;
    while (offset < st.size) {
      const read = readSync(fd, buffer, offset, st.size - offset, offset);
      if (read === 0) break;
      offset += read;
    }
    return buffer.subarray(0, offset).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function writeAtomicNoFollow(path: string, text: string, mode: number): void {
  const temp = join(dirname(path), `.${basename(path)}.tmp`);
  rmSync(temp, { force: true });
  const fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, mode);
  try {
    const bytes = Buffer.from(text, 'utf8');
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

/** The real filesystem (root's run). */
export function hostMapIo(): HostMapIo {
  return Object.freeze({
    readDir(dir: string): string[] | null {
      try {
        return readdirSync(dir);
      } catch {
        return null;
      }
    },
    lstat(path: string): ContribEntry['facts'] {
      try {
        const st = lstatSync(path);
        const type = st.isSymbolicLink() ? 'symlink' : st.isFile() ? 'file' : st.isDirectory() ? 'dir' : 'other';
        return { type, uid: st.uid, size: st.size };
      } catch {
        return null;
      }
    },
    readText: readNoFollow,
    writeAtomic: writeAtomicNoFollow,
    remove(path: string): void {
      rmSync(path, { force: true });
    },
  });
}

/** The production wiring: layout.ts's constants, root's flock, rendererExec. */
export function productionHostMapDeps(): HostMapDeps {
  return {
    mapDir: HOST_NGINX_MAP_DIR,
    locksDir: HOST_LOCKS_DIR,
    identitiesPath: join(HOST_MAP_RENDERER_DIR, IDENTITIES_FILE),
    lockIo: flockIo(),
    exec: rendererExec(),
    io: hostMapIo(),
    now: () => new Date(),
    log: line => console.error(line),
  };
}

if (import.meta.main) {
  const result = await runHostMap(productionHostMapDeps());
  process.exit(exitCodeOf(result));
}
