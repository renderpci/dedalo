/**
 * THE ENGINE'S ZIP ENCODER — a neutral kernel (no subsystem owns it): the
 * APPNOTE record encoders, the in-memory STORE archive (`buildStoreZip`, which
 * diffusion's `createZip` writes) and `openZipStream`, the streaming,
 * DEFLATE/STORE, ZIP64-capable writer (tool_export's XLSX / ODS / media ZIP).
 * One implementation, two drivers. Diffusion and the tools import it from
 * here; it imports nothing of theirs.
 *
 * ONE IN-PROCESS ZIP ENCODER — gated, not just stated:
 * test/unit/zip_encoder_census_tripwire.test.ts scans src/ and tools/ for ZIP
 * record emission (the local/central/end/descriptor signatures, raw DEFLATE,
 * a spawned `zip`/`git archive --format=zip`, a runtime `Bun.zip`) and
 * package.json for a ZIP library, and allows only this file plus the ledgered
 * exemptions it names (with reasons). A second encoder is red, not quiet.
 */

import { createDeflateRaw, deflateRawSync, crc32 as zlibCrc32 } from 'node:zlib';
import { DedaloError } from '../errors/index.ts';

/**
 * The in-memory archive (diffusion's `createZip`, src/diffusion/writers/files.ts):
 * method STORE, zeroed mod time/date,
 * entries in insertion order — deterministic bytes for identical inputs. Built
 * from the SAME record encoders as the streaming writer below (one ZIP
 * implementation, two drivers), so the diffusion archives keep their bytes
 * (gate: test/unit/zip_stream_native.test.ts pins them against the frozen
 * pre-upgrade writer) and gain what the encoders add: the UTF-8 name flag
 * (bit 11, set ONLY for a non-ASCII name — an ASCII-named archive is
 * byte-identical) and ZIP64 records past the 32/16-bit limits.
 */
export function buildStoreZip(entries: Record<string, Uint8Array>): Uint8Array {
	const parts: Uint8Array[] = [];
	const records: ZipCentralRecord[] = [];
	let offset = 0;
	for (const [name, data] of Object.entries(entries)) {
		const record: ZipCentralRecord = {
			nameBytes: TEXT_ENCODER.encode(name),
			flags: 0,
			method: ZIP_METHOD_STORE,
			dosTime: 0,
			dosDate: 0,
			crc: zipCrc32(data),
			compressedSize: data.byteLength,
			uncompressedSize: data.byteLength,
			offset,
			zip64Sizes: false,
		};
		record.flags = nameFlags(record.nameBytes);
		record.zip64Sizes = needsZip64(data.byteLength, ZIP64_DEFAULT_LIMITS.size);
		const header = encodeLocalHeader(record, record.zip64Sizes ? 'sizes' : 'none');
		parts.push(header, data);
		records.push(record);
		offset += header.byteLength + data.byteLength;
	}
	parts.push(...encodeCentralDirectory(records, offset, ZIP64_DEFAULT_LIMITS));
	return concatBytes(parts);
}

function concatBytes(arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((sum, array) => sum + array.length, 0);
	const out = new Uint8Array(total);
	let position = 0;
	for (const array of arrays) {
		out.set(array, position);
		position += array.length;
	}
	return out;
}

