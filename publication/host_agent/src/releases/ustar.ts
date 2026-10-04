/**
 * THE BUNDLE READER — a constrained ustar+gzip stream, validated and extracted in ONE pass.
 *
 * D7: no system `tar`. GNU and BSD tar disagree on flags, listing format and what they
 * silently accept (symlinks, `..`, absolute names, GNU long-name records), so a bundle
 * "validated" by listing it and then extracted by a second program is two code paths that
 * can disagree. Here the parser that decides is the parser that writes.
 *
 * THE FORMAT ACCEPTED (and nothing else):
 *   - gzip (magic 1f 8b) around POSIX ustar (`ustar\0` + version `00`);
 *   - entry types `0` / `\0` (regular file) and `5` (directory);
 *   - a PAX `x` record carrying ONLY `path`, applying to the next entry;
 *   - end of archive = two zero blocks; bytes after it are drained (they are hashed: the
 *     sha256 is over the WHOLE compressed stream) but never parsed.
 *
 * EVERY REFUSAL HAPPENS BEFORE THE OFFENDING ENTRY TOUCHES THE DISK, and on any failure
 * `destDir` itself is removed, so a refused bundle leaves nothing. Writes never follow a
 * link: files are created `O_CREAT|O_EXCL|O_NOFOLLOW` (an existing name — a link included
 * — is EEXIST, i.e. `duplicate_path`); directories are created one level at a time with a
 * non-recursive `mkdir` and moded on a handle opened `O_NOFOLLOW`. Modes are NORMALIZED and
 * applied with `fchmod` (never requested through the umask): files 0644, or 0755 when the
 * header carried any execute bit; directories 0755. Owner, group and mtime are ignored.
 *
 * ZERO-DEPENDENCY on purpose: the engine's phase-4 round-trip test imports this file from
 * the ROOT repo. Only `node:` builtins; `tests/ustar.test.ts` gates it.
 *
 * Confinement to STATE_ROOT and the reserved-path list are the CALLER's
 * (`releases/store.ts` `createStaging`, `reservedBundlePaths`): this module cannot read
 * config without importing zod.
 */

