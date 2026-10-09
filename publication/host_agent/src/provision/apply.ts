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
 *      level below such a directory: instance/roots.ts STATE_TREE_OWNERSHIP). ONE exception, for
 *      the directory doors (mkdir, chown, chmod): an untrusted GRANDPARENT under a root parent,
 *      which is then pinned by descriptor and inode and the entry used by name (pinnedParentOf —
 *      the site's web log directory under Ubuntu's root:syslog 0775 /var/log). The pinned parent
 *      must be the one the action EXPECTS (PinExpectation: owner, group, mode and the observed
 *      dev + ino) and on its own parent's device (withPinnedDir);
 *   2. operates on a FILE DESCRIPTOR opened O_NOFOLLOW (O_DIRECTORY for directories,
 *      O_NONBLOCK against FIFOs): fstat confirms a directory or a single-link regular file
 *      (a hard link to another file is refused), then fchown/fchmod on that fd;
 *   3. mkdir re-opens what it created and refuses it unless this process owns it;
 *   4. creates temp files O_CREAT|O_EXCL|O_NOFOLLOW and writes them through their fd.
 * rename(2) replaces the entry, never a link's target. `appendOnly` re-checks the same way
 * (ancestry + an O_NOFOLLOW single-link regular file) before the closed `chattr +a` runs.
 *
 * THE WEB SERVER AND PHP-FPM (spec §5.9). A write with a `web`/`fpm` validator is installed
 * AFTER the rename under the host web lock (installValidatedPostRename): back up, rename, the
 * server's own configtest; on failure the previous bytes come back and configtest runs again
 * (both exits reported). The rollback stays beside the file until its reload succeeded. Every
 * configtest op holds the host web lock through the reload that follows it; after the reload the
 * unit is POLLED for RELOAD_POLL (an AVC or a bad module kills the master at reload, after a
 * passing configtest run as unconfined root): inactive → restore, configtest, restart, confirm
 * active, `rolled_back{reload}` — for the web server and FPM alike.
 *
 * SELINUX (spec S9, §5.9): one `semanage import` from a root 0600 provisioner temp, then the
 * registration history; restorecon, then the same as a dry run that must find nothing pending.
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
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ExecResult, ProvisionExec } from '../exec';
import { provisionExec } from '../exec';
import { probeAppendOnly } from '../instance/roots';
import { flockIo } from './flock';
import { MAP_RENDERER_BUN, MAP_RENDERER_BUNFIG, MAP_RENDERER_FILES, MAP_RENDERER_VERSION_FILE, rendererDigest } from './host_map_renderer';
import { parseGetenforce, parseGetsebool, parseRestoreconDryRun, parseSelinuxConfig, parseSemanageFcontextLocal, parseSemanagePorts, singlePorts, tcpPortTypes } from './init/parse/selinux';
import { isNetworkFs, mountOf, parseMountinfo } from './init/parse/mounts';
import { parseSystemdVersion } from './init/parse/systemd';
import type { AgentLayout } from './layout';
import { APACHE_DUMP_CANDIDATES, MODES, PUBHOST_GROUP } from './layout';
import type { LockHandle, LockIo } from './lock';
import { acquireHostLockSync } from './lock';
import type { AccountGroups } from './access';
import type {
  PinExpectation,
  Action,
  AgentTree,
  ContributionFacts,
  EntryType,
  HostLockRef,
  HostState,
  PathFacts,
  RestoreEntry,
  SelinuxObserved,
  SiblingFacts,
  UnitFacts,
  WriteAction,
} from './plan';
import {
  AGENT_TREE_WALK_CAP,
  PlanRefused,
  VALIDATED_BACKUP_SUFFIX,
  VALIDATED_CREATED_SUFFIX,
  agentDevDependencyPaths,
  agentScratchPath,
  ancestorsBelow,
  describe,
  extraDirectories,
  hostDirTemp,
  hostLockFiles,
  RENDERERS,
  renderAll,
  ruleFacts,
  selinuxPaths,
  trustProblem,
} from './plan';
import type { Renderer } from './render/types';
import { PENDING_FACTS } from './render/types';
import { IDENTITIES_FILE } from './host_map_renderer';
import { HOST_MAP_FILE, HOST_MAP_RESULT_FILE } from '../rules/host_map';
import { RELOAD_ACTIVE_POLL } from '../rules/txn';
import { SELINUX_BOOLEANS, isHomeLayout, restoreconTargets } from './selinux';
import { webReferencePresent } from './web_reference';
import { webIncludePath } from './render/web_include';

/** Suffix of the temp file a write goes through. `removeTemp` refuses anything else. */
export const TEMP_SUFFIX = '.dedalo-provision.tmp';

/**
 * The previous sudoers file while the new one is checked against the whole policy, and the previous
 * bytes of a web/fpm-validated file until its reload succeeded (plan.ts VALIDATED_BACKUP_SUFFIX).
 * Both this and TEMP_SUFFIX contain a '.', so sudo's #includedir skips them: neither is ever policy.
 */
export const BACKUP_SUFFIX = VALIDATED_BACKUP_SUFFIX;
/** The marker of a web/fpm-validated file this provisioner CREATED, until its reload succeeded. */
export const CREATED_SUFFIX = VALIDATED_CREATED_SUFFIX;

/** How long a reloaded unit must stay active (spec §5.9): polled every `intervalMs`, `count` times. */
/** The post-reload active poll: ONE window for the provisioner and the shared web-config transaction (../rules/txn.ts). */
export const RELOAD_POLL = RELOAD_ACTIVE_POLL;

