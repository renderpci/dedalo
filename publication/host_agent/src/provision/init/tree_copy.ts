/**
 * THE CODE TREE (spec §1.3, §5.5) — the one tree walk both digests use, and the agent-code
 * install root performs.
 *
 * `treeDigest(root)`: every entry below `root`, in C byte order of its relative path `./…`,
 * gives one line — a file `F <sha256> <path>`, a symlink `L <target> <path>`, a directory
 * `D <path>` — and the digest is sha256 of those lines joined with `\n` (no trailing newline;
 * `root` itself is not an entry). deploy/install.sh's `tree_digest` is the sh twin, held equal
 * on a fixture tree by tests/init_install_sh.test.ts. Anything else in the tree (a FIFO, a
 * socket, a device), a name with a line break, or a symlink that is absolute or resolves
 * outside the tree (or nowhere) is a REFUSAL, never skipped: the tree is code root will run.
 *
 * `installTree(src, dst)` (code.install): the tree is rebuilt — never copied with its owners —
 * as `<dst>.dedalo-init.new`, root-owned, `u=rwX,go=rX` (setuid/setgid/sticky cleared: modes
 * are computed, not carried), its digest re-taken and required equal to the source's; then
 * `dst` → `<dst>.dedalo-init.prev` and `.new` → `dst` (two renames inside one directory).
 * `.prev` is removed by `commitTree` once the restarted units are up, or put back by
 * `restoreTree` (act.ts and the resume path decide which; the journal records the three paths).
 */
import { createHash } from 'node:crypto';
import { closeSync, constants as FS, fstatSync, lstatSync, openSync, readdirSync, readlinkSync, readSync, realpathSync, symlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, posix } from 'node:path';
import type { PathFacts } from '../plan';
import { AGENT_TREE_WALK_CAP } from '../plan';
import type { InitIo } from './types';

export const NEW_SUFFIX = '.dedalo-init.new';
export const PREV_SUFFIX = '.dedalo-init.prev';

export class TreeRefused extends Error {
  constructor(message: string) {
    super(`tree: ${message}`);
    this.name = 'TreeRefused';
  }
}

/** The reads a walk needs. Production: hostTreeReader() (lstat, never following). */
export interface TreeReader {
  lstat(path: string): PathFacts | null;
  readdir(path: string): string[];
  readlink(path: string): string;
  /** realpath, or null when it does not resolve. */
  realpath(path: string): string | null;
  /** A regular file's bytes, opened O_NOFOLLOW. */
  readFile(path: string): Uint8Array;
}

export interface TreeEntry {
  /** `./relative/path`. */
  readonly path: string;
  readonly type: 'file' | 'dir' | 'symlink';
  /** file: its sha256. */
  readonly sha?: string;
  /** symlink: its (relative) target, as stored. */
  readonly target?: string;
  /** file: whether any execute bit is set (the install mode follows it). */
  readonly executable?: boolean;
}

function typeOf(stats: { isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean }): PathFacts['type'] {
  if (stats.isSymbolicLink()) return 'symlink';
  if (stats.isDirectory()) return 'dir';
  if (stats.isFile()) return 'file';
  return 'other';
}

export function hostTreeReader(): TreeReader {
  return Object.freeze({
    lstat(path: string): PathFacts | null {
      try {
        const stats = lstatSync(path);
        return { type: typeOf(stats), uid: stats.uid, gid: stats.gid, mode: stats.mode & 0o7777 };
      } catch {
        return null;
      }
    },
    readdir: (path: string) => readdirSync(path),
    readlink: (path: string) => readlinkSync(path),
    realpath(path: string): string | null {
      try {
        return realpathSync(path);
      } catch {
        return null;
      }
    },
    readFile(path: string): Uint8Array {
      const fd = openSync(path, FS.O_RDONLY | FS.O_NOFOLLOW | FS.O_NONBLOCK);
      try {
        const stats = fstatSync(fd);
        if (!stats.isFile()) throw new TreeRefused(`'${path}' is not a regular file`);
        const out = Buffer.alloc(stats.size);
        let offset = 0;
        while (offset < out.length) {
          const read = readSync(fd, out, offset, out.length - offset, null);
          if (read === 0) break;
          offset += read;
        }
        return new Uint8Array(out.subarray(0, offset));
      } finally {
        closeSync(fd);
      }
    },
  });
}

