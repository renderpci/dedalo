/**
 * THE BUNDLE WRITER — the engine half of the publication-host release bundle (phase 4, L4).
 *
 * The publication agent accepts ONE format (phase-2 D7, `publication/host_agent/src/
 * releases/ustar.ts`): gzip around POSIX ustar, entry types `0` (file) and `5` (dir), and a
 * PAX `x` record carrying ONLY `path`. This module is the only engine code that produces
 * it, and it produces it DETERMINISTICALLY — the same entries always give the same bytes,
 * so the same sha256:
 *
 *   - entries arrive in TREE ORDER (`compareBundlePaths`: segment by segment, UTF-8 bytes,
 *     a parent before its contents) and anything else is REFUSED, never re-sorted: the
 *     writer streams and cannot buffer a node_modules tree to sort it;
 *   - every header carries uid/gid 0, mtime 0, empty uname/gname, and a NORMALIZED mode
 *     (dirs 0755; files 0755 when the caller's mode has any execute bit, else 0644);
 *   - a header path (dirs end in `/`) of ≤ 100 UTF-8 bytes goes in `name`; a longer one in
 *     a PAX `path` record (never the ustar `prefix` split — one long-path mechanism, the one
 *     the reader implements), and the `name` field then holds its first ≤ 100 bytes cut on
 *     a UTF-8 boundary;
 *   - gzip is framed HERE, not by zlib's gzip mode: header `1f 8b 08 00 00000000 00 ff`
 *     (no name, mtime 0, OS 255 "unknown" — zlib writes 3 on Linux and 19 on macOS) around
 *     a raw deflate from `node:zlib` (level 9), then CRC-32 + ISIZE. node:zlib's deflate
 *     output does not depend on how its input is chunked; web `CompressionStream` flushes
 *     per chunk and DOES (measured on Bun 1.4.2), so it is not used.
 *
 * What the writer refuses mirrors what the reader refuses on a well-formed archive (an
 * absolute path, an empty / `.` / `..` segment, a control character or backslash, a path
 * over 1024 bytes, a segment over 255 bytes, a duplicate, a path under a file), so a bad
 * tree is stopped on the engine, before anything is sent. The two limits are pinned equal
 * to the agent's constants by test/unit/publication_host_bundle_twin_tripwire.test.ts,
 * which also feeds this writer's output to the agent's `extractBundle`.
 *
 * Bundle-size and entry-count caps are the AGENT's config (`MAX_BUNDLE_BYTES`,
 * `MAX_BUNDLE_ENTRIES`); they are not known here and not enforced here.
 *
 * Imports only `node:` builtins (pinned by the twin tripwire), so the drill kit can use it
 * without reaching the engine config.
 */

import { createHash, type Hash } from 'node:crypto';
import { pipeline, Readable } from 'node:stream';
import { crc32, createDeflateRaw } from 'node:zlib';

export interface BundleWriterEntry {
	/** Relative, `/`-separated, no trailing `/` (the writer adds it to a dir's header). */
	path: string;
	type: 'file' | 'dir';
	/** Only the execute bits of a file are read; a dir is always 0755. */
	mode: number;
	/** A file's bytes. A stream needs `size`; absent = an empty file. A dir has none. */
	data?: Uint8Array | ReadableStream<Uint8Array>;
	size?: number;
}

export type BundleWriteReason =
	| 'absolute_path'
	| 'dot_segment'
	| 'bad_char'
	| 'path_too_long'
	| 'not_ascending'
	| 'file_as_dir'
	| 'dir_with_data'
	| 'size_missing'
	| 'size_mismatch'
	| 'too_large'
	| 'cancelled';

export class BundleWriteError extends Error {
	constructor(
		readonly reason: BundleWriteReason,
		readonly path: string | null = null,
	) {
		super(`bundle write refused: ${reason}${path === null ? '' : ` (${JSON.stringify(path)})`}`);
		this.name = 'BundleWriteError';
	}
}

