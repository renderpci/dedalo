/**
 * THE LOCKS (spec S12, §7) — every lock is a `flock(2)` lock on a root-created file. The kernel
 * releases a flock when its holder's last descriptor closes (kill -9 included), so there is no
 * stale-lock judgement, no takeover, no rename race and no pid-reuse error: a lock is held
 * exactly while its holder lives. An owner record beside the instance lock is written only for
 * messages and is never trusted; a waiter names the holder from `/proc/locks` and quotes the
 * record only when the two agree.
 *
 * Always taken in this order:
 *   1. the INSTANCE lock `<INIT_BASE>/<instance>/init.lock` — `provision init` and `provision
 *      apply` exclusive for the whole run, `provision check` shared (several checks run together);
 *   2. the HOST PROVISION lock `HOST_LOCKS_DIR/provision.lock` — exclusive, by apply around the
 *      host-wide items, root only;
 *   3. the HOST WEB lock `HOST_LOCKS_DIR/web.lock` — exclusive around every configtest+reload, by
 *      root and by every agent (agents open it read-only: HOST_LOCKS_DIR is root:dedalo_pubhost
 *      0750, they can create, rename or remove nothing there).
 *
 * PURE: the policy (trust of the lock directories, the wait, the holder message, the
 * /proc/locks parser) is here; every system call is the injected LockIo (production:
 * ./flock.ts flockIo, bun:ffi). Tests inject a fake LockIo and a scratch base/dir.
 * ZERO-DEPENDENCY (tests/provision_zero_dep.test.ts): node: builtins and ./layout only.
 */
import { join } from 'node:path';
import { HOST_LOCK_FILES, type HostLockName, INSTANCE_PATTERN, MODES } from './layout';

/** Init's own state (journal, stage, backups, kept/, the instance lock). A constant: no declaration field, no override. */
export const INIT_BASE = '/var/lib/dedalo_publication_host_init';
export const INSTANCE_LOCK_NAME = 'init.lock';
export const OWNER_RECORD_SUFFIX = '.owner';

export type LockMode = 'ex' | 'sh';

/** How long each lock waits before it gives up (spec §1.2, §7). */
export const LOCK_WAIT_MS = Object.freeze({ instance: 5_000, provision: 30_000, web: 30_000 });
/** The LOCK_NB poll interval. */
export const LOCK_POLL_MS = 100;

/** A lock file's expected identity. Opened O_NOFOLLOW; an existing file with other metadata is refused, never fixed. */
export interface LockFileSpec {
  readonly uid: number;
  /** null: not checked (an agent does not know dedalo_pubhost's gid by number; root does). */
  readonly gid: number | null;
  readonly mode: number;
  /** Create when missing (root). An agent opens an existing file read-only and creates nothing. */
  readonly create: boolean;
}

export interface DirFacts {
  readonly type: 'dir' | 'file' | 'symlink' | 'other';
  readonly uid: number;
  readonly mode: number;
}

/** The system calls behind a lock. Production: ./flock.ts flockIo(). */
export interface LockIo {
  /** Opens (creating when `spec.create`) with O_NOFOLLOW; refuses a non-regular file or other metadata. Returns the fd. */
  openLockFile(path: string, spec: LockFileSpec): number;
  /** flock(fd, LOCK_EX|LOCK_NB) / flock(fd, LOCK_SH|LOCK_NB): true = held now, false = someone else holds it. */
  tryFlock(fd: number, mode: LockMode): boolean;
  /** Releases the flock and closes the descriptor. */
  unlock(fd: number): void;
  /** The owner record's text, or null (absent, unreadable, a symlink). Never trusted. */
  readOwner(path: string): string | null;
  writeOwner(path: string, record: string): void;
  /** The pids `/proc/locks` lists as holding a lock on this file's inode; null = unknowable here (no /proc). */
  holderFromProcLocks(path: string): number[] | null;
  /** lstat (never followed), for the lock directories' trust. */
  lstat(path: string): DirFacts | null;
  /** mkdir one level with exactly this mode and owner (the parent is guaranteed). */
  mkdir(path: string, mode: number, uid: number, gid: number): void;
  now(): number;
  sleepSync(ms: number): void;
  sleep(ms: number): Promise<void>;
}

/** Who holds a lock, as far as anyone can tell. Every field may be unknown. */
export interface LockHolder {
  readonly pids: readonly number[] | null;
  /** From the owner record, only when its pid is one /proc/locks lists. */
  readonly verb: string | null;
  readonly pid: number | null;
  readonly since: string | null;
}

