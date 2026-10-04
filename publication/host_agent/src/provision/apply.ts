/**
 * APPLY — dumb: runs the plan's actions in order through one injected io, halts on the
 * first failure, and reports every action as done / failed / skipped. It decides nothing:
 * drift, ownership and ordering are plan.ts's. Writes are atomic (temp → chown → chmod →
 * optional validator → rename), so a failed write never leaves a half file in place.
 *
 * Also the host's two real doors: `hostIo()` and `observeHost()`. Mirrors
 * publication/site_builder/src/provision/apply.ts (ProvisionIo, apply, hostIo, observeHost)
 * minus links, archives and removal. Every child process goes through src/exec.ts.
 *
 * ROOT NEVER FOLLOWS A LINK IT DID NOT CREATE. Some managed paths sit inside directories the
 * agent owns (releases/, staging/, shared/ inside publication_api/<api>/), so between
 * observeHost and apply the agent could swap one for a symlink. Every hostIo door therefore:
 *   1. re-verifies, at apply time, every ancestor below the trust root: a real directory
 *      (lstat, not a link), and — all but the immediate parent — root-owned and not
 *      group/world-writable (the layout keeps every managed path at most ONE agent-writable
 *      level below such a directory: instance/roots.ts STATE_TREE_OWNERSHIP);
 *   2. operates on a FILE DESCRIPTOR opened O_NOFOLLOW (O_DIRECTORY for directories,
 *      O_NONBLOCK against FIFOs): fstat confirms a directory or a single-link regular file
 *      (a hard link to another file is refused), then fchown/fchmod on that fd;
 *   3. mkdir re-opens what it created and refuses it unless this process owns it;
 *   4. creates temp files O_CREAT|O_EXCL|O_NOFOLLOW and writes them through their fd.
 * rename(2) replaces the entry, never a link's target. `appendOnly` re-checks the same way
 * (ancestry + an O_NOFOLLOW single-link regular file) before the closed `chattr +a` runs.
 */
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants as FS,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import type { ExecResult, ProvisionExec } from '../exec';
import { provisionExec } from '../exec';
import { probeAppendOnly } from '../instance/roots';
import type { AgentLayout } from './layout';
import type { Action, EntryType, HostState, PathFacts, UnitFacts, WriteAction } from './plan';
import { agentScratchPath, ancestorsBelow, describe, renderAll, trustProblem } from './plan';

/** Suffix of the temp file a write goes through. `removeTemp` refuses anything else. */
export const TEMP_SUFFIX = '.dedalo-provision.tmp';

/**
 * The previous sudoers file while the new one is checked against the whole policy. Both this
 * and TEMP_SUFFIX contain a '.', so sudo's #includedir skips them: neither is ever policy.
 */
export const BACKUP_SUFFIX = '.dedalo-provision.bak';

export interface ProvisionIo {
  /** One level; the plan guarantees the parent. Mode is re-asserted by chmod (umask). */
  mkdir(path: string, mode: number): void;
  /** Writes `${path}${TEMP_SUFFIX}` exclusively (a stale temp is removed first); returns it. */
  writeTemp(path: string, body: string, mode: number): string;
  /** The entry itself, never a link target. */
  chown(path: string, uid: number, gid: number): void;
  /** The entry itself, never a link target. */
  chmod(path: string, mode: number): void;
  rename(from: string, to: string): void;
  removeTemp(path: string): void;
  /** Sets the append-only attribute on the file itself (the audit trail), never a link target. */
  appendOnly(path: string): void;
  /** base64url of `bytes` random bytes. Returned to the writer and nothing else. */
  randomToken(bytes: number): string;
  readonly exec: ProvisionExec;
}

export interface ActionOutcome {
  readonly action: Action;
  readonly status: 'done' | 'failed' | 'skipped';
  /** One line. Never content. */
  readonly detail: string;
}

export interface ApplyReport {
  readonly ok: boolean;
  readonly outcomes: readonly ActionOutcome[];
  readonly written: readonly string[];
  readonly failure: ActionOutcome | null;
}

/** The first non-blank line. Our own refusals keep every byte (they name paths); a child's output is capped. */
function firstLine(text: string, cap = Number.POSITIVE_INFINITY): string {
  return (text.split('\n').find(line => line.trim() !== '') ?? '').slice(0, cap);
}

