/**
 * THE REAL LockIo (spec S12, §7): `flock(2)` from libc through `bun:ffi`, opens with
 * O_NOFOLLOW, the holder read from `/proc/locks`. Used by root (provision apply/check/init) and
 * by the agent runtime (the host web lock). Linux and macOS: the real-fs gates run on both
 * (tests/provision_flock.test.ts); `/proc/locks` exists on Linux only (null elsewhere).
 *
 * The policy is ./lock.ts's; this file only makes the system calls. Not zero-dependency in
 * spirit (it loads libc), but it imports no package: the root map renderer copies it.
 */
import { dlopen, FFIType, read } from 'bun:ffi';
import {
  chmodSync,
  chownSync,
  closeSync,
  constants,
  fchmodSync,
  fchownSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import type { DirFacts, LockFileSpec, LockIo, LockMode } from './lock';
import { LockRefused, parseProcLocks } from './lock';

/** flock(2) operations — the same values on Linux and macOS (sys/file.h). */
export const LOCK_SH = 1;
export const LOCK_EX = 2;
export const LOCK_NB = 4;
export const LOCK_UN = 8;
/** EWOULDBLOCK: 11 on Linux, 35 on macOS. EINTR is 4 on both. */
const EWOULDBLOCK = process.platform === 'darwin' ? 35 : 11;
const EINTR = 4;

interface Libc {
  flock(fd: number, operation: number): number;
  errno(): number;
}

let libc: Libc | null = null;

function loadLibc(): Libc {
  if (libc !== null) return libc;
  const darwin = process.platform === 'darwin';
  const errnoSymbol = darwin ? '__error' : '__errno_location';
  const lib = dlopen(darwin ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6', {
    flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
    [errnoSymbol]: { args: [], returns: FFIType.ptr },
  });
  const symbols = lib.symbols as unknown as Record<string, (...args: unknown[]) => unknown>;
  libc = {
    flock: (fd, operation) => symbols.flock?.(fd, operation) as number,
    errno: () => {
      const pointer = symbols[errnoSymbol]?.() as number | null;
      return pointer ? read.i32(pointer as unknown as Parameters<typeof read.i32>[0], 0) : 0;
    },
  };
  return libc;
}

function entryType(stats: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }): DirFacts['type'] {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isDirectory()) return 'dir';
  if (stats.isFile()) return 'file';
  return 'other';
}

/** The kernel's dev_t split, as /proc/locks prints it (glibc's major()/minor()). */
export function splitDev(dev: number): { major: number; minor: number } {
  const big = BigInt(dev);
  const major = Number(((big >> 8n) & 0xfffn) | ((big >> 32n) & ~0xfffn));
  const minor = Number((big & 0xffn) | ((big >> 12n) & ~0xffn));
  return { major, minor };
}

function errorCode(error: unknown): string {
  return (error as NodeJS.ErrnoException)?.code ?? String(error);
}

function openLockFile(path: string, spec: LockFileSpec): number {
  const { O_RDWR, O_RDONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = constants;
  let fd: number;
  let created = false;
  try {
    if (spec.create) {
      try {
        fd = openSync(path, O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW, spec.mode);
        created = true;
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error;
        fd = openSync(path, O_RDWR | O_NOFOLLOW);
      }
    } else {
      fd = openSync(path, O_RDONLY | O_NOFOLLOW);
    }
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ELOOP' || code === 'EMLINK') throw new LockRefused(`lock: '${path}' is a symlink — refused (O_NOFOLLOW)`);
    throw new LockRefused(`lock: cannot open '${path}' (${code})`);
  }
  try {
    if (created) {
      fchownSync(fd, spec.uid, spec.gid ?? spec.uid);
      fchmodSync(fd, spec.mode);
    }
    const stats = fstatSync(fd);
    if (!stats.isFile()) throw new LockRefused(`lock: '${path}' is not a regular file`);
    const mode = stats.mode & 0o7777;
    if (stats.uid !== spec.uid || (spec.gid !== null && stats.gid !== spec.gid) || mode !== spec.mode) {
      throw new LockRefused(
        `lock: '${path}' is ${stats.uid}:${stats.gid} 0${mode.toString(8)}, expected ${spec.uid}:${spec.gid ?? '*'} ` +
          `0${spec.mode.toString(8)} — not the file root created; never fixed in place`,
      );
    }
    return fd;
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

function tryFlock(fd: number, mode: LockMode): boolean {
  const c = loadLibc();
  const operation = (mode === 'ex' ? LOCK_EX : LOCK_SH) | LOCK_NB;
  for (;;) {
    if (c.flock(fd, operation) === 0) return true;
    const errno = c.errno();
    if (errno === EINTR) continue;
    if (errno === EWOULDBLOCK) return false;
    throw new Error(`lock: flock(${fd}) failed (errno ${errno})`);
  }
}

function unlock(fd: number): void {
  try {
    loadLibc().flock(fd, LOCK_UN);
  } finally {
    closeSync(fd);
  }
}

const OWNER_CAP = 4096;

function readOwner(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  try {
    if (!fstatSync(fd).isFile()) return null;
    const buffer = Buffer.alloc(OWNER_CAP + 1);
    const length = readSync(fd, buffer, 0, buffer.length, 0);
    return length > OWNER_CAP ? null : buffer.subarray(0, length).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Temp (O_EXCL|O_NOFOLLOW, 0600, fsynced) → rename. The record is for messages only. */
function writeOwner(path: string, record: string): void {
  const temp = `${path}.tmp`;
  const { O_WRONLY, O_CREAT, O_EXCL, O_NOFOLLOW } = constants;
  try {
    const stale = lstatSync(temp);
    if (stale.isFile()) unlinkSync(temp);
  } catch {
    // absent: the usual case
  }
  const fd = openSync(temp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
  try {
    writeSync(fd, record);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

function holderFromProcLocks(path: string): number[] | null {
  let text: string;
  try {
    text = readFileSync('/proc/locks', 'utf8');
  } catch {
    return null;
  }
  try {
    const stats = lstatSync(path);
    return parseProcLocks(text, splitDev(stats.dev), stats.ino);
  } catch {
    return null;
  }
}

function lstatDir(path: string): DirFacts | null {
  try {
    const stats = lstatSync(path);
    return { type: entryType(stats), uid: stats.uid, mode: stats.mode & 0o7777 };
  } catch {
    return null;
  }
}

/** One level, then the exact owner and mode (umask-proof). */
function mkdirExact(path: string, mode: number, uid: number, gid: number): void {
  mkdirSync(path, { mode });
  chownSync(path, uid, gid);
  chmodSync(path, mode);
}

export function flockIo(): LockIo {
  return Object.freeze({
    openLockFile,
    tryFlock,
    unlock,
    readOwner,
    writeOwner,
    holderFromProcLocks,
    lstat: lstatDir,
    mkdir: mkdirExact,
    now: () => Date.now(),
    sleepSync: (ms: number) => Bun.sleepSync(ms),
    sleep: (ms: number) => Bun.sleep(ms),
  });
}