// ===========================================================================
// ZIP — the record encoders and the STREAMING writer
// ===========================================================================
//
// One ZIP implementation for the engine (APPNOTE 6.3.x). `createZip` above
// drives it in memory; `openZipStream` drives it onto a byte sink, entry by
// entry, in bounded memory whatever the archive's size:
//
//  - an entry's bytes go straight to the sink: `addEntry` (bytes in hand:
//    sizes + CRC in the local header, no data descriptor), `openEntry` /
//    `addStream` / `addDiskFile` (streamed: bit 3, CRC and sizes in a data
//    descriptor after the data);
//  - DEFLATE through node:zlib `createDeflateRaw` (streamed) or
//    `deflateRawSync` (bytes in hand), or STORE — per entry;
//  - ZIP64 exactly when needed: an entry size or local-header offset that
//    does not fit 32 bits, an entry count that does not fit 16 bits, or a
//    central directory size/offset past 32 bits. The thresholds are
//    injectable (`ZipStreamOptions.zip64Limits`) so a gate can drive every
//    ZIP64 record with a small archive; production uses the format's limits;
//  - names: UTF-8 bytes, flag bit 11 when non-ASCII; relative, '/'-separated,
//    no '.'/'..' segment; UNIQUE (case-insensitively — extractors on
//    case-insensitive filesystems would overwrite): a duplicate is refused or
//    renamed `name (2).ext` per `ZipStreamOptions.duplicates`.
//
// A streamed entry whose final size needs ZIP64 but was not DECLARED
// (`zip64: true` / `sizeHint`) still gets a correct central directory and an
// 8-byte data descriptor (Go archive/zip's posture): every central-directory
// reader (Info-ZIP, libarchive, Python, LibreOffice, Excel) reads it; only a
// forward-only streaming reader would need the declaration. Declare only on a
// KNOWN size (e.g. a disk file's stat), never on a guess: Excel prompts
// "repair" for an xlsx part whose local header carries a ZIP64 extra.

/** A byte sink the streaming writer appends to (artifact_store FileSink fits). */
export interface ZipByteSink {
	write(chunk: Uint8Array): Promise<void>;
}

/** Where ZIP64 starts: a value >= `size` / a count >= `count` needs it. */
export interface Zip64Limits {
	size: number;
	count: number;
}

/** The format's real limits (the sentinels 0xFFFFFFFF / 0xFFFF themselves need ZIP64). */
export const ZIP64_DEFAULT_LIMITS: Readonly<Zip64Limits> = Object.freeze({
	size: 0xffffffff,
	count: 0xffff,
});

export type ZipMethod = 'deflate' | 'store';

export interface ZipStreamOptions {
	/** TEST SEAM: lower ZIP64 thresholds. Default ZIP64_DEFAULT_LIMITS. */
	zip64Limits?: Partial<Zip64Limits>;
	/** Default DEFLATE level (0-9). Default 6. */
	deflateLevel?: number;
	/** A name already in the archive (case-insensitive): 'refuse' (default) or 'rename' to `name (n).ext`. */
	duplicates?: 'refuse' | 'rename';
}

export interface ZipEntryOptions {
	/** Default 'deflate'. */
	method?: ZipMethod;
	/** Entry mod time (DOS, UTC fields). Default: zeroed (deterministic archives). */
	modified?: Date;
	/** Streamed entries: declare ZIP64 up front (local extra + 8-byte descriptor). */
	zip64?: boolean;
	/** Streamed entries: an expected uncompressed size; >= the ZIP64 size limit declares ZIP64. */
	sizeHint?: number;
	/** DEFLATE level for this entry. */
	deflateLevel?: number;
}

export interface ZipEntryInfo {
	/** The name as stored (after a 'rename' de-duplication). */
	name: string;
	method: ZipMethod;
	crc32: number;
	compressedSize: number;
	uncompressedSize: number;
	/** Byte offset of the entry's local header. */
	offset: number;
	/** The entry carries ZIP64 records (sizes and/or offset). */
	zip64: boolean;
}

/** A streamed entry: write its bytes, then close it (or abort the archive). */
export interface ZipEntryStream {
	readonly name: string;
	write(chunk: Uint8Array | string): Promise<void>;
	close(): Promise<ZipEntryInfo>;
}

export interface ZipStreamResult {
	/** Archive bytes written to the sink. */
	bytes: number;
	entries: number;
	/** The archive carries the ZIP64 end records. */
	zip64: boolean;
}

