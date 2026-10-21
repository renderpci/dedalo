/**
 * A THESAURUS IMPORT STREAMS — the server process never holds the decompressed
 * file (cross-ops:r2 S2).
 *
 * THE DEFECT. `importHierarchyRows` runs INSIDE the server process (Maintenance ›
 * add_hierarchy install / reset). It read each listed file whole, gunzipSync'd it
 * (the largest vendored thesaurus file is 27.9 MB → 1,068,339,452 bytes), held every
 * decompressed file at once, copied each again (Buffer.from) and concatenated them
 * all into one more buffer for psql's stdin: > 2 GB for one tld, in the process
 * that serves every request — an OOM kill on a modest host takes every in-flight
 * request with it.
 *
 * THE LAW (measured): importing a listed file of ~512 MiB decompressed (a scratch
 * tld `zzhim`, the lane SUITE database, the REAL psql path) grows this process's
 * resident set by far less than the file — the digest, the row count and the load
 * are streaming passes. Own file, run alone: an earlier gate's freed heap would hide
 * a regression inside the allocator's retained pages.
 *
 * SURFACES. assertTestDatabase first; `zzhim1` rows of matrix_hierarchy and their
 * matrix_counter row, swept before and after; the file in a mkdtemp dir.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { createWriteStream, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGzip } from 'node:zlib';
import { encodeCopyField } from '../../src/core/db/copy_text.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { importHierarchyRows } from '../../src/core/install/hierarchy_import.ts';
import { connFromConfig } from '../../src/core/install/pg_exec.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TLD = 'zzhim';
const ROWS = 512;
/** One row's payload: 1 MiB of text (gzip shrinks the file to well under a megabyte). */
const PAYLOAD = 'x'.repeat(1 << 20);
/** The ceiling: a quarter of what one decompressed copy of the file alone would take. */
const CEILING_BYTES = (ROWS << 20) / 4;
const conn = connFromConfig();
let importDir = '';
let file = '';

async function sweep(): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix_hierarchy WHERE section_tipo ~ '^${TLD}[0-9]+$'`, []);
	await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo ~ '^${TLD}[0-9]+$'`, []);
}

/** Write the big listed file through a gzip stream (the test never holds it either). */
async function writeBigFile(path: string): Promise<void> {
	const gzip = createGzip({ level: 1 });
	const sink = createWriteStream(path);
	const done = new Promise<void>((resolve, reject) => {
		sink.on('finish', resolve);
		sink.on('error', reject);
	});
	gzip.pipe(sink);
	for (let sectionId = 1; sectionId <= ROWS; sectionId++) {
		const fields = MATRIX_COPY_COLUMNS.map((column) => {
			if (column === 'section_id') return String(sectionId);
			if (column === 'section_tipo') return `${TLD}1`;
			if (column === 'data') return encodeCopyField(JSON.stringify({ blob: PAYLOAD }));
			return '\\N';
		});
		if (!gzip.write(`${fields.join('\t')}\n`)) {
			await new Promise<void>((resolve) => gzip.once('drain', resolve));
		}
	}
	gzip.end();
	await done;
}

beforeAll(async () => {
	await assertTestDatabase('hierarchy_import_stream_memory_native');
	const [db] = (await sql.unsafe('SELECT current_database() AS name', [])) as { name: string }[];
	expect(conn.database).toBe(db?.name ?? '');
	importDir = mkdtempSync(join(tmpdir(), 'dedalo-hierarchy-memory-'));
	file = join(importDir, `${TLD}1.copy.gz`);
	await sweep();
	await writeBigFile(file);
}, 120_000);

afterAll(async () => {
	await sweep();
	rmSync(importDir, { recursive: true, force: true });
});

describe('importHierarchyRows never holds a decompressed file', () => {
	test('a ~512 MiB thesaurus file imports with the process growing far less than the file', async () => {
		expect(statSync(file).size, 'the fixture is small on disk').toBeLessThan(16 << 20);
		const sha256 = createHash('sha256').update(readFileSync(file)).digest('hex');
		Bun.gc(true);
		const baseline = process.memoryUsage().rss;
		let peak = baseline;
		const sampler = setInterval(() => {
			peak = Math.max(peak, process.memoryUsage().rss);
		}, 10);
		let result: Awaited<ReturnType<typeof importHierarchyRows>>;
		try {
			result = await importHierarchyRows(conn, TLD, {
				importDir,
				dataFiles: [{ file: `${TLD}1.copy.gz`, sha256 }],
			});
		} finally {
			clearInterval(sampler);
		}
		peak = Math.max(peak, process.memoryUsage().rss);
		expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
		// Non-vacuity: every row really landed, payload whole.
		const [landed] = (await sql.unsafe(
			`SELECT count(*)::int AS n, min(length(data->>'blob'))::int AS shortest FROM matrix_hierarchy WHERE section_tipo = '${TLD}1'`,
			[],
		)) as { n: number; shortest: number }[];
		expect(landed).toEqual({ n: ROWS, shortest: PAYLOAD.length });
		const grew = peak - baseline;
		expect(
			grew,
			`resident set grew ${Math.round(grew / 1e6)} MB importing a ${ROWS} MiB file`,
		).toBeLessThan(CEILING_BYTES);
	}, 300_000);
});
