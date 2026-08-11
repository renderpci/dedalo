/**
 * `consolidateOrderFor` — the per-table renumber ORDER extracted out of
 * `databaseInfoConsolidateTables` (database_info.ts:425) per plan §4.1.7.
 *
 * It was one inline ternary, which is exactly the extraction most likely to be
 * left duplicated. The decision it makes is not cosmetic: `dd_ontology` has no
 * `section_tipo`/`section_id` columns, so applying the matrix ordering to it
 * makes the `UPDATE … row_number() OVER (ORDER BY …)` reference columns the
 * table lacks and the action THROWS mid-transaction — on the one table that
 * most needs compacting, after the operator already confirmed a destructive
 * renumber.
 *
 * `databaseInfoConsolidateTables` is not driven: every table it acts on is a
 * shared ontology table (see database_info_consolidate_native.test.ts, which
 * owns the scratch-clone half). The `plan === 'error'` abort arm is pinned
 * here at the level that HAS arms — `planConsolidation` — plus a source
 * assertion that the arm still returns rather than continuing the loop.
 */

import { describe, expect, test } from 'bun:test';
import {
	consolidateOrderFor,
	planConsolidation,
} from '../../src/core/area_maintenance/widgets/database_info.ts';

const SOURCE_FILE = `${import.meta.dir}/../../src/core/area_maintenance/widgets/database_info.ts`;

describe('consolidateOrderFor', () => {
	test('dd_ontology renumbers in tld, id order — the columns it actually has', () => {
		expect(consolidateOrderFor('dd_ontology')).toBe('tld, id');
	});

	test('every other allowlisted table renumbers in matrix order', () => {
		for (const table of ['matrix_ontology', 'matrix_ontology_main', 'matrix_dd']) {
			expect(consolidateOrderFor(table)).toBe('section_tipo, section_id');
		}
	});

	test('the dd_ontology test is EXACT, not a prefix or a substring', () => {
		// A `startsWith('dd_ontology')` / `includes` widening would hand the
		// tld ordering to a matrix-shaped table, which then lacks `tld`.
		expect(consolidateOrderFor('dd_ontology_old')).toBe('section_tipo, section_id');
		expect(consolidateOrderFor('public.dd_ontology')).toBe('section_tipo, section_id');
		expect(consolidateOrderFor('DD_ONTOLOGY')).toBe('section_tipo, section_id');
	});

	test('the return value is one of the two closed enum members, always', () => {
		for (const table of ['dd_ontology', 'matrix_dd', '', 'whatever']) {
			expect(['tld, id', 'section_tipo, section_id']).toContain(consolidateOrderFor(table));
		}
	});
});

describe('the abort arm the order shares a loop with', () => {
	test('an absent first id is an ERROR verdict, not a skip', () => {
		// planConsolidation returning 'error' is what makes the action ABORT the
		// whole run instead of moving to the next table.
		expect(planConsolidation(null, 0)).toBe('error');
		expect(planConsolidation(undefined, 5)).toBe('error');
	});

	test("the caller RETURNS on 'error' rather than continuing", async () => {
		const source = await Bun.file(SOURCE_FILE).text();
		const arm = source.slice(source.indexOf("if (plan === 'error')"));
		expect(arm).not.toBe('');
		const head = arm.slice(0, 200);
		expect(head).toContain('errors.push(');
		expect(head).toContain('return {');
		expect(head).not.toContain('continue;');
	});
});

describe('the extraction is REWIRED, not duplicated', () => {
	test('the consolidate loop calls consolidateOrderFor and holds no inline ternary', async () => {
		const source = await Bun.file(SOURCE_FILE).text();
		expect(source).toContain('const order: ConsolidateOrder = consolidateOrderFor(table);');
		// The ternary is gone from the ACTION — it lives only in the extraction.
		const action = source.slice(source.indexOf('async function databaseInfoConsolidateTables'));
		expect(action).not.toBe('');
		expect(action).not.toContain("table === 'dd_ontology'");
		// and it exists exactly once in the whole file (the type alias spells the
		// two literals a second time, hence 2 for each literal).
		expect(source.split("table === 'dd_ontology' ? 'tld, id'").length - 1).toBe(1);
		expect(source.split("'tld, id'").length - 1).toBe(2);
		expect(source.split("'section_tipo, section_id'").length - 1).toBe(2);
	});
});