export interface ZipStreamWriter {
	/** Bytes written to the sink so far. */
	readonly bytes: number;
	/** An entry whose bytes are in hand (sizes and CRC in the local header). */
	addEntry(
		name: string,
		data: Uint8Array | string,
		options?: ZipEntryOptions,
	): Promise<ZipEntryInfo>;
	/** Open a streamed entry (only one may be open at a time). */
	openEntry(name: string, options?: ZipEntryOptions): Promise<ZipEntryStream>;
	/** Stream an iterable of chunks into one entry. */
	addStream(
		name: string,
		source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
		options?: ZipEntryOptions,
	): Promise<ZipEntryInfo>;
	/** Stream a file from disk into one entry (bounded reads). */
	addDiskFile(name: string, path: string, options?: ZipEntryOptions): Promise<ZipEntryInfo>;
	/** Write the central directory and end records. Nothing may be added after. */
	finish(): Promise<ZipStreamResult>;
	/** Release an open entry's compressor; the archive is unusable afterwards (the caller discards the sink). */
	abort(): void;
}

const TEXT_ENCODER = new TextEncoder();
const ZIP_METHOD_STORE = 0;
const ZIP_METHOD_DEFLATE = 8;
const FLAG_DATA_DESCRIPTOR = 0x0008;
const FLAG_UTF8 = 0x0800;
const VERSION_DEFAULT = 20;
const VERSION_ZIP64 = 45;
const U32_SENTINEL = 0xffffffff;
const U16_SENTINEL = 0xffff;
/** Streamed entries hand the compressor chunks of about this size. */
const STREAM_CHUNK_BYTES = 64 * 1024;

/** What the central directory needs to know of one entry. */
interface ZipCentralRecord {
	nameBytes: Uint8Array;
	flags: number;
	method: number;
	dosTime: number;
	dosDate: number;
	crc: number;
	compressedSize: number;
	uncompressedSize: number;
	offset: number;
	/** Sizes travel in the ZIP64 extra (declared or needed). */
	zip64Sizes: boolean;
}

function needsZip64(value: number, limit: number): boolean {
	return value >= limit;
}

/** Bit 11 only for a non-ASCII name (keeps ASCII-named archives byte-stable). */
function nameFlags(nameBytes: Uint8Array): number {
	for (const byte of nameBytes) if (byte > 0x7f) return FLAG_UTF8;
	return 0;
}

/** A 32-bit size/offset field: the value, or the ZIP64 sentinel when it moved to the extra. */
function u32Field(wide: boolean, value: number): number {
	return wide ? U32_SENTINEL : value;
}

/** A 16-bit count field: the value, or the ZIP64 sentinel. */
function u16Field(wide: boolean, value: number): number {
	return wide ? U16_SENTINEL : value;
}

/** A streamed entry (bit 3): its CRC and sizes travel in the data descriptor. */
function isStreamed(record: ZipCentralRecord): boolean {
	return (record.flags & FLAG_DATA_DESCRIPTOR) !== 0;
}

/**
 * The ZIP64 extended-information extra field (header id 0x0001) at `at`: one
 * 8-byte value per field, in the order given. Nothing when there is no value.
 */
function writeZip64Extra(view: DataView, at: number, values: readonly number[]): void {
	if (values.length === 0) return;
	view.setUint16(at, 0x0001, true);
	view.setUint16(at + 2, 8 * values.length, true);
	let position = at + 4;
	for (const value of values) {
		view.setBigUint64(position, BigInt(value), true);
		position += 8;
	}
}

/** Standard CRC-32, incremental (`previous` = the running value). */
export function zipCrc32(data: Uint8Array, previous = 0): number {
	return zlibCrc32(data, previous) >>> 0;
}

/**
 * Local file header. `zip64`: 'none'; 'sizes' (bytes in hand: both sizes in
 * the extra, 0xFFFFFFFF in the header); 'declared' (streamed: extra with
 * zeroed sizes, the descriptor carries them).
 */
