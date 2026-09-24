/**
 * THE ENGINE'S ZIP WRITER — behavioural gate for src/core/files/zip.ts
 * (`openZipStream` + the record encoders diffusion's `createZip`,
 * src/diffusion/writers/files.ts, shares through `buildStoreZip`).
 *
 * What is asserted is OUTCOMES read back by an INDEPENDENT strict reader
 * (test/helpers/zip_xml_reader.ts — central directory, ZIP64 end/locator,
 * extras, CRC, data descriptors), never the writer's source spelling:
 *
 *  A. createZip bytes are UNCHANGED by the upgrade — pinned against a frozen
 *     copy of the pre-upgrade writer (the diffusion callers' archives);
 *  B. streamed + in-hand entries, DEFLATE and STORE, round-trip byte for byte;
 *     streamed entries are bit-3 + data descriptor, in-hand ones are not;
 *  C. ZIP64: every record (entry sizes declared and undeclared, local-header
 *     offsets, entry count, end record) driven with injected small limits;
 *  D. names: UTF-8 flag only when non-ASCII, uniqueness (case-insensitive,
 *     refuse / rename), unsafe names refused;
 *  E. misuse: two open entries, writes after finish — refused loudly.
 *
 * Scratch files live in a temp dir this file creates and sweeps.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { isDedaloError } from '../../src/core/errors/index.ts';
import {
	openZipStream,
	uniqueZipEntryName,
	type ZipStreamOptions,
} from '../../src/core/files/zip.ts';
import { createZip } from '../../src/diffusion/writers/files.ts';
import { readZip } from '../helpers/zip_xml_reader.ts';

const scratchDirs: string[] = [];
afterAll(() => {
	for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});
function scratch(): string {
	const dir = mkdtempSync(join(tmpdir(), 'dedalo_zip_stream_'));
	scratchDirs.push(dir);
	return dir;
}

/** An in-memory sink (FileSink-shaped). */
function memorySink() {
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	return {
		async write(chunk: Uint8Array) {
			chunks.push(new Uint8Array(chunk));
			bytes += chunk.byteLength;
		},
		get bytes() {
			return bytes;
		},
		result(): Uint8Array {
			return new Uint8Array(Buffer.concat(chunks));
		},
	};
}

/** Deterministic pseudo-random bytes (incompressible enough to exercise DEFLATE). */
function noise(length: number, seed = 7): Uint8Array {
	const out = new Uint8Array(length);
	let state = seed;
	for (let i = 0; i < length; i++) {
		state = (state * 1103515245 + 12345) >>> 0;
		out[i] = state >>> 24;
	}
	return out;
}

function expectDedalo(fn: () => unknown, code: string): Promise<void> {
	return (async () => {
		let caught: unknown = null;
		try {
			await fn();
		} catch (error) {
			caught = error;
		}
		expect(isDedaloError(caught), `expected ${code}, got ${String(caught)}`).toBe(true);
		expect((caught as { code: string }).code).toBe(code);
	})();
}

// ---------------------------------------------------------------------------
// FROZEN ORACLE — the pre-upgrade createZip writer (files.ts buildStoreZip as
// of 2026-09-22, verbatim in behaviour). Never edit: it IS the contract.
function legacyStoreZip(entries: Record<string, Uint8Array>): Uint8Array {
	const parts: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;
	const encoder = new TextEncoder();
	for (const [name, data] of Object.entries(entries)) {
		const nameBytes = encoder.encode(name);
		const crc = crc32(data) >>> 0;
		const size = data.byteLength;
		const local = new DataView(new ArrayBuffer(30 + nameBytes.length));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(4, 20, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, size, true);
		local.setUint32(22, size, true);
		local.setUint16(26, nameBytes.length, true);
		new Uint8Array(local.buffer).set(nameBytes, 30);
		parts.push(new Uint8Array(local.buffer), data);
		const entry = new DataView(new ArrayBuffer(46 + nameBytes.length));
		entry.setUint32(0, 0x02014b50, true);
		entry.setUint16(4, 20, true);
		entry.setUint16(6, 20, true);
		entry.setUint32(16, crc, true);
		entry.setUint32(20, size, true);
		entry.setUint32(24, size, true);
		entry.setUint16(28, nameBytes.length, true);
		entry.setUint32(42, offset, true);
		new Uint8Array(entry.buffer).set(nameBytes, 46);
		central.push(new Uint8Array(entry.buffer));
		offset += 30 + nameBytes.length + size;
	}
	const count = Object.keys(entries).length;
	const centralBytes = Buffer.concat(central);
	const end = new DataView(new ArrayBuffer(22));
	end.setUint32(0, 0x06054b50, true);
	end.setUint16(8, count, true);
	end.setUint16(10, count, true);
	end.setUint32(12, centralBytes.length, true);
	end.setUint32(16, offset, true);
	return new Uint8Array(Buffer.concat([...parts, centralBytes, new Uint8Array(end.buffer)]));
}

