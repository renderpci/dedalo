/**
 * THE INSTANCE'S NAMING CONVENTIONS and THE BOOT PREFLIGHT.
 *
 * The marker filename, its content and the state root's subdirectories have three readers:
 * the boot preflight (below), the provisioner that plants them, and the suite's fixture
 * (tests/fixtures/instance.ts). All three import these exports; none restates the literal.
 * No PACKAGE import — node builtins and one type-only import (erased at runtime) — so the
 * provisioner and any root-repo gate may import it without pulling the agent's
 * configuration (and zod) in with it.
 *
 * The preflight follows publication/site_builder/src/instance/roots.ts (marker, ownership,
 * write probe, root refused, every refusal names its door and ends "Nothing was
 * written."). Changes: one STATE_ROOT with three fixed children instead of configured
 * roots; a symlink is refused wherever a directory is expected; group/world-writable modes
 * are refused; the audit trail's append-only property is CHECKED, not assumed; no site
 * table, legacy-env or binary checks. WHO OWNS WHAT is stated once, in STATE_TREE_OWNERSHIP,
 * which the provisioner's MODES matrix (src/provision/layout.ts) is built from: one rule,
 * two readers.
 *
 * THE AUDIT TRAIL IS APPEND-ONLY BY THE FILESYSTEM, and that is three facts, all checked:
 *   - audit/ is ROOT-owned (root:root 0755): unlink, rename and create of the FILE are
 *     permissions on this directory, so the agent cannot remove, replace or re-create it;
 *   - STATE_ROOT and every ancestor up to / are root-owned and not writable by others
 *     (sticky excepted; auditAncestryProblem): renaming a directory is a permission on its
 *     PARENT, so without this the agent could move audit/ itself aside, trail and all;
 *   - audit.jsonl (agent-owned 0600, created by the provisioner) carries the APPEND-ONLY
 *     attribute (chattr +a, Linux FS_APPEND_FL): the kernel refuses any open for writing
 *     without O_APPEND and any truncate — to its owner too — and clearing the attribute
 *     needs CAP_LINUX_IMMUTABLE, which the agent never holds. File ownership alone would
 *     prove nothing: an owner can O_TRUNC its own file.
 * Under NODE_ENV=test ('suite' mode) none of them can hold — an unprivileged suite cannot
 * own a directory as root nor set +a — so only the mode and an append probe are checked;
 * 'suite' is refused under any other NODE_ENV. The journald echo (audit.ts) is the second,
 * independent record.
 */