/** What `--dry-run` reports (CompareCtx.lock): a peek, never a wait, never a write. */
export type LockState = { readonly held: false } | { readonly held: true; readonly holder: LockHolder };

export interface LockHandle {
  readonly path: string;
  readonly mode: LockMode;
  /** The instance this handle locks (null for a host lock). */
  readonly instance: string | null;
  /** Idempotent. */
  release(): void;
}

/** The lock could not be taken within its wait. `holder` names who has it, as far as known. */
export class LockBusy extends Error {
  readonly path: string;
  readonly holder: LockHolder;
  constructor(path: string, holder: LockHolder, message: string) {
    super(message);
    this.name = 'LockBusy';
    this.path = path;
    this.holder = holder;
  }
}

/** A lock directory or file that is not what root created (a symlink, a foreign owner, a writable mode). */
export class LockRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockRefused';
  }
}

/* ── the owner record ─────────────────────────────────────────────────────────────── */

export interface OwnerRecord {
  readonly pid: number;
  readonly verb: string;
  readonly started: string;
}

const VERB_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

/** The record's JSON, or null for anything else (it is untrusted text; a null is "unknown", never an error). */
export function parseOwnerRecord(text: string | null): OwnerRecord | null {
  if (text === null || text.length > 4096) return null;
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    if (raw === null || typeof raw !== 'object') return null;
    const { pid, verb, started } = raw;
    if (typeof pid !== 'number' || !Number.isInteger(pid) || pid < 1) return null;
    if (typeof verb !== 'string' || !VERB_PATTERN.test(verb)) return null;
    if (typeof started !== 'string' || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(started)) return null;
    return { pid, verb, started };
  } catch {
    return null;
  }
}

export function encodeOwnerRecord(record: OwnerRecord): string {
  return `${JSON.stringify({ pid: record.pid, verb: record.verb, started: record.started })}\n`;
}

/** The holder as far as it can be told: /proc/locks' pids, and the record only when its pid is among them. */
export function lockHolder(pids: readonly number[] | null, record: OwnerRecord | null): LockHolder {
  if (record !== null && pids !== null && pids.includes(record.pid)) {
    return { pids, verb: record.verb, pid: record.pid, since: record.started };
  }
  return { pids, verb: null, pid: pids !== null && pids.length === 1 ? (pids[0] as number) : null, since: null };
}

/** "<verb> pid <n> since <t>", or the parts that are known. */
export function describeHolder(holder: LockHolder): string {
  const verb = holder.verb ?? 'another process';
  const pid = holder.pid !== null ? ` pid ${holder.pid}` : holder.pids !== null && holder.pids.length > 1 ? ` pids ${holder.pids.join(',')}` : '';
  const since = holder.since !== null ? ` since ${holder.since}` : '';
  return `${verb}${pid}${since}`;
}

/* ── /proc/locks ──────────────────────────────────────────────────────────────────── */

/**
 * The pids holding a lock on one inode, from `/proc/locks` text. A line is
 * `<n>: FLOCK  ADVISORY  WRITE <pid> <maj>:<min>:<ino> 0 EOF`; `->` lines are WAITERS, never
 * holders. maj/min are hex in the kernel's format; `dev` is the decomposed device.
 */