describe('A. createZip bytes are unchanged by the upgrade', () => {
	test('ASCII names: byte-identical to the frozen pre-upgrade writer', async () => {
		const dir = scratch();
		const files: Record<string, Uint8Array> = {
			'diffusion_json.json': new TextEncoder().encode('{"a":1}\n'),
			'fwt23_1.md': new TextEncoder().encode('# one\n'),
			'empty.txt': new Uint8Array(0),
			'blob.bin': noise(70_000),
		};
		for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
		const paths = Object.keys(files).map((name) => join(dir, name));
		await createZip(paths, join(dir, 'out.zip'));
		const built = new Uint8Array(readFileSync(join(dir, 'out.zip')));
		expect(Buffer.from(built).equals(Buffer.from(legacyStoreZip(files)))).toBe(true);
		// and it still reads back
		const read = readZip(built);
		expect(read.entries.map((e) => e.name)).toEqual(Object.keys(files));
		expect(read.entries.every((e) => e.method === 0 && e.flags === 0)).toBe(true);
	});

	test('a non-ASCII name: the ONLY change is the UTF-8 flag (bit 11) on its two headers', async () => {
		const dir = scratch();
		const files: Record<string, Uint8Array> = {
			'plain.txt': new TextEncoder().encode('p'),
			'moneda_ñ.xml': new TextEncoder().encode('<a/>'),
		};
		for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, name), data);
		await createZip(
			Object.keys(files).map((name) => join(dir, name)),
			join(dir, 'out.zip'),
		);
		const built = new Uint8Array(readFileSync(join(dir, 'out.zip')));
		const legacy = legacyStoreZip(files);
		expect(built.length).toBe(legacy.length);
		const differing: number[] = [];
		for (let i = 0; i < built.length; i++) if (built[i] !== legacy[i]) differing.push(i);
		const read = readZip(built);
		const flagged = read.entries.find((e) => e.name === 'moneda_ñ.xml');
		expect(flagged?.flags).toBe(0x0800);
		const centralAt = built.length - 22 - (46 * 2 + 9 + 'moneda_ñ.xml'.length + 1);
		// local header flags byte (offset+7) and central header flags byte (+9)
		expect(differing).toEqual([
			(flagged?.offset ?? 0) + 7,
			centralAt + 46 + 'plain.txt'.length + 9,
		]);
	});
});