export interface ProvisionIo {
  /**
   * One level; the plan guarantees the parent. Mode is re-asserted by chmod (umask). `pin`, on the
   * three directory doors: what the parent must be when only the grandparent is untrusted
   * (withPinnedDir); hostIo refuses such a path without one.
   */
  mkdir(path: string, mode: number, pin?: PinExpectation): void;
  /** Writes `${path}${TEMP_SUFFIX}` exclusively (a stale temp is removed first); returns it. */
  writeTemp(path: string, body: string, mode: number): string;
  /** The entry itself, never a link target. */
  chown(path: string, uid: number, gid: number, pin?: PinExpectation): void;
  /** The entry itself, never a link target. */
  chmod(path: string, mode: number, pin?: PinExpectation): void;
  rename(from: string, to: string): void;
  removeTemp(path: string): void;
  /** Sets the append-only attribute on the file itself (the audit trail), never a link target. */
  appendOnly(path: string): void;
  /** base64url of `bytes` random bytes. Returned to the writer and nothing else. */
  randomToken(bytes: number): string;
  readonly exec: ProvisionExec;
  /**
   * The flock door (spec S12): the host web lock around every configtest+reload, the host lock
   * files. Production: ./flock.ts flockIo(). Absent = this io cannot take a lock: an action that
   * needs one FAILS naming it (never runs unlocked).
   */
  readonly lockIo?: LockIo;
  /** The reload poll's wait (production: Bun.sleepSync). */
  sleepSync?(ms: number): void;
  /**
   * Copies a root-owned regular file (never followed) to `dst` atomically (temp O_EXCL|O_NOFOLLOW →
   * fchown/fchmod → rename): the host map renderer copy, its bun binary included. Absent = the
   * renderer install FAILS naming it.
   */
  installFile?(src: string, dst: string, mode: number, uid: number, gid: number): void;
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

function said(result: ExecResult): string {
  return firstLine(result.stderr, OUTPUT_LINE_CAP) || firstLine(result.stdout, OUTPUT_LINE_CAP) || 'no output';
}

/** The host web lock (spec S12 3), exclusive, through the io's flock door. Throws when the io has none. */
function takeWebLock(io: ProvisionIo, ref: HostLockRef): LockHandle {
  if (io.lockIo === undefined) {
    throw new Error('apply: this io has no lock door — the host web lock cannot be taken, so nothing is configtested or reloaded');
  }
  return acquireHostLockSync('web', { dir: ref.dir, io: io.lockIo, uid: ref.uid, gid: ref.gid, create: true });
}

/** The configtest a validator or a reload rollback runs. */
function configtest(io: ProvisionIo, target: { readonly kind: 'web'; readonly server: 'apache' | 'nginx'; readonly bin: string } | { readonly kind: 'fpm'; readonly bin: string }): ExecResult {
  return target.kind === 'web' ? io.exec.webConfigtest(target.bin, target.server) : io.exec.fpmConfigtest(target.bin);
}

/** Removes a file through the one removal door: renamed to the provisioner temp name, then removeTemp. */
function removeThroughTemp(io: ProvisionIo, path: string): void {
  const temp = `${path}${TEMP_SUFFIX}`;
  io.rename(path, temp);
  io.removeTemp(temp);
}

/**
 * THE POST-RENAME INSTALL (spec §5.9, twin of installValidatedSudoers) for a web/fpm-validated
 * file, under the host web lock: keep the previous bytes as `<path>.dedalo-provision.bak` (or mark
 * a create), rename the new file into place, run the server's configtest; on failure restore and
 * run configtest again, reporting both exits. The rollback stays until the reload succeeded.
 */
function installValidatedPostRename(action: WriteAction, temp: string, io: ProvisionIo): void {
  const validator = action.validator;
  if (!validator || validator.kind === 'sudoers' || action.lock === undefined) {
    io.removeTemp(temp);
    throw new Error(`apply: '${action.path}' has a ${action.validate} validator without its configtest or its lock`);
  }
  let lock: LockHandle;
  try {
    lock = takeWebLock(io, action.lock);
  } catch (error) {
    io.removeTemp(temp);
    throw error;
  }
  try {
    const backup = `${action.path}${BACKUP_SUFFIX}`;
    const marker = `${action.path}${CREATED_SUFFIX}`;
    const hadPrevious = action.disposition === 'rewrite';
    if (hadPrevious) io.rename(action.path, backup);
    else writeAtomic(io, marker, '', 0o600, action.uid, action.gid);
    try {
      io.rename(temp, action.path);
    } catch (error) {
      if (hadPrevious) io.rename(backup, action.path);
      else removeThroughTemp(io, marker);
      io.removeTemp(temp);
      throw error;
    }
    const first = configtest(io, validator);
    if (first.code === 0) return;
    restoreValidated(io, { path: action.path, disposition: action.disposition });
    const again = configtest(io, validator);
    throw new Error(
      `${validator.bin} -t exited ${first.code} with the new ${action.label} in place (${said(first)}); the previous ` +
        `state was restored and ${validator.bin} -t then exited ${again.code}${again.code === 0 ? '' : ` (${said(again)})`}`,
    );
  } finally {
    lock.release();
  }
}

/** Puts back what a validated write replaced (the backup) or removes what it created (the marker says so). */
function restoreValidated(io: ProvisionIo, entry: RestoreEntry): void {
  if (entry.disposition === 'rewrite') io.rename(`${entry.path}${BACKUP_SUFFIX}`, entry.path);
  else {
    removeThroughTemp(io, entry.path);
    removeThroughTemp(io, `${entry.path}${CREATED_SUFFIX}`);
  }
}

/** The reload succeeded: the rollback of every file it loaded goes. */
function dropRollback(io: ProvisionIo, entry: RestoreEntry): void {
  removeThroughTemp(io, `${entry.path}${entry.disposition === 'rewrite' ? BACKUP_SUFFIX : CREATED_SUFFIX}`);
}

/** True when `unit` stayed active for the whole poll (spec §5.9: an inactive unit after a reload is a failure). */
function staysActive(io: ProvisionIo, unit: string): boolean {
  const sleep = io.sleepSync?.bind(io) ?? ((ms: number) => Bun.sleepSync(ms));
  for (let attempt = 0; attempt < RELOAD_POLL.count; attempt += 1) {
    if (!io.exec.unitState(unit).active) return false;
    sleep(RELOAD_POLL.intervalMs);
  }
  return io.exec.unitState(unit).active;
}

/**
 * RELOAD, THEN THE ACTIVE POLL (spec §5.9). Inactive after the reload: restore every file this
 * reload was to load, configtest, restart, confirm active — and fail `rolled_back{reload}`. Active:
 * the rollbacks go.
 */
function reloadWithPoll(
  io: ProvisionIo,
  unit: string,
  restore: readonly RestoreEntry[],
  target: { readonly kind: 'web'; readonly server: 'apache' | 'nginx'; readonly bin: string } | { readonly kind: 'fpm'; readonly bin: string },
): void {
  checked(`systemctl reload ${unit}`, io.exec.reloadUnit(unit));
  if (staysActive(io, unit)) {
    for (const entry of restore) dropRollback(io, entry);
    return;
  }
  for (const entry of restore) restoreValidated(io, entry);
  const test = configtest(io, target);
  const restart = io.exec.restartUnit(unit);
  const back = restart.code === 0 && io.exec.unitState(unit).active;
  throw new Error(
    `rolled_back{reload}: ${unit} was not active after the reload; ${restore.length} file(s) restored, ` +
      `${target.bin} -t exited ${test.code}, systemctl restart ${unit} exited ${restart.code}, ` +
      `${unit} is ${back ? 'active again' : 'STILL NOT ACTIVE — the web server or PHP-FPM is down: journalctl -u ' + unit}`,
  );
}

/** At most this many paths per restorecon call (src/exec.ts restorecon validates 1-16). */
const RESTORECON_BATCH = 16;

function relabel(io: ProvisionIo, targets: readonly { path: string; recursive: boolean }[]): void {
  for (let index = 0; index < targets.length; index += RESTORECON_BATCH) {
    const batch = targets.slice(index, index + RESTORECON_BATCH);
    checked('restorecon', io.exec.restorecon(batch, false));
  }
  const left: string[] = [];
  for (let index = 0; index < targets.length; index += RESTORECON_BATCH) {
    const batch = targets.slice(index, index + RESTORECON_BATCH);
    const dry = io.exec.restorecon(batch, true);
    checked('restorecon -n', dry);
    for (const pending of parseRestoreconDryRun(dry.stdout)) left.push(`${pending.path} (${pending.from} → ${pending.to})`);
  }
  if (left.length > 0) {
    throw new Error(`restorecon left ${left.length} path(s) unrelabelled: ${left.slice(0, 5).join(', ')}${left.length > 5 ? ', …' : ''}`);
  }
}

function run(action: Action, io: ProvisionIo, written: string[]): void {
  switch (action.op) {
    case 'mkdir':
      if (action.via !== undefined) {
        // Host-wide (spec §5.9): never visible with the wrong metadata.
        io.mkdir(action.via, action.mode);
        io.chown(action.via, action.uid, action.gid);
        io.chmod(action.via, action.mode);
        io.rename(action.via, action.path);
        return;
      }
      io.mkdir(action.path, action.mode, action.pin);
      io.chown(action.path, action.uid, action.gid, action.pin);
      io.chmod(action.path, action.mode, action.pin);
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
      else if (action.validate === 'web' || action.validate === 'fpm') installValidatedPostRename(action, temp, io);
      else {
        // A failed rename must not leave the temp behind: it may hold a freshly minted credential.
        try {
          io.rename(temp, action.path);
        } catch (error) {
          io.removeTemp(temp);
          throw error;
        }
      }
      written.push(action.path);
      return;
    }
    case 'chown':
      io.chown(action.path, action.uid, action.gid, action.pin);
      return;
    case 'chmod':
      io.chmod(action.path, action.mode, action.pin);
      return;
    case 'append-only':
      io.appendOnly(action.path);
      return;
    case 'remove':
      removeThroughTemp(io, action.path);
      return;
    case 'renderer-install': {
      if (io.installFile === undefined) throw new Error(`apply: this io cannot copy files — the host map renderer was not installed`);
      for (const sub of action.subdirs) {
        const path = join(action.dir, sub);
        try {
          io.mkdir(path, MODES.hostMapRenderer.mode);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        }
        io.chown(path, action.uid, action.gid);
        io.chmod(path, MODES.hostMapRenderer.mode);
      }
      for (const file of action.files) {
        io.installFile(join(action.sourceDir, file), join(action.dir, file), 0o644, action.uid, action.gid);
      }
      io.installFile(action.bun, join(action.dir, MAP_RENDERER_BUN), 0o755, action.uid, action.gid);
      writeAtomic(io, join(action.dir, MAP_RENDERER_BUNFIG), '', 0o644, action.uid, action.gid);
      // LAST: the record never names a copy that is not whole.
      writeAtomic(io, join(action.dir, MAP_RENDERER_VERSION_FILE), action.versionBody, 0o644, action.uid, action.gid);
      written.push(join(action.dir, MAP_RENDERER_VERSION_FILE));
      return;
    }
    case 'daemon-reload':
      checked('systemctl daemon-reload', io.exec.daemonReload());
      return;
    case 'selinux-import': {
      if (action.lines.length > 0) {
        // The exec door admits exactly `<configBase>/<instance>/selinux.import.dedalo-provision.tmp`, root 0600.
        const temp = io.writeTemp(action.file, `${action.lines.join('\n')}\n`, 0o600);
        try {
          io.chown(temp, action.uid, action.gid);
          io.chmod(temp, 0o600);
          checked('semanage import', io.exec.semanageImport(temp));
        } finally {
          io.removeTemp(temp);
        }
      }
      writeAtomic(io, action.statePath, action.stateBody, 0o644, action.uid, action.gid);
      written.push(action.statePath);
      return;
    }
    case 'selinux-restorecon':
      relabel(io, action.targets);
      return;
    case 'fpm-configtest':
      checked(`${action.bin} -t`, io.exec.fpmConfigtest(action.bin));
      return;
    case 'fpm-reload':
      reloadWithPoll(io, action.unit, action.restore, { kind: 'fpm', bin: action.bin });
      return;
    case 'web-configtest':
      checked(`${action.bin} -t`, io.exec.webConfigtest(action.bin, action.server));
      return;
    case 'web-reload': {
      if (action.server === undefined || action.bin === undefined) {
        checked(`systemctl reload ${action.unit}`, io.exec.reloadUnit(action.unit));
        return;
      }
      reloadWithPoll(io, action.unit, action.restore ?? [], { kind: 'web', server: action.server, bin: action.bin });
      return;
    }
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
  // The host web lock a configtest op takes is held through the reload that follows it (spec S12 3).
  let held: LockHandle | null = null;
  try {
    for (const action of actions) {
      if (failure) {
        outcomes.push({ action, status: 'skipped', detail: 'not reached — an earlier action failed' });
        continue;
      }
      try {
        if ((action.op === 'web-configtest' || action.op === 'fpm-configtest') && action.lock !== undefined) {
          held?.release();
          held = takeWebLock(io, action.lock);
        }
        run(action, io, written);
        outcomes.push({ action, status: 'done', detail: describe(action) });
      } catch (error) {
        failure = { action, status: 'failed', detail: firstLine(error instanceof Error ? error.message : String(error)) };
        outcomes.push(failure);
      }
      if (action.op === 'web-reload' || action.op === 'fpm-reload' || failure !== null) {
        held?.release();
        held = null;
      }
    }
  } finally {
    held?.release();
  }
  return { ok: failure === null, outcomes, written, failure };
}

/**
 * THE HOST PROVISION LOCK (spec S12 2): `provision apply` holds it around planning AND applying the
 * host-wide items, so two instances' applies never see each other's half-created directories. The
 * lock lives in HOST_LOCKS_DIR, which an apply creates: so the two directories it needs are ensured
 * first, each created under a temporary name and renamed (with exactly its MODES metadata, an
 * existing one with other metadata refused). Throws PlanRefused when the pubhost group is missing.
 */
export function lockHostProvision(
  layout: AgentLayout,
  io: ProvisionIo,
  ids: { readonly rootUid: number; readonly rootGid: number; readonly pubhostGid: number | null },
): LockHandle {
  if (ids.pubhostGid === null) {
    throw new PlanRefused(layout.instance, [
      `group '${PUBHOST_GROUP}' (host-wide: every agent unit's SupplementaryGroups=) does not exist — create it: ` +
        `groupadd --system ${PUBHOST_GROUP}`,
    ]);
  }
  if (io.lockIo === undefined) throw new Error('apply: this io has no lock door — the host provision lock cannot be taken');
  // The host base's missing ancestors first (root 0755, as plan() creates them), then the two lock directories.
  const missingAncestors = ancestorsBelow(layout.host.base, '/').filter(dir => io.lockIo?.lstat(dir) === null);
  for (const [path, row, gid] of [
    ...missingAncestors.map(dir => [dir, MODES.hostBase, ids.rootGid] as const),
    [layout.host.base, MODES.hostBase, ids.rootGid],
    [layout.host.locksDir, MODES.hostLocks, ids.pubhostGid],
  ] as const) {
    const facts = io.lockIo.lstat(path);
    if (facts === null) {
      const temp = hostDirTemp(path);
      io.mkdir(temp, row.mode);
      io.chown(temp, ids.rootUid, gid);
      io.chmod(temp, row.mode);
      io.rename(temp, path);
      continue;
    }
    if (facts.type !== 'dir' || facts.uid !== ids.rootUid || (facts.mode & 0o7777) !== row.mode) {
      throw new PlanRefused(layout.instance, [
        `'${path}' (host-wide) is not a ${row.mode.toString(8)} directory owned by root — a host-wide anomaly; it is never chowned`,
      ]);
    }
  }
  return acquireHostLockSync('provision', { dir: layout.host.locksDir, io: io.lockIo, uid: ids.rootUid, gid: ids.rootGid, create: true });
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
  /**
   * The renderers whose artifact PATHS observeHost watches. Default: plan.ts RENDERERS. The
   * scratch-root gate passes the same set plan() gets (its sudoers renderer substituted: the
   * real one refuses any configtest binary but the canonical path, which a scratch tree cannot own).
   */
  readonly renderers?: readonly Renderer[];
  /** The most entries observeHost walks in agent_dir. Default: plan.ts AGENT_TREE_WALK_CAP; a gate lowers it. */
  readonly agentTreeCap?: number;
  /**
   * The other declarations of this host (cli.ts readSiblings: trusted and parsed there). Absent = not
   * observed: the plan then neither rewrites identities.json nor sweeps contributions (planReport says so).
   */
  readonly siblings?: readonly { readonly layout: AgentLayout }[];
  /** A text file's contents (default: readFileSync). The SELinux config and /proc/self/mountinfo go through it. */
  readonly readText?: (path: string) => string | null;
  /** hostIo's flock door (default: ./flock.ts flockIo()). */
  readonly lockIo?: LockIo;
  /** GATES ONLY: runs inside withPinnedDir between the pin and the operation (the substitute-after-pin race). */
  readonly onPinned?: (dir: string) => void;
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

/**
 * RULE 1'S ONE EXCEPTION — THE UNTRUSTED GRANDPARENT, for the directory doors (mkdir, chown,
 * chmod) and init's writeBytesAtomic. Two managed paths sit under a grandparent rule 1 cannot
 * trust while their parent is root's:
 *   - the site's web log directory `/var/log/<server>/<domain>` (layout.ts webLogBase): Ubuntu's
 *     rsyslog makes /var/log root:syslog 0775 (measured, ubuntu:24.04 and 26.04 with rsyslog), so
 *     the syslog group could rename /var/log/apache2 away and put its own in place;
 *   - init's API files `<api>/shared/<file>`: `publication_api/<api>/` is the agent's, `shared/` root's.
 * Such a write is PINNED to the parent instead: opened O_DIRECTORY|O_NOFOLLOW (never a link), its
 * descriptor a root-owned directory closed to group/other writes, the working directory moved into
 * it and checked to be THAT inode (dev + ino of '.' = the descriptor's); the operation then uses the
 * entry's NAME relative to the working directory, which is bound to the inode, not to a path a
 * rename could repoint. Everything above the grandparent is judged as rule 1 judges it (a swap there
 * would repoint the grandparent itself). plan.ts judges the same shape (pinnableGrandparent).
 *
 * Returns the parent to pin, or null when rule 1 holds as it is (the caller then applies rule 1).
 */
export function pinnedParentOf(path: string, trustRoot: string, rootUid: number, who = 'apply'): string | null {
  const chain = ancestorsBelow(path, trustRoot);
  if (chain.length < 2) return null;
  const grandparent = chain[chain.length - 2] as string;
  let stats: Stats;
  try {
    stats = lstatSync(grandparent);
  } catch {
    return null; // rule 1 names it
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) return null;
  if (trustProblem({ uid: stats.uid, mode: stats.mode & 0o7777 }, rootUid) === null) return null;
  const above = ancestorsBelow(grandparent, trustRoot);
  for (const dir of above) {
    let facts: Stats;
    try {
      facts = lstatSync(dir);
    } catch (error) {
      throw new Error(`${who}: refusing '${path}': its ancestor '${dir}' cannot be inspected (${errno(error)})`);
    }
    if (facts.isSymbolicLink() || !facts.isDirectory()) {
      throw new Error(`${who}: refusing '${path}': '${dir}' is not a real directory — a link there could redirect a root write`);
    }
    const problem = trustProblem({ uid: facts.uid, mode: facts.mode & 0o7777 }, rootUid);
    if (problem) throw new Error(`${who}: refusing '${path}': its ancestor '${dir}' is ${problem} — only the grandparent may be untrusted, and then the parent is pinned`);
  }
  return chain[chain.length - 1] as string;
}

export type { PinExpectation };

/** One line naming what `stats` differs in from `expect`, or null when it is that directory. */
export function pinMismatch(stats: { uid: number; gid: number; mode: number; dev?: number; ino?: number }, expect: PinExpectation): string | null {
  const mode = stats.mode & 0o7777;
  if (stats.uid !== expect.uid || stats.gid !== expect.gid || mode !== expect.mode) {
    return `uid ${stats.uid} gid ${stats.gid} mode ${mode.toString(8).padStart(4, '0')}, not the expected uid ${expect.uid} gid ${expect.gid} mode ${expect.mode.toString(8).padStart(4, '0')}`;
  }
  if (expect.dev !== undefined && stats.dev !== expect.dev) return `on device ${stats.dev}, not the observed ${expect.dev}`;
  if (expect.ino !== undefined && stats.ino !== expect.ino) return `inode ${stats.ino}, not the observed ${expect.ino} — it was replaced after it was observed`;
  return null;
}

/**
 * Runs `fn` with the working directory pinned to `expect.parent` (see pinnedParentOf); the previous
 * one is restored. The directory must be the one EXPECTED (PinExpectation), and on the same device
 * as its own parent — a mount over the name (FUSE needs only an owned mountpoint: the agent could
 * rename the root directory away, make its own, mount a filesystem that reports root:root over it)
 * is a different device from the grandparent it sits in. `onPinned` (gates only) runs between the
 * pin and `fn`: the substitute-after-pin race is driven through it.
 */
export function withPinnedDir<T>(expect: PinExpectation, rootUid: number, fn: () => T, who = 'apply', onPinned?: (dir: string) => void): T {
  const dir = expect.parent;
  let fd: number;
  try {
    fd = openSync(dir, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW | FS.O_NONBLOCK);
  } catch (error) {
    throw new Error(`${who}: refusing to write in '${dir}': it cannot be opened as a real directory without following a link (${errno(error)})`);
  }
  const before = process.cwd();
  let moved = false;
  try {
    const pinned = fstatSync(fd);
    const problem = pinned.isDirectory() ? trustProblem({ uid: pinned.uid, mode: pinned.mode & 0o7777 }, rootUid) : 'not a directory';
    if (problem) throw new Error(`${who}: refusing to write in '${dir}': it is ${problem} (its parent is untrusted, so only a root directory closed to others may be written in)`);
    const mismatch = pinMismatch(pinned, expect);
    if (mismatch) throw new Error(`${who}: refusing to write in '${dir}': it is ${mismatch} (its parent is untrusted, so only the directory expected may be written in)`);
    process.chdir(dir);
    moved = true;
    const here = statSync('.');
    if (here.dev !== pinned.dev || here.ino !== pinned.ino) throw new Error(`${who}: refusing to write in '${dir}': it was replaced while it was being opened`);
    const up = statSync('..');
    if (up.dev !== pinned.dev) {
      throw new Error(`${who}: refusing to write in '${dir}': it is on device ${pinned.dev}, its parent on ${up.dev} — something is mounted over the name`);
    }
    const named = lstatSync(dirname(dir));
    if (named.dev !== up.dev || named.ino !== up.ino) throw new Error(`${who}: refusing to write in '${dir}': it is no longer in '${dirname(dir)}'`);
    onPinned?.(dir);
    return fn();
  } finally {
    if (moved) process.chdir(before);
    closeSync(fd);
  }
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
  /** The directory doors: rule 1, or the pinned parent when only the grandparent is untrusted (pinnedParentOf). */
  const dirDoor = (path: string, pin: PinExpectation | undefined, fn: (entry: string) => void): void => {
    const pinned = pinnedParentOf(path, trustRoot, rootUid);
    if (pinned === null) {
      safeParent(path);
      fn(path);
      return;
    }
    if (pin === undefined || pin.parent !== pinned) {
      throw new Error(
        `apply: refusing '${path}': its grandparent is untrusted, so its parent '${pinned}' is pinned — ` +
          (pin === undefined ? 'and the plan stated no expectation for it' : `but the plan's expectation names '${pin.parent}'`),
      );
    }
    withPinnedDir(pin, rootUid, () => fn(basename(path)), 'apply', options.onPinned);
  };
  return Object.freeze({
    mkdir(path: string, mode: number, pin?: PinExpectation): void {
      dirDoor(path, pin, entry => {
        mkdirSync(entry, { mode });
        onDescriptor(entry, FS.O_DIRECTORY, (_fd, stats) => {
          if (stats.uid !== self) {
            throw new Error(`apply: refusing '${path}': the directory just created is owned by uid ${stats.uid}, not this process — it was swapped`);
          }
        });
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
    chown(path: string, uid: number, gid: number, pin?: PinExpectation): void {
      dirDoor(path, pin, entry => onDescriptor(entry, 0, fd => fchownSync(fd, uid, gid)));
    },
    chmod(path: string, mode: number, pin?: PinExpectation): void {
      dirDoor(path, pin, entry => onDescriptor(entry, 0, fd => fchmodSync(fd, mode)));
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
    lockIo: options.lockIo ?? flockIo(),
    sleepSync(ms: number): void {
      Bun.sleepSync(ms);
    },
    installFile(src: string, dst: string, mode: number, uid: number, gid: number): void {
      // The source is root's code (agent_dir, bun_bin — trust-judged by the plan): read through an
      // O_NOFOLLOW descriptor of a single-link regular file, never a link.
      let bytes: Buffer | null = null;
      onDescriptor(src, 0, (fd, stats) => {
        if (!stats.isFile()) throw new Error(`apply: refusing '${src}': not a regular file`);
        bytes = readFileSync(fd);
      });
      if (bytes === null) throw new Error(`apply: '${src}' could not be read`);
      safeParent(dst);
      const temp = `${dst}${TEMP_SUFFIX}`;
      rmSync(temp, { force: true });
      const fd = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600);
      try {
        writeSync(fd, bytes);
        fsyncSync(fd);
        fchownSync(fd, uid, gid);
        fchmodSync(fd, mode);
      } catch (error) {
        closeSync(fd);
        rmSync(temp, { force: true });
        throw error;
      }
      closeSync(fd);
      renameSync(temp, dst);
    },
  });
}

function entryType(stats: Stats): EntryType {
  if (stats.isDirectory()) return 'dir';
  if (stats.isFile()) return 'file';
  if (stats.isSymbolicLink()) return 'symlink';
  return 'other';
}

/** lstat facts — never followed: a link is reported as a link (with its resolved target unless `bare`). */
function facts(path: string, bare = false): PathFacts | null {
  try {
    const stats = lstatSync(path);
    const found: PathFacts = { type: entryType(stats), uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o7777, dev: stats.dev, ino: stats.ino };
    if (!stats.isSymbolicLink() || bare) return found;
    try {
      return { ...found, target: realpathSync(path) };
    } catch {
      return found; // dangling: the refusal says it does not resolve
    }
  } catch {
    return null;
  }
}

/**
 * agent_dir's tree, lstat only: a symlink is recorded as an entry and never entered or
 * resolved (the walk stays in the tree). Past `cap` entries, or at a directory it cannot
 * list, the walk STOPS and says why — plan refuses an incomplete tree, never skips it.
 */
function walkAgentTree(root: string, cap: number, paths: Map<string, PathFacts>): AgentTree {
  const rootFacts = facts(root, true);
  if (!rootFacts || rootFacts.type !== 'dir') return { paths: [], incomplete: null }; // refused as pinned code
  if (!paths.has(root)) paths.set(root, rootFacts);
  const listed: string[] = [root];
  const pending: string[] = [root];
  while (pending.length > 0) {
    const dir = pending.shift() as string;
    let names: string[];
    try {
      names = readdirSync(dir).sort();
    } catch (error) {
      return { paths: listed, incomplete: `'${dir}' could not be listed (${errno(error)})` };
    }
    for (const name of names) {
      if (listed.length >= cap) return { paths: listed, incomplete: `it holds more than ${cap} entries` };
      const path = join(dir, name);
      const found = facts(path, true);
      if (!found) continue; // gone between readdir and lstat
      if (!paths.has(path)) paths.set(path, found); // a watched path keeps its link target (refusal text)
      listed.push(path);
      if (found.type === 'dir') pending.push(path);
    }
  }
  return { paths: listed, incomplete: null };
}

function readOrNull(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** The SELinux config directory (spec S9: `/etc/selinux/<SELINUXTYPE>/` = the policy store). */
export const SELINUX_CONFIG_DIR = '/etc/selinux';
export const SEMANAGE_BIN = '/usr/sbin/semanage';

/**
 * observeHost's SELinux pass (spec S9, §5.9): the mode; the policy store (the disabled-with-store
 * branch); the local rules and ports; the policy's port types; the booleans; whether the media root
 * may be labelled (local or `seclabel` filesystem); the registration history; and — only when labels
 * are relabelled — what restorecon would still change on this instance's existing targets. Parsed by
 * init/parse/selinux.ts (the one SELinux grammar). Absent tools (exit 127) mean `absent`.
 */
function observeSelinux(
  layout: AgentLayout,
  exec: ProvisionExec,
  readText: (path: string) => string | null,
  exists: (path: string) => boolean,
): SelinuxObserved {
  const mode = parseGetenforce(exec.selinuxMode());
  const empty: SelinuxObserved = {
    mode,
    storePresent: false,
    localFcontext: [],
    localPorts: [],
    portTypes: new Map(),
    pending: [],
    state: null,
    booleans: {},
    mediaLabelable: true,
  };
  if (mode === 'absent') return empty;
  const config = parseSelinuxConfig(readText(join(SELINUX_CONFIG_DIR, 'config')) ?? '');
  const storePresent = config.type !== null && exists(join(SELINUX_CONFIG_DIR, config.type)) && exists(SEMANAGE_BIN);
  if (mode === 'disabled' && !storePresent) return { ...empty, storePresent };
  const listed = (result: ExecResult, what: string): string => {
    if (result.code !== 0) throw new Error(`observe: ${what} exited ${result.code}: ${said(result)}`);
    return result.stdout;
  };
  const local = parseSemanageFcontextLocal(listed(exec.semanageLocal('fcontext'), 'semanage fcontext -l -C'));
  const localPorts = singlePorts(parseSemanagePorts(listed(exec.semanageLocal('port'), 'semanage port -l -C')));
  const portTypes = tcpPortTypes(parseSemanagePorts(listed(exec.semanagePortList(), 'semanage port -l')));
  const booleans: Record<string, boolean> = {};
  if (mode !== 'disabled') {
    for (const name of SELINUX_BOOLEANS) {
      const value = parseGetsebool(name, exec.getsebool(name));
      if (value !== null) booleans[name] = value;
    }
  }
  let mediaLabelable = true;
  if (layout.media.root !== null) {
    const mount = mountOf(layout.media.root, parseMountinfo(readText('/proc/self/mountinfo') ?? ''));
    mediaLabelable = mount === null || !isNetworkFs(mount.fsType) || mount.seclabel;
  }
  const state = readText(selinuxPaths(layout).stateFile);
  const base: SelinuxObserved = {
    mode,
    storePresent,
    localFcontext: local.rules.map(rule => ({ spec: rule.spec, type: rule.type })),
    localPorts,
    portTypes,
    pending: [],
    state,
    booleans,
    mediaLabelable,
  };
  if (mode === 'disabled') return base;
  const targets = restoreconTargets(layout, ruleFacts(layout, base)).filter(target => exists(target.path));
  const pending = [];
  for (let index = 0; index < targets.length; index += RESTORECON_BATCH) {
    const dry = exec.restorecon(targets.slice(index, index + RESTORECON_BATCH), true);
    pending.push(...parseRestoreconDryRun(listed(dry, 'restorecon -n')));
  }
  return { ...base, pending };
}

/** The web server's own account of what it loads (spec §5.9 check): true/false, null when the dump failed. */
function observeWebReference(layout: AgentLayout, exec: ProvisionExec, isFile: (path: string) => boolean): boolean | null {
  const include = webIncludePath(layout);
  if (layout.web.server === 'apache') {
    const bin = APACHE_DUMP_CANDIDATES.find(isFile);
    if (bin === undefined) return null;
    const dump = exec.apacheIncludes(bin);
    return dump.code === 0 ? webReferencePresent('apache', `${dump.stdout}\n${dump.stderr}`, include) : null;
  }
  const dump = exec.nginxDump(layout.web.configtestBin);
  return dump.code === 0 ? webReferencePresent('nginx', dump.stdout, include) : null;
}

/** sha-256 digest of THIS agent_dir's renderer closure (host_map_renderer.ts rendererDigest), null when not whole. */
function ownRendererDigest(layout: AgentLayout): string | null {
  const files: { path: string; bytes: Uint8Array }[] = [];
  for (const file of MAP_RENDERER_FILES) {
    const path = join(layout.agentDir, file);
    let bytes: Buffer | null = null;
    try {
      onDescriptor(path, 0, (fd, stats) => {
        if (stats.isFile()) bytes = readFileSync(fd);
      });
    } catch {
      return null;
    }
    if (bytes === null) return null;
    files.push({ path: file, bytes });
  }
  return rendererDigest(files);
}

/**
 * Every fact plan() judges: lstat facts of the watched paths and their ancestors, agent_dir's
 * whole tree (walkAgentTree — capped, links not entered), the accounts' uids and database
 * groups (`id -g` / `id -G`: the access rule's credentials), the groups, the units, and (spec
 * S9-S11, §5.9) the systemd version, the SELinux facts, the host-wide directories, the lock files,
 * the contributions, the renderer copy, the siblings' agent uids and the web-reference proof.
 */
export function observeHost(
  layout: AgentLayout,
  exec: ProvisionExec = provisionExec(),
  options: HostDoorOptions = {},
): HostState {
  const trustRoot = options.trustRoot ?? '/';
  const readText = options.readText ?? readOrNull;
  const paths = new Map<string, PathFacts>();
  const contents = new Map<string, string | null>();
  const artifacts = renderAll(layout, PENDING_FACTS, options.renderers ?? RENDERERS);
  const artifactPaths = artifacts.map(art => art.path);
  const extra = extraDirectories(layout);
  const identitiesPath = join(layout.host.mapRendererDir, IDENTITIES_FILE);
  const versionPath = join(layout.host.mapRendererDir, MAP_RENDERER_VERSION_FILE);
  const rendererSubdirs = [...new Set(MAP_RENDERER_FILES.flatMap(file => {
    const parts = file.split('/').slice(0, -1);
    return parts.map((_, index) => join(layout.host.mapRendererDir, ...parts.slice(0, index + 1)));
  }))];
  const validatedMarkers = artifacts
    .filter(art => art.validate === 'web' || art.validate === 'fpm')
    .flatMap(art => [`${art.path}${BACKUP_SUFFIX}`, `${art.path}${CREATED_SUFFIX}`]);
  const watched = [
    ...layout.directories.map(dir => dir.path),
    ...extra.map(dir => dir.path),
    ...extra.filter(dir => dir.hostWide).map(dir => hostDirTemp(dir.path)),
    ...hostLockFiles(layout).map(file => file.path),
    layout.state.marker,
    layout.serviceTokenPath,
    layout.state.auditFile,
    ...artifactPaths,
    ...validatedMarkers,
    layout.web.configtestBin,
    ...(layout.v1 === null ? [] : [layout.v1.phpBin]),
    layout.bunBin,
    layout.agentDir,
    layout.agentEntry,
    agentScratchPath(layout),
    ...agentDevDependencyPaths(layout),
  ];
  if (layout.site?.v1 != null) watched.push(layout.site.v1.fpm.bin);
  // Relabel targets the plan does not create (spec S9): a shared media root, R/bun.
  if (layout.media.root !== null) watched.push(layout.media.root);
  const mapManaged = layout.web.server === 'nginx' && layout.web.nginxMap === 'conf_d';
  if (mapManaged) watched.push(identitiesPath, versionPath, ...rendererSubdirs);
  const observed = new Set<string>([trustRoot]);
  for (const path of watched) {
    observed.add(path);
    for (const dir of ancestorsBelow(path, trustRoot)) observed.add(dir);
  }
  for (const path of observed) {
    const found = facts(path);
    if (found) paths.set(path, found);
  }
  const agentTree = walkAgentTree(layout.agentDir, options.agentTreeCap ?? AGENT_TREE_WALK_CAP, paths);
  // The marker and our artifacts only: never the credential, never the audit log.
  const readable = [layout.state.marker, ...artifactPaths, ...(mapManaged ? [identitiesPath, versionPath] : [])];
  for (const path of readable) {
    if (paths.get(path)?.type === 'file') contents.set(path, readOrNull(path));
  }
  const users = new Map<string, number>();
  // No v1 account on a v2-only instance.
  const accounts = [layout.identity.agentUser, ...(layout.v1 === null ? [] : [layout.v1.user]), layout.identity.v2User];
  for (const name of ['root', ...accounts]) {
    const id = exec.userId(name);
    if (id !== null) users.set(name, id);
  }
  const accountGroups = new Map<string, AccountGroups>();
  for (const name of accounts) {
    const found = users.has(name) ? exec.userGroups(name) : null;
    if (found) accountGroups.set(name, Object.freeze({ primary: found.primary, all: Object.freeze([...found.all]) }));
  }
  const groups = new Map<string, number>();
  const groupNames = ['root', PUBHOST_GROUP, layout.identity.v2Group];
  if (layout.identity.engineGroup !== null) groupNames.push(layout.identity.engineGroup);
  for (const name of groupNames) {
    const id = exec.groupId(name);
    if (id !== null) groups.set(name, id);
  }
  const units = new Map<string, UnitFacts>();
  const unitNames = [layout.agentUnitName, layout.v2.unit];
  if (layout.site !== null) unitNames.push(layout.web.unit);
  if (layout.site?.v1 != null) unitNames.push(layout.site.v1.fpm.unit);
  for (const unit of unitNames) units.set(unit, exec.unitState(unit));
  // The audit trail's attribute: probed (an O_NOFOLLOW write-open, never a write), never read.
  const appendOnly = new Set<string>();
  const probe = options.appendOnlyProbe ?? probeAppendOnly;
  if (paths.get(layout.state.auditFile)?.type === 'file' && probe(layout.state.auditFile) === 'append_only') {
    appendOnly.add(layout.state.auditFile);
  }
  const version = exec.systemdVersion();
  const systemdVersion = version.code === 0 ? parseSystemdVersion(version.stdout) : null;
  const exists = (path: string): boolean => facts(path, true) !== null;
  const selinux = observeSelinux(layout, exec, readText, exists);
  let siblings: SiblingFacts[] | undefined;
  if (options.siblings !== undefined) {
    siblings = options.siblings.map(sibling => ({ layout: sibling.layout, agentUid: exec.userId(sibling.layout.identity.agentUser) }));
  }
  let contributions: ContributionFacts[] | undefined;
  let renderer: HostState['renderer'];
  let hostMap: HostState['hostMap'];
  if (mapManaged) {
    contributions = [];
    try {
      for (const name of readdirSync(layout.host.nginxContribDir).sort()) {
        const found = facts(join(layout.host.nginxContribDir, name), true);
        if (found) contributions.push({ name, type: found.type, uid: found.uid });
      }
    } catch {
      // absent (created by this plan) or unlistable: nothing to sweep this run
    }
    renderer = { installed: contents.get(versionPath) ?? null, ownDigest: ownRendererDigest(layout) };
    hostMap = {
      live: facts(join(layout.host.nginxMapDir, HOST_MAP_FILE), true)?.type === 'file',
      result: readOrNull(join(layout.host.nginxMapDir, HOST_MAP_RESULT_FILE)),
    };
  }
  const isFile = (path: string): boolean => facts(path, true)?.type === 'file';
  const webReference = layout.site === null ? null : observeWebReference(layout, exec, isFile);
  return {
    trustRoot,
    appendOnly,
    paths,
    contents,
    users,
    groups,
    units,
    accountGroups,
    agentTree,
    systemdVersion,
    selinux,
    ...(siblings === undefined ? {} : { siblings }),
    ...(contributions === undefined ? {} : { contributions }),
    ...(renderer === undefined ? {} : { renderer }),
    ...(hostMap === undefined ? {} : { hostMap }),
    webReference,
  };
}