import { closeSync, constants as FS, existsSync, lstatSync, openSync, readFileSync, realpathSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { AgentConfig } from '../config';

/** A root that belongs to an agent instance holds this file. */
export const INSTANCE_MARKER = '.dedalo_host_agent_instance';

/** The marker's ENTIRE content: the instance name and a newline (a string compare, never a parse). */
export function markerContent(instance: string): string {
  return `${instance}\n`;
}

/** The state root's fixed children: `<STATE_ROOT>/{publication_api,rules,audit}`. */
export const STATE_SUBDIRS = ['publication_api', 'rules', 'audit'] as const;

/** The three children by role — the same three strings, never restated. */
export const [PUBLICATION_API_DIR, RULES_DIR, AUDIT_DIR] = STATE_SUBDIRS;

/** The audit trail's file inside AUDIT_DIR (agent-owned, append-only file; root-owned directory). */
export const AUDIT_FILE_NAME = 'audit.jsonl';

export type StateTreeOwner = 'root' | 'agent';

/**
 * WHO OWNS EACH PART OF THE STATE TREE on a provisioned host. Root owns the directories root
 * must write into or the agent must not be able to rename (the tree's spine and the audit
 * directory); the agent owns only the leaves it writes itself. That keeps every path the
 * root-run provisioner touches at most ONE agent-writable level below a root-owned,
 * non-writable directory (src/provision/apply.ts relies on it), and makes the audit trail
 * append-only by directory permissions (the agent can append to its file, not unlink or
 * rename it). The unprivileged suite owns its whole tree: a 'root' entry is accepted when
 * owned by root OR by the running uid; an 'agent' entry must be the running uid's.
 */
export const STATE_TREE_OWNERSHIP = Object.freeze({
  stateRoot: 'root',
  publicationApi: 'root',
  rules: 'agent',
  audit: 'root',
  auditFile: 'agent',
} as const satisfies Record<string, StateTreeOwner>);

const NOTHING_WRITTEN = 'Nothing was written.';

export class PreflightRefused extends Error {
  constructor(door: string, message: string) {
    super(`[preflight] ${door}: ${message} ${NOTHING_WRITTEN}`);
    this.name = 'PreflightRefused';
  }
}

/** How the audit trail's append-only property is checked (see the header). */
export type AuditProtection = 'enforce' | 'suite';

export interface PreflightOptions {
  /** The running uid (default: process.getuid()). Injectable so a gate reaches every refusal. */
  readonly uid?: number | null;
  /**
   * The uid treated as root (default 0): the owner STATE_TREE_OWNERSHIP's 'root' entries
   * accept, and the one enforce mode demands for audit/. Injectable ONLY so an unprivileged
   * gate reaches those branches; production never passes it.
   */
  readonly rootUid?: number;
  /** Default: 'suite' under NODE_ENV=test, 'enforce' otherwise. 'suite' is refused outside test. */
  readonly auditProtection?: AuditProtection;
  /**
   * Default probeAppendOnly. Injectable ONLY so an unprivileged gate reaches the checks
   * after it (an unprivileged suite cannot set chattr +a); src/index.ts passes no options.
   */
  readonly appendOnlyProbe?: (path: string) => string;
}

/**
 * THE PREFLIGHT, in order:
 *   1. not root; an audit protection this NODE_ENV allows;
 *   2. STATE_ROOT absolute, a real directory (not a symlink), marked for THIS instance;
 *   3. STATE_ROOT and all three children real directories, neither group- nor
 *      world-writable, owned per STATE_TREE_OWNERSHIP ('root' = root or the running uid,
 *      'agent' = the running uid);
 *   4. rules/ takes a create+unlink probe (EROFS under ProtectSystem=strict surfaces here,
 *      not at the first rules.apply); publication_api/ is root-owned on a provisioned host,
 *      so it takes none (the agent writes only in its per-API children);
 *   5. audit/: 'enforce' — root-owned directory, an existing agent-owned regular file that
 *      is append-only, an O_APPEND probe (no create), then the ANCESTRY (auditAncestryProblem:
 *      STATE_ROOT and every ancestor up to /, lexical and real, root-owned and not writable
 *      by others unless sticky); 'suite' — mode only, then an O_APPEND|O_CREAT probe.
 */
export function bootPreflight(
  cfg: Pick<AgentConfig, 'INSTANCE' | 'STATE_ROOT' | 'NODE_ENV'>,
  options: PreflightOptions = {},
): void {
  const uid = options.uid !== undefined ? options.uid : typeof process.getuid === 'function' ? process.getuid() : null;
  const rootUid = options.rootUid ?? 0;
  const root = cfg.STATE_ROOT;
  const protection: AuditProtection = options.auditProtection ?? (cfg.NODE_ENV === 'test' ? 'suite' : 'enforce');

  if (uid === 0) {
    throw new PreflightRefused(
      'assertNotRoot',
      `the agent is running as root (uid 0). It runs as its own user; its two privileged ` +
        `effects go through the rendered sudoers and polkit rules. Start it through the generated unit.`,
    );
  }

  if (protection === 'suite' && cfg.NODE_ENV !== 'test') {
    throw new PreflightRefused(
      'assertAuditProtection',
      `the 'suite' audit protection (no root-owned directory, no append-only attribute) is for ` +
        `NODE_ENV=test only; NODE_ENV is '${cfg.NODE_ENV}'.`,
    );
  }

  if (!isAbsolute(root)) {
    throw new PreflightRefused('assertStateRoot', `STATE_ROOT '${root}' is not an absolute path.`);
  }
  assertRealDirectory('STATE_ROOT', root);

  const marker = join(root, INSTANCE_MARKER);
  const expected = markerContent(cfg.INSTANCE);
  const found = existsSync(marker) ? safeRead(marker) : null;
  if (found === null) {
    throw new PreflightRefused(
      'assertStateRoot',
      `STATE_ROOT ('${root}') does not declare itself: no readable '${INSTANCE_MARKER}'. ` +
        `The provisioner creates and marks it; run 'provision apply' for instance '${cfg.INSTANCE}'.`,
    );
  }
  if (found !== expected) {
    throw new PreflightRefused(
      'assertStateRoot',
      `STATE_ROOT ('${root}') belongs to another instance: '${INSTANCE_MARKER}' reads ` +
        `'${found.trim() || '(empty)'}', expected '${expected.trim()}'.`,
    );
  }

  assertOwnerAndMode('STATE_ROOT', root, uid, rootUid, STATE_TREE_OWNERSHIP.stateRoot);

  const api = join(root, PUBLICATION_API_DIR);
  assertRealDirectory(`STATE_ROOT/${PUBLICATION_API_DIR}`, api);
  assertOwnerAndMode(`STATE_ROOT/${PUBLICATION_API_DIR}`, api, uid, rootUid, STATE_TREE_OWNERSHIP.publicationApi);

  const rules = join(root, RULES_DIR);
  assertRealDirectory(`STATE_ROOT/${RULES_DIR}`, rules);
  assertOwnerAndMode(`STATE_ROOT/${RULES_DIR}`, rules, uid, rootUid, STATE_TREE_OWNERSHIP.rules);
  probeCreate(`STATE_ROOT/${RULES_DIR}`, rules);

  const auditDir = join(root, AUDIT_DIR);
  assertRealDirectory(`STATE_ROOT/${AUDIT_DIR}`, auditDir);
  assertOwnerAndMode(`STATE_ROOT/${AUDIT_DIR}`, auditDir, uid, rootUid, STATE_TREE_OWNERSHIP.audit);
  if (protection === 'enforce') {
    // Stricter than the shared rule: in enforce mode audit/ must be ROOT's, never the agent's.
    assertAuditEnforced(auditDir, uid, rootUid, options.appendOnlyProbe ?? probeAppendOnly);
  } else {
    probeAppend(join(auditDir, AUDIT_FILE_NAME), true);
  }
}

/**
 * IS THE FILE APPEND-ONLY? Asked the kernel's way, without an ioctl and without a spawn:
 * an open for writing WITHOUT O_APPEND (and without O_TRUNC) of an append-only file fails
 * with EPERM (Linux fs/namei.c may_open; BSD vn_open for UF_APPEND). A plain file opens
 * and is closed at once, unwritten. Returns 'append_only', 'writable', or the errno code.
 */
export function probeAppendOnly(path: string): string {
  let fd: number;
  try {
    fd = openSync(path, FS.O_WRONLY | FS.O_NOFOLLOW);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'error';
    return code === 'EPERM' ? 'append_only' : code;
  }
  closeSync(fd);
  return 'writable';
}

/** The two filesystem reads auditAncestryProblem makes — injectable for the gate. */
export interface AncestryFs {
  readonly lstat: (path: string) => { uid: number; mode: number; isSymbolicLink(): boolean };
  readonly realpath: (path: string) => string;
}

const REAL_FS: AncestryFs = { lstat: lstatSync, realpath: realpathSync };

/**
 * CAN THE AGENT MOVE ITS TRAIL ASIDE? Renaming a directory needs write permission only on
 * its PARENT, so a root-owned audit/ is as safe as the directory holding it, and that one as
 * safe as its own parent, up to /. Every directory on the chain from STATE_ROOT (audit/'s
 * parent) to / — the lexical path AND its realpath, so a symlinked ancestor is followed as
 * the kernel follows it — must be owned by root (rootUid or 0) and must not be group- or
 * world-writable unless sticky (in a sticky directory only an entry's owner may rename it,
 * and every entry on the chain is root's). A symlink on the lexical chain must be root's
 * (its mode bits mean nothing). Returns the first problem, or null.
 */
export function auditAncestryProblem(auditDir: string, rootUid: number, fs: AncestryFs = REAL_FS): string | null {
  const parent = dirname(auditDir);
  const chains = [parent];
  try {
    const real = fs.realpath(parent);
    if (real !== parent) chains.push(real);
  } catch (error) {
    return `'${parent}' could not be resolved (${(error as NodeJS.ErrnoException).code ?? 'error'})`;
  }
  const seen = new Set<string>();
  for (const start of chains) {
    for (let dir = start; ; dir = dirname(dir)) {
      if (!seen.has(dir)) {
        seen.add(dir);
        let st: ReturnType<AncestryFs['lstat']>;
        try {
          st = fs.lstat(dir);
        } catch (error) {
          return `'${dir}' could not be inspected (${(error as NodeJS.ErrnoException).code ?? 'error'})`;
        }
        if (st.uid !== rootUid && st.uid !== 0) {
          return `'${dir}' is owned by uid ${st.uid}, not root`;
        }
        if (!st.isSymbolicLink() && (st.mode & 0o022) !== 0 && (st.mode & 0o1000) === 0) {
          return `'${dir}' is group- or world-writable without the sticky bit (mode ${(st.mode & 0o7777).toString(8)})`;
        }
      }
      if (dirname(dir) === dir) break;
    }
  }
  return null;
}

function assertAuditEnforced(
  auditDir: string,
  uid: number | null,
  rootUid: number,
  appendOnlyProbe: (path: string) => string,
): void {
  const label = `STATE_ROOT/${AUDIT_DIR}`;
  const dirOwner = lstatSync(auditDir).uid;
  if (dirOwner !== rootUid) {
    throw new PreflightRefused(
      'assertAuditTrail',
      `${label} ('${auditDir}') is owned by uid ${dirOwner}, not root. Unlink and rename are ` +
        `permissions on the DIRECTORY: an agent-owned audit directory lets the agent erase its own ` +
        `trail. The provisioner creates it root:root 0755.`,
    );
  }
  const file = join(auditDir, AUDIT_FILE_NAME);
  let isFile = false;
  let mode = 0;
  let owner = -1;
  try {
    const st = lstatSync(file);
    isFile = st.isFile();
    mode = st.mode;
    owner = st.uid;
  } catch {
    throw new PreflightRefused(
      'assertAuditTrail',
      `the audit trail '${file}' does not exist. The provisioner creates it agent-owned and ` +
        `append-only (chattr +a); the agent cannot create a file in its root-owned directory.`,
    );
  }
  if (!isFile) {
    throw new PreflightRefused('assertAuditTrail', `the audit trail '${file}' is not a regular file (a symlink is refused).`);
  }
  if ((mode & 0o022) !== 0) {
    throw new PreflightRefused(
      'assertAuditTrail',
      `the audit trail '${file}' is group- or world-writable (mode ${(mode & 0o777).toString(8)}).`,
    );
  }
  if (uid !== null && owner !== uid) {
    throw new PreflightRefused(
      'assertAuditTrail',
      `the audit trail '${file}' is owned by uid ${owner} and this process is uid ${uid}; the agent could not append.`,
    );
  }
  const verdict = appendOnlyProbe(file);
  if (verdict === 'writable') {
    throw new PreflightRefused(
      'assertAuditTrail',
      `the audit trail '${file}' can be opened for writing without O_APPEND, so the agent could ` +
        `truncate or overwrite it. Set the append-only attribute (chattr +a — the provisioner does); ` +
        `clearing it needs CAP_LINUX_IMMUTABLE, which the agent never has.`,
    );
  }
  if (verdict !== 'append_only') {
    throw new PreflightRefused('assertAuditTrail', `the audit trail '${file}' could not be probed (${verdict}).`);
  }
  probeAppend(file, false);
  const ancestry = auditAncestryProblem(auditDir, rootUid);
  if (ancestry !== null) {
    throw new PreflightRefused(
      'assertAuditTrail',
      `the audit directory '${auditDir}' could be renamed aside, trail and all: ${ancestry}. ` +
        `Renaming a directory needs write permission only on its parent, so STATE_ROOT and every ` +
        `ancestor up to / must be root-owned and not writable by others (sticky excepted). The ` +
        `provisioner creates STATE_ROOT root:root 0755; choose a state_root under root-owned directories.`,
    );
  }
}

function safeRead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

function assertRealDirectory(label: string, path: string): void {
  let isDir = false;
  let isLink = false;
  try {
    const st = lstatSync(path);
    isDir = st.isDirectory();
    isLink = st.isSymbolicLink();
  } catch {
    throw new PreflightRefused('assertRealDirectory', `${label} ('${path}') does not exist.`);
  }
  if (isLink) {
    throw new PreflightRefused(
      'assertRealDirectory',
      `${label} ('${path}') is a symlink. A root is a real directory; a link can be repointed after this check.`,
    );
  }
  if (!isDir) {
    throw new PreflightRefused('assertRealDirectory', `${label} ('${path}') is not a directory.`);
  }
}

function assertOwnerAndMode(
  label: string,
  path: string,
  uid: number | null,
  rootUid: number,
  owner: StateTreeOwner,
): void {
  const st = lstatSync(path);
  if ((st.mode & 0o022) !== 0) {
    throw new PreflightRefused(
      'assertOwnerAndMode',
      `${label} ('${path}') is group- or world-writable (mode ${(st.mode & 0o777).toString(8)}). ` +
        `Another principal could plant files the agent then serves or executes.`,
    );
  }
  if (uid === null) return;
  const allowed = owner === 'agent' ? [uid] : [rootUid, uid];
  if (!allowed.includes(st.uid)) {
    throw new PreflightRefused(
      'assertOwnerAndMode',
      `${label} ('${path}') is owned by uid ${st.uid}; it must be owned by ` +
        `${owner === 'agent' ? `this process (uid ${uid})` : `root or this process (uid ${uid})`}. The ` +
        `agent is running as the wrong user or is pointed at another instance's tree.`,
    );
  }
}

function probeCreate(label: string, dir: string): void {
  const probe = join(dir, `.dedalo_host_agent_write_probe.${process.pid}`);
  try {
    closeSync(openSync(probe, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, 0o600));
  } catch (error) {
    throw new PreflightRefused(
      'probeCreate',
      `${label} ('${dir}') is not writable by this process (${(error as NodeJS.ErrnoException).code ?? 'error'}). ` +
        `Under ProtectSystem=strict a path missing from ReadWritePaths= is read-only.`,
    );
  } finally {
    try {
      if (existsSync(probe)) unlinkSync(probe);
    } catch {
      // the next boot's probe reports an unremovable probe file
    }
  }
}

function probeAppend(path: string, create: boolean): void {
  try {
    closeSync(openSync(path, FS.O_WRONLY | FS.O_APPEND | FS.O_NOFOLLOW | (create ? FS.O_CREAT : 0), 0o600));
  } catch (error) {
    throw new PreflightRefused(
      'probeAppend',
      `the audit trail '${path}' cannot be appended to (${(error as NodeJS.ErrnoException).code ?? 'error'}). ` +
        `The provisioner creates it agent-owned and append-only inside the root-owned audit directory.`,
    );
  }
}