describe('B. streamed and in-hand entries round-trip', () => {
	test('DEFLATE + STORE, text + bytes, streamed + in hand, from disk', async () => {
		const dir = scratch();
		const onDisk = noise(300_000, 3);
		writeFileSync(join(dir, 'photo.bin'), onDisk);
		const big = noise(1_000_000, 11);
		const sink = memorySink();
		const zip = openZipStream(sink);
		await zip.addEntry('mimetype', 'application/x-test', { method: 'store' });
		await zip.addEntry('in_hand.xml', '<a>título</a>'.repeat(1000));
		const streamed = await zip.openEntry('stream/deflated.bin');
		for (let at = 0; at < big.length; at += 77_777)
			await streamed.write(big.subarray(at, at + 77_777));
		const info = await streamed.close();
		const text = await zip.openEntry('stream/text.xml');
		for (let i = 0; i < 20_000; i++) await text.write(`<r n="${i}">ç ${i}</r>`);
		await text.close();
		await zip.addStream('stored_stream.bin', [big.subarray(0, 1000), 'tail'], { method: 'store' });
		await zip.addDiskFile('media/photo.bin', join(dir, 'photo.bin'), { method: 'store' });
		const result = await zip.finish();

		const bytes = sink.result();
		expect(result.bytes).toBe(bytes.length);
		expect(result.entries).toBe(6);
		expect(result.zip64).toBe(false);
		const read = readZip(bytes);
		const byName = new Map(read.entries.map((e) => [e.name, e]));
		expect([...byName.keys()]).toEqual([
			'mimetype',
			'in_hand.xml',
			'stream/deflated.bin',
			'stream/text.xml',
			'stored_stream.bin',
			'media/photo.bin',
		]);
		// in hand: no descriptor, sizes in the header; streamed: bit 3 + descriptor
		expect(byName.get('mimetype')?.flags).toBe(0);
		expect(byName.get('mimetype')?.method).toBe(0);
		expect(byName.get('mimetype')?.localExtraLength).toBe(0);
		expect(byName.get('in_hand.xml')?.method).toBe(8);
		expect(byName.get('stream/deflated.bin')?.flags).toBe(0x0008);
		expect(byName.get('stream/deflated.bin')?.wideDescriptor).toBe(false);
		expect(
			Buffer.from(byName.get('stream/deflated.bin')?.data ?? []).equals(Buffer.from(big)),
		).toBe(true);
		expect(info.uncompressedSize).toBe(big.length);
		expect(info.crc32).toBe(crc32(big) >>> 0);
		const textEntry = new TextDecoder().decode(byName.get('stream/text.xml')?.data);
		expect(textEntry.startsWith('<r n="0">ç 0</r>')).toBe(true);
		expect(textEntry.endsWith('<r n="19999">ç 19999</r>')).toBe(true);
		// compressible text really is compressed
		expect(
			(byName.get('stream/text.xml')?.compressedSize ?? 0) <
				(byName.get('stream/text.xml')?.uncompressedSize ?? 0) / 3,
		).toBe(true);
		expect(new TextDecoder().decode(byName.get('stored_stream.bin')?.data).endsWith('tail')).toBe(
			true,
		);
		expect(byName.get('stored_stream.bin')?.method).toBe(0);
		expect(Buffer.from(byName.get('media/photo.bin')?.data ?? []).equals(Buffer.from(onDisk))).toBe(
			true,
		);
	});

	test('mod time: zeroed by default (deterministic), DOS-encoded when given', async () => {
		const run = async (modified?: Date) => {
			const sink = memorySink();
			const zip = openZipStream(sink);
			await zip.addEntry('a.txt', 'a', modified ? { modified } : {});
			await zip.finish();
			return sink.result();
		};
		const one = await run();
		const two = await run();
		expect(Buffer.from(one).equals(Buffer.from(two))).toBe(true);
		const dated = await run(new Date(Date.UTC(2026, 8, 23, 10, 30, 4)));
		const view = new DataView(dated.buffer, dated.byteOffset);
		expect(view.getUint16(10, true)).toBe((10 << 11) | (30 << 5) | 2);
		expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (9 << 5) | 23);
	});
});

