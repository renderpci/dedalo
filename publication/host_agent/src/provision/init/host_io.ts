/**
 * INIT'S REAL FILESYSTEM DOORS (spec §2.2) — `initHostIo(exec): InitIo` is the provisioner's
 * own `hostIo()` (every ProvisionIo door, unchanged) plus init's doors, on the SAME two rules:
 *
 *   1. the ancestry is re-verified at the moment of the write (`safeParent`): every directory
 *      between the trust root and the target is a real directory (lstat, not a link) and — all
 *      but the immediate parent — root-owned and not group/world-writable. writeBytesAtomic's one
 *      exception: an untrusted grandparent under a root parent, which is then pinned (apply.ts
 *      pinnedParentOf / withPinnedDir — the API files in the agent's `publication_api/<api>/shared/`);
 *   2. root never follows a link it did not create: every open is O_NOFOLLOW (O_NONBLOCK
 *      against FIFOs), the descriptor is fstat'ed (a regular single-link file, or a directory),
 *      and ownership/mode are set on that descriptor. Temps are O_CREAT|O_EXCL|O_NOFOLLOW.
 *
 * Init's additions: `writeBytesAtomic` (temp `<dir>/.<base>.dedalo-init.tmp` → fsync → fchown →
 * fchmod → rename → fsync of the directory), `writeTempNamed`, `removeInitTemp` (that suffix
 * only), `removeTree` (lstat walk, never follows a link, only under `mustBeUnder`),
 * `renameDir`, `appendSync` (O_APPEND + fsync; the journal), `readOperatorFile` (bytes + owner
 * + mode + sha, one descriptor), `readRootFile`, and `readProcFile` — a CLOSED allowlist of
 * /proc paths (PROC_ALLOWLIST), the only /proc reads init makes.
 *
 * The scratch-root seam (spec §2.2, non-root real-fs gates on macOS): `trustRoot` narrows the
 * judged ancestry to a scratch tree and `rootUid` names the uid that counts as root there (the
 * test's own) — the same seam hostIo's gate uses. Production: '/' and the host's root uid.
 */
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as FS,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { ProvisionExec } from '../exec_contract';
import { hostIo, pinnedParentOf, withPinnedDir } from '../apply';
import type { PathFacts } from '../plan';
import { ancestorsBelow, trustProblem } from '../plan';
import type { InitIo, OperatorFile } from './types';
import { BINARY_READ_CAP_BYTES } from './types';

/** Suffix of every temp init writes. `removeInitTemp` refuses anything else. */
export const INIT_TEMP_SUFFIX = '.dedalo-init.tmp';

/** The temp writeBytesAtomic uses for `path`: hidden, beside it, so no include glob (`*.conf`) matches it. */
export function initTempPath(path: string): string {
  return join(dirname(path), `.${basename(path)}${INIT_TEMP_SUFFIX}`);
}

/**
 * THE /proc ALLOWLIST (spec §2.2): `/proc/self/*` (environ, cmdline, mountinfo, attr/current…),
 * `/proc/net/*` (tcp, tcp6), the boot id, the kernel release, `/proc/locks`. Nothing else.
 */
export const PROC_ALLOWLIST: readonly RegExp[] = Object.freeze([
  /^\/proc\/self\/[a-z_]+(?:\/[a-z_]+)?$/,
  /^\/proc\/net\/[a-z0-9_]+$/,
  /^\/proc\/sys\/kernel\/random\/boot_id$/,
  /^\/proc\/sys\/kernel\/osrelease$/,
  /^\/proc\/locks$/,
]);

export function procPathAllowed(path: string): boolean {
  return PROC_ALLOWLIST.some(pattern => pattern.test(path));
}

/** The largest file the readers load (an operator vhost, a root file, a /proc file). */
export const READ_CAP_BYTES = 8 * 1024 * 1024;

export interface InitHostIoOptions {
  /** Ancestors at or above this directory are not judged. Production: '/'. */
  readonly trustRoot?: string;
  /** The uid that counts as root for the ancestry judgement (production: exec.userId('root') ?? 0). */
  readonly rootUid?: number;
  /** Where readProcFile reads an allowlisted path from (production: the path itself). A gate maps it into a scratch tree. */
  readonly procRoot?: string;
}