function encodeLocalHeader(
	record: ZipCentralRecord,
	zip64: 'none' | 'sizes' | 'declared',
): Uint8Array {
	const wide = zip64 !== 'none';
	const extra = localZip64Extra(record, zip64);
	const extraLength = extra.length === 0 ? 0 : 4 + 8 * extra.length;
	const view = new DataView(new ArrayBuffer(30 + record.nameBytes.length + extraLength));
	// a streamed entry's CRC and sizes are zero here (the descriptor has them)
	const known = isStreamed(record) ? 0 : 1;
	view.setUint32(0, 0x04034b50, true);
	view.setUint16(4, wide ? VERSION_ZIP64 : VERSION_DEFAULT, true);
	view.setUint16(6, record.flags, true);
	view.setUint16(8, record.method, true);
	view.setUint16(10, record.dosTime, true);
	view.setUint16(12, record.dosDate, true);
	view.setUint32(14, known * record.crc, true);
	view.setUint32(18, u32Field(wide, known * record.compressedSize), true);
	view.setUint32(22, u32Field(wide, known * record.uncompressedSize), true);
	view.setUint16(26, record.nameBytes.length, true);
	view.setUint16(28, extraLength, true);
	const bytes = new Uint8Array(view.buffer);
	bytes.set(record.nameBytes, 30);
	writeZip64Extra(view, 30 + record.nameBytes.length, extra);
	return bytes;
}

/**
 * The local header's ZIP64 extra values: none; both sizes ('sizes', bytes in
 * hand — uncompressed first, APPNOTE 4.5.3); or both zeroed ('declared',
 * streamed — the 8-byte descriptor carries them).
 */
function localZip64Extra(record: ZipCentralRecord, zip64: 'none' | 'sizes' | 'declared'): number[] {
	if (zip64 === 'none') return [];
	if (zip64 === 'declared') return [0, 0];
	return [record.uncompressedSize, record.compressedSize];
}

/** Data descriptor (signature form), 4- or 8-byte sizes. */
function encodeDataDescriptor(record: ZipCentralRecord, wide: boolean): Uint8Array {
	const view = new DataView(new ArrayBuffer(wide ? 24 : 16));
	view.setUint32(0, 0x08074b50, true);
	view.setUint32(4, record.crc, true);
	if (wide) {
		view.setBigUint64(8, BigInt(record.compressedSize), true);
		view.setBigUint64(16, BigInt(record.uncompressedSize), true);
	} else {
		view.setUint32(8, record.compressedSize, true);
		view.setUint32(12, record.uncompressedSize, true);
	}
	return new Uint8Array(view.buffer);
}

/** Central directory header; ZIP64 extra holds exactly the fields that overflow (APPNOTE 4.5.3 order). */
function encodeCentralHeader(record: ZipCentralRecord, limits: Zip64Limits): Uint8Array {
	const { wideSizes, wideOffset, extra } = centralZip64(record, limits);
	const extraLength = extra.length === 0 ? 0 : 4 + 8 * extra.length;
	const version = extraLength === 0 ? VERSION_DEFAULT : VERSION_ZIP64;
	const view = new DataView(new ArrayBuffer(46 + record.nameBytes.length + extraLength));
	view.setUint32(0, 0x02014b50, true);
	view.setUint16(4, version, true); // version made by (MS-DOS attribute host)
	view.setUint16(6, version, true); // version needed
	view.setUint16(8, record.flags, true);
	view.setUint16(10, record.method, true);
	view.setUint16(12, record.dosTime, true);
	view.setUint16(14, record.dosDate, true);
	view.setUint32(16, record.crc, true);
	view.setUint32(20, u32Field(wideSizes, record.compressedSize), true);
	view.setUint32(24, u32Field(wideSizes, record.uncompressedSize), true);
	view.setUint16(28, record.nameBytes.length, true);
	view.setUint16(30, extraLength, true);
	// comment length, disk start, internal + external attributes: all zero
	view.setUint32(42, u32Field(wideOffset, record.offset), true);
	const bytes = new Uint8Array(view.buffer);
	bytes.set(record.nameBytes, 46);
	writeZip64Extra(view, 46 + record.nameBytes.length, extra);
	return bytes;
}