export function parseProcLocks(text: string, dev: { major: number; minor: number }, ino: number): number[] {
  const pids = new Set<number>();
  for (const line of text.split('\n')) {
    // A waiter's line carries `->` before the kind, so its fields never parse as a holder's.
    const [, kind, , , pidText, where] = line.trim().split(/\s+/);
    if (kind !== 'FLOCK' && kind !== 'POSIX' && kind !== 'OFDLCK') continue;
    const parts = (where ?? '').split(':');
    if (parts.length !== 3) continue;
    const [major, minor, inode] = [Number.parseInt(parts[0] ?? '', 16), Number.parseInt(parts[1] ?? '', 16), Number(parts[2])];
    const pid = Number(pidText);
    if (major === dev.major && minor === dev.minor && inode === ino && Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids].sort((a, b) => a - b);
}

/* ── the lock directories ─────────────────────────────────────────────────────────── */

/**
 * `<INIT_BASE>` and `<INIT_BASE>/<instance>`: each, when present, a real directory owned by
 * `uid`, not group/other-writable (the trampoline's step-3 law); a missing one is created 0700.
 */
export function ensureInitDirs(base: string, instance: string, io: LockIo, uid = 0, gid = 0): string {
  if (!INSTANCE_PATTERN.test(instance)) throw new LockRefused(`lock: instance '${instance}' must match ${INSTANCE_PATTERN.source}`);
  const dir = join(base, instance);
  for (const path of [base, dir]) {
    const facts = io.lstat(path);
    if (facts === null) {
      io.mkdir(path, MODES.initState.mode, uid, gid);
      continue;
    }
    const problem = dirProblem(facts, uid);
    if (problem !== null) {
      throw new LockRefused(
        `lock: '${path}' is ${problem} — init's state must be root's alone; fix: chown root:root '${path}' && chmod 0700 '${path}'`,
      );
    }
  }
  return dir;
}

function dirProblem(facts: DirFacts, uid: number): string | null {
  if (facts.type !== 'dir') return `a ${facts.type}, not a directory`;
  if (facts.uid !== uid) return `owned by uid ${facts.uid}, not ${uid === 0 ? 'root' : `uid ${uid}`}`;
  if ((facts.mode & 0o022) !== 0) return `group- or other-writable (mode 0${(facts.mode & 0o7777).toString(8)})`;
  return null;
}

/* ── acquisition ──────────────────────────────────────────────────────────────────── */

interface Attempt {
  readonly path: string;
  readonly fd: number;
  readonly mode: LockMode;
}

function open(path: string, spec: LockFileSpec, io: LockIo): number {
  try {
    return io.openLockFile(path, spec);
  } catch (error) {
    if (error instanceof LockRefused) throw error;
    throw new LockRefused(`lock: cannot open '${path}': ${error instanceof Error ? error.message : String(error)}`);
  }
}

function holderOf(path: string, io: LockIo, recordPath: string | null): LockHolder {
  return lockHolder(io.holderFromProcLocks(path), recordPath === null ? null : parseOwnerRecord(io.readOwner(recordPath)));
}

function handle(attempt: Attempt, instance: string | null, io: LockIo): LockHandle {
  let released = false;
  return Object.freeze({
    path: attempt.path,
    mode: attempt.mode,
    instance,
    release(): void {
      if (released) return;
      released = true;
      io.unlock(attempt.fd);
    },
  });
}

function busy(path: string, io: LockIo, recordPath: string | null, what: string, waitMs: number): LockBusy {
  const holder = holderOf(path, io, recordPath);
  return new LockBusy(path, holder, `${what} is held by ${describeHolder(holder)}; waited ${waitMs / 1000} s`);
}

/** Polls LOCK_NB until held or `waitMs` passed. Sync: root's CLI blocks (`Bun.sleepSync` behind io.sleepSync). */
function waitSync(attempt: Attempt, io: LockIo, waitMs: number): boolean {
  const deadline = io.now() + waitMs;
  for (;;) {
    if (io.tryFlock(attempt.fd, attempt.mode)) return true;
    if (io.now() >= deadline) return false;
    io.sleepSync(LOCK_POLL_MS);
  }
}

async function waitAsync(attempt: Attempt, io: LockIo, waitMs: number): Promise<boolean> {
  const deadline = io.now() + waitMs;
  for (;;) {
    if (io.tryFlock(attempt.fd, attempt.mode)) return true;
    if (io.now() >= deadline) return false;
    await io.sleep(LOCK_POLL_MS);
  }
}

export interface InstanceLockOptions {
  /** INIT_BASE in production; a scratch directory in the tests. */
  readonly base: string;
  readonly io: LockIo;
  /** Named in the owner record (`init`, `apply`, `check`). */
  readonly verb: string;
  readonly waitMs?: number;
  /** The owner the lock directories and file must have: 0 in production; the test's own uid on a scratch base. */
  readonly uid?: number;
  readonly gid?: number;
  readonly pid?: number;
}

export function instanceLockPath(base: string, instance: string): string {
  return join(base, instance, INSTANCE_LOCK_NAME);
}

/**
 * The instance lock (spec S12 1): `ex` for init and apply, `sh` for check. Waits up to
 * `waitMs` (default 5 s), then throws LockBusy naming the holder. An exclusive holder writes the
 * owner record (messages only). Sync: `provision` is a synchronous CLI.
 */
export function acquireInstanceLockSync(instance: string, mode: LockMode, options: InstanceLockOptions): LockHandle {
  const { io } = options;
  const uid = options.uid ?? 0;
  const gid = options.gid ?? 0;
  ensureInitDirs(options.base, instance, io, uid, gid);
  const path = instanceLockPath(options.base, instance);
  const recordPath = `${path}${OWNER_RECORD_SUFFIX}`;
  const fd = open(path, { uid, gid, mode: MODES.initLock.mode, create: true }, io);
  const attempt = { path, fd, mode };
  const waitMs = options.waitMs ?? LOCK_WAIT_MS.instance;
  if (!waitSync(attempt, io, waitMs)) {
    const error = busy(path, io, recordPath, `instance '${instance}'`, waitMs);
    io.unlock(fd);
    throw error;
  }
  if (mode === 'ex') {
    try {
      io.writeOwner(
        recordPath,
        encodeOwnerRecord({ pid: options.pid ?? process.pid, verb: options.verb, started: new Date(io.now()).toISOString() }),
      );
    } catch (error) {
      io.unlock(fd);
      throw error;
    }
  }
  return handle(attempt, instance, io);
}

/**
 * `--dry-run`'s peek (spec §7): LOCK_SH|LOCK_NB once, never waits, never creates, never writes.
 * A missing lock file (or directory) is a free lock.
 */
export function peekInstanceLock(instance: string, options: Pick<InstanceLockOptions, 'base' | 'io' | 'uid' | 'gid'>): LockState {
  const { io } = options;
  const path = instanceLockPath(options.base, instance);
  if (io.lstat(path) === null) return { held: false };
  const fd = open(path, { uid: options.uid ?? 0, gid: options.gid ?? 0, mode: MODES.initLock.mode, create: false }, io);
  try {
    if (io.tryFlock(fd, 'sh')) return { held: false };
    return { held: true, holder: holderOf(path, io, `${path}${OWNER_RECORD_SUFFIX}`) };
  } finally {
    io.unlock(fd);
  }
}

export interface HostLockOptions {
  /** HOST_LOCKS_DIR in production (layout.host.locksDir); a scratch directory in the tests. */
  readonly dir: string;
  readonly io: LockIo;
  readonly waitMs?: number;
  /** The file's expected owner (root: 0). */
  readonly uid?: number;
  /** web.lock's group (dedalo_pubhost's gid, root knows it); null = not checked (an agent). provision.lock: 0. */
  readonly gid?: number | null;
  /** Root creates a missing lock file; an agent never does (default: create). */
  readonly create?: boolean;
}

function hostLockSpec(name: HostLockName, options: HostLockOptions): LockFileSpec {
  const row = name === 'provision' ? MODES.hostProvisionLock : MODES.hostWebLock;
  const gid = options.gid === undefined ? (name === 'provision' ? 0 : null) : options.gid;
  return { uid: options.uid ?? 0, gid, mode: row.mode, create: options.create ?? true };
}

function hostAttempt(name: HostLockName, options: HostLockOptions): Attempt {
  const path = join(options.dir, HOST_LOCK_FILES[name]);
  return { path, fd: open(path, hostLockSpec(name, options), options.io), mode: 'ex' };
}

/** A host lock (spec S12 2/3), exclusive, from root's synchronous code (provision apply, init). */
export function acquireHostLockSync(name: HostLockName, options: HostLockOptions): LockHandle {
  const attempt = hostAttempt(name, options);
  const waitMs = options.waitMs ?? LOCK_WAIT_MS[name];
  if (!waitSync(attempt, options.io, waitMs)) {
    const error = busy(attempt.path, options.io, null, `the host ${name} lock`, waitMs);
    options.io.unlock(attempt.fd);
    throw error;
  }
  return handle(attempt, null, options.io);
}

/** The same, for the agent's async server (rules.apply, rules.map): the wait never blocks a request. */
export async function acquireHostLockAsync(name: HostLockName, options: HostLockOptions): Promise<LockHandle> {
  const attempt = hostAttempt(name, options);
  const waitMs = options.waitMs ?? LOCK_WAIT_MS[name];
  if (!(await waitAsync(attempt, options.io, waitMs))) {
    const error = busy(attempt.path, options.io, null, `the host ${name} lock`, waitMs);
    options.io.unlock(attempt.fd);
    throw error;
  }
  return handle(attempt, null, options.io);
}