/** = the agent's DEFAULT_MAX_PATH_LENGTH (twin tripwire). Counts a dir's trailing `/`. */
export const BUNDLE_MAX_PATH_BYTES = 1024;
/** = the agent's MAX_SEGMENT_BYTES (NAME_MAX; twin tripwire). */
export const BUNDLE_MAX_SEGMENT_BYTES = 255;
/** The largest size an 11-digit octal field holds; the agent refuses base-256 sizes. */
export const BUNDLE_MAX_ENTRY_BYTES = 8 ** 11 - 1;
/** The fixed gzip member header: deflate, no flags, mtime 0, XFL 0, OS 255. */
export const GZIP_HEADER_BYTES = [0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x00, 0xff] as const;
export const GZIP_LEVEL = 9;

const BLOCK = 512;
const NAME_BYTES = 100;
const DIR_MODE = 0o755;
const FILE_MODE = 0o644;
const EXEC_FILE_MODE = 0o755;
const TYPE_FILE = 0x30; // '0'
const TYPE_DIR = 0x35; // '5'
const TYPE_PAX = 0x78; // 'x'
const PAX_NAME = 'PaxHeader';
const UTF8 = new TextEncoder();

function utf8(text: string): Uint8Array {
	return UTF8.encode(text);
}

/** False for a string holding a lone surrogate, which UTF-8 encoding would silently replace. */
function isWellFormed(text: string): boolean {
	return new TextDecoder().decode(utf8(text)) === text;
}

/**
 * Tree order: segment by segment, each compared as UTF-8 bytes; a path sorts right after
 * its parent and before its parent's next sibling. A recursive walk that sorts each
 * directory's names by `Buffer.compare` emits exactly this order.
 */
export function compareBundlePaths(a: string, b: string): number {
	const x = a.split('/');
	const y = b.split('/');
	const shared = Math.min(x.length, y.length);
	for (let i = 0; i < shared; i++) {
		const c = Buffer.compare(utf8(x[i] as string), utf8(y[i] as string));
		if (c !== 0) return c;
	}
	return x.length - y.length;
}

function hasForbiddenChar(segment: string): boolean {
	for (const ch of segment) {
		const code = ch.codePointAt(0) as number;
		if (code < 0x20 || code === 0x7f || ch === '\\') return true;
	}
	return false;
}

function checkSegment(segment: string, path: string): void {
	if (segment === '' || segment === '.' || segment === '..')
		throw new BundleWriteError('dot_segment', path);
	if (hasForbiddenChar(segment)) throw new BundleWriteError('bad_char', path);
	if (utf8(segment).length > BUNDLE_MAX_SEGMENT_BYTES)
		throw new BundleWriteError('path_too_long', path);
}

/** The header path's UTF-8 bytes (a dir gains its trailing `/`), or a refusal. */
function headerPathBytes(entry: BundleWriterEntry): Uint8Array {
	const { path } = entry;
	if (path.startsWith('/')) throw new BundleWriteError('absolute_path', path);
	if (!isWellFormed(path)) throw new BundleWriteError('bad_char', path);
	for (const segment of path.split('/')) checkSegment(segment, path);
	const bytes = utf8(entry.type === 'dir' ? `${path}/` : path);
	if (bytes.length > BUNDLE_MAX_PATH_BYTES) throw new BundleWriteError('path_too_long', path);
	return bytes;
}

/** Strict tree order (no duplicates) and no entry under a file. One per writeBundle call. */
class OrderGuard {
	private previous: string | null = null;
	private readonly files = new Set<string>();

	admit(entry: BundleWriterEntry): void {
		const { path } = entry;
		if (this.previous !== null && compareBundlePaths(this.previous, path) >= 0) {
			throw new BundleWriteError('not_ascending', path);
		}
		this.previous = path;
		this.refuseFileAncestor(path);
		if (entry.type === 'file') this.files.add(path);
	}

	private refuseFileAncestor(path: string): void {
		for (let i = path.indexOf('/'); i !== -1; i = path.indexOf('/', i + 1)) {
			if (this.files.has(path.slice(0, i))) throw new BundleWriteError('file_as_dir', path);
		}
	}
}

function checkedSize(size: number, path: string): number {
	if (!Number.isSafeInteger(size) || size < 0) throw new BundleWriteError('size_mismatch', path);
	if (size > BUNDLE_MAX_ENTRY_BYTES) throw new BundleWriteError('too_large', path);
	return size;
}

function bytesSize(data: Uint8Array, size: number | undefined, path: string): number {
	if (size !== undefined && size !== data.length) throw new BundleWriteError('size_mismatch', path);
	return data.length;
}

