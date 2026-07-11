/**
 * Milestone gate: read one REAL record through the TS DB layer from the same
 * PostgreSQL database the PHP server uses (plan A4.4).
 *
 * Uses a record known to exist in the dev DB (numisdata6 #1, seen via psql
 * during scaffolding). If your dev DB differs, adjust the constants — the
 * point is a real row, not a synthetic fixture.
 */

import { describe, expect, test } from 'bun:test';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';

const KNOWN_SECTION_TIPO = 'numisdata6';
const KNOWN_SECTION_ID = 1;

// NOTE: no afterAll(closeDatabasePool) here — the pool is shared module state
// across test files in one bun test process; closing it in one file breaks the
// next. The test process exit tears connections down.

describe('matrix read (real DB)', () => {
	test('reads a real record with parsed JSONB and raw ::text twins', async () => {
		const record = await readMatrixRecord('matrix', KNOWN_SECTION_TIPO, KNOWN_SECTION_ID);

		expect(record).not.toBeNull();
		expect(record?.section_tipo).toBe(KNOWN_SECTION_TIPO);
		expect(record?.section_id).toBe(KNOWN_SECTION_ID);

		// At least one JSONB column must hold data, and its raw text twin must
		// re-parse to the same value (sanity of the parity projection).
		const populatedColumn = Object.entries(record?.rawText ?? {}).find(
			([, rawValue]) => rawValue !== null,
		);
		expect(populatedColumn).toBeDefined();
		const [columnName, rawValue] = populatedColumn as [string, string];
		expect(JSON.parse(rawValue)).toEqual((record?.columns as Record<string, unknown>)[columnName]);
	});

	test('returns null for a nonexistent record', async () => {
		const missing = await readMatrixRecord('matrix', KNOWN_SECTION_TIPO, 99999999);
		expect(missing).toBeNull();
	});

	test('refuses tables outside the allowlist (identifier gate §7.6)', async () => {
		await expect(
			readMatrixRecord('matrix; DROP TABLE matrix;--', KNOWN_SECTION_TIPO, 1),
		).rejects.toThrow(/allowlist/);
	});
});
