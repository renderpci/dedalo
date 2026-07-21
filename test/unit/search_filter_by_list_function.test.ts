/**
 * Relation filter leaves (conform.ts) — the autocomplete picker's pre-filter
 * checkboxes (e.g. numisdata4's numisdata161 "Catálogo" filter). Both wire
 * shapes resolve to the same exact tuple-IN over matrix_relation_index:
 *
 * CANONICAL format:'relation' (2026-07-21): q is a partial locator object
 *   ({from_component_tipo, section_tipo, section_id, type?}) or an array of
 *   them (array = OR within the leaf). Strictly validated.
 *
 * DEPRECATED format:'function' (WC-012 reader, kept for beta-era saved
 *   searches): { q:'"<fct>_<st>_<si>"', use_function:'relations_flat_*' } —
 *   the v6-era vocabulary; the stored functions were REMOVED 2026-07-20.
 *
 * DELIBERATE functionality-over-parity: the live PHP oracle interpolated the
 * v6 name verbatim → SQL error → 0 results (probed 2026-07-09; TS used to
 * IGNORE the clause → unfiltered results, the reported bug). These cases
 * therefore assert TS ground truth, NOT PHP equality.
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

function relationClause(q: unknown): Record<string, unknown> {
	return {
		q,
		path: [{ section_tipo: SECTION, component_tipo: FILTER_COMPONENT }],
		format: 'relation',
	};
}

async function catalogueTruth(catalogueIds: string[]): Promise<number> {
	const truth = (await sql.unsafe(
		`SELECT count(*)::int AS c FROM matrix
		 WHERE section_tipo = $1 AND EXISTS (
			SELECT 1 FROM jsonb_array_elements(relation->$2) e
			WHERE e->>'section_tipo' = $3
			  AND e->>'section_id' IN (SELECT jsonb_array_elements_text($4::text::jsonb))
			  AND e->>'from_component_tipo' = $2)`,
		[SECTION, FILTER_COMPONENT, CATALOGUE_SECTION, JSON.stringify(catalogueIds)],
	)) as { c: number }[];
	return truth[0]?.c ?? 0;
}

describe("filter leaves format:'relation' (canonical, 2026-07-21)", () => {
	test('single locator object narrows to the ground-truth record set', async () => {
		if (!dbReady) return;
		for (const catalogueId of ['1', '2']) {
			const expected = await catalogueTruth([catalogueId]);
			expect(expected).toBeGreaterThan(0); // fixture guard
			const total = await runCount({
				$and: [
					{
						$or: [
							relationClause({
								from_component_tipo: FILTER_COMPONENT,
								section_tipo: CATALOGUE_SECTION,
								section_id: catalogueId,
							}),
						],
					},
				],
			});
			expect(total).toBe(expected);
		}
	});

	test('array q = OR within the leaf (one index subquery, union of both sets)', async () => {
		if (!dbReady) return;
		const expected = await catalogueTruth(['1', '2']);
		const total = await runCount({
			$and: [
				relationClause([
					{
						from_component_tipo: FILTER_COMPONENT,
						section_tipo: CATALOGUE_SECTION,
						section_id: 1,
					},
					{
						from_component_tipo: FILTER_COMPONENT,
						section_tipo: CATALOGUE_SECTION,
						section_id: '2',
					},
				]),
			],
		});
		expect(total).toBe(expected);
	});

	test('array leaf equals the $or-of-single-leaves form (both wire shapes)', async () => {
		if (!dbReady) return;
		const viaOperators = await runCount({
			$and: [
				{
					$or: [
						relationClause({
							from_component_tipo: FILTER_COMPONENT,
							section_tipo: CATALOGUE_SECTION,
							section_id: 1,
						}),
						relationClause({
							from_component_tipo: FILTER_COMPONENT,
							section_tipo: CATALOGUE_SECTION,
							section_id: 2,
						}),
					],
				},
			],
		});
		expect(viaOperators).toBe(await catalogueTruth(['1', '2']));
	});

	test('strict validation: unknown field, bad tipo, non-integer id, empty array all throw', async () => {
		if (!dbReady) return;
		await expect(
			runCount({ $and: [relationClause({ section_tipo: CATALOGUE_SECTION, bogus: 'x' })] }),
		).rejects.toThrow(/unknown locator field 'bogus'/);
		await expect(
			runCount({ $and: [relationClause({ section_tipo: "x'; DROP--" })] }),
		).rejects.toThrow(/invalid tipo/);
		await expect(
			runCount({
				$and: [relationClause({ section_tipo: CATALOGUE_SECTION, section_id: '1 OR 1=1' })],
			}),
		).rejects.toThrow(/is not an integer/);
		await expect(runCount({ $and: [relationClause([])] })).rejects.toThrow(/q array is empty/);
		await expect(runCount({ $and: [relationClause({ section_id: 1 })] })).rejects.toThrow(
			/needs a section_tipo/,
		);
	});
});

describe("filter_by_list format:'function' (DEPRECATED reader, WC-012)", () => {
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
