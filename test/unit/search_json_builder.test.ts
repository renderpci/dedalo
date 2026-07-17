/**
 * builder_json unit gate (no DB) — component_json was UNSEARCHABLE before
 * 2026-07-17 (conform threw "declares no searchBuilder family"), so Activity's
 * Data (dd551) column and every JSON component could not be searched. Locks the
 * jsonpath envelope + operator grammar (contains/exact/not-contains/empty/
 * wildcard) over the tipo-keyed `misc` column, matching PHP search_component_json
 * but keeping the query value a BOUND param (never embedded in the jsonpath).
 */

import { describe, expect, test } from 'bun:test';
import { buildJsonFragment } from '../../src/core/search/builders/builder_json.ts';
import type { BuilderContext } from '../../src/core/search/builders/types.ts';

function ctx(overrides: Partial<BuilderContext> = {}): BuilderContext {
	return {
		alias: 'dd542',
		column: 'misc',
		tipo: 'dd551',
		sectionTipo: 'dd542',
		table: 'matrix_activity',
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_json',
		...overrides,
	};
}

describe('builder_json', () => {
	test('default → contains (accent/case-insensitive regex, value bound)', () => {
		const result = buildJsonFragment(['list'], '', ctx());
		expect(result).toMatchObject({
			kind: 'fragment',
			tokenValues: { _Q1_: 'list' },
		});
		expect((result as { sentence: string }).sentence).toContain(
			"jsonb_path_query(dd542.misc, '$.dd551[*]')",
		);
		expect((result as { sentence: string }).sentence).toContain(
			"f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)",
		);
	});

	test("'*' not-empty / '!*' empty test the tipo entries", () => {
		expect(buildJsonFragment(null, '*', ctx())).toMatchObject({
			sentence: "(dd542.misc @? '$.dd551[*]')",
		});
		expect((buildJsonFragment(null, '!*', ctx()) as { sentence: string }).sentence).toContain(
			'dd542.misc IS NULL OR NOT EXISTS',
		);
	});

	test("'==' exact, '!=' and '-' not-contains", () => {
		expect(buildJsonFragment(['List'], '==', ctx())).toMatchObject({
			tokenValues: { _Q1_: 'List' },
		});
		const ne = buildJsonFragment(['list'], '!=', ctx()) as { sentence: string };
		expect(ne.sentence).toContain('NOT EXISTS');
		const minus = buildJsonFragment(['list'], '-', ctx()) as { sentence: string };
		expect(minus.sentence).toContain('NOT EXISTS');
	});

	test('wildcard anchoring: begins-with vs ends-with', () => {
		const begins = buildJsonFragment(['list*'], '', ctx()) as { sentence: string };
		expect(begins.sentence).toContain("~* ('^' || f_unaccent(_Q1_))");
		const ends = buildJsonFragment(['*list'], '', ctx()) as { sentence: string };
		expect(ends.sentence).toContain("~* (f_unaccent(_Q1_) || '$')");
	});

	test('absent q with no operator drops the clause', () => {
		expect(buildJsonFragment(null, '', ctx())).toBe(false);
		expect(buildJsonFragment([''], '', ctx())).toBe(false);
	});
});
