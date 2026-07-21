/**
 * Phase 3/6 gate: the search_related inverse-reference engine.
 *
 * Expectations are DB-DERIVED (raw jsonb locator enumeration over every
 * relation-capable table — deliberately NOT the engine's own
 * matrix_relation_index, so the store is validated against the source of
 * truth): the full inverse set of a well-referenced record,
 * from_component_tipo narrowing, target-section narrowing, and a real
 * write→find→cleanup round-trip on the test section.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	findInverseReferenceLocators,
	findInverseReferences,
	getRelationTables,
} from '../../src/core/search/search_related.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

/** A well-referenced target on this install (a Ceca used by many records). */
const TARGET = { section_tipo: 'numisdata6', section_id: 1 };

async function groundTruthCount(): Promise<number> {
	const tables = await getRelationTables();
	let total = 0;
	for (const table of tables) {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS c FROM "${table}" t
			 WHERE EXISTS (
				SELECT 1 FROM jsonb_each(t.relation) AS kv, jsonb_array_elements(kv.value) AS e
				WHERE jsonb_typeof(kv.value) = 'array'
				  AND e->>'section_tipo' = $1 AND e->>'section_id' = $2)`,
			[TARGET.section_tipo, String(TARGET.section_id)],
		)) as { c: number }[];
		total += rows[0]?.c ?? 0;
	}
	return total;
}

describe('search_related (inverse references, Phase 3/6 gate)', () => {
	// generous timeout: the ground truth deliberately enumerates raw jsonb
	// across every relation-capable table (no index — that is the point)
	test('finds the full inverse set of a well-referenced record', async () => {
		const expected = await groundTruthCount();
		expect(expected).toBeGreaterThan(0);
		const hits = await findInverseReferences([TARGET]);
		expect(hits.length).toBe(expected);
		// Every hit REALLY holds a locator to the target (spot-check first 5,
		// against the raw jsonb — never the index the engine itself used).
		for (const hit of hits.slice(0, 5)) {
			const rows = (await sql.unsafe(
				`SELECT 1 FROM "${hit.table}" t
				 WHERE t.section_tipo = $1 AND t.section_id = $2
				   AND EXISTS (
					SELECT 1 FROM jsonb_each(t.relation) AS kv, jsonb_array_elements(kv.value) AS e
					WHERE jsonb_typeof(kv.value) = 'array'
					  AND e->>'section_tipo' = $3 AND e->>'section_id' = $4)`,
				[hit.section_tipo, hit.section_id, TARGET.section_tipo, String(TARGET.section_id)],
			)) as unknown[];
			expect(rows.length).toBe(1);
		}
	}, 120000);

	test('target-section narrowing keeps only the requested owners', async () => {
		const all = await findInverseReferences([TARGET]);
		const firstOwner = all[0]?.section_tipo as string;
		const narrowed = await findInverseReferences([TARGET], { sectionTipos: [firstOwner] });
		expect(narrowed.length).toBe(all.filter((hit) => hit.section_tipo === firstOwner).length);
		expect(narrowed.every((hit) => hit.section_tipo === firstOwner)).toBe(true);
	});

	test('limit/offset paginate deterministically', async () => {
		const all = await findInverseReferences([TARGET]);
		if (all.length < 3) {
			// FAIL LOUD, never silently green (test-quality audit 2026-07-07).
			throw new Error(
				`fixture too small: only ${all.length} inverse references to ${JSON.stringify(TARGET)} — pagination gate cannot assert`,
			);
		}
		const pageOne = await findInverseReferences([TARGET], { limit: 2, offset: 0 });
		const pageTwo = await findInverseReferences([TARGET], { limit: 2, offset: 2 });
		expect(pageOne).toEqual(all.slice(0, 2));
		expect(pageTwo).toEqual(all.slice(2, 4));
	});

	test('from_component_tipo narrows to the pointing slot (write round-trip)', async () => {
		// Seed a test-section record pointing at the target from a known slot.
		const seedId = 999901;
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, relation)
			 VALUES ($1, 'test2', $2::text::jsonb)
			 ON CONFLICT DO NOTHING`,
			[
				seedId,
				JSON.stringify({
					test99: [
						{
							type: 'dd151',
							section_tipo: TARGET.section_tipo,
							section_id: String(TARGET.section_id),
							from_component_tipo: 'test99',
						},
					],
				}),
			],
		);
		try {
			const bySlot = await findInverseReferences([{ ...TARGET, from_component_tipo: 'test99' }]);
			expect(bySlot).toEqual([{ section_tipo: 'test2', section_id: seedId, table: 'matrix_test' }]);
			// And the generic query includes it too.
			const generic = await findInverseReferences([TARGET]);
			expect(generic.some((hit) => hit.section_id === seedId)).toBe(true);
		} finally {
			await cleanScratchRecord('test2', seedId);
		}
	});
});

describe('breakdown mode (exact-locator recovery)', () => {
	test('every recovered locator_data targets the filter exactly', async () => {
		const hits = await findInverseReferenceLocators([TARGET], { limit: 20 });
		expect(hits.length).toBeGreaterThan(0);
		for (const hit of hits) {
			expect(hit.locator_data.section_tipo).toBe(TARGET.section_tipo);
			expect(String(hit.locator_data.section_id)).toBe(String(TARGET.section_id));
		}
	});

	test('breakdown recovers the SEEDED locator object verbatim', async () => {
		const seedId = 999902;
		const seededLocator = {
			type: 'dd151',
			section_tipo: TARGET.section_tipo,
			section_id: String(TARGET.section_id),
			from_component_tipo: 'test99',
		};
		await sql.unsafe(
			`INSERT INTO matrix_test (section_id, section_tipo, relation)
			 VALUES ($1, 'test2', $2::text::jsonb) ON CONFLICT DO NOTHING`,
			[seedId, JSON.stringify({ test99: [seededLocator] })],
		);
		try {
			const hits = await findInverseReferenceLocators([
				{ ...TARGET, from_component_tipo: 'test99' },
			]);
			expect(hits).toEqual([
				{
					section_tipo: 'test2',
					section_id: seedId,
					table: 'matrix_test',
					locator_data: seededLocator,
				},
			]);
		} finally {
			await cleanScratchRecord('test2', seedId);
		}
	});
});

afterAll(async () => {
	// Safety: the seeded rows are removed in each test's finally; nothing else.
});