const OUTPUT_LINE_CAP = 200;

/** temp → chown → chmod → rename: the one atomic write, for a writer outside the plan (tls.ts via cli.ts). */
export function writeAtomic(io: ProvisionIo, path: string, body: string, mode: number, uid: number, gid: number): void {
  const temp = io.writeTemp(path, body, mode);
  try {
    io.chown(temp, uid, gid);
    io.chmod(temp, mode);
    io.rename(temp, path);
  } catch (error) {
    io.removeTemp(temp);
    throw error;
  }
}

/**
 * THE SUDOERS INSTALL — still ONE write path (this file), with the second check a single-file
 * `visudo -cf` cannot make: `visudo -c` over the whole policy (a duplicate Cmnd_Alias in
 * another include is only visible there). A broken policy breaks sudo for EVERY user on the
 * host, so on that failure the previous file comes back by rename (its exact bytes, owner and
 * mode), or the new file is removed when there was none. The live path is briefly absent
 * between the two renames: the grant is missing for that instant, nothing else is.
 * The only removal door is removeTemp, so a file to delete is first renamed to the temp name.
 */
function installValidatedSudoers(action: WriteAction, temp: string, io: ProvisionIo): void {
  const backup = `${action.path}${BACKUP_SUFFIX}`;
  const hadPrevious = action.disposition === 'rewrite';
  if (hadPrevious) io.rename(action.path, backup);
  try {
    io.rename(temp, action.path);
  } catch (error) {
    if (hadPrevious) io.rename(backup, action.path);
    io.removeTemp(temp);
    throw error;
  }
  const policy = io.exec.visudoCheckPolicy();
  if (policy.code === 0) {
    if (hadPrevious) {
      io.rename(backup, temp);
      io.removeTemp(temp);
    }
    return;
  }
  if (hadPrevious) {
    io.rename(backup, action.path);
  } else {
    io.rename(action.path, temp);
    io.removeTemp(temp);
  }
  const said = firstLine(policy.stderr, OUTPUT_LINE_CAP) || firstLine(policy.stdout, OUTPUT_LINE_CAP) || 'no output';
  throw new Error(`visudo -c exited ${policy.code} with the new rule in place (${said}); the previous state was restored`);
}

function checked(label: string, result: ExecResult): void {
  if (result.code !== 0) {
    throw new Error(`${label} exited ${result.code}: ${firstLine(result.stderr, OUTPUT_LINE_CAP) || firstLine(result.stdout, OUTPUT_LINE_CAP) || '(no output)'}`);
  }
}

function run(action: Action, io: ProvisionIo, written: string[]): void {
  switch (action.op) {
    case 'mkdir':
      io.mkdir(action.path, action.mode);
      io.chown(action.path, action.uid, action.gid);
      io.chmod(action.path, action.mode);
      return;
    case 'write': {
      const body = action.content.source === 'literal' ? action.content.body : io.randomToken(action.content.bytes);
      const temp = io.writeTemp(action.path, body, action.mode);
      try {
        io.chown(temp, action.uid, action.gid);
        io.chmod(temp, action.mode);
        if (action.validate === 'sudoers') checked('visudo -cf', io.exec.visudoCheck(temp));
      } catch (error) {
        io.removeTemp(temp);
        throw error;
      }
      if (action.validate === 'sudoers') installValidatedSudoers(action, temp, io);
      else io.rename(temp, action.path);
      written.push(action.path);
      return;
    }
    case 'chown':
      io.chown(action.path, action.uid, action.gid);
      return;
    case 'chmod':
      io.chmod(action.path, action.mode);
      return;
    case 'append-only':
      io.appendOnly(action.path);
      return;
    case 'daemon-reload':
      checked('systemctl daemon-reload', io.exec.daemonReload());
      return;
    case 'web-configtest':
      checked(`${action.bin} -t`, io.exec.webConfigtest(action.bin, action.server));
      return;
    case 'web-reload':
      checked(`systemctl reload ${action.unit}`, io.exec.reloadUnit(action.unit));
      return;
    case 'enable':
      checked(`systemctl enable ${action.unit}`, io.exec.enableUnit(action.unit));
      return;
    case 'start':
      checked(`systemctl start ${action.unit}`, io.exec.startUnit(action.unit));
      return;
    case 'restart':
      checked(`systemctl restart ${action.unit}`, io.exec.restartUnit(action.unit));
      return;
    default: {
      const unreachable: never = action;
      throw new Error(`apply: unknown action ${JSON.stringify(unreachable)}`);
    }
  }
}

