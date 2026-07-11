/**
 * Phase F gate: the upload receiver (multipart parse, MIME sniff, chunked join
 * + SEC-066 re-sniff) + the full ingest chain (upload → add_file → regenerate),
 * with a REAL image, against a scratch root. Also pins the fail-closed security
 * behaviors: wrong extension, polyglot chunk assembly.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/config.ts';
import { mediaTypeOf } from '../../src/core/concepts/media.ts';
import { resolveMagick } from '../../src/core/media/engine/imagemagick.ts';
import { runBinary } from '../../src/core/media/engine/spawn.ts';
import { addFile, stagingDir } from '../../src/core/media/ingest/add_file.ts';
import { processUploadedFile } from '../../src/core/media/ingest/process_uploaded_file.ts';
import {
	type ParsedUpload,
	joinChunkedUpload,
	parseUploadRequest,
	receiveUpload,
} from '../../src/core/media/ingest/upload.ts';
import type { MediaIdentity, MediaPathOptions } from '../../src/core/media/path.ts';

const ROOT = `${tmpdir()}/dedalo_media_upload_${process.pid}`;
const image = mediaTypeOf('component_image')!;
const HAVE_MAGICK = existsSync(resolveMagick());
const USER = 3;
const pathOpts: MediaPathOptions = { initialMediaPath: '', maxItemsFolder: null, mediaRoot: ROOT };

/** Produce real jpeg bytes via ImageMagick. */
async function jpegBytes(size = '200x200'): Promise<Uint8Array> {
	const tmp = `${ROOT}/_scratch_${Math.abs(size.length)}.jpg`;
	const { mkdirSync } = await import('node:fs');
	mkdirSync(ROOT, { recursive: true });
	await runBinary([resolveMagick(), '-size', size, 'xc:purple', tmp], { nice: false });
	const bytes = new Uint8Array(readFileSync(tmp));
	rmSync(tmp, { force: true });
	return bytes;
}

function parsed(fields: Partial<ParsedUpload>, blob: Uint8Array): ParsedUpload {
	return {
		keyDir: 'kd',
		fileName: 'photo.jpg',
		chunked: false,
		chunkIndex: 0,
		totalChunks: 1,
		blob,
		...fields,
	};
}

beforeAll(() => rmSync(ROOT, { recursive: true, force: true }));
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe('upload receiver — single-shot', () => {
	test.if(HAVE_MAGICK)('sniffs + stages a valid jpg; complete=true', async () => {
		const bytes = await jpegBytes();
		const result = receiveUpload(parsed({}, bytes), USER, ROOT);
		expect(result.complete).toBe(true);
		expect(result.extension).toBe('jpg');
		expect(result.tmpName).toBe('photo.jpg');
	});

	test.if(HAVE_MAGICK)(
		'rejects a jpg declared as .png (signature mismatch, fail closed)',
		async () => {
			const bytes = await jpegBytes();
			expect(() => receiveUpload(parsed({ fileName: 'evil.png' }, bytes), USER, ROOT)).toThrow();
		},
	);

	test('rejects unknown bytes declared as an image (fail closed)', () => {
		const junk = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(() => receiveUpload(parsed({ fileName: 'x.jpg' }, junk), USER, ROOT)).toThrow();
	});

	test('rejects a ZERO-BYTE upload (no signature → fail closed, nothing staged)', () => {
		// Pinned contract: empty bytes carry no recognizable signature, so the
		// sniffer rejects them before anything is written.
		expect(() =>
			receiveUpload(
				parsed({ keyDir: 'kd0', fileName: 'empty.jpg' }, new Uint8Array(0)),
				USER,
				ROOT,
			),
		).toThrow(/Unrecognized file signature/);
		expect(existsSync(join(stagingDir(USER, 'kd0', ROOT), 'empty.jpg'))).toBe(false);
	});

	test('rejects a part larger than the configured maxSizeBytes cap (M6)', async () => {
		// The configured cap (default 2 GiB) is too large to allocate in a test, so
		// the cap CHECK is exercised through its seam: parseUploadRequest consults
		// only `file.size` BEFORE buffering, so a Blob subclass reporting an
		// oversized length drives the M6 throw without allocating the bytes.
		class OversizedBlob extends Blob {
			override get size(): number {
				return config.media.upload.maxSizeBytes + 1;
			}
		}
		const oversized = new OversizedBlob([new Uint8Array([0xff, 0xd8, 0xff]) as BlobPart]);
		const form = {
			get: (key: string) =>
				key === 'file_to_upload' ? oversized : key === 'file_name' ? 'huge.jpg' : null,
		} as unknown as FormData;
		const request = {
			headers: new Headers(),
			formData: async () => form,
		} as unknown as Request;
		await expect(parseUploadRequest(request)).rejects.toThrow(/exceeds the maximum allowed size/);
	});
});

