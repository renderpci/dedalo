/**
 * THE ENGINE'S BUNDLE WRITER, HELD ON ITS OWN BYTES (publication host phase 4, L4).
 *
 * src/core/publication_host/bundle_writer.ts produces the release bundle the publication
 * agent installs. This gate reads the bytes back WITHOUT the agent (the agent round trip is
 * test/unit/publication_host_bundle_twin_tripwire.test.ts) and pins:
 *   - the gzip frame: the fixed 10-byte header (mtime 0, OS 255), a CRC-32 + ISIZE trailer
 *     that match the archive, and a member any gunzip accepts;
 *   - every ustar header: POSIX magic, uid/gid/mtime 0, empty owner names, a valid checksum,
 *     modes normalized to 0644/0755, type `0`/`5`/`x` only, PAX `path` only past 100 bytes;
 *   - determinism: the same entries give the same bytes however the data streams are
 *     chunked, and the uncompressed archive has a golden sha256;
 *   - tree order (`compareBundlePaths`) and every refusal, each surfacing on the stream AND
 *     on the `sha256` promise.
 *
 * HERMETIC: in-memory only. No DB, no network, no filesystem.
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import {
	BUNDLE_MAX_ENTRY_BYTES,
	BundleWriteError,
	type BundleWriteReason,
	type BundleWriterEntry,
	compareBundlePaths,
	GZIP_HEADER_BYTES,
	paxPathRecord,
	writeBundle,
} from '../../src/core/publication_host/bundle_writer.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();
const text = (value: string): Uint8Array<ArrayBuffer> => enc.encode(value);
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

async function* listOf(entries: readonly BundleWriterEntry[]): AsyncGenerator<BundleWriterEntry> {
	for (const entry of entries) yield entry;
}

function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
	let offset = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (offset >= bytes.length) {
				controller.close();
				return;
			}
			controller.enqueue(bytes.slice(offset, offset + size));
			offset += size;
		},
	});
}

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
	const parts: Uint8Array[] = [];
	const reader = stream.getReader();
	for (;;) {
		const next = await reader.read();
		if (next.done) break;
		parts.push(next.value);
	}
	return new Uint8Array(Buffer.concat(parts));
}

async function bundleOf(
	entries: readonly BundleWriterEntry[],
): Promise<{ bytes: Uint8Array<ArrayBuffer>; sha256: string }> {
	const out = await writeBundle(listOf(entries));
	const bytes = await drain(out.stream);
	return { bytes, sha256: await out.sha256 };
}

interface Header {
	name: string;
	mode: number;
	uid: number;
	gid: number;
	size: number;
	mtime: number;
	type: string;
	magic: string;
	uname: string;
	gname: string;
	prefix: string;
	checksumOk: boolean;
	data: Uint8Array;
}

const zstr = (b: Uint8Array): string => {
	const nul = b.indexOf(0);
	return dec.decode(nul === -1 ? b : b.subarray(0, nul));
};
const oct = (b: Uint8Array): number => Number.parseInt(zstr(b).trim() || '0', 8);

/** Every header of an uncompressed archive, with its data; stops at the first zero block. */
function headers(tar: Uint8Array): Header[] {
	const out: Header[] = [];
	let off = 0;
	while (off + 512 <= tar.length && tar.subarray(off, off + 512).some((b) => b !== 0)) {
		const h = tar.subarray(off, off + 512);
		let sum = 0;
		for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 0x20 : (h[i] as number);
		const size = oct(h.subarray(124, 136));
		out.push({
			name: zstr(h.subarray(0, 100)),
			mode: oct(h.subarray(100, 108)),
			uid: oct(h.subarray(108, 116)),
			gid: oct(h.subarray(116, 124)),
			size,
			mtime: oct(h.subarray(136, 148)),
			type: String.fromCharCode(h[156] as number),
			magic: dec.decode(h.subarray(257, 265)),
			uname: zstr(h.subarray(265, 297)),
			gname: zstr(h.subarray(297, 329)),
			prefix: zstr(h.subarray(345, 500)),
			checksumOk: oct(h.subarray(148, 156)) === sum,
			data: tar.slice(off + 512, off + 512 + size),
		});
		off += 512 + Math.ceil(size / 512) * 512;
	}
	return out;
}

/** The fixture every determinism test writes: a dir, a text file, an exec file, a 3000-byte file. */
const BIG = Uint8Array.from({ length: 3000 }, (_, i) => (i * 31 + 7) % 251);
const FIXTURE: readonly BundleWriterEntry[] = [
	{ path: 'bin', type: 'dir', mode: 0o700 },
	{ path: 'bin/run', type: 'file', mode: 0o4750, data: text('#!/bin/sh\n') },
	{ path: 'data.bin', type: 'file', mode: 0o600, data: BIG },
	{ path: 'empty', type: 'file', mode: 0o644 },
];

/** GOLDEN: sha256 of the UNCOMPRESSED archive of FIXTURE. Pure format; no zlib in it. */
const FIXTURE_TAR_SHA256 = '87ea12898f1551ef49c990d223fc10a696eeab2544bca18570dd2a74c87462ac';