function dataSize(entry: BundleWriterEntry): number {
	const { data, size, path } = entry;
	if (data instanceof Uint8Array) return bytesSize(data, size, path);
	if (data === undefined) {
		// absent data = an empty file: a nonzero size here would frame bytes never written
		if ((size ?? 0) !== 0) throw new BundleWriteError('size_mismatch', path);
		return 0;
	}
	if (size === undefined) throw new BundleWriteError('size_missing', path);
	return size;
}

/** The entry's content size, validated; a dir is 0 or a refusal. */
function entrySize(entry: BundleWriterEntry): number {
	if (entry.type === 'file') return checkedSize(dataSize(entry), entry.path);
	if (entry.data !== undefined || (entry.size ?? 0) !== 0)
		throw new BundleWriteError('dir_with_data', entry.path);
	return 0;
}

function putText(h: Uint8Array, offset: number, text: string): void {
	h.set(utf8(text), offset);
}

function putOctal(h: Uint8Array, offset: number, width: number, value: number): void {
	putText(h, offset, `${value.toString(8).padStart(width - 1, '0')}\0`);
}

/** One ustar header: uid/gid/mtime 0, empty uname/gname, POSIX magic `ustar\0` + `00`. */
function headerBlock(name: Uint8Array, typeflag: number, mode: number, size: number): Uint8Array {
	const h = new Uint8Array(BLOCK);
	h.set(name, 0);
	putOctal(h, 100, 8, mode);
	putOctal(h, 108, 8, 0);
	putOctal(h, 116, 8, 0);
	putOctal(h, 124, 12, size);
	putOctal(h, 136, 12, 0);
	h[156] = typeflag;
	putText(h, 257, 'ustar\0');
	putText(h, 263, '00');
	h.fill(0x20, 148, 156);
	let sum = 0;
	for (const byte of h) sum += byte;
	putText(h, 148, `${sum.toString(8).padStart(6, '0')}\0 `);
	return h;
}

/** The first ≤ 100 bytes of a long path, never cutting a UTF-8 sequence. */
function truncatedName(bytes: Uint8Array): Uint8Array {
	let cut = NAME_BYTES;
	while (cut > 0 && ((bytes[cut] as number) & 0xc0) === 0x80) cut--;
	return bytes.subarray(0, cut);
}

/** `<len> path=<value>\n`, `<len>` counting the whole record in bytes, its own digits included. */
export function paxPathRecord(value: Uint8Array): Uint8Array {
	const body = Buffer.concat([utf8(' path='), value, utf8('\n')]);
	let length = body.length + 1;
	while (String(length).length + body.length !== length)
		length = String(length).length + body.length;
	return Buffer.concat([utf8(String(length)), body]);
}

function padding(size: number): Uint8Array | null {
	const rest = size % BLOCK;
	return rest === 0 ? null : new Uint8Array(BLOCK - rest);
}

function* paxBlocks(path: Uint8Array): Generator<Uint8Array> {
	const record = paxPathRecord(path);
	yield headerBlock(utf8(PAX_NAME), TYPE_PAX, FILE_MODE, record.length);
	yield record;
	const pad = padding(record.length);
	if (pad) yield pad;
}

function normalizedMode(entry: BundleWriterEntry): number {
	if (entry.type === 'dir') return DIR_MODE;
	return entry.mode & 0o111 ? EXEC_FILE_MODE : FILE_MODE;
}

/** Exactly `size` bytes from a stream, or a refusal (short and long both). */
async function* exactly(
	stream: ReadableStream<Uint8Array>,
	size: number,
	path: string,
): AsyncGenerator<Uint8Array> {
	let seen = 0;
	for await (const chunk of stream) {
		seen += chunk.length;
		if (seen > size) throw new BundleWriteError('size_mismatch', path);
		yield chunk;
	}
	if (seen !== size) throw new BundleWriteError('size_mismatch', path);
}

async function* dataBlocks(entry: BundleWriterEntry, size: number): AsyncGenerator<Uint8Array> {
	if (entry.data instanceof Uint8Array) yield entry.data;
	else if (entry.data !== undefined) yield* exactly(entry.data, size, entry.path);
	const pad = padding(size);
	if (pad) yield pad;
}

