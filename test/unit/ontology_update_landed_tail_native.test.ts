/**
 * ONTOLOGY UPDATE — a failure AFTER the import landed never rolls the matrix
 * rows back (cross-write:r2, review of b095553e22..73ff5d88a4, S3).
 *
 * THE DEFECT. updateOntology's outer catch restored every Phase-B snapshot on
 * ANY throw — also one from a report-only tail step (the dependency report)
 * that ran after `importStagedOntologyFiles` answered completed=true, i.e.
 * after dd_ontology had been re-derived from the NEW rows. The restore put the
 * OLD matrix_ontology rows back under the NEW dd_ontology: a state neither
 * version was ever in, reported as a failed update.
 *
 * THE OUTCOME PINNED, through the ONE catch-site function both doors share
 * (restoreAfterThrow) over a real snapshot and a real replaced slice:
 *   - landed → the replaced rows STAY (nothing restored), the operator line
 *     says the update landed and nothing was rolled back;
 *   - not landed (CONTROL) → the snapshot is restored, byte for byte.
 *
 * Scratch: matrix_ontology rows of the `zzult` section_tipo only (swept and
 * asserted gone) and a mkdtemp() directory for the snapshot.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from '../../src/core/db/postgres.ts';
import { connFromConfig, type DbConnDescriptor } from '../../src/core/install/pg_exec.ts';
import { restoreAfterThrow, snapshotTableRows } from '../../src/core/ontology/ontology_update.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const TIPO = 'zzult';
let workDir = '';
let conn: DbConnDescriptor;

async function rows(): Promise<string[]> {
	const found = (await sql.unsafe(
		`SELECT section_id::text || ':' || (data->>'marker') AS r FROM matrix_ontology
		 WHERE section_tipo = $1 ORDER BY section_id`,
		[TIPO],
	)) as { r: string }[];
	return found.map((row) => row.r);
}

/** Seed `original`, snapshot it into a fresh recovery dir, then REPLACE the slice. */
async function replacedSlice(): Promise<string> {
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [TIPO]);
	for (const id of [1, 2]) {
		await sql.unsafe(
			`INSERT INTO matrix_ontology (section_id, section_tipo, data) VALUES ($1, $2, $3::text::jsonb)`,
			[id, TIPO, JSON.stringify({ marker: 'original' })],
		);
	}
	// FLOOR: the reader really reads the seeded slice (every later "rows" is judged by it).
	expect((await rows()).length).toBe(2);
	const recoveryDir = mkdtempSync(join(workDir, 'recovery-'));
	expect(
		await snapshotTableRows('matrix_ontology', TIPO, join(recoveryDir, `${TIPO}.copy`), conn),
	).toBe(true);
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [TIPO]);
	await sql.unsafe(
		`INSERT INTO matrix_ontology (section_id, section_tipo, data) VALUES (9, $1, $2::text::jsonb)`,
		[TIPO, JSON.stringify({ marker: 'imported' })],
	);
	// FLOOR: the slice really changed (else "not restored" is vacuous).
	expect(await rows()).toEqual(['9:imported']);
	return recoveryDir;
}

beforeAll(async () => {
	await assertTestDatabase('ontology_update_landed_tail_native');
	conn = connFromConfig();
	workDir = mkdtempSync(join(tmpdir(), 'zzult-'));
});

afterAll(async () => {
	rmSync(workDir, { recursive: true, force: true });
	await sql.unsafe('DELETE FROM matrix_ontology WHERE section_tipo = $1', [TIPO]);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [TIPO]);
	expect(await rows()).toEqual([]);
});

describe('restoreAfterThrow: the landed update is never rolled back', () => {
	const staged = [{ tld: TIPO, sectionTipo: TIPO, stagedPath: '' }];

	test('LANDED (a tail step threw): the imported rows stay; the operator line says so', async () => {
		const recoveryDir = await replacedSlice();
		const errors: string[] = [];
		const msg = await restoreAfterThrow(
			new Error('dependency report exploded'),
			{ mutated: staged, provisioned: [], errors, landed: true },
			{ conn, recoveryDir },
		);
		expect(await rows()).toEqual(['9:imported']);
		expect(msg).toBe(
			'Error. The ontology update landed, but a final step failed (see the server log)',
		);
		expect(errors).toEqual([
			'the ontology update landed; a final step failed (see the server log) — nothing was rolled back',
		]);
	}, 60_000);

	test('CONTROL — NOT landed (Phase C threw): the snapshot is restored', async () => {
		const recoveryDir = await replacedSlice();
		const errors: string[] = [];
		await restoreAfterThrow(
			new Error('import exploded'),
			{ mutated: staged, provisioned: [], errors, landed: false },
			{ conn, recoveryDir },
		);
		expect(await rows()).toEqual(['1:original', '2:original']);
		expect(errors[0]).toBe('import exploded');
	}, 60_000);
});
