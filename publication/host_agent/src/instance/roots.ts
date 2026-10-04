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
 * table, legacy-env or binary checks.
 *
 * THE AUDIT TRAIL IS APPEND-ONLY BY THE FILESYSTEM, and that is two facts, both checked:
 *   - audit/ is ROOT-owned (root:root 0755): unlink, rename and create are permissions on
 *     the DIRECTORY, so the agent cannot remove, replace or re-create its trail;
 *   - audit.jsonl (agent-owned 0600, created by the provisioner) carries the APPEND-ONLY
 *     attribute (chattr +a, Linux FS_APPEND_FL): the kernel refuses any open for writing
 *     without O_APPEND and any truncate — to its owner too — and clearing the attribute
 *     needs CAP_LINUX_IMMUTABLE, which the agent never holds. File ownership alone would
 *     prove nothing: an owner can O_TRUNC its own file.
 * Under NODE_ENV=test ('suite' mode) neither fact can hold — an unprivileged suite cannot
 * own a directory as root nor set +a — so only the mode and an append probe are checked;
 * 'suite' is refused under any other NODE_ENV. The journald echo (audit.ts) is the second,
 * independent record.
 */

import { closeSync, constants as FS, existsSync, lstatSync, openSync, readFileSync, unlinkSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
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
   * The uid that must own audit/ (default 0). Injectable ONLY so an unprivileged gate can
   * reach the audit FILE checks; production never passes it.
   */
  readonly rootUid?: number;
  /** Default: 'suite' under NODE_ENV=test, 'enforce' otherwise. 'suite' is refused outside test. */
  readonly auditProtection?: AuditProtection;
}

/**
 * THE PREFLIGHT, in order:
 *   1. not root; an audit protection this NODE_ENV allows;
 *   2. STATE_ROOT absolute, a real directory (not a symlink), marked for THIS instance;
 *   3. STATE_ROOT, publication_api/ and rules/ owned by the running uid; STATE_ROOT and all
 *      three children neither group- nor world-writable;
 *   4. publication_api/ and rules/ take a create+unlink probe (EROFS under
 *      ProtectSystem=strict surfaces here, not at the first install);
 *   5. audit/: 'enforce' — root-owned directory, an existing agent-owned regular file that
 *      is append-only, then an O_APPEND probe (no create); 'suite' — mode only, then an
 *      O_APPEND|O_CREAT probe.
 */
export function bootPreflight(
  cfg: Pick<AgentConfig, 'INSTANCE' | 'STATE_ROOT' | 'NODE_ENV'>,
  options: PreflightOptions = {},
): void {
  const uid = options.uid !== undefined ? options.uid : typeof process.getuid === 'function' ? process.getuid() : null;
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

  assertOwnerAndMode('STATE_ROOT', root, uid, true);

  for (const name of [PUBLICATION_API_DIR, RULES_DIR]) {
    const dir = join(root, name);
    assertRealDirectory(`STATE_ROOT/${name}`, dir);
    assertOwnerAndMode(`STATE_ROOT/${name}`, dir, uid, true);
    probeCreate(`STATE_ROOT/${name}`, dir);
  }

  const auditDir = join(root, AUDIT_DIR);
  assertRealDirectory(`STATE_ROOT/${AUDIT_DIR}`, auditDir);
  assertOwnerAndMode(`STATE_ROOT/${AUDIT_DIR}`, auditDir, uid, false);
  if (protection === 'enforce') {
    assertAuditEnforced(auditDir, uid, options.rootUid ?? 0);
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

function assertAuditEnforced(auditDir: string, uid: number | null, rootUid: number): void {
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
  const verdict = probeAppendOnly(file);
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

function assertOwnerAndMode(label: string, path: string, uid: number | null, ownedByAgent: boolean): void {
  const st = lstatSync(path);
  if ((st.mode & 0o022) !== 0) {
    throw new PreflightRefused(
      'assertOwnerAndMode',
      `${label} ('${path}') is group- or world-writable (mode ${(st.mode & 0o777).toString(8)}). ` +
        `Another principal could plant files the agent then serves or executes.`,
    );
  }
  if (ownedByAgent && uid !== null && st.uid !== uid) {
    throw new PreflightRefused(
      'assertOwnerAndMode',
      `${label} ('${path}') is owned by uid ${st.uid} and this process is uid ${uid}. The ` +
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