describe('C. ZIP64, driven with injected small limits', () => {
	const small: ZipStreamOptions = { zip64Limits: { size: 1000, count: 3 } };

	test('sizes (in hand + streamed, declared + undeclared), offsets, count, end record', async () => {
		const sink = memorySink();
		const zip = openZipStream(sink, small);
		const big = noise(5000, 5);
		await zip.addEntry('small.txt', 'tiny'); // below every limit, at offset 0
		await zip.addEntry('big_in_hand.bin', big, { method: 'store' }); // sizes >= limit
		const declared = await zip.openEntry('declared.bin', { zip64: true, method: 'store' });
		await declared.write(noise(10, 2));
		await declared.close();
		const hinted = await zip.openEntry('hinted.bin', { sizeHint: 10_000 });
		await hinted.write('x');
		await hinted.close();
		const undeclared = await zip.openEntry('undeclared.bin', { method: 'store' });
		await undeclared.write(big);
		const undeclaredInfo = await undeclared.close();
		await zip.addEntry('late.txt', 'offset past the limit');
		const result = await zip.finish();
		expect(result.zip64).toBe(true);
		expect(undeclaredInfo.zip64).toBe(true);

		const read = readZip(sink.result());
		expect(read.zip64End).toBe(true);
		expect(read.count).toBe(6);
		const by = new Map(read.entries.map((e) => [e.name, e]));
		expect(by.get('small.txt')?.centralZip64).toBe(false);
		expect(by.get('small.txt')?.versionNeeded).toBe(20);
		expect(by.get('big_in_hand.bin')?.localZip64).toBe(true);
		expect(by.get('big_in_hand.bin')?.centralZip64).toBe(true);
		expect(Buffer.from(by.get('big_in_hand.bin')?.data ?? []).equals(Buffer.from(big))).toBe(true);
		expect(by.get('declared.bin')?.localZip64).toBe(true);
		expect(by.get('declared.bin')?.wideDescriptor).toBe(true);
		expect(by.get('hinted.bin')?.localZip64).toBe(true);
		expect(by.get('hinted.bin')?.wideDescriptor).toBe(true);
		// undeclared overflow: no local extra, but an 8-byte descriptor + central extra
		expect(by.get('undeclared.bin')?.localZip64).toBe(false);
		expect(by.get('undeclared.bin')?.wideDescriptor).toBe(true);
		expect(by.get('undeclared.bin')?.centralZip64).toBe(true);
		// a small entry whose local header sits past the limit: offset-only ZIP64 extra
		expect(by.get('late.txt')?.offset).toBeGreaterThan(1000);
		expect(by.get('late.txt')?.centralZip64).toBe(true);
		expect(by.get('late.txt')?.localZip64).toBe(false);
		expect(new TextDecoder().decode(by.get('late.txt')?.data)).toBe('offset past the limit');
	});

	test('the real limits: no ZIP64 records for an ordinary archive', async () => {
		const sink = memorySink();
		const zip = openZipStream(sink);
		for (let i = 0; i < 5; i++) await zip.addEntry(`f${i}.txt`, 'x'.repeat(2000));
		const result = await zip.finish();
		expect(result.zip64).toBe(false);
		const read = readZip(sink.result());
		expect(read.zip64End).toBe(false);
		expect(read.entries.some((e) => e.centralZip64 || e.localZip64)).toBe(false);
	});

	test('count alone (65535+ entries at the real limit) switches to the ZIP64 end record', async () => {
		const sink = memorySink();
		const zip = openZipStream(sink, { zip64Limits: { count: 4 } });
		for (let i = 0; i < 4; i++) await zip.addEntry(`n${i}`, '');
		expect((await zip.finish()).zip64).toBe(true);
		const bytes = sink.result();
		const read = readZip(bytes);
		expect(read.count).toBe(4);
		// the 16-bit count fields carry the sentinel
		const view = new DataView(bytes.buffer, bytes.byteOffset);
		expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(0xffff);
	});
});