import { createHash } from 'node:crypto';
import { constants as FS } from 'node:fs';
import { lstat, mkdir, open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export type ApiName = 'v1' | 'v2';

export interface BundleEntry {
  path: string;
  type: 'file' | 'dir';
  size: number;
  mode: number;
}

export interface BundleLimits {
  maxBytes: number;
  maxEntries: number;
  maxPathLength: number;
}

export type BundleRefusalReason =
  | 'not_gzip'
  | 'truncated'
  | 'bad_checksum'
  | 'entry_type'
  | 'pax_key'
  | 'absolute_path'
  | 'dot_segment'
  | 'duplicate_path'
  | 'path_too_long'
  | 'too_many_entries'
  | 'too_large'
  | 'reserved_path';

export class BundleRefused extends Error {
  constructor(
    readonly reason: BundleRefusalReason,
    readonly path: string | null = null,
  ) {
    super(`bundle refused: ${reason}${path === null ? '' : ` (${JSON.stringify(path)})`}`);
    this.name = 'BundleRefused';
  }
}

/** D7 cap on one entry path, in UTF-8 bytes. */
export const DEFAULT_MAX_PATH_LENGTH = 1024;

/** A PAX record set larger than this is not "one path". */
export const MAX_PAX_BYTES = 8192;

/** NAME_MAX on Linux and macOS filesystems. */
export const MAX_SEGMENT_BYTES = 255;

const BLOCK = 512;
const FILE_MODE = 0o644;
const EXEC_FILE_MODE = 0o755;
const DIR_MODE = 0o755;
const WRITE_FLAGS = FS.O_WRONLY | FS.O_CREAT | FS.O_EXCL | FS.O_NOFOLLOW;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** The two reader methods used — structural, so web and node:stream/web readers both fit. */
interface ChunkSource {
  read(): Promise<{ done: true; value?: Uint8Array } | { done: false; value: Uint8Array }>;
}

/** Pulls exact byte counts out of the decompressed stream; maps inflate errors to `truncated`. */
class BlockReader {
  private buf: Uint8Array = new Uint8Array(0);
  private done = false;
  private total = 0;
  constructor(
    private readonly reader: ChunkSource,
    private readonly cap: number,
  ) {}

  private async fill(): Promise<boolean> {
    if (this.done) return false;
    let r: Awaited<ReturnType<ChunkSource['read']>>;
    try {
      r = await this.reader.read();
    } catch (err) {
      if (err instanceof BundleRefused) throw err;
      throw new BundleRefused('truncated');
    }
    if (r.done) {
      this.done = true;
      return false;
    }
    this.total += r.value.length;
    if (this.total > this.cap) throw new BundleRefused('too_large');
    const next = new Uint8Array(this.buf.length + r.value.length);
    next.set(this.buf, 0);
    next.set(r.value, this.buf.length);
    this.buf = next;
    return true;
  }

  /** Exactly `n` bytes; `null` only when the stream ended cleanly before the first byte. */
  async exact(n: number): Promise<Uint8Array | null> {
    while (this.buf.length < n) {
      if (!(await this.fill())) {
        if (this.buf.length === 0) return null;
        throw new BundleRefused('truncated');
      }
    }
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return out;
  }

  /** Streams `n` bytes to `sink` without buffering the whole entry. */
  async pipe(n: number, sink: (chunk: Uint8Array) => Promise<void>): Promise<void> {
    let left = n;
    while (left > 0) {
      if (this.buf.length === 0 && !(await this.fill())) throw new BundleRefused('truncated');
      const take = Math.min(left, this.buf.length);
      await sink(this.buf.subarray(0, take));
      this.buf = this.buf.subarray(take);
      left -= take;
    }
  }

  async skip(n: number): Promise<void> {
    await this.pipe(n, async () => {});
  }

  /** Reads to the end so the compressed-stream hash covers every byte. */
  async drain(): Promise<void> {
    this.buf = new Uint8Array(0);
    while (await this.fill()) this.buf = new Uint8Array(0);
  }
}

function isZeroBlock(b: Uint8Array): boolean {
  for (let i = 0; i < b.length; i++) if (b[i] !== 0) return false;
  return true;
}

function field(h: Uint8Array, off: number, len: number): Uint8Array {
  const f = h.subarray(off, off + len);
  const nul = f.indexOf(0);
  return nul === -1 ? f : f.subarray(0, nul);
}

function octal(h: Uint8Array, off: number, len: number): number {
  if ((h[off] ?? 0) & 0x80) throw new BundleRefused('too_large'); // base-256: > 8 GiB, never ours
  const s = new TextDecoder('latin1').decode(field(h, off, len)).trim();
  if (s === '') return 0;
  if (!/^[0-7]+$/.test(s)) throw new BundleRefused('bad_checksum');
  return Number.parseInt(s, 8);
}

function verifyChecksum(h: Uint8Array): void {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
  if (octal(h, 148, 8) !== sum) throw new BundleRefused('bad_checksum');
}

function isUstar(h: Uint8Array): boolean {
  // magic "ustar\0" + version "00" — GNU's "ustar  \0" is a different dialect.
  const want = [0x75, 0x73, 0x74, 0x61, 0x72, 0x00, 0x30, 0x30];
  return want.every((b, i) => h[257 + i] === b);
}

function decodeName(bytes: Uint8Array): string {
  try {
    return UTF8.decode(bytes);
  } catch {
    throw new BundleRefused('dot_segment');
  }
}

function parsePax(data: Uint8Array): string {
  let text: string;
  try {
    text = UTF8.decode(data);
  } catch {
    throw new BundleRefused('pax_key');
  }
  const enc = new TextEncoder();
  let path: string | null = null;
  let rest = text;
  while (rest.length > 0) {
    const m = /^([1-9][0-9]*) /.exec(rest);
    if (!m) throw new BundleRefused('pax_key');
    const len = Number(m[1]);
    // `len` counts BYTES of the whole record, its own digits and the newline included.
    const restBytes = enc.encode(rest);
    if (len > restBytes.length) throw new BundleRefused('pax_key');
    const record = UTF8.decode(restBytes.subarray(0, len));
    if (!record.endsWith('\n')) throw new BundleRefused('pax_key');
    const body = record.slice(m[0].length, -1);
    const eq = body.indexOf('=');
    if (eq <= 0) throw new BundleRefused('pax_key');
    const key = body.slice(0, eq);
    const value = body.slice(eq + 1);
    if (key !== 'path' || path !== null || value.includes('\0')) {
      throw new BundleRefused('pax_key', key);
    }
    path = value;
    rest = UTF8.decode(restBytes.subarray(len));
  }
  if (path === null) throw new BundleRefused('pax_key');
  return path;
}

/** Canonical relative form or a refusal. Returns the path without a trailing `/`. */
function checkPath(raw: string, isDir: boolean, limits: BundleLimits): string {
  if (raw.startsWith('/')) throw new BundleRefused('absolute_path', raw);
  if (new TextEncoder().encode(raw).length > limits.maxPathLength) {
    throw new BundleRefused('path_too_long', raw.slice(0, 64));
  }
  const p = isDir && raw.endsWith('/') ? raw.slice(0, -1) : raw;
  // Control characters and backslashes are not a path a release needs; refusing them keeps
  // one spelling per file on every filesystem the bundle may land on.
  if (/[\u0000-\u001f\u007f\\]/.test(p)) throw new BundleRefused('dot_segment', raw);
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.' || seg === '..') throw new BundleRefused('dot_segment', raw);
    // NAME_MAX (255 bytes) on every filesystem we target: refused here, not as ENAMETOOLONG mid-write.
    if (new TextEncoder().encode(seg).length > MAX_SEGMENT_BYTES) throw new BundleRefused('path_too_long', raw.slice(0, 64));
  }
  return p;
}