describe('bundle writer — the gzip frame', () => {
	test('fixed header, matching CRC-32/ISIZE trailer, a member gunzip accepts', async () => {
		const { bytes, sha256 } = await bundleOf(FIXTURE);
		// Spelled out, not read from GZIP_HEADER_BYTES: a gate comparing a constant to itself pins nothing.
		expect([...bytes.subarray(0, 10)]).toEqual([0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x00, 0xff]);
		expect([...bytes.subarray(0, 10)]).toEqual([...GZIP_HEADER_BYTES]);
		const tar = Bun.gunzipSync(bytes);
		const view = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 8, 8);
		expect(view.getUint32(0, true)).toBe(crc32(tar));
		expect(view.getUint32(4, true)).toBe(tar.length);
		expect(sha256).toBe(sha(bytes));
		expect(tar.length % 512).toBe(0);
		expect(tar.subarray(tar.length - 1024).every((b) => b === 0)).toBe(true);
	});
});

describe('bundle writer — headers', () => {
	test('POSIX magic, owner/time zeroed, checksum valid, modes normalized, types 0/5', async () => {
		const tar = Bun.gunzipSync((await bundleOf(FIXTURE)).bytes);
		const hs = headers(tar);
		expect(hs.map((h) => [h.name, h.type, h.mode, h.size])).toEqual([
			['bin/', '5', 0o755, 0],
			['bin/run', '0', 0o755, 10],
			['data.bin', '0', 0o644, 3000],
			['empty', '0', 0o644, 0],
		]);
		for (const h of hs) {
			expect(h).toMatchObject({
				uid: 0,
				gid: 0,
				mtime: 0,
				magic: 'ustar\u000000',
				uname: '',
				gname: '',
				prefix: '',
			});
			expect(h.checksumOk).toBe(true);
		}
		expect(hs[2]?.data).toEqual(BIG);
	});

	test('PAX `path` exactly past 100 bytes (a dir counts its `/`), name cut on a UTF-8 boundary', async () => {
		const at100 = 'f'.repeat(100);
		const dir99 = 'd'.repeat(99);
		const dir100 = 'e'.repeat(100);
		const wide = `${'é'.repeat(60)}.txt`; // 124 bytes: the 100-byte cut falls inside no 'é'
		const odd = `x${'é'.repeat(60)}`; // 121 bytes: byte 100 is the 2nd byte of an 'é'
		const entries: BundleWriterEntry[] = [
			{ path: dir99, type: 'dir', mode: 0o755 },
			{ path: dir100, type: 'dir', mode: 0o755 },
			{ path: at100, type: 'file', mode: 0o644, data: text('a') },
			{ path: `${'f'.repeat(101)}`, type: 'file', mode: 0o644, data: text('b') },
			{ path: odd, type: 'file', mode: 0o644, data: text('c') },
			{ path: wide, type: 'file', mode: 0o644, data: text('d') },
		].sort((a, b) => compareBundlePaths(a.path, b.path)) as BundleWriterEntry[];
		const hs = headers(Bun.gunzipSync((await bundleOf(entries)).bytes));
		const pax = hs.filter((h) => h.type === 'x');
		expect(pax.map((h) => dec.decode(h.data))).toEqual(
			[`${dir100}/`, 'f'.repeat(101), odd, wide].map((p) => dec.decode(paxPathRecord(text(p)))),
		);
		for (const h of pax)
			expect(h).toMatchObject({ name: 'PaxHeader', mode: 0o644, uid: 0, mtime: 0 });
		const plain = hs.filter((h) => h.type !== 'x').map((h) => h.name);
		expect(plain).toContain(`${dir99}/`);
		expect(plain).toContain(at100);
		for (const name of plain) expect(enc.encode(name).length).toBeLessThanOrEqual(100);
		expect(plain).toContain(`x${'é'.repeat(49)}`); // 99 bytes: the half 'é' at byte 100 is dropped
	});

	test('a PAX record counts its own length in bytes, digit rollover included', () => {
		for (const n of [1, 85, 86, 87, 990, 991, 992, 1024]) {
			const record = paxPathRecord(text('p'.repeat(n)));
			const [len] = dec.decode(record).split(' ');
			expect(Number(len)).toBe(record.length);
			expect(dec.decode(record).endsWith(`path=${'p'.repeat(n)}\n`)).toBe(true);
		}
	});
});

describe('bundle writer — determinism', () => {
	test('stream chunking never changes a byte; Uint8Array and stream data agree; golden archive', async () => {
		const reference = await bundleOf(FIXTURE);
		for (const size of [1, 7, 512, 4096]) {
			const streamed = FIXTURE.map((e) =>
				e.data instanceof Uint8Array
					? { ...e, data: chunked(e.data, size), size: e.data.length }
					: e,
			);
			const again = await bundleOf(streamed);
			expect(again.sha256).toBe(reference.sha256);
			expect(again.bytes).toEqual(reference.bytes);
		}
		expect(sha(Bun.gunzipSync(reference.bytes))).toBe(FIXTURE_TAR_SHA256);
	});
});

