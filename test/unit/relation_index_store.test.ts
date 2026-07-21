/**
 * matrix_relation_index — the per-locator relation index (phases 1-2,
 * 2026-07-20): sync-trigger round-trip, index-driven search_related paths vs
 * flat-function ground truth (result equality on live data), and the WC-012
 * format:'function' leaf translation shape.
 *
 * The index is DERIVED and never authoritative; these gates pin that the
 * covered paths return exactly what the classic flat-GIN containment returns.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sanitizeClientSqo } from '../../src/core/concepts/sqo.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	countInverseReferences,
	findInverseReferenceLocators,
	findInverseReferences,
} from '../../src/core/search/search_related.ts';
import { buildSearchSql } from '../../src/core/search/sql_assembler.ts';

const SCRATCH_ID = 999903; // matrix_test scratch surface

async function storeReady(): Promise<boolean> {
	try {
		const rows = (await sql`
			SELECT 1 AS ok FROM pg_trigger WHERE tgname = 'matrix_test_relation_index_sync' LIMIT 1
		`) as { ok: number }[];
		return rows.length > 0;
	} catch {
		return false;
	}
}

afterAll(async () => {
	try {
		await sql`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
	} catch {
		// no DB — nothing to clean
	}
});

describe('sync trigger', () => {
	test('insert/update/delete keep matrix_relation_index in sync; non-numeric ids are skipped', async () => {
		if (!(await storeReady())) return;
		const storeRows = () =>
			sql`SELECT from_component_tipo, type, target_section_tipo, target_section_id
			    FROM matrix_relation_index
			    WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}
			    ORDER BY from_component_tipo, target_section_id` as Promise<
				{
					from_component_tipo: string;
					type: string | null;
					target_section_tipo: string;
					target_section_id: number;
				}[]
			>;
		await sql`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
		await sql`INSERT INTO matrix_test (section_tipo, section_id, relation)
		          VALUES ('test3', ${SCRATCH_ID}, '{"test52":[
		            {"type":"dd151","section_tipo":"test3","section_id":"7"},
		            {"type":"dd151","section_tipo":"test3","section_id":7},
		            {"type":"dd151","section_tipo":"test3","section_id":"not_numeric"}
		          ]}'::jsonb)`;
		let rows = await storeRows();
		// both string "7" and number 7 normalize to int 7; the junk locator is skipped
		expect(rows.length).toBe(2);
		expect(rows.every((r) => r.target_section_id === 7 && r.type === 'dd151')).toBe(true);
		await sql`UPDATE matrix_test SET relation = '{"test52":[{"type":"dd151","section_tipo":"test3","section_id":"9"}]}'::jsonb
		          WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
		rows = await storeRows();
		expect(rows.map((r) => r.target_section_id)).toEqual([9]);
		await sql`DELETE FROM matrix_test WHERE section_tipo = 'test3' AND section_id = ${SCRATCH_ID}`;
		rows = await storeRows();
		expect(rows).toEqual([]);
	});
});

describe('index-driven search_related equals flat-function ground truth (skips without store)', () => {
	// rsc197/6848: the most-referenced person in the MIB dataset (fixture guard below)
	const TARGET = { section_tipo: 'rsc197', section_id: 6848 };

	test('findInverseReferences — same owner set as raw jsonb ground truth (rsc205 scope)', async () => {
		if (!(await storeReady())) return;
		// Ground truth from the RAW jsonb (no flat functions — their indexes are
		// retired), section-scoped so the expansion is bitmap-bounded.
		const truth = (await sql.unsafe(
			`SELECT DISTINCT m.section_tipo, m.section_id FROM matrix m
			 WHERE m.section_tipo = 'rsc205' AND EXISTS (
				SELECT 1 FROM jsonb_each(m.relation) kv, jsonb_array_elements(kv.value) e
				WHERE jsonb_typeof(kv.value) = 'array'
				  AND e->>'section_tipo' = 'rsc197' AND e->>'section_id' = '6848')`,
			[],
		)) as { section_tipo: string; section_id: number }[];
		const truthKeys = new Set(truth.map((r) => `${r.section_tipo}/${r.section_id}`));
		expect(truthKeys.size).toBeGreaterThan(100); // fixture guard

		const hits = await findInverseReferences([TARGET], {
			limit: false,
			order: 'section_id',
			sectionTipos: ['rsc205'],
		});
		const hitKeys = new Set(hits.map((h) => `${h.section_tipo}/${h.section_id}`));
		expect([...hitKeys].sort()).toEqual([...truthKeys].sort());
		expect(hits.length).toBe(hitKeys.size); // no duplicate owners
	}, 30000);

	test('countInverseReferences — total and section_tipo grouping match the find set', async () => {
		if (!(await storeReady())) return;
		const hits = await findInverseReferences([TARGET], { limit: false });
		const counted = await countInverseReferences([TARGET], { groupBy: ['section_tipo'] });
		expect(counted.total).toBe(hits.length);
		const byTipo = new Map<string, number>();
		for (const hit of hits) byTipo.set(hit.section_tipo, (byTipo.get(hit.section_tipo) ?? 0) + 1);
		for (const group of counted.totals_group ?? []) {
			expect(group.value).toBe(byTipo.get(group.key[0] as string) as number);
		}
	});

	test('findInverseReferenceLocators — exact locator payloads survive the index row-narrowing', async () => {
		if (!(await storeReady())) return;
		const hits = await findInverseReferenceLocators(
			[{ ...TARGET, from_component_tipo: 'rsc139' }],
			{ limit: false, order: 'section_id' },
		);
		expect(hits.length).toBeGreaterThan(100); // fixture guard (467 measured)
		for (const hit of hits.slice(0, 20)) {
			expect(hit.locator_data.section_tipo).toBe('rsc197');
			expect(String(hit.locator_data.section_id)).toBe('6848');
			expect(hit.locator_data.from_component_tipo).toBe('rsc139');
		}
	});

	test('order table + limit pagination stays exact (relation_list shape)', async () => {
		if (!(await storeReady())) return;
		const pageA = await findInverseReferences([TARGET], { limit: 10, offset: 0 });
		const pageB = await findInverseReferences([TARGET], { limit: 10, offset: 10 });
		expect(pageA.length).toBe(10);
		expect(pageB.length).toBe(10);
		const overlap = new Set(pageA.map((h) => `${h.section_tipo}/${h.section_id}`));
		expect(pageB.some((h) => overlap.has(`${h.section_tipo}/${h.section_id}`))).toBe(false);
	});
});

describe('WC-012 format:function leaf translation', () => {
	test('covered table emits the matrix_relation_index tuple-IN, key parsed into columns', async () => {
		if (!(await storeReady())) return;
		const sqo = sanitizeClientSqo(
			structuredClone({
				section_tipo: ['rsc205'],
				limit: 10,
				offset: 0,
				filter: {
					$and: [
						{
							format: 'function',
							use_function: 'relations_flat_fct_st_si',
							q: 'rsc139_rsc197_6848',
							path: [{ section_tipo: 'rsc205', component_tipo: 'rsc139' }],
						},
					],
				},
			}) as never,
		);
		const { sql: builtSql, params } = await buildSearchSql(sqo, {});
		expect(builtSql).toContain('FROM matrix_relation_index r');
		expect(builtSql).toContain('r.from_component_tipo = $');
		expect(builtSql).toContain('r.target_section_id = $');
		expect(builtSql).not.toContain('data_relations_flat');
		expect(params).toContain('rsc139');
		expect(params).toContain('rsc197');
		expect(params).toContain('6848');
		// result equality vs the raw jsonb enumeration (the source of truth —
		// the retired flat containment's semantics, expressed directly)
		const viaIndex = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix mix WHERE mix.section_tipo = 'rsc205'
			 AND (mix.section_tipo, mix.section_id) IN
			   (SELECT r.section_tipo, r.section_id FROM matrix_relation_index r
			    WHERE r.from_component_tipo = 'rsc139' AND r.target_section_tipo = 'rsc197' AND r.target_section_id = 6848)`,
			[],
		)) as { n: number }[];
		const viaJsonb = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix mix WHERE mix.section_tipo = 'rsc205'
			 AND EXISTS (
				SELECT 1 FROM jsonb_each(mix.relation) AS kv, jsonb_array_elements(kv.value) AS e
				WHERE jsonb_typeof(kv.value) = 'array' AND kv.key = 'rsc139'
				  AND e->>'section_tipo' = 'rsc197' AND e->>'section_id' = '6848')`,
			[],
		)) as { n: number }[];
		expect(viaIndex[0]?.n).toBe(viaJsonb[0]?.n as number);
		expect(viaIndex[0]?.n).toBeGreaterThan(0);
	});
});