type Known = 'file' | 'dir' | 'implicit';

/**
 * Creates the missing levels of `rel`, one non-recursive `mkdir` each, moded on a handle
 * opened `O_NOFOLLOW` (umask-independent: the mode is applied, never requested). A level
 * already in `known` was created by THIS call into a fresh, agent-owned staging dir, and the
 * `known` map has already refused a file in the way, so it is not re-walked per file.
 */
async function ensureDir(destDir: string, rel: string, known: Map<string, Known>, explicit: boolean): Promise<void> {
  const segs = rel.split('/');
  let cur = '';
  for (let i = 0; i < segs.length; i++) {
    cur = cur === '' ? (segs[i] as string) : `${cur}/${segs[i]}`;
    const isLeaf = i === segs.length - 1;
    if (known.has(cur)) {
      if (isLeaf && explicit) known.set(cur, 'dir');
      continue;
    }
    const abs = join(destDir, cur);
    try {
      await mkdir(abs, { mode: DIR_MODE });
    } catch (err) {
      // EEXIST: a second spelling of a name already written (a case-insensitive filesystem).
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') throw new BundleRefused('duplicate_path', cur);
      throw err;
    }
    known.set(cur, isLeaf && explicit ? 'dir' : 'implicit');
    const h = await open(abs, FS.O_RDONLY | FS.O_NOFOLLOW);
    try {
      if (!(await h.stat()).isDirectory()) throw new BundleRefused('duplicate_path', cur);
      await h.chmod(DIR_MODE);
    } finally {
      await h.close();
    }
  }
}

async function assertEmptyRealDir(destDir: string): Promise<void> {
  const st = await lstat(destDir);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error(`extractBundle: destDir '${destDir}' is not a real directory`);
  }
  if ((await readdir(destDir)).length > 0) {
    throw new Error(`extractBundle: destDir '${destDir}' is not empty`);
  }
}

/** Hashes every compressed byte and refuses a stream that does not start with the gzip magic. */
function hashingGate(hash: ReturnType<typeof createHash>): TransformStream<Uint8Array, Uint8Array> {
  const head: number[] = [];
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      hash.update(chunk);
      for (let i = 0; i < chunk.length && head.length < 2; i++) {
        head.push(chunk[i] as number);
        if (head.length === 2 && (head[0] !== 0x1f || head[1] !== 0x8b)) {
          controller.error(new BundleRefused('not_gzip'));
          return;
        }
      }
      controller.enqueue(chunk);
    },
    flush(controller) {
      if (head.length < 2) controller.error(new BundleRefused('not_gzip'));
    },
  });
}