function byteOrder(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function sha256(data: Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Every entry below `root`, validated, in C byte order of `./path`. Throws TreeRefused on the
 * first entry that may not be part of a code tree. `cap` bounds the walk (a refusal past it).
 */
export function treeEntries(root: string, reader: TreeReader, cap = AGENT_TREE_WALK_CAP): TreeEntry[] {
  const rootFacts = reader.lstat(root);
  if (rootFacts?.type !== 'dir') throw new TreeRefused(`'${root}' is not a real directory`);
  const realRoot = reader.realpath(root);
  if (realRoot === null) throw new TreeRefused(`'${root}' does not resolve`);
  const entries: TreeEntry[] = [];
  const pending = [''];
  while (pending.length > 0) {
    const rel = pending.shift() as string;
    const dir = rel === '' ? root : join(root, rel);
    for (const name of reader.readdir(dir)) {
      if (entries.length >= cap) throw new TreeRefused(`'${root}' holds more than ${cap} entries`);
      if (/[\n\r\0]/.test(name)) throw new TreeRefused(`'${dir}' holds a name with a line break or NUL`);
      const childRel = rel === '' ? name : `${rel}/${name}`;
      const full = join(root, childRel);
      const path = `./${childRel}`;
      const facts = reader.lstat(full);
      if (facts === null) throw new TreeRefused(`'${full}' vanished during the walk`);
      if (facts.type === 'dir') {
        entries.push({ path, type: 'dir' });
        pending.push(childRel);
      } else if (facts.type === 'file') {
        const bytes = reader.readFile(full);
        entries.push({ path, type: 'file', sha: sha256(bytes), executable: (facts.mode & 0o111) !== 0 });
      } else if (facts.type === 'symlink') {
        const target = reader.readlink(full);
        if (isAbsolute(target)) throw new TreeRefused(`'${full}' is an absolute symlink ('${target}'); only relative links inside the tree are allowed`);
        if (/[\n\r\0]/.test(target)) throw new TreeRefused(`'${full}' has a link target with a line break or NUL`);
        const lexical = posix.normalize(posix.join(posix.dirname(childRel), target));
        if (lexical === '..' || lexical.startsWith('../')) throw new TreeRefused(`'${full}' points outside the tree ('${target}')`);
        const resolved = reader.realpath(full);
        if (resolved === null) throw new TreeRefused(`'${full}' does not resolve ('${target}')`);
        if (!resolved.startsWith(`${realRoot}/`)) throw new TreeRefused(`'${full}' resolves outside the tree ('${target}')`);
        entries.push({ path, type: 'symlink', target });
      } else {
        throw new TreeRefused(`'${full}' is neither a file, a directory nor a symlink`);
      }
    }
  }
  return entries.sort((a, b) => byteOrder(a.path, b.path));
}

/** The digest lines of a walk (exported for the sh-twin gate). */
export function digestLines(entries: readonly TreeEntry[]): string[] {
  return entries.map(entry => {
    if (entry.type === 'file') return `F ${entry.sha} ${entry.path}`;
    if (entry.type === 'symlink') return `L ${entry.target} ${entry.path}`;
    return `D ${entry.path}`;
  });
}

export function digestOf(entries: readonly TreeEntry[]): string {
  return sha256(digestLines(entries).join('\n'));
}

export function treeDigest(root: string, reader: TreeReader = hostTreeReader(), cap = AGENT_TREE_WALK_CAP): string {
  return digestOf(treeEntries(root, reader, cap));
}

/* ── the install ──────────────────────────────────────────────────────────────────── */

/** The writes an install needs: init's doors plus one symlink creator (inside the fresh `.new` tree only). */
export interface TreeWriter {
  readonly io: InitIo;
  /** Creates a symlink at `path` (its parent is a directory this install just created). */
  symlink(target: string, path: string): void;
}

export function hostTreeWriter(io: InitIo): TreeWriter {
  return Object.freeze({ io, symlink: (target: string, path: string) => symlinkSync(target, path) });
}

export interface InstallOptions {
  /** The owner of every installed entry: root (0:0) in production; the test's own ids on a scratch tree. */
  readonly uid?: number;
  readonly gid?: number;
  /** The digest the comparison showed (`code_install.digest`): the source must still have it. */
  readonly expectedDigest?: string;
  readonly cap?: number;
}

export interface InstallResult {
  readonly dst: string;
  readonly new: string;
  /** Where the previous tree now is; null on a first install. */
  readonly prev: string | null;
  readonly digest: string;
}

export function newPathOf(dst: string): string {
  return `${dst}${NEW_SUFFIX}`;
}

export function prevPathOf(dst: string): string {
  return `${dst}${PREV_SUFFIX}`;
}

/**
 * Builds `<dst>.dedalo-init.new` from `src`, verifies it, swaps it in. Throws TreeRefused (the
 * source is not a code tree, changed, or a previous install was never finished) or the io's
 * error; on any failure before the swap the `.new` tree is removed and `dst` is untouched.
 */
export function installTree(
  src: string,
  dst: string,
  reader: TreeReader,
  writer: TreeWriter,
  options: InstallOptions = {},
): InstallResult {
  const { io } = writer;
  const uid = options.uid ?? 0;
  const gid = options.gid ?? 0;
  const parent = dirname(dst);
  const newPath = newPathOf(dst);
  const prevPath = prevPathOf(dst);
  if (reader.lstat(prevPath) !== null) {
    throw new TreeRefused(`'${prevPath}' exists: a previous install was never finished — re-run with --resume`);
  }
  const entries = treeEntries(src, reader, options.cap);
  const digest = digestOf(entries);
  if (options.expectedDigest !== undefined && digest !== options.expectedDigest) {
    throw new TreeRefused(`'${src}' changed since it was compared (digest ${digest.slice(0, 12)}… ≠ ${options.expectedDigest.slice(0, 12)}…); re-run`);
  }
  if (reader.lstat(newPath) !== null) io.removeTree(newPath, parent); // a crashed build: never reused
  const mkdir = (path: string): void => {
    io.mkdir(path, 0o755);
    io.chown(path, uid, gid);
    io.chmod(path, 0o755);
  };
  try {
    mkdir(newPath);
    for (const entry of entries) {
      const target = join(newPath, entry.path.slice(2));
      if (entry.type === 'dir') mkdir(target);
      else if (entry.type === 'file') {
        const mode = entry.executable ? 0o755 : 0o644;
        const written = io.writeTempNamed(dirname(target), entry.path.slice(entry.path.lastIndexOf('/') + 1), reader.readFile(join(src, entry.path.slice(2))), mode);
        io.chown(written, uid, gid);
        io.chmod(written, mode);
      } else writer.symlink(entry.target as string, target);
    }
    const built = digestOf(treeEntries(newPath, reader, options.cap));
    if (built !== digest) throw new TreeRefused(`the rebuilt tree '${newPath}' does not match its source (digest ${built.slice(0, 12)}…)`);
  } catch (error) {
    if (reader.lstat(newPath) !== null) io.removeTree(newPath, parent);
    throw error;
  }
  const hadPrevious = reader.lstat(dst) !== null;
  if (hadPrevious) io.renameDir(dst, prevPath);
  try {
    io.renameDir(newPath, dst);
  } catch (error) {
    if (hadPrevious) io.renameDir(prevPath, dst);
    throw error;
  }
  return Object.freeze({ dst, new: newPath, prev: hadPrevious ? prevPath : null, digest });
}

/** The restarted units are up: the previous tree goes. Idempotent. */
export function commitTree(dst: string, reader: TreeReader, io: InitIo): boolean {
  const prevPath = prevPathOf(dst);
  if (reader.lstat(prevPath) === null) return false;
  io.removeTree(prevPath, dirname(dst));
  return true;
}

/**
 * Puts the previous tree back (a later step failed, or resume found the run died between the
 * swap and the restart). Also clears a half-built `.new`. Returns what it did.
 */
export function restoreTree(dst: string, reader: TreeReader, io: InitIo): 'restored' | 'cleared' | 'nothing' {
  const parent = dirname(dst);
  const newPath = newPathOf(dst);
  const prevPath = prevPathOf(dst);
  let did: 'restored' | 'cleared' | 'nothing' = 'nothing';
  if (reader.lstat(prevPath) !== null) {
    if (reader.lstat(dst) !== null) {
      if (reader.lstat(newPath) !== null) io.removeTree(newPath, parent);
      io.renameDir(dst, newPath);
    }
    io.renameDir(prevPath, dst);
    did = 'restored';
  }
  if (reader.lstat(newPath) !== null) {
    io.removeTree(newPath, parent);
    if (did === 'nothing') did = 'cleared';
  }
  return did;
}
