/**
 * SECTION_SPEC §7.2 gate: the relation_list cell-value contract covers every
 * component model that appears as a real relation_list column in the ontology.
 *
 * The full-grid byte-parity is gated by relation_list_differential (numisdata6
 * columns). This unit gate pins the two column models that gate does not reach:
 * component_section_id (the record's own id — rsc559 under rsc424) resolves,
 * and a genuinely-uncovered model stays LEDGERED (null + unresolved note).
 */

import { describe, expect, test } from 'bun:test';
import { resolveCellValue } from '../../src/core/resolve/relation_list.ts';

describe('relation_list cell value contract (SECTION_SPEC §7.2)', () => {
	test('component_section_id resolves to the record section_id', async () => {
		// rsc559 is the section_id component (ontology model resolution needs no
		// records). The audit (2026-07-07) found the original rsc424 fixture has
		// ZERO records on this install, so this gate had been silently green since
		// birth — the model branch is section-independent (it echoes the record
		// id after the record-exists read), so pin it on a record that EXISTS.
		const { sql } = await import('../../src/core/db/postgres.ts');
		const rows =
			await sql`SELECT section_id FROM matrix WHERE section_tipo = 'rsc197' ORDER BY section_id LIMIT 1`;
		const id = (rows as { section_id: number }[])[0]?.section_id;
		if (id === undefined) {
			// FAIL LOUD, never silently green: a missing fixture must not read as a
			// passing contract gate.
			throw new Error('fixture missing: no rsc197 records on this install — gate cannot assert');
		}
		const unresolved: string[] = [];
		const value = await resolveCellValue('rsc197', id, 'rsc559', 'lg-spa', unresolved);
		expect(value).toBe(String(id));
		expect(unresolved).toEqual([]);
	});

	test('a NONEXISTENT record resolves to null (fail-closed), never a fabricated id', async () => {
		// readMatrixRecord null → null: the section_id branch must not echo an id
		// for a record that does not exist.
		const unresolved: string[] = [];
		const value = await resolveCellValue('rsc197', 999_999_999, 'rsc559', 'lg-spa', unresolved);
		expect(value).toBeNull();
	});

	test('an uncovered column model is ledgered (null + unresolved), never guessed', async () => {
		// ich126 (under rsc197's ich96) is the one live relation_list column whose
		// model is outside the value scope — the cell must be null and the model
		// ledgered, never a guessed string.
		// Anti-vacuity (audit 2026-07-07): null+unresolved is ALSO plausible for a
		// nonexistent record — prove the record exists so the assertion really
		// pins the uncovered-model contract.
		const { sql } = await import('../../src/core/db/postgres.ts');
		const exists = await sql`SELECT 1 FROM matrix WHERE section_tipo = 'rsc197' AND section_id = 1`;
		if ((exists as unknown[]).length === 0) {
			throw new Error('fixture missing: rsc197/1 does not exist — gate cannot assert');
		}
		const unresolved: string[] = [];
		const value = await resolveCellValue('rsc197', 1, 'ich126', 'lg-spa', unresolved);
		expect(value).toBeNull();
		expect(unresolved.length).toBeGreaterThan(0);
	});
});