function errno(error: unknown): string {
  return (error as NodeJS.ErrnoException).code ?? 'error';
}

function cleanAbsolute(path: string, what: string): void {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('\0') || path.split('/').some(s => s === '..' || s === '.')) {
    throw new Error(`init io: refusing ${what} '${String(path)}': not a clean absolute path`);
  }
}

function entryType(stats: Stats): PathFacts['type'] {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isDirectory()) return 'dir';
  if (stats.isFile()) return 'file';
  return 'other';
}

/** lstat facts, never following a link; null when absent or not inspectable. */
export function lstatFacts(path: string): PathFacts | null {
  try {
    const stats = lstatSync(path);
    return { type: entryType(stats), uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o7777 };
  } catch {
    return null;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Reads a whole descriptor, capped. */
function readAll(fd: number, size: number, what: string, cap: number = READ_CAP_BYTES): Uint8Array {
  if (size > cap) throw new Error(`init io: refusing '${what}': ${size} bytes is over the ${cap}-byte cap`);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const chunk = Buffer.alloc(64 * 1024);
    const read = readSync(fd, chunk, 0, chunk.length, null);
    if (read === 0) break;
    total += read;
    if (total > cap) throw new Error(`init io: refusing '${what}': over the ${cap}-byte cap`);
    chunks.push(chunk.subarray(0, read));
  }
  return new Uint8Array(Buffer.concat(chunks));
}

function fsyncDir(dir: string): void {
  let fd: number;
  try {
    fd = openSync(dir, FS.O_RDONLY | FS.O_DIRECTORY | FS.O_NOFOLLOW);
  } catch {
    return; // a directory fsync is best-effort durability, never a correctness condition
  }
  try {
    fsyncSync(fd);
  } catch {
    // some filesystems refuse fsync on a directory descriptor
  } finally {
    closeSync(fd);
  }
}

/**
 * fsyncs every directory of a tree (lstat only: a symlink is never followed), so the entries
 * created in it reach the disk with the rename that publishes it. Best-effort like fsyncDir.
 */
function fsyncDirTree(root: string): void {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() as string;
    fsyncDir(dir);
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const path = join(dir, name);
      try {
        if (lstatSync(path).isDirectory()) stack.push(path);
      } catch {
        // vanished: nothing to sync
      }
    }
  }
}

