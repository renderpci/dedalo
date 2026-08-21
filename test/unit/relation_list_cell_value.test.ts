/**
 * SECTION_SPEC §7.2 gate: the relation_list cell-value contract covers every
 * component model that appears as a real relation_list column in the ontology.
 *
 * The full grid (context columns, cell values, paging) is gated by
 * relation_list_grid_native.test.ts, which BUILDS its own situation. This unit
 * gate pins the two column models that gate does not reach:
 * component_section_id (the record's own id) resolves, and a genuinely-uncovered
 * model stays LEDGERED (null + unresolved note).
 */
// Migrated to the generic `test` TLD 2026-08-20 (AGENTS.md hard rules). The two
// cases used to hunt an `rsc197` record with raw SQL against `matrix` and THREW
// "fixture missing" when the install's corpus was absent — which is what they
// did on the suite database (2 of 3 red at baseline). The gate now BUILDS its
// situation (`zzcv`: one section on matrix_test through the test24 matrix_table
// node, one record, a component_section_id column and an UNCOVERED-family
// relation_list column) so both branches assert on rows this file wrote.
// Torn down with an asserted residue of 0.

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { resolveCellValue } from '../../src/core/resolve/relation_list.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';

const SECTION = 'zzcv1';
const RECORD_ID = 900801;
/** The component_section_id column — the model that echoes the record's own id. */
const SECTION_ID_COLUMN = 'zzcv2';
/**
 * A relation_list node used as a relation_list COLUMN: its model declares no
 * `flatValue` family, so it is the uncovered-model case by construction (the
 * same shape the install fixture had — ich126, a relation_list, under rsc197).
 */
const UNCOVERED_COLUMN = 'zzcv3';

const S = situation({
	name: 'zzcv relation_list cell value',
	tld: 'zzcv',
	nodes: [
		{
			tipo: SECTION,
			parent: 'test1',
			model: 'section',
			term: { 'lg-spa': 'Celdas de referencias', 'lg-eng': 'Relation list cells' },
			relations: [{ tipo: 'test24' }],
		},
		{
			tipo: SECTION_ID_COLUMN,
			parent: SECTION,
			model: 'component_section_id',
			term: { 'lg-spa': 'Id', 'lg-eng': 'Id' },
		},
		{
			tipo: UNCOVERED_COLUMN,
			parent: SECTION,
			model: 'relation_list',
			order_number: 2,
			term: { 'lg-spa': 'Referencias', 'lg-eng': 'References' },
		},
	],
	records: [{ section_tipo: SECTION, section_id: RECORD_ID, columns: { data: {} } }],
});

beforeAll(async () => {
	await ensureSituation(S);
});
afterAll(async () => {
	expect(await dropSituation(S)).toBe(0);
});

describe('relation_list cell value contract (SECTION_SPEC §7.2)', () => {
	test('component_section_id resolves to the record section_id', async () => {
		const unresolved: string[] = [];
		const value = await resolveCellValue(
			SECTION,
			RECORD_ID,
			SECTION_ID_COLUMN,
			'lg-spa',
			unresolved,
		);
		expect(value).toBe(String(RECORD_ID));
		expect(unresolved).toEqual([]);
	});

	test('a NONEXISTENT record resolves to null (fail-closed), never a fabricated id', async () => {
		// readMatrixRecord null → null: the section_id branch must not echo an id
		// for a record that does not exist.
		const unresolved: string[] = [];
		const value = await resolveCellValue(
			SECTION,
			999_999_999,
			SECTION_ID_COLUMN,
			'lg-spa',
			unresolved,
		);
		expect(value).toBeNull();
	});

	test('an uncovered column model is ledgered (null + unresolved), never guessed', async () => {
		// Anti-vacuity (audit 2026-07-07): null+unresolved is ALSO plausible for a
		// nonexistent record — so prove, THROUGH THE SAME DOOR, that this record
		// resolves a covered column first. The uncovered branch is then the only
		// thing the null below can mean.
		expect(
			await resolveCellValue(SECTION, RECORD_ID, SECTION_ID_COLUMN, 'lg-spa', []),
		).not.toBeNull();

		const unresolved: string[] = [];
		const value = await resolveCellValue(
			SECTION,
			RECORD_ID,
			UNCOVERED_COLUMN,
			'lg-spa',
			unresolved,
		);
		expect(value).toBeNull();
		expect(unresolved.length).toBeGreaterThan(0);
	});
});