export function apply(actions: readonly Action[], io: ProvisionIo): ApplyReport {
  const outcomes: ActionOutcome[] = [];
  const written: string[] = [];
  let failure: ActionOutcome | null = null;
  for (const action of actions) {
    if (failure) {
      outcomes.push({ action, status: 'skipped', detail: 'not reached — an earlier action failed' });
      continue;
    }
    try {
      run(action, io, written);
      outcomes.push({ action, status: 'done', detail: describe(action) });
    } catch (error) {
      failure = { action, status: 'failed', detail: firstLine(error instanceof Error ? error.message : String(error)) };
      outcomes.push(failure);
    }
  }
  return { ok: failure === null, outcomes, written, failure };
}

/* ── the real host ────────────────────────────────────────────────────────────────── */

export interface HostDoorOptions {
  /** Ancestors at or above this directory are not judged. Production: '/'. The scratch gate narrows it. */
  readonly trustRoot?: string;
  /**
   * How observeHost asks whether the audit trail is append-only. Default: the agent's own
   * probeAppendOnly (instance/roots.ts) — the same verdict its boot preflight acts on. The
   * unprivileged real-fs gate (which cannot set FS_APPEND_FL) injects one paired with its stub.
   */
  readonly appendOnlyProbe?: (path: string) => string;
}

function errno(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? 'error';
}

/** Apply-time re-check of the ancestry (see the header, rule 1). Throws one line. */
function assertSafeParent(path: string, trustRoot: string, rootUid: number): void {
  const chain = ancestorsBelow(path, trustRoot);
  chain.forEach((dir, index) => {
    let stats: Stats;
    try {
      stats = lstatSync(dir);
    } catch (error) {
      throw new Error(`apply: refusing '${path}': its ancestor '${dir}' cannot be inspected (${errno(error)})`);
    }
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(`apply: refusing '${path}': '${dir}' is not a real directory — a link there could redirect a root write`);
    }
    if (index < chain.length - 1) {
      const problem = trustProblem({ uid: stats.uid, mode: stats.mode & 0o7777 }, rootUid);
      if (problem) {
        throw new Error(`apply: refusing '${path}': its ancestor '${dir}' is ${problem} — only the immediate parent may be the agent's`);
      }
    }
  });
}

/** Open without following, confirm the type, hand the fd to `fn` (header, rule 2). */
function onDescriptor(path: string, extraFlags: number, fn: (fd: number, stats: Stats) => void): void {
  let fd: number;
  try {
    fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK | extraFlags);
  } catch (error) {
    const code = errno(error);
    throw new Error(
      code === 'ELOOP'
        ? `apply: refusing '${path}': it is a symbolic link — root never follows a link it did not create`
        : `apply: refusing '${path}': cannot open it (${code})`,
    );
  }
  try {
    const stats = fstatSync(fd);
    if (!stats.isDirectory() && !stats.isFile()) {
      throw new Error(`apply: refusing '${path}': it is neither a file nor a directory`);
    }
    if (stats.isFile() && stats.nlink !== 1) {
      throw new Error(`apply: refusing '${path}': it has ${stats.nlink} hard links — the write would land on another file`);
    }
    fn(fd, stats);
  } finally {
    closeSync(fd);
  }
}

