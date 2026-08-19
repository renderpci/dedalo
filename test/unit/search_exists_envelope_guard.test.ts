/**
 * The redundant `@?` pre-guard on the POSITIVE exists-envelope (WC-055).
 *
 * builder_json and builder_iri both wrapped a value match as
 *   (col @? '$.<tipo>[*]') AND EXISTS (SELECT 1 FROM jsonb_path_query(col, …) …)
 * The leading `@?` cannot change the result: `jsonb_path_query` is a strict
 * set-returning function, so a NULL column or a path that yields no element
 * produces no rows and the EXISTS is already false. It is pure per-row work —
 * a second full jsonpath evaluation of the same path on the same document.
 *
 * IT IS NOT FREE. Measured on the 32.9M-row mdcat matrix_activity, the dd551
 * Data search (component_json over `misc`) scanning 200k rows for a term that
 * matches nothing — the case that cannot abort early and therefore reads
 * everything:
 *     with the guard      2854 ms
 *     without             1059 ms   (2.7x)
 * Extrapolated to the whole table that is ~470 s → ~175 s. Neither is fast:
 * this component is deliberately NOT indexed (a trigram GIN over an expression
 * on `misc` would be maintained on the hottest insert path in the system to
 * serve a search almost nobody runs), so the residual cost is accepted and
 * bounded by DB_STATEMENT_TIMEOUT_MS instead. The guard removal is simply free.
 *
 * SCOPED TO THE POSITIVE ENVELOPE. The same `@?` is LOAD-BEARING elsewhere and
 * must stay:
 *   - `!=` / `-` not-contains: `(col @? path) AND NOT EXISTS (…)` means "HAS
 *     entries for this tipo but none match". Without the guard every record
 *     lacking the component entirely would match.
 *   - `*` not-empty: the guard IS the predicate.
 * That asymmetry is the whole point of this gate.
 */
// BINDS INSTALL TLDs: oh — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { buildIriFragment } from '../../src/core/search/builders/builder_iri.ts';
import { buildJsonFragment } from '../../src/core/search/builders/builder_json.ts';
import type { BuilderContext } from '../../src/core/search/builders/types.ts';

function jsonCtx(overrides: Partial<BuilderContext> = {}): BuilderContext {
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

function iriCtx(overrides: Partial<BuilderContext> = {}): BuilderContext {
	return {
		alias: 'oh1',
		column: 'iri',
		tipo: 'oh18',
		sectionTipo: 'oh1',
		table: 'matrix',
		lang: 'lg-nolan',
		translatable: false,
		model: 'component_iri',
		...overrides,
	};
}

const sentenceOf = (result: unknown): string => (result as { sentence: string }).sentence;

describe('positive exists-envelope drops the redundant @? pre-guard', () => {
	test('builder_json: contains / exact carry EXISTS but no @? guard', () => {
		for (const [q, op] of [
			['list', ''],
			['List', '=='],
		] as const) {
			const sentence = sentenceOf(buildJsonFragment([q], op, jsonCtx()));
			expect(sentence).toContain('EXISTS (');
			expect(sentence).toContain("jsonb_path_query(dd542.misc, '$.dd551[*]')");
			expect(sentence, `operator '${op}' must not re-evaluate the path as a guard`).not.toContain(
				'@?',
			);
		}
	});

	test('builder_iri: contains carries EXISTS but no @? guard', () => {
		const sentence = sentenceOf(buildIriFragment(['example.org'], '', iriCtx()));
		expect(sentence).toContain('EXISTS (');
		expect(sentence).not.toContain('@?');
	});
});

describe('the @? guard SURVIVES where it carries meaning', () => {
	test("'!=' / '-' not-contains keeps it (else records without the component match)", () => {
		for (const op of ['!=', '-'] as const) {
			const sentence = sentenceOf(buildJsonFragment(['list'], op, jsonCtx()));
			expect(sentence).toContain('NOT EXISTS');
			expect(sentence, `operator '${op}' needs the has-entries guard`).toContain(
				"dd542.misc @? '$.dd551[*]'",
			);
		}
	});

	test("'*' not-empty IS the guard", () => {
		expect(sentenceOf(buildJsonFragment(null, '*', jsonCtx()))).toBe(
			"(dd542.misc @? '$.dd551[*]')",
		);
	});
});

/**
 * The equivalence the removal rests on, asserted against the real planner
 * rather than argued: guarded and unguarded predicates select the SAME rows,
 * including the NULL-column and no-entries cases that the guard supposedly
 * protected.
 */
describe('guarded and unguarded predicates select identical rows (real DB)', () => {
	test('every dd551 shape agrees, NULL and missing-component rows included', async () => {
		const rows = (await sql.unsafe(
			`WITH probe(id, misc) AS (VALUES
				(1, '{"dd551":[{"lang":"lg-nolan","value":"HTML Page is loaded in mode: list"}]}'::jsonb),
				(2, '{"dd551":[{"lang":"lg-nolan","value":{"msg":"Saved component data"}}]}'::jsonb),
				(3, '{"dd551":[]}'::jsonb),
				(4, '{"dd542":[{"lang":"lg-nolan","value":"other component only"}]}'::jsonb),
				(5, NULL::jsonb),
				(6, '{"dd551":[{"lang":"lg-nolan","value":null}]}'::jsonb)
			)
			SELECT id,
				((misc @? '$.dd551[*]') AND EXISTS (
					SELECT 1 FROM jsonb_path_query(misc, '$.dd551[*]') AS elem
					WHERE f_unaccent(elem->>'value') ~* f_unaccent($1))) AS guarded,
				(EXISTS (
					SELECT 1 FROM jsonb_path_query(misc, '$.dd551[*]') AS elem
					WHERE f_unaccent(elem->>'value') ~* f_unaccent($1))) AS unguarded
			FROM probe ORDER BY id`,
			['a'],
		)) as { id: number; guarded: boolean | null; unguarded: boolean | null }[];

		expect(rows.length).toBe(6);
		for (const row of rows) {
			// `guarded` can be NULL (NULL @? → NULL) where `unguarded` is false;
			// both are non-TRUE, so WHERE excludes the row either way.
			expect(row.guarded === true, `row ${row.id}`).toBe(row.unguarded === true);
		}
		// The gate would be vacuous if nothing matched: rows 1 and 2 carry an 'a'.
		expect(rows.filter((row) => row.unguarded === true).map((row) => row.id)).toEqual([1, 2]);
	});
});
