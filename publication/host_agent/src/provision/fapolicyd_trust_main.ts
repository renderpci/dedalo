/**
 * ROOT'S FAPOLICYD TRUST PROGRAM — the entry of the oneshot `dedalo-pubhost-trust-<instance>.service`
 * (render/trust_unit.ts; owner decision 2026-10-09). argv is the unit's own (`<instance>
 * <declaration>`, root-written there); the agent that starts it passes NOTHING.
 *
 * ONE RUN, as root, empty environment:
 *   1. fapolicyd uninstalled (FAPOLICYD_CLI not a real file): our trust file (if it is ours) goes —
 *      outcome `not_installed` (the next `provision apply` retires the unit too);
 *   2. the declaration, judged by the provisioner's own trust law (cli.ts declarationTrustProblems:
 *      a root-owned regular file under root-owned directories) BEFORE it is read, then parsed and
 *      derived (schema.ts, DeriveHost.fapolicyd); ABSENT = the instance was retired: our trust file
 *      goes — outcome `retired`;
 *   3. the HOST PROVISION lock (30 s; `provision apply` writes the same file under it) — `busy`;
 *   4. deriveTrust (fapolicyd_trust.ts) — `refused` with every reason, the previous file kept
 *      (a release it leaves out is not a refusal of the run: it is named in `reasons`, and the
 *      agent, which checks ITS release is in `releases`, refuses to run it);
 *   5. the file on disk must be ours for this instance (trustFileProblem) — else `refused`;
 *      equal bytes = `unchanged`; otherwise written atomically (temp O_EXCL|O_NOFOLLOW, fsync,
 *      fchmod 0644, rename) and committed (commitTrust: update, then wait until the daemon lists
 *      it) — `applied`, `inactive` (the daemon reads it when it starts) or `failed`;
 *   6. the result record `<config_base>/<instance>/fapolicyd_trust.json` (root 0644) — the agent
 *      reads it for its answer and its status. Exit 0 = applied / unchanged / inactive /
 *      not_installed / retired; anything else exits 1 (the agent still reads the fresh record).
 *
 * Every path is a parameter of runTrust (production: the layout.ts constants), so the gate
 * (tests/fapolicyd_trust_main.test.ts) runs it on scratch directories.
 */
import { closeSync, constants as FS, fchmodSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { TrustExec } from './exec_contract';
import type { TrustIo, TrustOutcome, TrustResult } from './fapolicyd_trust';
import {
  TRUST_FILE_MODE,
  commitTrust,
  deriveTrust,
  pendingEntry,
  realTrustIo,
  renderTrustFile,
  renderTrustResult,
  trustFileProblem,
  trustRootsOf,
} from './fapolicyd_trust';
import type { AgentLayout } from './layout';
import { FAPOLICYD_TRUST_DIR, INSTANCE_PATTERN, TRUST_RESULT_NAME, trustFileName } from './layout';
import type { LockHandle } from './lock';
import { LockBusy } from './lock';

/** The files one run touches besides the trees it reads (the real one: trustFileIo). */
export interface TrustFileIo {
  /** lstat type, never followed (null = absent). */
  type(path: string): 'file' | 'dir' | 'symlink' | 'other' | null;
  /** Why `dir` may not hold our root writes (not a real directory, not root's, group/world-writable), or null. */
  dirProblem(dir: string): string | null;
  /** A regular file's text, opened O_NOFOLLOW; null when absent or not regular. */
  readText(path: string): string | null;
  /** temp (`.<name>.tmp`, O_EXCL|O_NOFOLLOW, fsynced, fchmod `mode`) → rename. */
  writeAtomic(path: string, text: string, mode: number): void;
  remove(path: string): void;
}

export interface TrustRunDeps {
  readonly instance: string;
  readonly declarationPath: string;
  /** FAPOLICYD_TRUST_DIR. */
  readonly trustDir: string;
  /** FAPOLICYD_CLI is a real file (fapolicyd is installed). */
  fapolicydInstalled(): boolean;
  /**
   * The declaration's layout (judged, parsed, derived with fapolicyd), null when the file is absent.
   * Throws TrustRefused when it may not be read or does not parse.
   */
  loadLayout(): AgentLayout | null;
  /** The host provision lock of `layout` (throws LockBusy past its wait). */
  lock(layout: AgentLayout): LockHandle;
  readonly trees: TrustIo;
  readonly files: TrustFileIo;
  readonly exec: TrustExec;
  now(): Date;
  log(line: string): void;
}

/** A refusal before the trust set is derived (the declaration may not be read, or names another instance). */
export class TrustRefused extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(reasons.join('; '));
    this.name = 'TrustRefused';
    this.reasons = reasons;
  }
}

const OK_OUTCOMES: readonly TrustOutcome[] = ['applied', 'unchanged', 'inactive', 'not_installed', 'retired'];

export function exitCodeOf(result: TrustResult): number {
  return OK_OUTCOMES.includes(result.outcome) ? 0 : 1;
}

interface Draft {
  outcome: TrustOutcome;
  entries: number | null;
  skipped: number;
  releases: readonly string[];
  reasons: readonly string[];
}