export function hostIo(exec: ProvisionExec = provisionExec(), options: HostDoorOptions = {}): ProvisionIo {
  const trustRoot = options.trustRoot ?? '/';
  const rootUid = exec.userId('root') ?? 0;
  const self = typeof process.geteuid === 'function' ? process.geteuid() : -1;
  const safeParent = (path: string): void => assertSafeParent(path, trustRoot, rootUid);
  return Object.freeze({
    mkdir(path: string, mode: number): void {
      safeParent(path);
      mkdirSync(path, { mode });
      onDescriptor(path, FS.O_DIRECTORY, (_fd, stats) => {
        if (stats.uid !== self) {
          throw new Error(`apply: refusing '${path}': the directory just created is owned by uid ${stats.uid}, not this process — it was swapped`);
        }
      });
    },
    writeTemp(path: string, body: string, mode: number): string {
      safeParent(path);
      const temp = `${path}${TEMP_SUFFIX}`;
      rmSync(temp, { force: true });
      const fd = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, mode);
      try {
        writeSync(fd, body);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return temp;
    },
    chown(path: string, uid: number, gid: number): void {
      safeParent(path);
      onDescriptor(path, 0, fd => fchownSync(fd, uid, gid));
    },
    chmod(path: string, mode: number): void {
      safeParent(path);
      onDescriptor(path, 0, fd => fchmodSync(fd, mode));
    },
    rename(from: string, to: string): void {
      safeParent(to);
      renameSync(from, to);
    },
    removeTemp(path: string): void {
      if (!path.endsWith(TEMP_SUFFIX)) throw new Error(`apply: refusing to remove '${path}' — not a provisioner temp file`);
      safeParent(path);
      rmSync(path, { force: true });
    },
    appendOnly(path: string): void {
      safeParent(path);
      onDescriptor(path, 0, (_fd, stats) => {
        if (!stats.isFile()) throw new Error(`apply: refusing '${path}': only a regular file is made append-only`);
      });
      checked(`chattr +a ${path}`, exec.appendOnly(path));
    },
    randomToken(bytes: number): string {
      return randomBytes(bytes).toString('base64url');
    },
    exec,
  });
}

function entryType(stats: Stats): EntryType {
  if (stats.isDirectory()) return 'dir';
  if (stats.isFile()) return 'file';
  if (stats.isSymbolicLink()) return 'symlink';
  return 'other';
}

/** lstat facts — never followed: a link is reported as a link. */
function facts(path: string): PathFacts | null {
  try {
    const stats = lstatSync(path);
    return { type: entryType(stats), uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o7777 };
  } catch {
    return null;
  }
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function observeHost(
  layout: AgentLayout,
  exec: ProvisionExec = provisionExec(),
  options: HostDoorOptions = {},
): HostState {
  const trustRoot = options.trustRoot ?? '/';
  const paths = new Map<string, PathFacts>();
  const contents = new Map<string, string | null>();
  const artifactPaths = renderAll(layout).map(art => art.path);
  const watched = [
    ...layout.directories.map(dir => dir.path),
    layout.state.marker,
    layout.serviceTokenPath,
    layout.state.auditFile,
    ...artifactPaths,
    layout.web.configtestBin,
    layout.phpBin,
    layout.bunBin,
    layout.agentDir,
    layout.agentEntry,
    agentScratchPath(layout),
  ];
  const observed = new Set<string>([trustRoot]);
  for (const path of watched) {
    observed.add(path);
    for (const dir of ancestorsBelow(path, trustRoot)) observed.add(dir);
  }
  for (const path of observed) {
    const found = facts(path);
    if (found) paths.set(path, found);
  }
  // The marker and our artifacts only: never the credential, never the audit log.
  for (const path of [layout.state.marker, ...artifactPaths]) {
    if (paths.get(path)?.type === 'file') contents.set(path, readOrNull(path));
  }
  const users = new Map<string, number>();
  for (const name of ['root', layout.identity.agentUser, layout.identity.v2User]) {
    const id = exec.userId(name);
    if (id !== null) users.set(name, id);
  }
  const groups = new Map<string, number>();
  const groupNames = ['root', layout.identity.webGroup, layout.identity.v2Group];
  if (layout.identity.engineGroup !== null) groupNames.push(layout.identity.engineGroup);
  for (const name of groupNames) {
    const id = exec.groupId(name);
    if (id !== null) groups.set(name, id);
  }
  const units = new Map<string, UnitFacts>();
  for (const unit of [layout.agentUnitName, layout.v2.unit]) units.set(unit, exec.unitState(unit));
  // The audit trail's attribute: probed (an O_NOFOLLOW write-open, never a write), never read.
  const appendOnly = new Set<string>();
  const probe = options.appendOnlyProbe ?? probeAppendOnly;
  if (paths.get(layout.state.auditFile)?.type === 'file' && probe(layout.state.auditFile) === 'append_only') {
    appendOnly.add(layout.state.auditFile);
  }
  return { trustRoot, appendOnly, paths, contents, users, groups, units };
}
