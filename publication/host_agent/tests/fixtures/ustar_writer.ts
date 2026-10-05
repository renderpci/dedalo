/**
 * TEST-ONLY ustar WRITER — builds well-formed AND deliberately hostile tarballs in-test, so
 * every refusal of `src/releases/ustar.ts` is pinned by a bundle the suite constructs
 * itself (no system `tar`, no binary fixtures on disk). The engine-side production writer
 * is phase 4's; this one exists to LIE on purpose (bad checksums, symlink types, `..`).
 */

export type TypeFlag = '0' | '\0' | '1' | '2' | '5' | 'x' | 'g' | 'L';

export interface TarEntry {
  path: string;
  type?: TypeFlag; // default '0'
  data?: Uint8Array | string; // default empty
  mode?: number; // default 0o644 (files) / 0o755 (dirs)
  linkname?: string;
  /** Overrides the header size field (default: data length). */
  size?: number;
  /** Adds 1 to the stored checksum. */
  corruptChecksum?: boolean;
  /** Writes GNU magic "ustar  \0" instead of POSIX "ustar\0" + "00". */
  gnuMagic?: boolean;
}

const BLOCK = 512;
const enc = new TextEncoder();

function bytesOf(d: Uint8Array | string | undefined): Uint8Array {
  if (d === undefined) return new Uint8Array(0);
  return typeof d === 'string' ? enc.encode(d) : d;
}

function put(h: Uint8Array, off: number, len: number, s: string): void {
  const b = enc.encode(s);
  if (b.length > len) throw new Error(`ustar_writer: '${s}' does not fit ${len} bytes`);
  h.set(b, off);
}

function oct(n: number, len: number): string {
  return `${n.toString(8).padStart(len - 1, '0')}\0`;
}

/** Splits a > 100-byte path into ustar prefix/name, or throws (use a PAX entry instead). */
function splitPath(path: string): { name: string; prefix: string } {
  if (enc.encode(path).length <= 100) return { name: path, prefix: '' };
  for (let i = path.length - 1; i > 0; i--) {
    if (path[i] !== '/') continue;
    const prefix = path.slice(0, i);
    const name = path.slice(i + 1);
    if (enc.encode(prefix).length <= 155 && enc.encode(name).length <= 100 && name !== '') {
      return { name, prefix };
    }
  }
  throw new Error(`ustar_writer: '${path.slice(0, 40)}…' needs a PAX path record`);
}

export function tarHeader(e: TarEntry, size: number): Uint8Array {
  const h = new Uint8Array(BLOCK);
  const type = e.type ?? '0';
  const { name, prefix } = splitPath(e.path);
  put(h, 0, 100, name);
  put(h, 100, 8, oct(e.mode ?? (type === '5' ? 0o755 : 0o644), 8));
  put(h, 108, 8, oct(0, 8));
  put(h, 116, 8, oct(0, 8));
  put(h, 124, 12, oct(e.size ?? size, 12));
  put(h, 136, 12, oct(0, 12));
  h[156] = type === '\0' ? 0 : type.charCodeAt(0);
  if (e.linkname) put(h, 157, 100, e.linkname);
  if (e.gnuMagic) put(h, 257, 8, 'ustar  \0');
  else {
    put(h, 257, 6, 'ustar\0');
    put(h, 263, 2, '00');
  }
  put(h, 345, 155, prefix);
  h.fill(0x20, 148, 156);
  let sum = 0;
  for (const b of h) sum += b;
  put(h, 148, 8, `${(sum + (e.corruptChecksum ? 1 : 0)).toString(8).padStart(6, '0')}\0 `);
  return h;
}

/** One PAX record: "<len> <key>=<value>\n", len counting its own digits. */
export function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  const bodyLen = enc.encode(body).length;
  let len = bodyLen + 1;
  while (String(len).length + bodyLen !== len) len = String(len).length + bodyLen;
  return `${len}${body}`;
}

/** A PAX `x` entry whose data is the given records. */
export function paxEntry(records: string): TarEntry {
  return { path: 'PaxHeaders/x', type: 'x', data: records };
}

/** The raw (uncompressed) archive. `end: false` omits the two terminating zero blocks. */
export function ustar(entries: readonly TarEntry[], opts: { end?: boolean } = {}): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const e of entries) {
    const data = bytesOf(e.data);
    parts.push(tarHeader(e, data.length));
    parts.push(data);
    const pad = (BLOCK - (data.length % BLOCK)) % BLOCK;
    if (pad) parts.push(new Uint8Array(pad));
  }
  if (opts.end !== false) parts.push(new Uint8Array(BLOCK * 2));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function gzip(raw: Uint8Array): Uint8Array {
  return Bun.gzipSync(Uint8Array.from(raw));
}

/** gzip(ustar(entries)) — the shape a release bundle has. */
export function bundle(entries: readonly TarEntry[], opts: { end?: boolean } = {}): Uint8Array {
  return gzip(ustar(entries, opts));
}

/** A stream delivering `bytes` in `chunk`-sized pieces (small chunks cross every block boundary). */
export function streamOf(bytes: Uint8Array, chunk = 97): ReadableStream<Uint8Array> {
  let off = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (off >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(off, off + chunk));
      off += chunk;
    },
  });
}
