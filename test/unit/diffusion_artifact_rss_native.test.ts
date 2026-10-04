/**
 * PERF-2 / DIFF-4 — CONSOLIDATED ARTIFACTS ARE BUILT IN BOUNDED MEMORY.
 *
 * THE FINDING (audit 2026-09-26). Every file writer's close() consolidated
 * through `createZip`, which read EVERY input whole (`arrayBuffer()`) and then
 * concatenated them into one more buffer (`buildStoreZip`) — peak memory about
 * twice the archive; the rdf/xml merge read every per-record part into one
 * string array and joined it. A heritage publication of a few GB of documents
 * took the runner past its memory ceiling at the very last step, after every
 * record had been written.
 *
 * WHAT IS ASSERTED — the peak RSS delta of a SPAWNED CHILD (test/helpers/
 * diffusion_rss_child.ts) doing exactly one thing, on inputs much larger than
 * the ceiling, under a MARKED scratch media root. The delta runs from the
 * child's CURRENT resident size after a full GC to its final high-water mark —
 * never from an earlier high-water mark, which would hide the growth of the
 * measured step back up to it:
 *   control — reading the 192 MiB input whole raises the child's peak by more
 *             than 150 MiB: the probe and its unit (KiB) measure what they claim;
 *   A       — `createZip` over 192 MiB + 8 × 16 MiB stays under 48 MiB of peak
 *             growth, and the archive is VALID: full central directory, every
 *             entry's CRC recomputed from the bytes;
 *   B       — an rdf session's close() over 2000 records of 64 KiB (merge + zip),
 *             run in a fresh process after the writes (maxRSS never resets),
 *             stays under the same ceiling, and its archive is valid too.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { crc32 } from 'node:zlib';
import { scratchMediaRoot } from '../helpers/media_scratch_root.ts';
import { readZip } from '../helpers/zip_xml_reader.ts';

const CHILD = join(import.meta.dir, '..', 'helpers', 'diffusion_rss_child.ts');
const MIB = 1024 * 1024;
const CEILING_KIB = 48 * 1024;
const CONTROL_FLOOR_KIB = 150 * 1024;
const BIG_FILE_BYTES = 192 * MIB;
const MEDIUM_FILES = 8;
const MEDIUM_FILE_BYTES = 16 * MIB;
const RDF_RECORDS = 2000;
const RDF_PART_BYTES = 64 * 1024;

let root: string;
const bigFiles: string[] = [];

/** Write `bytes` of deterministic content in 1 MiB chunks (the parent never holds a file). */
function writeCorpusFile(path: string, bytes: number, seed: number): void {
	const chunk = new Uint8Array(MIB);
	const fd = openSync(path, 'w');
	try {
		let state = seed >>> 0;
		for (let written = 0; written < bytes; written += MIB) {
			for (let index = 0; index < chunk.length; index += 4) {
				state = (state * 1664525 + 1013904223) >>> 0;
				chunk[index] = state & 0xff;
				chunk[index + 1] = (state >>> 8) & 0xff;
				chunk[index + 2] = (state >>> 16) & 0xff;
				chunk[index + 3] = state >>> 24;
			}
			writeSync(fd, chunk, 0, Math.min(MIB, bytes - written));
		}
	} finally {
		closeSync(fd);
	}
}

interface ChildReport {
	mode: string;
	deltaKiB: number;
	peakKiB: number;
	baselineKiB: number;
	tables?: string[];
}

async function measure(args: string[]): Promise<ChildReport> {
	const child = Bun.spawn([process.execPath, 'run', CHILD, ...args], {
		env: { ...process.env, DEDALO_DIFFUSION_FILES_ROOT: root },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`rss child (${args[0]}) exited ${exitCode}: ${stderr.slice(-2000)}`);
	}
	const line = stdout.trim().split('\n').at(-1) ?? '';
	return JSON.parse(line) as ChildReport;
}

/** Full structural read + every entry's CRC recomputed from its stored bytes. */
function expectValidStoreArchive(zipPath: string, expectedNames: string[]): void {
	const bytes = new Uint8Array(readFileSync(zipPath));
	const read = readZip(bytes);
	expect(read.entries.map((entry) => entry.name)).toEqual(expectedNames);
	for (const entry of read.entries) {
		expect(entry.data.byteLength).toBe(entry.uncompressedSize);
		expect(crc32(entry.data) >>> 0, `CRC mismatch for ${entry.name}`).toBe(entry.crc >>> 0);
	}
}

beforeAll(() => {
	root = scratchMediaRoot('dedalo_diffusion_artifact_rss_');
	const big = join(root, 'big_192.bin');
	writeCorpusFile(big, BIG_FILE_BYTES, 1);
	bigFiles.push(big);
	for (let index = 0; index < MEDIUM_FILES; index++) {
		const path = join(root, `medium_${index}.bin`);
		writeCorpusFile(path, MEDIUM_FILE_BYTES, 100 + index);
		bigFiles.push(path);
	}
}, 120_000);

afterAll(() => {
	if (root !== undefined) rmSync(root, { recursive: true, force: true });
});

describe('PERF-2 — consolidated artifacts in bounded memory (spawned-child maxRSS)', () => {
	test('control: reading the 192 MiB input whole raises the peak by > 150 MiB (the probe measures)', async () => {
		const report = await measure(['control', bigFiles[0] as string]);
		expect(report.deltaKiB).toBeGreaterThan(CONTROL_FLOOR_KIB);
	}, 120_000);

	test(`A: createZip over ${BIG_FILE_BYTES / MIB} MiB + ${MEDIUM_FILES} × ${MEDIUM_FILE_BYTES / MIB} MiB stays under ${CEILING_KIB / 1024} MiB of peak growth`, async () => {
		const out = join(root, 'archive_a.zip');
		const report = await measure(['zip', out, ...bigFiles]);
		expect(
			report.deltaKiB,
			`createZip raised the runner's peak RSS by ${Math.round(report.deltaKiB / 1024)} MiB over ${(BIG_FILE_BYTES + MEDIUM_FILES * MEDIUM_FILE_BYTES) / MIB} MiB of input`,
		).toBeLessThan(CEILING_KIB);
		expectValidStoreArchive(
			out,
			bigFiles.map((path) => path.split('/').at(-1) as string),
		);
		rmSync(out, { force: true });
	}, 300_000);

	test(`B: an rdf session's close() over ${RDF_RECORDS} × ${RDF_PART_BYTES / 1024} KiB records (merge + zip) stays under the same ceiling`, async () => {
		// The writes in their own process: maxRSS cannot be reset, so a close measured
		// in the writing process inherits the write phase's peak (see the child's header).
		await measure(['rdf-write', String(RDF_RECORDS), String(RDF_PART_BYTES)]);
		const report = await measure(['rdf-close', String(RDF_RECORDS)]);
		expect(
			report.deltaKiB,
			`the rdf consolidation raised the runner's peak RSS by ${Math.round(report.deltaKiB / 1024)} MiB`,
		).toBeLessThan(CEILING_KIB);
		const dir = join(root, 'rdf', 'rss_rdf');
		const names = [
			...Array.from({ length: RDF_RECORDS }, (_, index) => index + 1).map(
				(id) => `nmonumismaticobject-test6100-${id}.rdf`,
			),
			'diffusion_rdf_merged.rdf',
		];
		expectValidStoreArchive(join(dir, 'diffusion_rdf.zip'), names);
	}, 300_000);
});