/** Which central-header fields overflow into the ZIP64 extra, and its values (4.5.3 order). */
function centralZip64(
	record: ZipCentralRecord,
	limits: Zip64Limits,
): { wideSizes: boolean; wideOffset: boolean; extra: number[] } {
	const wideSizes =
		record.zip64Sizes ||
		needsZip64(record.uncompressedSize, limits.size) ||
		needsZip64(record.compressedSize, limits.size);
	const wideOffset = needsZip64(record.offset, limits.size);
	const extra: number[] = [];
	if (wideSizes) extra.push(record.uncompressedSize, record.compressedSize);
	if (wideOffset) extra.push(record.offset);
	return { wideSizes, wideOffset, extra };
}

/**
 * Central directory + (ZIP64 end record + locator when needed) + end record,
 * YIELDED one header at a time: the caller emits each before the next is
 * encoded, so finishing an archive of a million entries holds the (inherent)
 * records and ONE encoded header — never a second, encoded copy of the whole
 * directory. Returns whether the ZIP64 end record was written.
 */
function* encodeCentralDirectory(
	records: readonly ZipCentralRecord[],
	centralOffset: number,
	limits: Zip64Limits,
): Generator<Uint8Array, boolean, undefined> {
	let centralSize = 0;
	for (const record of records) {
		const header = encodeCentralHeader(record, limits);
		centralSize += header.byteLength;
		yield header;
	}
	const count = records.length;
	const wideCount = needsZip64(count, limits.count);
	const wideSize = needsZip64(centralSize, limits.size);
	const wideOffset = needsZip64(centralOffset, limits.size);
	const zip64 = wideCount || wideSize || wideOffset;
	if (zip64) yield* encodeZip64End(count, centralSize, centralOffset);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, u16Field(wideCount, count), true);
	end.setUint16(10, u16Field(wideCount, count), true);
	end.setUint32(12, u32Field(wideSize, centralSize), true);
	end.setUint32(16, u32Field(wideOffset, centralOffset), true);
	yield new Uint8Array(end.buffer);
	return zip64;
}

/** The ZIP64 end-of-central-directory record + its locator (APPNOTE 4.3.14 / 4.3.15). */
function encodeZip64End(count: number, centralSize: number, centralOffset: number): Uint8Array[] {
	const zip64EndOffset = centralOffset + centralSize;
	const end64 = new DataView(new ArrayBuffer(56));
	end64.setUint32(0, 0x06064b50, true);
	end64.setBigUint64(4, 44n, true); // size of the remaining record
	end64.setUint16(12, VERSION_ZIP64, true);
	end64.setUint16(14, VERSION_ZIP64, true);
	// disk numbers (16, 20): 0
	end64.setBigUint64(24, BigInt(count), true);
	end64.setBigUint64(32, BigInt(count), true);
	end64.setBigUint64(40, BigInt(centralSize), true);
	end64.setBigUint64(48, BigInt(centralOffset), true);
	const locator = new DataView(new ArrayBuffer(20));
	locator.setUint32(0, 0x07064b50, true);
	locator.setBigUint64(8, BigInt(zip64EndOffset), true);
	locator.setUint32(16, 1, true); // total disks
	return [new Uint8Array(end64.buffer), new Uint8Array(locator.buffer)];
}

/** DOS time/date from a Date's UTC fields (1980..2107; outside = zeroed). */
function dosDateTime(date: Date | undefined): { dosTime: number; dosDate: number } {
	if (!date || Number.isNaN(date.getTime())) return { dosTime: 0, dosDate: 0 };
	const year = date.getUTCFullYear();
	if (year < 1980 || year > 2107) return { dosTime: 0, dosDate: 0 };
	return {
		dosTime: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
		dosDate: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
	};
}

