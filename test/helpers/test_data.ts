/**
 * Shared test-data helpers — the ONE place for the matrix_test scratch
 * conventions and canonical-test3 self-healing (single verified source:
 * src/core/test_data/).
 *
 * Scratch conventions (do not invent new ones):
 *  - `test2`   — a REAL ontology section resolving to matrix_test; use a
 *                reserved HIGH section_id (900000+) clear of genuine records.
 *  - `testrt1`, `zztws*`, `zzcg*`, … — synthetic tipos for write-kernel gates
 *                that must not touch a real section's ontology.
 *  - `test3`   — ONLY for tests that need the real playground ontology
 *                (children/relations); create scratch records via
 *                createSectionRecord(-1) and NEVER touch the canonical ids
 *                (base 1, 2, 27 + the per-suite isolation clones 10, 11, 12 —
 *                CANONICAL_RECORD_IDS in src/core/test_data/manifest.ts).
 * Every writer cleans up (cleanScratchRecord) in afterAll/finally.
 */

import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import { deleteMatrixRecord, updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { canonicalTest3Drift, restoreCanonicalTest3 } from '../../src/core/test_data/seed.ts';

/**
 * Self-heal the canonical test3 records (drift-check, surgical restore only
 * when needed; once per test process). Call in the beforeAll of any gate that
 * asserts against the canonical playground shapes — never assume the live
 * rows are canonical (client sweeps mutate test3/1 on every client-gate run).
 */
let canonicalEnsured = false;
export async function ensureCanonicalTest3(): Promise<void> {
	if (canonicalEnsured) return;
	const drifted = await canonicalTest3Drift();
	if (drifted.length > 0) {
		await restoreCanonicalTest3();
	}
	canonicalEnsured = true;
}

/**
 * Upsert a scratch record. `values` maps jsonb columns to PARSED objects
 * (stringified here) or pre-stringified text when `rawText` is true; missing
 * columns are written as NULL so a re-run starts clean.
 */
export async function createScratchRecord(
	sectionTipo: string,
	sectionId: number,
	values: Record<string, unknown> = {},
	options: { table?: string; rawText?: boolean } = {},
): Promise<void> {
	const table = options.table ?? 'matrix_test';
	const bound: Record<string, string | null> = {};
	for (const column of MATRIX_JSONB_COLUMNS) {
		const value = values[column];
		if (value === null || value === undefined) {
			bound[column] = null;
		} else {
			bound[column] = options.rawText === true ? String(value) : JSON.stringify(value);
		}
	}
	await updateMatrixRecord(table, sectionTipo, sectionId, bound, { rawTextPassthrough: true });
}

/**
 * Remove a scratch record AND its time-machine audit rows (the recurring
 * local-helper pattern this consolidates).
 */
export async function cleanScratchRecord(
	sectionTipo: string,
	sectionId: number,
	table = 'matrix_test',
): Promise<void> {
	await deleteMatrixRecord(table, sectionTipo, sectionId);
	await sql`
		DELETE FROM matrix_time_machine
		WHERE section_tipo = ${sectionTipo} AND section_id = ${sectionId}
	`;
}

/**
 * Remove EVERY record of a synthetic scratch tipo (the zztws / zzcg / testrt1
 * sweeps) plus its TM rows and counter row.
 */
export async function cleanScratchTipo(sectionTipo: string, table = 'matrix_test'): Promise<void> {
	await sql.unsafe(`DELETE FROM "${table}" WHERE section_tipo = $1`, [sectionTipo]);
	await sql`DELETE FROM matrix_time_machine WHERE section_tipo = ${sectionTipo}`;
	await sql`DELETE FROM matrix_counter WHERE tipo = ${sectionTipo}`;
}