describe('D. names', () => {
	test('UTF-8 flag only for non-ASCII names', async () => {
		const sink = memorySink();
		const zip = openZipStream(sink);
		await zip.addEntry('ascii.txt', 'a');
		const stream = await zip.openEntry('ñandú/año.txt');
		await stream.write('b');
		await stream.close();
		await zip.finish();
		const read = readZip(sink.result());
		expect(read.entries.map((e) => [e.name, e.flags & 0x0800])).toEqual([
			['ascii.txt', 0],
			['ñandú/año.txt', 0x0800],
		]);
	});

	test('duplicates: refused by default, renamed on request (case-insensitive)', async () => {
		const refusing = openZipStream(memorySink());
		await refusing.addEntry('Photo.JPG', 'a');
		await expectDedalo(() => refusing.addEntry('photo.jpg', 'b'), 'internal.invariant');

		const sink = memorySink();
		const renaming = openZipStream(sink, { duplicates: 'rename' });
		const names: string[] = [];
		names.push((await renaming.addEntry('media/Photo.JPG', 'a')).name);
		names.push((await renaming.addEntry('media/photo.jpg', 'b')).name);
		names.push((await renaming.addEntry('media/photo.jpg', 'c')).name);
		names.push((await renaming.addEntry('media/photo (2).jpg', 'd')).name);
		names.push((await renaming.addEntry('media/noext', 'e')).name);
		names.push((await renaming.addEntry('media/NOEXT', 'f')).name);
		await renaming.finish();
		expect(names).toEqual([
			'media/Photo.JPG',
			'media/photo (2).jpg',
			'media/photo (3).jpg',
			'media/photo (2) (2).jpg',
			'media/noext',
			'media/NOEXT (2)',
		]);
		const read = readZip(sink.result());
		expect(new Set(read.entries.map((e) => e.name.toLowerCase())).size).toBe(6);
		expect(uniqueZipEntryName('a.b/c', new Set(['a.b/c']))).toBe('a.b/c (2)');
	});

	test('N same-named duplicates are renamed in O(N) probes (never re-trying 2..k for the k-th)', () => {
		const taken = new Set<string>();
		let probes = 0;
		const counting: ReadonlySet<string> = {
			has: (key: string) => {
				probes++;
				return taken.has(key);
			},
		} as ReadonlySet<string>;
		const next = new Map<string, number>();
		const names: string[] = [];
		const total = 2000;
		for (let k = 0; k < total; k++) {
			const name = uniqueZipEntryName('1.JPG', counting, next);
			taken.add(name.toLowerCase());
			names.push(name);
		}
		// the same first-free sequence the unmemoized rule gives
		expect(names.slice(0, 4)).toEqual(['1.JPG', '1 (2).JPG', '1 (3).JPG', '1 (4).JPG']);
		expect(names.at(-1)).toBe(`1 (${total}).JPG`);
		expect(new Set(names).size).toBe(total);
		// linear: about two probes per name (quadratic would be ~total²/2)
		expect(probes).toBeLessThan(total * 3);
		// a name taken out of band in between is still skipped (first FREE n)
		taken.add('1 (2001).jpg');
		expect(uniqueZipEntryName('1.jpg', counting, next)).toBe('1 (2002).jpg');
	});

	test('unsafe names are refused before a byte is written', async () => {
		for (const bad of [
			'',
			'/abs.txt',
			'../up.txt',
			'a/../b',
			'a//b',
			'./a',
			'C:/x',
			'dir/',
			'nul\0',
		]) {
			const sink = memorySink();
			const zip = openZipStream(sink);
			await expectDedalo(() => zip.addEntry(bad, 'x'), 'internal.invariant');
			await expectDedalo(() => zip.openEntry(bad), 'internal.invariant');
			expect(sink.bytes).toBe(0);
		}
		// backslashes become '/'
		const sink = memorySink();
		const zip = openZipStream(sink);
		expect((await zip.addEntry('win\\path.txt', 'x')).name).toBe('win/path.txt');
	});
});

describe('E. misuse is loud', () => {
	test('one open entry at a time; nothing after finish; abort releases', async () => {
		const zip = openZipStream(memorySink());
		const first = await zip.openEntry('a.txt');
		await expectDedalo(() => zip.openEntry('b.txt'), 'internal.invariant');
		await expectDedalo(() => zip.addEntry('c.txt', 'x'), 'internal.invariant');
		await expectDedalo(() => zip.finish(), 'internal.invariant');
		await first.write('a');
		await first.close();
		await expectDedalo(() => first.write('late'), 'internal.invariant');
		await zip.finish();
		await expectDedalo(() => zip.addEntry('d.txt', 'x'), 'internal.invariant');

		const aborted = openZipStream(memorySink());
		const open = await aborted.openEntry('x.txt');
		await open.write('partial');
		aborted.abort();
		await expectDedalo(() => open.write('more'), 'internal.invariant');
		await expectDedalo(() => aborted.finish(), 'internal.invariant');
	});
});