/**
 * A safe entry name: '/'-separated, relative, no empty/'.'/'..' segment, no
 * NUL, at most 65535 UTF-8 bytes. A directory entry (trailing '/') is not
 * supported — directories are implied by the file names.
 */
export function normalizeZipEntryName(name: string): string {
	const normalized = String(name).replace(/\\/g, '/');
	const segments = normalized.split('/');
	const bad =
		normalized === '' ||
		normalized.includes('\0') ||
		/^[A-Za-z]:/.test(normalized) ||
		segments.some((segment) => segment === '' || segment === '.' || segment === '..');
	if (bad || TEXT_ENCODER.encode(normalized).length > 0xffff) {
		throw new DedaloError('internal.invariant', {
			message: `zip: unsafe entry name '${normalized.slice(0, 120)}'`,
		});
	}
	return normalized;
}

/**
 * `photo.jpg` → `photo (2).jpg` (first free n, case-insensitive against `taken`).
 *
 * `nextIndex` (per writer) remembers, per lowercased name, the n the next
 * search starts from — without it the k-th duplicate re-tried 2..k, and N
 * same-named files (a media ZIP of legacy `1.jpg`s across buckets) cost O(N²)
 * probes on the shared event loop. The result is the same first free n: the
 * names below the remembered n were taken when it was recorded, and `taken`
 * only ever grows.
 */
export function uniqueZipEntryName(
	name: string,
	taken: ReadonlySet<string>,
	nextIndex?: Map<string, number>,
): string {
	if (!taken.has(name.toLowerCase())) return name;
	const slash = name.lastIndexOf('/');
	const dot = name.lastIndexOf('.');
	const cut = dot > slash + 1 ? dot : name.length;
	const stem = name.slice(0, cut);
	const extension = name.slice(cut);
	const key = name.toLowerCase();
	for (let n = nextIndex?.get(key) ?? 2; ; n++) {
		const candidate = `${stem} (${n})${extension}`;
		if (!taken.has(candidate.toLowerCase())) {
			nextIndex?.set(key, n + 1);
			return candidate;
		}
	}
}

/** A raw-DEFLATE compressor fed chunk by chunk; output collected between feeds. */
class DeflatePipe {
	private readonly stream: ReturnType<typeof createDeflateRaw>;
	private output: Uint8Array[] = [];
	private failure: unknown = null;

	constructor(level: number) {
		this.stream = createDeflateRaw({ level });
		this.stream.on('data', (chunk: Uint8Array) => this.output.push(chunk));
		this.stream.on('error', (error) => {
			this.failure = error;
		});
	}

	private take(): Uint8Array[] {
		if (this.failure) throw this.failure;
		const out = this.output;
		this.output = [];
		return out;
	}

	push(chunk: Uint8Array): Promise<Uint8Array[]> {
		return new Promise((resolvePush, rejectPush) => {
			this.stream.write(chunk, (error) => {
				if (error) rejectPush(error);
				else {
					try {
						resolvePush(this.take());
					} catch (failure) {
						rejectPush(failure);
					}
				}
			});
		});
	}

	end(): Promise<Uint8Array[]> {
		return new Promise((resolveEnd, rejectEnd) => {
			this.stream.once('end', () => {
				try {
					resolveEnd(this.take());
				} catch (failure) {
					rejectEnd(failure);
				}
			});
			this.stream.once('error', rejectEnd);
			this.stream.end();
		});
	}

	destroy(): void {
		this.stream.destroy();
	}
}

/** Bytes of an entry given in hand (a string is UTF-8). */
function toBytes(data: Uint8Array | string): Uint8Array {
	return typeof data === 'string' ? TEXT_ENCODER.encode(data) : data;
}

/** Does the entry DEFLATE (the default) or STORE? */
function isDeflate(entryOptions: ZipEntryOptions): boolean {
	return (entryOptions.method ?? 'deflate') === 'deflate';
}