function finish(deps: TrustRunDeps, resultPath: string, draft: Draft): TrustResult {
  const result: TrustResult = {
    v: 1,
    at: deps.now().toISOString(),
    outcome: draft.outcome,
    entries: draft.entries,
    skipped_links: draft.skipped,
    releases: [...draft.releases],
    reasons: [...draft.reasons],
  };
  const line = `[fapolicyd-trust] ${deps.instance}: ${result.outcome}${result.entries === null ? '' : ` (${result.entries} files`}${
    result.entries === null ? '' : `, ${result.skipped_links} links skipped; ${result.releases.join(', ') || 'no release'})`
  }`;
  deps.log(line);
  for (const reason of result.reasons) deps.log(`[fapolicyd-trust]   ${reason}`);
  // The record lives in the instance's config directory: absent (a retired instance) = none written.
  if (deps.files.type(dirname(resultPath)) === 'dir' && deps.files.dirProblem(dirname(resultPath)) === null) {
    try {
      deps.files.writeAtomic(resultPath, renderTrustResult(result), TRUST_FILE_MODE);
    } catch (error) {
      deps.log(`[fapolicyd-trust]   the result record '${resultPath}' could not be written: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

/** Our trust file goes (steps 1 and 2): only when it is ours, for this instance, unedited. */
function removeOwn(deps: TrustRunDeps, path: string, outcome: 'not_installed' | 'retired', resultPath: string): TrustResult {
  const type = deps.files.type(path);
  if (type === null) return finish(deps, resultPath, { outcome, entries: null, skipped: 0, releases: [], reasons: [] });
  const problem = type === 'file' ? trustFileProblem(deps.instance, path, deps.files.readText(path)) : `'${path}' is a ${type}, not our trust file`;
  if (problem !== null) return finish(deps, resultPath, { outcome: 'refused', entries: null, skipped: 0, releases: [], reasons: [`${problem} — it is left in place`] });
  deps.files.remove(path);
  // The daemon forgets it at its next update; an uninstalled one has none to tell.
  if (outcome === 'retired') {
    const told = commitTrust(deps.exec, null);
    if (told.kind === 'failed') return finish(deps, resultPath, { outcome: 'failed', entries: null, skipped: 0, releases: [], reasons: [told.why] });
  }
  return finish(deps, resultPath, { outcome, entries: null, skipped: 0, releases: [], reasons: [] });
}

/** ONE RUN (see the header). */
export function runTrust(deps: TrustRunDeps): TrustResult {
  const path = join(deps.trustDir, trustFileName(deps.instance));
  const fallbackResult = join(dirname(deps.declarationPath), deps.instance, TRUST_RESULT_NAME);
  if (!deps.fapolicydInstalled()) return removeOwn(deps, path, 'not_installed', fallbackResult);
  let layout: AgentLayout | null;
  try {
    layout = deps.loadLayout();
  } catch (error) {
    if (!(error instanceof TrustRefused)) throw error;
    return finish(deps, fallbackResult, { outcome: 'refused', entries: null, skipped: 0, releases: [], reasons: error.reasons });
  }
  if (layout === null) return removeOwn(deps, path, 'retired', fallbackResult);
  if (layout.instance !== deps.instance || layout.trust === null || layout.trust.file !== path) {
    return finish(deps, fallbackResult, {
      outcome: 'refused',
      entries: null,
      skipped: 0,
      releases: [],
      reasons: [`'${deps.declarationPath}' declares instance '${layout.instance}' (trust file ${layout.trust?.file ?? 'none'}), not '${deps.instance}' at '${path}'`],
    });
  }
  const resultPath = layout.trust.result;
  let lock: LockHandle;
  try {
    lock = deps.lock(layout);
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    return finish(deps, resultPath, { outcome: error instanceof LockBusy ? 'busy' : 'failed', entries: null, skipped: 0, releases: [], reasons: [why] });
  }
  try {
    const derivation = deriveTrust(trustRootsOf(layout), deps.trees);
    if (derivation.kind === 'refused') {
      return finish(deps, resultPath, { outcome: 'refused', entries: null, skipped: 0, releases: [], reasons: derivation.reasons });
    }
    const common = { entries: derivation.entries.length, skipped: derivation.skippedLinks, releases: derivation.releases };
    // A release left out is named in every record of this run (the agent refuses to run it).
    const left = derivation.refused;
    const dirProblem = deps.files.dirProblem(deps.trustDir);
    if (dirProblem !== null) return finish(deps, resultPath, { ...common, outcome: 'refused', reasons: [dirProblem, ...left] });
    const type = deps.files.type(path);
    const previous = type === null ? null : deps.files.readText(path);
    if (type !== null) {
      const problem = type === 'file' ? trustFileProblem(deps.instance, path, previous) : `'${path}' is a ${type}, not our trust file`;
      if (problem !== null) return finish(deps, resultPath, { ...common, outcome: 'refused', reasons: [problem, ...left] });
    }
    const body = renderTrustFile(deps.instance, derivation);
    if (previous === body) return finish(deps, resultPath, { ...common, outcome: 'unchanged', reasons: left });
    deps.files.writeAtomic(path, body, TRUST_FILE_MODE);
    const committed = commitTrust(deps.exec, pendingEntry(previous, body));
    if (committed.kind === 'failed') return finish(deps, resultPath, { ...common, outcome: 'failed', reasons: [committed.why, ...left] });
    return finish(deps, resultPath, { ...common, outcome: committed.kind === 'loaded' ? 'applied' : 'inactive', reasons: left });
  } finally {
    lock.release();
  }
}

/* ── the real host ────────────────────────────────────────────────────────────────── */

function readNoFollow(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK);
  } catch {
    return null;
  }
  try {
    return readFileSync(fd, 'utf8');
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

/** The real files (root's run). `ownerUid`: who must own a directory root writes into (0 in production). */
export function trustFileIo(ownerUid = 0): TrustFileIo {
  return Object.freeze({
    type(path: string) {
      try {
        const st = lstatSync(path);
        return st.isSymbolicLink() ? 'symlink' : st.isFile() ? 'file' : st.isDirectory() ? 'dir' : 'other';
      } catch {
        return null;
      }
    },
    dirProblem(dir: string): string | null {
      try {
        const st = lstatSync(dir);
        if (st.isSymbolicLink() || !st.isDirectory()) return `'${dir}' is not a real directory`;
        if (st.uid !== ownerUid) return `'${dir}' is owned by uid ${st.uid}, not root`;
        if ((st.mode & 0o022) !== 0) return `'${dir}' is group- or world-writable`;
        return null;
      } catch {
        return `'${dir}' does not exist — is fapolicyd installed whole?`;
      }
    },
    readText: readNoFollow,
    writeAtomic(path: string, text: string, mode: number): void {
      const temp = join(dirname(path), `.${basename(path)}.tmp`);
      rmSync(temp, { force: true });
      const fd = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, mode);
      try {
        const bytes = Buffer.from(text, 'utf8');
        let offset = 0;
        while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
        fchmodSync(fd, mode);
        fsyncSync(fd);
      } catch (error) {
        closeSync(fd);
        rmSync(temp, { force: true });
        throw error;
      }
      closeSync(fd);
      renameSync(temp, path);
    },
    remove(path: string): void {
      rmSync(path, { force: true });
    },
  });
}

/** The unit's argv: `<instance> <declaration>`, the declaration named `<dir>/<instance>.json`. */
export function parseTrustArgv(argv: readonly string[]): { instance: string; declarationPath: string } | { error: string } {
  if (argv.length !== 2) return { error: 'usage: fapolicyd_trust_main.ts <instance> <declaration>' };
  const [instance, declarationPath] = argv as [string, string];
  if (!INSTANCE_PATTERN.test(instance)) return { error: `'${instance}' is not an instance name` };
  if (!/^\/[A-Za-z0-9._/-]+$/.test(declarationPath) || declarationPath.split('/').includes('..') || basename(declarationPath) !== `${instance}.json`) {
    return { error: `'${declarationPath}' is not <config_base>/${instance}.json` };
  }
  return { instance, declarationPath };
}

/** The production wiring (lazy imports: the declaration parser and the flock door load only here). */
export async function productionTrustDeps(instance: string, declarationPath: string): Promise<TrustRunDeps> {
  const { declarationTrustProblems, hostDeps } = await import('./cli');
  const { parseDeclaration, DeclarationError } = await import('./schema');
  const { trustExec, FAPOLICYD_CLI } = await import('../exec');
  const { flockIo } = await import('./flock');
  const { acquireHostLockSync } = await import('./lock');
  const host = hostDeps();
  return {
    instance,
    declarationPath,
    trustDir: FAPOLICYD_TRUST_DIR,
    fapolicydInstalled: () => host.isRealFile(FAPOLICYD_CLI),
    loadLayout() {
      if (host.lstat(declarationPath) === null) return null;
      const problems = declarationTrustProblems(declarationPath, 'the declaration', path => host.lstat(path));
      if (problems.length > 0) throw new TrustRefused(problems);
      const text = host.readDeclaration(declarationPath);
      if (text === null) throw new TrustRefused([`'${declarationPath}' cannot be read`]);
      try {
        return parseDeclaration(JSON.parse(text), declarationPath, { isRealFile: path => host.isRealFile(path), fapolicyd: true }).layout;
      } catch (error) {
        if (error instanceof DeclarationError || error instanceof SyntaxError) throw new TrustRefused([error.message]);
        throw error;
      }
    },
    lock: layout => acquireHostLockSync('provision', { dir: layout.host.locksDir, io: flockIo(), uid: 0, create: false, waitMs: 30_000 }),
    trees: realTrustIo(),
    files: trustFileIo(0),
    exec: trustExec(),
    now: () => new Date(),
    log: line => console.error(line),
  };
}

if (import.meta.main) {
  const args = parseTrustArgv(process.argv.slice(2));
  if ('error' in args) {
    console.error(`[fapolicyd-trust] ${args.error}`);
    process.exit(2);
  }
  const result = runTrust(await productionTrustDeps(args.instance, args.declarationPath));
  process.exit(exitCodeOf(result));
}