async function* entryBlocks(
	entry: BundleWriterEntry,
	path: Uint8Array,
	size: number,
): AsyncGenerator<Uint8Array> {
	const long = path.length > NAME_BYTES;
	if (long) yield* paxBlocks(path);
	const typeflag = entry.type === 'dir' ? TYPE_DIR : TYPE_FILE;
	yield headerBlock(long ? truncatedName(path) : path, typeflag, normalizedMode(entry), size);
	if (entry.type === 'file') yield* dataBlocks(entry, size);
}

/** The uncompressed archive: every entry, then the two zero blocks. */
async function* tarBlocks(entries: AsyncIterable<BundleWriterEntry>): AsyncGenerator<Uint8Array> {
	const order = new OrderGuard();
	for await (const entry of entries) {
		// validate the entry itself first, so a hostile path is refused under its own reason
		const path = headerPathBytes(entry);
		const size = entrySize(entry);
		order.admit(entry);
		yield* entryBlocks(entry, path, size);
	}
	yield new Uint8Array(BLOCK * 2);
}

interface GzipTally {
	crc: number;
	size: number;
}

async function* tallied(
	source: AsyncIterable<Uint8Array>,
	tally: GzipTally,
): AsyncGenerator<Uint8Array> {
	for await (const chunk of source) {
		tally.crc = crc32(chunk, tally.crc);
		tally.size = (tally.size + chunk.length) % 2 ** 32;
		yield chunk;
	}
}

function gzipTrailer(tally: GzipTally): Uint8Array {
	const out = new Uint8Array(8);
	const view = new DataView(out.buffer);
	view.setUint32(0, tally.crc, true);
	view.setUint32(4, tally.size, true);
	return out;
}

/** One gzip member around a raw deflate of `source` (see the header for why not zlib's gzip). */
async function* gzipMember(source: AsyncIterable<Uint8Array>): AsyncGenerator<Uint8Array> {
	const tally: GzipTally = { crc: 0, size: 0 };
	const deflate = createDeflateRaw({ level: GZIP_LEVEL });
	// A refusal inside `source` destroys `deflate` with that error; the loop below rethrows it.
	pipeline(Readable.from(tallied(source, tally)), deflate, () => {});
	yield Uint8Array.from(GZIP_HEADER_BYTES);
	for await (const chunk of deflate) yield new Uint8Array(chunk as Buffer);
	yield gzipTrailer(tally);
}

interface Digest {
	promise: Promise<string>;
	resolve: (hex: string) => void;
	reject: (error: unknown) => void;
}

function deferredDigest(): Digest {
	const digest = {} as Digest;
	digest.promise = new Promise<string>((resolve, reject) => {
		digest.resolve = resolve;
		digest.reject = reject;
	});
	// A caller that only reads the stream sees the failure there; never an unhandled rejection.
	digest.promise.catch(() => {});
	return digest;
}

async function pullInto(
	controller: ReadableStreamDefaultController<Uint8Array>,
	chunks: AsyncGenerator<Uint8Array>,
	hash: Hash,
	digest: Digest,
): Promise<void> {
	try {
		const next = await chunks.next();
		if (next.done) {
			controller.close();
			digest.resolve(hash.digest('hex'));
			return;
		}
		hash.update(next.value);
		controller.enqueue(next.value);
	} catch (error) {
		digest.reject(error);
		controller.error(error);
	}
}

/**
 * Streams the bundle for `entries` (tree order, see `compareBundlePaths`). `sha256` resolves
 * to the lowercase hex of every byte the stream delivered, once it has delivered the last;
 * it rejects with the same error the stream errors with (a refused entry, a short or long
 * data stream) or with `cancelled` when the reader cancels.
 */
export async function writeBundle(
	entries: AsyncIterable<BundleWriterEntry>,
): Promise<{ stream: ReadableStream<Uint8Array>; sha256: Promise<string> }> {
	const hash = createHash('sha256');
	const digest = deferredDigest();
	const chunks = gzipMember(tarBlocks(entries));
	const stream = new ReadableStream<Uint8Array>({
		pull: (controller) => pullInto(controller, chunks, hash, digest),
		cancel: async () => {
			digest.reject(new BundleWriteError('cancelled'));
			await chunks.return(undefined);
		},
	});
	return { stream, sha256: digest.promise };
}