export function initHostIo(exec: ProvisionExec, options: InitHostIoOptions = {}): InitIo {
  const trustRoot = options.trustRoot ?? '/';
  const rootUid = options.rootUid ?? exec.userId('root') ?? 0;
  const procRoot = options.procRoot ?? '';
  // hostIo judges with exec.userId('root'): hand it the same uid, so both door sets agree.
  const base = hostIo({ ...exec, userId: name => (name === 'root' ? rootUid : exec.userId(name)) }, { trustRoot });

  const safeParent = (path: string): void => {
    cleanAbsolute(path, 'path');
    const chain = ancestorsBelow(path, trustRoot);
    chain.forEach((dir, index) => {
      let stats: Stats;
      try {
        stats = lstatSync(dir);
      } catch (error) {
        throw new Error(`init io: refusing '${path}': its ancestor '${dir}' cannot be inspected (${errno(error)})`);
      }
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error(`init io: refusing '${path}': '${dir}' is not a real directory — a link there could redirect a root write`);
      }
      if (index < chain.length - 1) {
        const problem = trustProblem({ uid: stats.uid, mode: stats.mode & 0o7777 }, rootUid);
        if (problem) throw new Error(`init io: refusing '${path}': its ancestor '${dir}' is ${problem}`);
      }
    });
  };

  /**
   * Rule 1's one exception (apply.ts pinnedParentOf / withPinnedDir), writeBytesAtomic only: the
   * state tree's `publication_api/<api>/` is the AGENT's and `shared/` in it root's, so the API files
   * init writes there (`v2/shared/v2.env`, `v1/shared/server_config_api.php`) have an untrusted
   * grandparent — rule 1 alone refused them (measured: the Debian drill's api_config.v2_env). The
   * write is pinned to the root parent and done by name relative to it.
   */
  const pinnedParent = (path: string): string | null => {
    cleanAbsolute(path, 'path');
    return pinnedParentOf(path, trustRoot, rootUid, 'init io');
  };

  /** Opens without following and hands the descriptor + fstat to `fn` (rule 2). */
  const openNoFollow = <T>(path: string, flags: number, fn: (fd: number, stats: Stats) => T): T => {
    let fd: number;
    try {
      fd = openSync(path, flags | FS.O_NOFOLLOW | FS.O_NONBLOCK);
    } catch (error) {
      const code = errno(error);
      throw new Error(
        code === 'ELOOP' || code === 'EMLINK'
          ? `init io: refusing '${path}': it is a symbolic link — root never follows a link it did not create`
          : `init io: refusing '${path}': cannot open it (${code})`,
      );
    }
    try {
      return fn(fd, fstatSync(fd));
    } finally {
      closeSync(fd);
    }
  };

  const regularFile = (path: string, stats: Stats): void => {
    if (!stats.isFile()) throw new Error(`init io: refusing '${path}': not a regular file`);
    if (stats.nlink !== 1) throw new Error(`init io: refusing '${path}': it has ${stats.nlink} hard links`);
  };

  /** Creates `temp` exclusively and writes `bytes` through its descriptor. */
  const createExclusive = (temp: string, bytes: Uint8Array, mode: number, after?: (fd: number) => void): void => {
    const fd = openSync(temp, FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW, mode & 0o777);
    try {
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
      after?.(fd);
    } finally {
      closeSync(fd);
    }
  };

  /** Unlinks a stale temp; a directory or anything we cannot inspect is refused, never recursed. */
  const clearStale = (temp: string): void => {
    const found = lstatFacts(temp);
    if (found === null) return;
    if (found.type === 'dir') throw new Error(`init io: refusing '${temp}': a directory sits at the temp name`);
    unlinkSync(temp); // unlink removes a link itself, never its target
  };

  const removeWalk = (path: string): void => {
    const stats = lstatSync(path);
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      unlinkSync(path);
      return;
    }
    for (const name of readdirSync(path)) removeWalk(join(path, name));
    rmdirSync(path);
  };

  return Object.freeze({
    ...base,
    writeBytesAtomic(path: string, bytes: Uint8Array, mode: number, uid: number, gid: number): void {
      const pinned = pinnedParent(path);
      if (pinned !== null) {
        // By name, relative to the pinned working directory (apply.ts withPinnedDir).
        withPinnedDir(pinned, rootUid, () => {
          const name = basename(path);
          const temp = basename(initTempPath(path));
          clearStale(temp);
          try {
            createExclusive(temp, bytes, 0o600, fd => {
              fchownSync(fd, uid, gid);
              fchmodSync(fd, mode);
            });
            renameSync(temp, name);
          } catch (error) {
            rmSync(temp, { force: true });
            throw error;
          }
          fsyncDir('.');
        }, 'init io');
        return;
      }
      safeParent(path);
      const temp = initTempPath(path);
      clearStale(temp);
      try {
        createExclusive(temp, bytes, 0o600, fd => {
          fchownSync(fd, uid, gid);
          fchmodSync(fd, mode);
        });
        renameSync(temp, path);
      } catch (error) {
        rmSync(temp, { force: true });
        throw error;
      }
      fsyncDir(dirname(path));
    },
    writeTempNamed(dir: string, name: string, bytes: Uint8Array, mode: number): string {
      if (name === '' || name.includes('/') || name === '.' || name === '..' || name.includes('\0')) {
        throw new Error(`init io: refusing temp name '${name}': a plain file name is required`);
      }
      const path = join(dir, name);
      safeParent(path);
      createExclusive(path, bytes, mode);
      return path;
    },
    removeInitTemp(path: string): void {
      if (!basename(path).endsWith(INIT_TEMP_SUFFIX)) throw new Error(`init io: refusing to remove '${path}' — not an init temp file`);
      safeParent(path);
      const found = lstatFacts(path);
      if (found === null) return;
      if (found.type === 'dir') throw new Error(`init io: refusing to remove '${path}': it is a directory`);
      unlinkSync(path);
    },
    removeTree(path: string, mustBeUnder: string): void {
      cleanAbsolute(mustBeUnder, 'tree root');
      cleanAbsolute(path, 'tree');
      if (!path.startsWith(`${mustBeUnder.replace(/\/$/, '')}/`)) {
        throw new Error(`init io: refusing to remove '${path}': it is not under '${mustBeUnder}'`);
      }
      safeParent(path);
      if (lstatFacts(path) === null) return;
      removeWalk(path);
    },
    renameDir(from: string, to: string): void {
      safeParent(from);
      safeParent(to);
      const found = lstatFacts(from);
      if (found?.type !== 'dir') throw new Error(`init io: refusing to rename '${from}': not a real directory`);
      if (lstatFacts(to) !== null) throw new Error(`init io: refusing to rename onto '${to}': it exists`);
      renameSync(from, to);
      // the same durability as writeBytesAtomic: the tree's own entries, then both parents' renames
      fsyncDirTree(to);
      fsyncDir(dirname(to));
      if (dirname(from) !== dirname(to)) fsyncDir(dirname(from));
    },
    appendSync(path: string, text: string): void {
      safeParent(path);
      const created = lstatFacts(path) === null;
      let fd: number;
      try {
        fd = openSync(path, FS.O_WRONLY | FS.O_APPEND | FS.O_CREAT | FS.O_NOFOLLOW | FS.O_NONBLOCK, 0o600);
      } catch (error) {
        throw new Error(`init io: refusing to append to '${path}': cannot open it without following a link (${errno(error)})`);
      }
      try {
        regularFile(path, fstatSync(fd));
        const bytes = Buffer.from(text, 'utf8');
        let offset = 0;
        while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      if (created) fsyncDir(dirname(path));
    },
    readOperatorFile(path: string, capBytes: number = READ_CAP_BYTES): OperatorFile {
      safeParent(path);
      const cap = Math.min(capBytes, BINARY_READ_CAP_BYTES);
      return openNoFollow(path, FS.O_RDONLY, (fd, stats) => {
        regularFile(path, stats);
        const bytes = readAll(fd, stats.size, path, cap);
        return Object.freeze({ bytes, uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o7777, sha: sha256(bytes) });
      });
    },
    readRootFile(path: string): string | null {
      try {
        safeParent(path);
        return openNoFollow(path, FS.O_RDONLY, (fd, stats) => {
          regularFile(path, stats);
          return Buffer.from(readAll(fd, stats.size, path)).toString('utf8');
        });
      } catch {
        return null;
      }
    },
    readProcFile(path: string): string | null {
      if (!procPathAllowed(path)) throw new Error(`init io: refusing to read '${path}': not on the /proc allowlist`);
      try {
        // /proc/self is itself a link (to /proc/<pid>): only the LAST component is opened O_NOFOLLOW.
        return openNoFollow(`${procRoot}${path}`, FS.O_RDONLY, (fd, stats) => {
          if (!stats.isFile()) throw new Error('not a regular file');
          // /proc files report size 0: read until EOF, capped.
          return Buffer.from(readAll(fd, 0, path)).toString('utf8');
        });
      } catch {
        return null;
      }
    },
  });
}

/** One directory of init's own state: created root-owned with exactly `mode` when missing; an existing non-directory is refused, an existing directory kept as it is. */
export function ensureDir(io: InitIo, path: string, mode: number, uid: number, gid: number, lstat: (p: string) => PathFacts | null): void {
  const found = lstat(path);
  if (found !== null) {
    if (found.type !== 'dir') throw new Error(`init io: '${path}' is a ${found.type}, not a directory`);
    return;
  }
  io.mkdir(path, mode);
  io.chown(path, uid, gid);
  io.chmod(path, mode);
}