export async function extractBundle(
  stream: ReadableStream<Uint8Array>,
  destDir: string,
  limits: BundleLimits,
  reserved: readonly string[],
): Promise<{ entries: number; bytes: number; sha256: string }> {
  await assertEmptyRealDir(destDir);

  const hash = createHash('sha256');
  // A gzip bomb is bounded by the DECOMPRESSED byte count: content cap + per-entry header
  // overhead (header, PAX header, PAX data, padding) + the end blocks and record padding.
  const cap = limits.maxBytes + (limits.maxEntries * 8 + 64) * BLOCK + MAX_PAX_BYTES;
  // lib.dom types DecompressionStream's writable as BufferSource; at runtime it takes Uint8Array.
  const gunzip = new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
  const reader = stream
    .pipeThrough(hashingGate(hash))
    .pipeThrough(gunzip)
    .getReader();
  const blocks = new BlockReader(reader, cap);

  const known = new Map<string, Known>();
  let entries = 0;
  let bytes = 0;
  let paxPath: string | null = null;

  try {
    for (;;) {
      const h = await blocks.exact(BLOCK);
      if (h === null) throw new BundleRefused('truncated');
      if (isZeroBlock(h)) {
        if (paxPath !== null) throw new BundleRefused('pax_key');
        const second = await blocks.exact(BLOCK);
        if (second === null) throw new BundleRefused('truncated');
        // A lone zero block followed by data is a header whose checksum (0) cannot match.
        if (!isZeroBlock(second)) throw new BundleRefused('bad_checksum');
        await blocks.drain();
        break;
      }
      verifyChecksum(h);
      if (!isUstar(h)) throw new BundleRefused('entry_type');

      const typeflag = h[156] as number;
      const size = octal(h, 124, 12);
      const padding = (BLOCK - (size % BLOCK)) % BLOCK;

      if (typeflag === 0x78 /* 'x' */) {
        if (paxPath !== null) throw new BundleRefused('pax_key');
        if (size > MAX_PAX_BYTES) throw new BundleRefused('too_large');
        const data = await blocks.exact(size);
        if (data === null) throw new BundleRefused('truncated');
        paxPath = parsePax(data);
        await blocks.skip(padding);
        continue;
      }

      const isFile = typeflag === 0x30 /* '0' */ || typeflag === 0x00;
      const isDir = typeflag === 0x35; /* '5' */
      if (!isFile && !isDir) throw new BundleRefused('entry_type', String.fromCharCode(typeflag));
      if (isDir && size !== 0) throw new BundleRefused('entry_type');

      let raw: string;
      if (paxPath !== null) {
        raw = paxPath;
        paxPath = null;
      } else {
        const name = decodeName(field(h, 0, 100));
        const prefix = decodeName(field(h, 345, 155));
        raw = prefix === '' ? name : `${prefix}/${name}`;
      }
      const path = checkPath(raw, isDir, limits);

      for (const r of reserved) {
        if (path === r || path.startsWith(`${r}/`)) throw new BundleRefused('reserved_path', path);
      }
      const existing = known.get(path);
      if (existing === 'file' || existing === 'dir' || (existing === 'implicit' && isFile)) {
        throw new BundleRefused('duplicate_path', path);
      }
      const segs = path.split('/');
      for (let i = 1; i < segs.length; i++) {
        if (known.get(segs.slice(0, i).join('/')) === 'file') throw new BundleRefused('duplicate_path', path);
      }
      entries += 1;
      if (entries > limits.maxEntries) throw new BundleRefused('too_many_entries');
      if (bytes + size > limits.maxBytes) throw new BundleRefused('too_large', path);
      bytes += size;

      if (isDir) {
        await ensureDir(destDir, path, known, true);
        continue;
      }

      const parent = segs.slice(0, -1).join('/');
      if (parent !== '') await ensureDir(destDir, parent, known, false);
      const mode = octal(h, 100, 8) & 0o111 ? EXEC_FILE_MODE : FILE_MODE;
      let fh: Awaited<ReturnType<typeof open>>;
      try {
        fh = await open(join(destDir, path), WRITE_FLAGS, 0o600);
      } catch (err) {
        // EEXIST: a second spelling of the same name (a case-insensitive filesystem).
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') throw new BundleRefused('duplicate_path', path);
        throw err;
      }
      known.set(path, 'file');
      try {
        await blocks.pipe(size, async (chunk) => {
          let off = 0;
          while (off < chunk.length) {
            const { bytesWritten } = await fh.write(chunk, off, chunk.length - off);
            off += bytesWritten;
          }
        });
        await fh.chmod(mode);
      } finally {
        await fh.close();
      }
      await blocks.skip(padding);
    }
  } catch (err) {
    await reader.cancel().catch(() => {});
    await rm(destDir, { recursive: true, force: true });
    throw err;
  }

  return { entries, bytes, sha256: hash.digest('hex') };
}
