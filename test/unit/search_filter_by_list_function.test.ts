/**
 * filter_by_list `format:'function'` clauses (conform.ts, 2026-07-09) — the
 * autocomplete picker's pre-filter checkboxes (e.g. numisdata4's numisdata161
 * "Catálogo" filter). Each checked option becomes:
 *   { q:'"<fct>_<st>_<si>"', path:[…], format:'function',
 *     use_function:'relations_flat_fct_st_si' }
 * and must narrow the search to records whose relation holds a matching
 * locator, via an exact tuple-IN over matrix_relation_index (the v6-era
 * data_relations_flat_* functions were REMOVED 2026-07-20; the use_function
 * name survives as wire vocabulary only — WC-012).
 *
 * DELIBERATE functionality-over-parity: the client names the LEGACY v6
 * function (no data_ prefix); the live PHP oracle interpolated the v6 name
 * verbatim → SQL error → 0 results (probed 2026-07-09; TS used to IGNORE the
 * clause → unfiltered results, the reported bug). TS maps through an explicit
 * allowlist and binds the key as a parameter. These cases therefore assert
 * TS ground truth, NOT PHP equality.
 *
 * Fixtures: numisdata3 gated by catalogue select numisdata309 → numisdata300
 * records (catalogue 1 = 5425 rows, catalogue 2 = 2726, probed 2026-07-09 —
 * re-derived in-test, never hardcoded).
 */

import { beforeAll, describe, expect, test } from 'bun:test';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';

const SECTION = 'numisdata3';
const FILTER_COMPONENT = 'numisdata309';
const CATALOGUE_SECTION = 'numisdata300';

function functionClause(useFunction: string, key: string): Record<string, unknown> {
	return {
		q: JSON.stringify(key),
		path: [{ section_tipo: SECTION, component_tipo: FILTER_COMPONENT }],
		format: 'function',
		use_function: useFunction,
	};
}

async function runCount(filter: Record<string, unknown>): Promise<number> {
	const sqo = sanitizeClientSqo(
		structuredClone({ section_tipo: [SECTION], limit: 10, offset: 0, full_count: true, filter }),
	);
	const { sql: builtSql, params } = await buildSearchSql(sqo, {});
	const rows = (await sql.unsafe(builtSql, params as (string | number | null)[])) as {
		full_count: number | string;
	}[];
	return rows.reduce((sum, row) => sum + Number(row.full_count), 0);
}

let dbReady = false;
beforeAll(async () => {
	try {
		await sql`SELECT 1`;
		dbReady = true;
	} catch {
		dbReady = false; // no shared DB on this machine — cases skip honestly
	}
});

describe("filter_by_list format:'function' (autocomplete pre-filter)", () => {
	test('single catalogue clause narrows to the ground-truth record set', async () => {
		if (!dbReady) return;
		for (const catalogueId of ['1', '2']) {
			const truth = (await sql.unsafe(
				`SELECT count(*)::int AS c FROM matrix
				 WHERE section_tipo = $1 AND EXISTS (
					SELECT 1 FROM jsonb_array_elements(relation->$2) e
					WHERE e->>'section_tipo' = $3 AND e->>'section_id' = $4
					  AND e->>'from_component_tipo' = $2)`,
				[SECTION, FILTER_COMPONENT, CATALOGUE_SECTION, catalogueId],
			)) as { c: number }[];
			expect(truth[0]?.c).toBeGreaterThan(0); // fixture guard
			const total = await runCount({
				$and: [
					{
						$or: [
							functionClause(
								'relations_flat_fct_st_si',
								`${FILTER_COMPONENT}_${CATALOGUE_SECTION}_${catalogueId}`,
							),
						],
					},
				],
			});
			expect(total).toBe(truth[0]?.c as number);
		}
	});

	test('two catalogue clauses under $or = union of both sets', async () => {
		if (!dbReady) return;
		const truth = (await sql.unsafe(
			`SELECT count(*)::int AS c FROM matrix
			 WHERE section_tipo = $1 AND EXISTS (
				SELECT 1 FROM jsonb_array_elements(relation->$2) e
				WHERE e->>'section_tipo' = $3 AND e->>'section_id' IN ('1','2')
				  AND e->>'from_component_tipo' = $2)`,
			[SECTION, FILTER_COMPONENT, CATALOGUE_SECTION],
		)) as { c: number }[];
		const total = await runCount({
			$and: [
				{
					$or: [
						functionClause(
							'relations_flat_fct_st_si',
							`${FILTER_COMPONENT}_${CATALOGUE_SECTION}_1`,
						),
						functionClause(
							'relations_flat_fct_st_si',
							`${FILTER_COMPONENT}_${CATALOGUE_SECTION}_2`,
						),
					],
				},
			],
		});
		expect(total).toBe(truth[0]?.c as number);
	});

	test('unknown use_function throws loudly (allowlist-only, never interpolated)', async () => {
		if (!dbReady) return;
		await expect(
			runCount({
				$and: [{ $or: [functionClause('pg_sleep; DROP TABLE matrix', 'x_y_1')] }],
			}),
		).rejects.toThrow(/unknown use_function/);
	});

	test('malformed flat key contributes nothing (no crash, unfiltered)', async () => {
		if (!dbReady) return;
		const unfiltered = await runCount({ $and: [] });
		const total = await runCount({
			$and: [{ $or: [functionClause('relations_flat_fct_st_si', "bad'); DROP--")] }],
		});
		expect(total).toBe(unfiltered);
	});
});