describe('upload receiver — chunked store + join (client contract)', () => {
	test.if(HAVE_MAGICK)('each chunk stores + echoes index/total; join assembles', async () => {
		const bytes = await jpegBytes('300x200');
		const mid = Math.floor(bytes.length / 2);
		const base = { keyDir: 'kdc', fileName: 'big.jpg', chunked: true, totalChunks: 2 };
		// Chunk POSTs store the part and echo the counter fields (client counts these).
		const r0 = receiveUpload(parsed({ ...base, chunkIndex: 0 }, bytes.slice(0, mid)), USER, ROOT);
		expect(r0.complete).toBe(false);
		expect(r0.chunkIndex).toBe(0);
		expect(r0.totalChunks).toBe(2);
		expect(r0.tmpName).toBe('big.jpg'); // present on EVERY chunk (was the bug)
		const r1 = receiveUpload(parsed({ ...base, chunkIndex: 1 }, bytes.slice(mid)), USER, ROOT);
		expect(r1.complete).toBe(false);
		// The client, having counted all chunks, fires the join.
		const joined = joinChunkedUpload('kdc', 'big.jpg', 2, USER, ROOT);
		expect(joined.complete).toBe(true);
		expect(joined.extension).toBe('jpg');
	});

	test.if(HAVE_MAGICK)(
		'POLYGLOT: chunks that assemble to a NON-jpg fail closed at join (SEC-066)',
		async () => {
			// Each chunk is innocuous; assembled they are a PDF, not the declared jpg →
			// the join's re-sniff must reject.
			const pdfBytes = new TextEncoder().encode('%PDF-1.4\n...body...');
			const base = { keyDir: 'kdp', fileName: 'sneaky.jpg', chunked: true, totalChunks: 2 };
			receiveUpload(parsed({ ...base, chunkIndex: 0 }, pdfBytes.slice(0, 5)), USER, ROOT);
			receiveUpload(parsed({ ...base, chunkIndex: 1 }, pdfBytes.slice(5)), USER, ROOT);
			expect(() => joinChunkedUpload('kdp', 'sneaky.jpg', 2, USER, ROOT)).toThrow();
		},
	);

	test('join with a missing chunk fails closed', () => {
		expect(() => joinChunkedUpload('kd_missing', 'x.jpg', 3, USER, ROOT)).toThrow();
	});

	test('join with EXTRA delivered chunks consumes exactly the declared total', () => {
		// Pinned contract (surplus side of the count mismatch): the join assembles
		// exactly parts 0..declaredTotal-1 — a surplus part is NEVER concatenated
		// into the staged file; it stays behind as an unconsumed orphan in the
		// staging dir. (A valid jpeg signature spans the first part, so the
		// re-sniff passes and only the byte accounting is under test.)
		const bytes = new Uint8Array([
			0xff,
			0xd8,
			0xff,
			...Array.from({ length: 297 }, (_, i) => i % 251),
		]);
		const base = { keyDir: 'kde', fileName: 'extra.jpg', chunked: true, totalChunks: 3 };
		receiveUpload(parsed({ ...base, chunkIndex: 0 }, bytes.slice(0, 100)), USER, ROOT);
		receiveUpload(parsed({ ...base, chunkIndex: 1 }, bytes.slice(100, 200)), USER, ROOT);
		receiveUpload(parsed({ ...base, chunkIndex: 2 }, bytes.slice(200)), USER, ROOT);
		// The client declares 2 chunks at join time, but 3 parts were delivered.
		const joined = joinChunkedUpload('kde', 'extra.jpg', 2, USER, ROOT);
		expect(joined.complete).toBe(true);
		const dir = stagingDir(USER, 'kde', ROOT);
		// The staged file holds parts 0+1 only — the surplus part contributed nothing.
		expect(readFileSync(join(dir, 'extra.jpg'))).toEqual(Buffer.from(bytes.slice(0, 200)));
		// The surplus part is left unconsumed (not silently appended, not deleted).
		expect(existsSync(join(dir, '2-extra.jpg.blob'))).toBe(true);
	});
});

describe('full ingest: upload → add_file → regenerate', () => {
	test.if(HAVE_MAGICK)('staged upload ingests into derivatives', async () => {
		const bytes = await jpegBytes('2400x1600');
		const staged = receiveUpload(parsed({ keyDir: 'kdi', fileName: 'in.jpg' }, bytes), USER, ROOT);
		expect(staged.complete).toBe(true);
		const identity: MediaIdentity = {
			componentTipo: 'rsc29',
			sectionTipo: 'rsc170',
			sectionId: 77,
			lang: null,
		};
		const result = await processUploadedFile({
			spec: image,
			identity,
			pathOpts,
			userId: USER,
			keyDir: 'kdi',
			tmpName: staged.tmpName!,
			extension: staged.extension!,
		});
		const qualities = new Set(result.filesInfo.map((e) => e.quality));
		expect(qualities.has('original')).toBe(true);
		expect(qualities.has('1.5MB')).toBe(true);
		expect(qualities.has('thumb')).toBe(true);
		// original tier holds the raw upload
		expect(existsSync(`${ROOT}/image/original/rsc29_rsc170_77.jpg`)).toBe(true);
	});

	test.if(HAVE_MAGICK)('parseUploadRequest reads a real multipart Request', async () => {
		const bytes = await jpegBytes();
		const form = new FormData();
		form.set('key_dir', 'kdr');
		form.set('file_name', 'req.jpg');
		form.set('chunked', 'false');
		form.set('file_to_upload', new Blob([bytes as BlobPart], { type: 'image/jpeg' }), 'req.jpg');
		const request = new Request('http://x/upload', { method: 'POST', body: form });
		const p = await parseUploadRequest(request);
		expect(p.keyDir).toBe('kdr');
		expect(p.fileName).toBe('req.jpg');
		expect(p.blob.length).toBe(bytes.length);
	});
});
