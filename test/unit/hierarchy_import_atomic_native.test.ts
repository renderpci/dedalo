/**
 * A HIERARCHY IMPORT APPLIES WHOLE OR NOT AT ALL (OPS-6/PERF-11 review follow-up).
 *
 * THE DEFECT. `installHierarchies` (the install wizard's hierarchy step, and the
 * add_hierarchy "Reset to seed" action with `replace: true`) ran each step of a
 * tld's import as its OWN psql call — its own transaction:
 *   1. `DELETE FROM matrix_hierarchy WHERE section_tipo ~ '^<tld>[0-9]+$'`;
 *   2. `\copy` of `<tld>1.copy.gz` (the terms);
 *   3. `\copy` of `<tld>2.copy.gz` (the models) — its failure IGNORED;
 *   4. the counter consolidation — its failure SWALLOWED (`.catch(() => {})`).
 * A terms file that failed to load (a corrupt seed, a constraint, a dropped
 * connection) therefore left the hierarchy DELETED — every operator edit and
 * addition gone, the seed not restored — and a failed models file left a
 * half-imported hierarchy reported as success.
 *
 * THE LAW (measured here, on a scratch tld `zzhia` in the lane SUITE database,
 * through the REAL psql path, `importHierarchyRows`):
 *  (a) replace with a corrupt TERMS file → refused, and the existing rows —
 *      the operator's edit and addition — are intact;
 *  (b) replace with valid terms but a corrupt MODELS file → refused (not a
 *      success), existing rows intact, no seed row landed;
 *  (c) replace with valid files → the seed replaces the rows, models included,
 *      and the counter is raised to the high-water mark in the same unit;
 *  (d) without replace, a present tld is skipped untouched.
 *
 * SURFACES. assertTestDatabase first; rows of `zzhia1`/`zzhia2` in
 * matrix_hierarchy and their matrix_counter rows, swept before and after; the
 * seed files live in a mkdtemp dir.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { MATRIX_COPY_COLUMNS } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { importHierarchyRows } from '../../src/core/install/hierarchy_import.ts';
import { connFromConfig, runPsql } from '../../src/core/install/pg_exec.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TLD = 'zzhia';
const conn = connFromConfig();
let importDir = '';
let seedTerms = '';
let seedModels = '';

async function sweep(): Promise<void> {
	await sql.unsafe(`DELETE FROM matrix_hierarchy WHERE section_tipo ~ '^${TLD}[0-9]+$'`, []);
	await sql.unsafe(`DELETE FROM matrix_counter WHERE tipo ~ '^${TLD}[0-9]+$'`, []);
}

async function insertRow(sectionTipo: string, sectionId: number, marker: string): Promise<void> {
	await sql.unsafe(
		'INSERT INTO matrix_hierarchy (section_id, section_tipo, data) VALUES ($1, $2, $3::text::jsonb)',
		[sectionId, sectionTipo, encodeForJsonb({ marker })],
	);
}

/** The COPY text (MATRIX_COPY_COLUMNS order) of one section's rows, through psql. */
async function copyText(sectionTipo: string): Promise<string> {
	const res = await runPsql(conn, [
		'-v',
		'ON_ERROR_STOP=1',
		'-c',
		`\\copy (SELECT ${MATRIX_COPY_COLUMNS.join(', ')} FROM matrix_hierarchy WHERE section_tipo = '${sectionTipo}' ORDER BY section_id) TO STDOUT`,
	]);
	expect(res.exitCode, res.stderr).toBe(0);
	return `${res.stdout}\n`;
}

function writeSeed(terms: string, models: string | null): void {
	writeFileSync(join(importDir, `${TLD}1.copy.gz`), gzipSync(Buffer.from(terms)));
	const modelsPath = join(importDir, `${TLD}2.copy.gz`);
	rmSync(modelsPath, { force: true });
	if (models !== null) writeFileSync(modelsPath, gzipSync(Buffer.from(models)));
}

async function rows(): Promise<string[]> {
	const found = (await sql.unsafe(
		`SELECT section_tipo, section_id, data->>'marker' AS marker FROM matrix_hierarchy
		  WHERE section_tipo ~ '^${TLD}[0-9]+$' ORDER BY section_tipo, section_id`,
		[],
	)) as { section_tipo: string; section_id: number; marker: string }[];
	return found.map((row) => `${row.section_tipo}/${row.section_id}:${row.marker}`);
}

beforeAll(async () => {
	await assertTestDatabase('hierarchy_import_atomic_native');
	const [db] = (await sql.unsafe('SELECT current_database() AS name', [])) as { name: string }[];
	// The psql channel and the engine pool must name the SAME (lane) database.
	expect(conn.database).toBe(db?.name ?? '');
	importDir = mkdtempSync(join(tmpdir(), 'dedalo-hierarchy-import-'));
	await sweep();
	// The SEED: two terms and one model, rendered as COPY text by psql itself.
	await insertRow(`${TLD}1`, 1, 'seed');
	await insertRow(`${TLD}1`, 2, 'seed');
	await insertRow(`${TLD}2`, 1, 'seed-model');
	seedTerms = await copyText(`${TLD}1`);
	seedModels = await copyText(`${TLD}2`);
	await sweep();
});

afterAll(async () => {
	await sweep();
	rmSync(importDir, { recursive: true, force: true });
});

/** The operator's state before a reset: an EDITED seed term and an ADDED term. */
beforeEach(async () => {
	await sweep();
	await insertRow(`${TLD}1`, 1, 'edited');
	await insertRow(`${TLD}1`, 7, 'added');
});

const OPERATOR_STATE = [`${TLD}1/1:edited`, `${TLD}1/7:added`];
const CORRUPT_LINE = 'not-an-integer\tzzhia1\n';

describe('importHierarchyRows: one tld = one atomic unit', () => {
	test("(a) replace with a corrupt TERMS file is refused and leaves the operator's rows intact", async () => {
		writeSeed(seedTerms + CORRUPT_LINE, seedModels);
		const result = await importHierarchyRows(conn, TLD, { replace: true, importDir });
		expect(result.ok).toBe(false);
		expect(await rows()).toEqual(OPERATOR_STATE);
	});

	test('(b) replace with a corrupt MODELS file is refused (never a success) and lands nothing', async () => {
		writeSeed(seedTerms, seedModels + CORRUPT_LINE);
		const result = await importHierarchyRows(conn, TLD, { replace: true, importDir });
		expect(result.ok).toBe(false);
		expect(await rows()).toEqual(OPERATOR_STATE);
	});

	test('(c) replace with valid files: the seed replaces the rows, models included, and the counter is raised in the same unit', async () => {
		writeSeed(seedTerms, seedModels);
		const result = await importHierarchyRows(conn, TLD, { replace: true, importDir });
		expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
		expect(await rows()).toEqual([`${TLD}1/1:seed`, `${TLD}1/2:seed`, `${TLD}2/1:seed-model`]);
		const counters = (await sql.unsafe(
			`SELECT tipo, value FROM matrix_counter WHERE tipo ~ '^${TLD}[0-9]+$' ORDER BY tipo`,
			[],
		)) as { tipo: string; value: number }[];
		expect(counters.map((row) => `${row.tipo}=${Number(row.value)}`)).toEqual([
			`${TLD}1=2`,
			`${TLD}2=1`,
		]);
	});

	test('(d) without replace a present tld is skipped, untouched', async () => {
		writeSeed(seedTerms, seedModels);
		const result = await importHierarchyRows(conn, TLD, { importDir });
		expect(result).toMatchObject({ ok: true, skipped: true });
		expect(await rows()).toEqual(OPERATOR_STATE);
	});
});
