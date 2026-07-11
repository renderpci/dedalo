/**
 * Phase 2 gate (plan A3): full WRITE round-trip through the TS write path.
 *
 * Clones a real PHP-written record's columns into matrix_test (the dedicated
 * test table, dev DB) under a reserved test section_tipo, reads it back, and
 * requires every jsonb column's canonical ::text to be byte-identical to the
 * source. Exercises: UPDATE→INSERT upsert fallback, raw-text passthrough,
 * codec-encoded writes, delete.
 *
 * Cleanup runs before AND after — a crashed previous run must not poison the
 * next one.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { MATRIX_JSONB_COLUMNS, readMatrixRecord } from '../../src/core/db/matrix.ts';
import { deleteMatrixRecord, updateMatrixRecord } from '../../src/core/db/matrix_write.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/** Reserved coordinates in matrix_test — 'testrt1' matches the tipo grammar and collides with nothing. */
const TEST_TABLE = 'matrix_test';
const TEST_SECTION_TIPO = 'testrt1';
const TEST_SECTION_ID = 900001;

async function cleanupTestRecord(): Promise<void> {
	await cleanScratchRecord(TEST_SECTION_TIPO, TEST_SECTION_ID);
}

describe('matrix write round-trip (Phase 2 gate, real DB)', () => {
	beforeAll(cleanupTestRecord);
	afterAll(cleanupTestRecord);

	test('clone a real record via raw-text passthrough → byte-identical columns', async () => {
		// A real, component-rich record (verified to exist during scaffolding).
		const source = await readMatrixRecord('matrix', 'numisdata6', 1);
		expect(source).not.toBeNull();

		// Build the write payload from the source's raw canonical text.
		const values: Record<string, string | null> = {};
		for (const column of MATRIX_JSONB_COLUMNS) {
			values[column] = source?.rawText[column] ?? null;
		}

		// First write hits the INSERT branch (record does not exist yet).
		const firstWrite = await updateMatrixRecord(
			TEST_TABLE,
			TEST_SECTION_TIPO,
			TEST_SECTION_ID,
			values,
			{ rawTextPassthrough: true },
		);
		expect(firstWrite).toBe('inserted');

		// Read back and compare every column's canonical text byte-for-byte.
		const clone = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(clone).not.toBeNull();
		for (const column of MATRIX_JSONB_COLUMNS) {
			expect(clone?.rawText[column] ?? null).toBe(source?.rawText[column] ?? null);
		}
	});

	test('second write hits the UPDATE branch and codec-encoded values land correctly', async () => {
		const componentData = {
			testcomp1: [{ id: 1, value: 'codec-written value', lang: 'lg-spa' }],
		};
		const secondWrite = await updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {
			string: componentData,
			misc: null,
		});
		expect(secondWrite).toBe('updated');

		const readBack = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(readBack?.columns.string).toEqual(componentData);
		expect(readBack?.rawText.misc ?? null).toBeNull();
	});

	test('independent client (psql-equivalent) sees exactly what TS wrote', async () => {
		// Cross-check through a separate query path (not readMatrixRecord):
		// the jsonb value as Postgres canonical text.
		const [row] = (await sql.unsafe(
			`SELECT string::text AS string_text FROM ${TEST_TABLE}
			 WHERE section_tipo = $1 AND section_id = $2`,
			[TEST_SECTION_TIPO, TEST_SECTION_ID],
		)) as { string_text: string }[];
		expect(row).toBeDefined();
		expect(JSON.parse((row as { string_text: string }).string_text)).toEqual({
			testcomp1: [{ id: 1, value: 'codec-written value', lang: 'lg-spa' }],
		});
	});

	test('delete removes exactly the test record', async () => {
		const deletedCount = await deleteMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(deletedCount).toBe(1);
		const gone = await readMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID);
		expect(gone).toBeNull();
	});

	test('write path refuses non-allowlisted columns and empty payloads', async () => {
		await expect(
			updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {
				// biome-ignore lint/suspicious/noExplicitAny: deliberately hostile input
				['section_tipo; DROP TABLE matrix;--' as any]: {},
			}),
		).rejects.toThrow(/allowlisted jsonb column/);
		await expect(
			updateMatrixRecord(TEST_TABLE, TEST_SECTION_TIPO, TEST_SECTION_ID, {}),
		).rejects.toThrow(/empty values/);
	});
});