/** The APPNOTE method code. */
function methodCode(deflate: boolean): number {
	return deflate ? ZIP_METHOD_DEFLATE : ZIP_METHOD_STORE;
}

/** A streamed entry declares ZIP64 up front: asked for, or a size hint past the limit. */
function declaresZip64(entryOptions: ZipEntryOptions, limits: Zip64Limits): boolean {
	return entryOptions.zip64 === true || needsZip64(entryOptions.sizeHint ?? 0, limits.size);
}

/** Open a streaming ZIP writer onto `sink`. */
export function openZipStream(sink: ZipByteSink, options: ZipStreamOptions = {}): ZipStreamWriter {
	const limits: Zip64Limits = { ...ZIP64_DEFAULT_LIMITS, ...(options.zip64Limits ?? {}) };
	const defaultLevel = options.deflateLevel ?? 6;
	const duplicates = options.duplicates ?? 'refuse';
	const records: ZipCentralRecord[] = [];
	const taken = new Set<string>();
	/** uniqueZipEntryName's per-name resume point (duplicates: 'rename'). */
	const renameNext = new Map<string, number>();
	let offset = 0;
	let open: { name: string; deflate: DeflatePipe | null } | null = null;
	let state: 'open' | 'finished' | 'aborted' = 'open';

	const emit = async (chunk: Uint8Array): Promise<void> => {
		if (chunk.byteLength === 0) return;
		await sink.write(chunk);
		offset += chunk.byteLength;
	};

	const assertWritable = (door: string): void => {
		if (state !== 'open' || open !== null) {
			throw new DedaloError('internal.invariant', {
				message: `zip.${door}: the archive is ${open ? `inside entry '${open.name}'` : state}`,
			});
		}
	};

	const claimName = (requested: string): string => {
		let name = normalizeZipEntryName(requested);
		if (taken.has(name.toLowerCase())) {
			if (duplicates === 'refuse') {
				throw new DedaloError('internal.invariant', {
					message: `zip: duplicate entry name '${name.slice(0, 120)}'`,
				});
			}
			name = uniqueZipEntryName(name, taken, renameNext);
		}
		taken.add(name.toLowerCase());
		return name;
	};

	/** An entry's DEFLATE level (its own, else the archive's). */
	const levelOf = (entryOptions: ZipEntryOptions): number =>
		entryOptions.deflateLevel ?? defaultLevel;

	const info = (name: string, record: ZipCentralRecord): ZipEntryInfo => ({
		name,
		method: record.method === ZIP_METHOD_DEFLATE ? 'deflate' : 'store',
		crc32: record.crc,
		compressedSize: record.compressedSize,
		uncompressedSize: record.uncompressedSize,
		offset: record.offset,
		zip64: record.zip64Sizes || needsZip64(record.offset, limits.size),
	});

	const writer: ZipStreamWriter = {
		get bytes() {
			return offset;
		},

		async addEntry(requestedName, data, entryOptions = {}) {
			assertWritable('addEntry');
			const name = claimName(requestedName);
			const raw = toBytes(data);
			const deflate = isDeflate(entryOptions);
			const payload = deflate ? deflateRawSync(raw, { level: levelOf(entryOptions) }) : raw;
			const nameBytes = TEXT_ENCODER.encode(name);
			const record: ZipCentralRecord = {
				nameBytes,
				flags: nameFlags(nameBytes),
				method: methodCode(deflate),
				...dosDateTime(entryOptions.modified),
				crc: zipCrc32(raw),
				compressedSize: payload.byteLength,
				uncompressedSize: raw.byteLength,
				offset,
				zip64Sizes:
					needsZip64(raw.byteLength, limits.size) || needsZip64(payload.byteLength, limits.size),
			};
			await emit(encodeLocalHeader(record, record.zip64Sizes ? 'sizes' : 'none'));
			await emit(payload);
			records.push(record);
			return info(name, record);
		},

		async openEntry(requestedName, entryOptions = {}) {
			assertWritable('openEntry');
			const name = claimName(requestedName);
			const nameBytes = TEXT_ENCODER.encode(name);
			const deflate = isDeflate(entryOptions);
			const declared = declaresZip64(entryOptions, limits);
			const record: ZipCentralRecord = {
				nameBytes,
				flags: nameFlags(nameBytes) | FLAG_DATA_DESCRIPTOR,
				method: methodCode(deflate),
				...dosDateTime(entryOptions.modified),
				crc: 0,
				compressedSize: 0,
				uncompressedSize: 0,
				offset,
				zip64Sizes: declared,
			};
			await emit(encodeLocalHeader(record, declared ? 'declared' : 'none'));
			const pipe = deflate ? new DeflatePipe(levelOf(entryOptions)) : null;
			const current = { name, deflate: pipe };
			open = current;
			let pendingText: string[] = [];
			let pendingTextLength = 0;
			let closed = false;

			const feed = async (bytes: Uint8Array): Promise<void> => {
				if (bytes.byteLength === 0) return;
				record.crc = zipCrc32(bytes, record.crc);
				record.uncompressedSize += bytes.byteLength;
				const out = pipe ? await pipe.push(bytes) : [bytes];
				for (const chunk of out) {
					record.compressedSize += chunk.byteLength;
					await emit(chunk);
				}
			};
			const flushText = async (): Promise<void> => {
				if (pendingTextLength === 0) return;
				const text = pendingText.join('');
				pendingText = [];
				pendingTextLength = 0;
				await feed(TEXT_ENCODER.encode(text));
			};
			const assertOpen = (): void => {
				if (closed || open !== current || state !== 'open') {
					throw new DedaloError('internal.invariant', {
						message: `zip: entry '${name.slice(0, 120)}' is not open`,
					});
				}
			};

			return {
				name,
				async write(chunk) {
					assertOpen();
					if (typeof chunk === 'string') {
						pendingText.push(chunk);
						pendingTextLength += chunk.length;
						if (pendingTextLength >= STREAM_CHUNK_BYTES) await flushText();
						return;
					}
					await flushText();
					await feed(chunk);
				},
				async close() {
					assertOpen();
					await flushText();
					if (pipe) {
						for (const chunk of await pipe.end()) {
							record.compressedSize += chunk.byteLength;
							await emit(chunk);
						}
					}
					closed = true;
					const overflow =
						needsZip64(record.uncompressedSize, limits.size) ||
						needsZip64(record.compressedSize, limits.size);
					record.zip64Sizes = declared || overflow;
					await emit(encodeDataDescriptor(record, record.zip64Sizes));
					records.push(record);
					open = null;
					return info(name, record);
				},
			};
		},

		async addStream(name, source, entryOptions) {
			const entry = await writer.openEntry(name, entryOptions);
			for await (const chunk of source as AsyncIterable<Uint8Array | string>) {
				await entry.write(chunk);
			}
			return entry.close();
		},

		async addDiskFile(name, path, entryOptions) {
			return writer.addStream(
				name,
				Bun.file(path).stream() as unknown as AsyncIterable<Uint8Array>,
				entryOptions,
			);
		},

		async finish() {
			assertWritable('finish');
			const centralOffset = offset;
			// Encode-and-emit, one header at a time (see encodeCentralDirectory).
			const tail = encodeCentralDirectory(records, centralOffset, limits);
			let zip64 = false;
			for (;;) {
				const step = tail.next();
				if (step.done === true) {
					zip64 = step.value;
					break;
				}
				await emit(step.value);
			}
			state = 'finished';
			return { bytes: offset, entries: records.length, zip64 };
		},

		abort() {
			open?.deflate?.destroy();
			open = null;
			state = 'aborted';
		},
	};
	return writer;
}