describe('bundle writer — tree order', () => {
	test('segment by segment, UTF-8 bytes: a parent, its contents, then its next sibling', () => {
		const paths = ['a-b', 'a/x', 'b', 'a', 'a/x/y', 'B', 'é', 'z', 'a/w'];
		expect([...paths].sort(compareBundlePaths)).toEqual([
			'B',
			'a',
			'a/w',
			'a/x',
			'a/x/y',
			'a-b',
			'b',
			'z',
			'é',
		]);
		expect(compareBundlePaths('a', 'a')).toBe(0);
	});
});

describe('bundle writer — refusals surface on the stream AND on sha256', () => {
	const ok: BundleWriterEntry = { path: 'ok', type: 'file', mode: 0o644, data: text('ok') };
	const cases: Array<[string, BundleWriterEntry[], BundleWriteReason]> = [
		['absolute path', [{ ...ok, path: '/etc/x' }], 'absolute_path'],
		['.. segment', [{ ...ok, path: 'a/../b' }], 'dot_segment'],
		['. segment', [{ ...ok, path: './a' }], 'dot_segment'],
		['empty segment', [{ ...ok, path: 'a//b' }], 'dot_segment'],
		['trailing slash', [{ ...ok, path: 'a/' }], 'dot_segment'],
		['empty path', [{ ...ok, path: '' }], 'dot_segment'],
		['backslash', [{ ...ok, path: 'a\\b' }], 'bad_char'],
		['control character', [{ ...ok, path: 'a\nb' }], 'bad_char'],
		['DEL', [{ ...ok, path: 'a\u007fb' }], 'bad_char'],
		['lone surrogate', [{ ...ok, path: 'a\ud800b' }], 'bad_char'],
		['path over 1024 bytes', [{ ...ok, path: `${'p/'.repeat(512)}p` }], 'path_too_long'],
		[
			'dir whose `/` passes 1024 bytes',
			[{ path: `${'q/'.repeat(511)}qq`, type: 'dir', mode: 0o755 }],
			'path_too_long',
		],
		['segment over 255 bytes', [{ ...ok, path: 's'.repeat(256) }], 'path_too_long'],
		['duplicate', [ok, ok], 'not_ascending'],
		['dir and file of one name', [{ path: 'ok', type: 'dir', mode: 0o755 }, ok], 'not_ascending'],
		[
			'out of tree order',
			[
				{ ...ok, path: 'b' },
				{ ...ok, path: 'a' },
			],
			'not_ascending',
		],
		[
			'parent after its contents',
			[
				{ ...ok, path: 'd/f' },
				{ path: 'd', type: 'dir', mode: 0o755 },
			],
			'not_ascending',
		],
		['entry under a file', [ok, { ...ok, path: 'ok/child' }], 'file_as_dir'],
		['dir with data', [{ path: 'd', type: 'dir', mode: 0o755, data: text('x') }], 'dir_with_data'],
		['dir with a size', [{ path: 'd', type: 'dir', mode: 0o755, size: 1 }], 'dir_with_data'],
		['stream without size', [{ ...ok, data: chunked(text('x'), 1) }], 'size_missing'],
		['bytes and a different size', [{ ...ok, size: 3 }], 'size_mismatch'],
		[
			'size without data (header would frame bytes never written)',
			[{ path: 'ok', type: 'file', mode: 0o644, size: 3 }],
			'size_mismatch',
		],
		[
			'hostile path after a valid entry → its own reason, not order',
			[ok, { ...ok, path: '../x' }],
			'dot_segment',
		],
		['negative size', [{ ...ok, data: chunked(text(''), 1), size: -1 }], 'size_mismatch'],
		[
			'stream shorter than size',
			[{ ...ok, data: chunked(text('abc'), 1), size: 4 }],
			'size_mismatch',
		],
		[
			'stream longer than size',
			[{ ...ok, data: chunked(text('abcde'), 2), size: 4 }],
			'size_mismatch',
		],
		[
			'size past the octal field',
			[{ ...ok, data: chunked(text(''), 1), size: BUNDLE_MAX_ENTRY_BYTES + 1 }],
			'too_large',
		],
	];
	for (const [name, entries, reason] of cases) {
		test(`${name} → ${reason}`, async () => {
			const out = await writeBundle(listOf(entries));
			const streamErr = await drain(out.stream).then(
				() => null,
				(e: unknown) => e,
			);
			const shaErr = await out.sha256.then(
				() => null,
				(e: unknown) => e,
			);
			expect(streamErr).toBeInstanceOf(BundleWriteError);
			expect((streamErr as BundleWriteError).reason).toBe(reason);
			expect(shaErr).toBe(streamErr);
		});
	}

	test('a reader that cancels gets `cancelled` on sha256', async () => {
		const out = await writeBundle(listOf(FIXTURE));
		const reader = out.stream.getReader();
		await reader.read();
		await reader.cancel();
		const err = await out.sha256.then(
			() => null,
			(e: unknown) => e,
		);
		expect((err as BundleWriteError).reason).toBe('cancelled');
	});
});
