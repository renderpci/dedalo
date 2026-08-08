/**
 * TS_NODE_REPOSITORY — DB-backed gates for the two batch readers behind every
 * thesaurus/ontology tree payload:
 *   - fetchNodeInfo        (src/core/ts_object/node_repository.ts:195, comp 40)
 *   - batchDescriptorFlags (src/core/ts_object/node_repository.ts:312, comp 10)
 *
 * WHY THIS FILE EXISTS. Both functions were at 13% line coverage: every DB-backed
 * tree gate in the suite is pinned on `tchi1`, and `matrix_hierarchy` holds ZERO
 * tchi1 rows in `dedalo_mib_v7_test`, so only the two PURE helpers
 * (formatNumberValue / pickOrderValueForParent — gated in ts_tree_semantics.test.ts)
 * ever executed. The SQL-building, grouping, back-fill, throw and flag branches were
 * completely unexercised. This file rebases them onto the test3 playground
 * (section_map test137: term test52, order test22, parent test71, is_descriptor test88)
 * plus a PROVISIONED scratch section for the branches test3's map cannot reach.
 *
 * WHY A SCRATCH ONTOLOGY SECTION. test3's section_map declares NO `is_indexable`,
 * so on test3 alone `is_indexable` is CONSTANT FALSE and no assertion against it can
 * ever redden — deleting the whole is_indexable computation would leave a test3-only
 * file green. The same holds for the invalid-tipo-grammar throws, the
 * "no matrix table" throws, the hierarchy/ontology root suppression and the
 * "section declares no order/is_descriptor" null paths: none are reachable from any
 * section that ships in the test database (a survey of dd_ontology found no
 * section_map anywhere declaring thesaurus.is_indexable). So the scratch cases
 * provision a real dd_ontology section + section_map pair, run, and restore in a
 * `finally` with the ontology caches cleared on BOTH sides — the ontology write is
 * NOT healed by the preload.
 *
 * SCRATCH SURFACES (this file owns ONLY these):
 *   - matrix_test rows, section_tipo 'test3',        section_id 921000-921099
 *   - matrix_test rows, section_tipo 'zzt921001',    section_id 921100-921199
 *   - matrix_test rows, section_tipo 'hierarchy921001', section_id 921200-921299
 *   - dd_ontology rows 'zzt921001'/'zzt921002' and 'hierarchy921001'/'hierarchy921002'
 *     (created and dropped INSIDE the test body that needs them)
 *   - dd_ontology row 'zzt921004': an ORPHAN section_map whose parent 'zzt921003'
 *     intentionally has NO node row (model null + is_descriptor declared)
 * Nothing is asserted with a table-global count: the suite runs concurrently against
 * this database and every count here is scoped to this file's own tipos/ids.
 *
 * NOTE ON test3 CANONICAL ROWS: the preload restores test3/1, /2, /27 ONLY, so the
 * read-side cases assert against 1 and 2 and never against strays (test3/10…13 exist
 * in this database and are deliberately untouched and unasserted).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { encodeForJsonb } from '../../src/core/db/json_codec.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { getModelByTipo } from '../../src/core/ontology/resolver.ts';
import { getSectionMap } from '../../src/core/ontology/section_map.ts';
import { batchDescriptorFlags, fetchNodeInfo } from '../../src/core/ts_object/node_repository.ts';

/** This file's scratch section tipos (matrix_test rows only). */
const SCRATCH_TIPOS = ['zzt921001', 'hierarchy921001'] as const;
/** This file's scratch dd_ontology tipos. */
const SCRATCH_ONTOLOGY_TIPOS = [
	'zzt921001',
	'zzt921002',
	'hierarchy921001',
	'hierarchy921002',
	// the ORPHAN section_map (its parent tipo zzt921003 deliberately has NO node row)
	'zzt921004',
] as const;
/** Postgres array literals for the ANY() binds (Bun.sql binds arrays as text). */
const SCRATCH_TIPOS_ARRAY = `{${SCRATCH_TIPOS.join(',')}}`;
const SCRATCH_ONTOLOGY_TIPOS_ARRAY = `{${SCRATCH_ONTOLOGY_TIPOS.join(',')}}`;
/** This file's scratch test3 id range (inclusive). */
const TEST3_ID_LOW = 921000;
const TEST3_ID_HIGH = 921099;

/** Insert one scratch matrix_test row. */
async function seedRow(
	sectionTipo: string,
	sectionId: number,
	numberData: Record<string, unknown>,
	relationData: Record<string, unknown>,
): Promise<void> {
	await sql`
		INSERT INTO matrix_test (section_id, section_tipo, "number", relation)
		VALUES (
			${sectionId}, ${sectionTipo},
			${encodeForJsonb(numberData)}::text::jsonb,
			${encodeForJsonb(relationData)}::text::jsonb
		)
	`;
}

/** Count this file's rows in a table, scoped to its own tipos/ids. */
async function scratchRowCount(): Promise<number> {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM matrix_test
		WHERE section_tipo = ANY(${SCRATCH_TIPOS_ARRAY}::text[])
		   OR (section_tipo = 'test3' AND section_id BETWEEN ${TEST3_ID_LOW} AND ${TEST3_ID_HIGH})
	`) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function scratchOntologyCount(): Promise<number> {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM dd_ontology
		WHERE tipo = ANY(${SCRATCH_ONTOLOGY_TIPOS_ARRAY}::text[])
	`) as { n: number }[];
	return rows[0]?.n ?? 0;
}

async function scratchTimeMachineCount(): Promise<number> {
	const rows = (await sql`
		SELECT count(*)::int AS n FROM matrix_time_machine
		WHERE section_tipo = ANY(${SCRATCH_TIPOS_ARRAY}::text[])
		   OR (section_tipo = 'test3' AND section_id::text ~ '^9210[0-9][0-9]$')
	`) as { n: number }[];
	return rows[0]?.n ?? 0;
}

/** Remove every surface this file can create. Used by beforeAll and afterAll. */
async function purgeScratch(): Promise<void> {
	await sql`
		DELETE FROM matrix_test
		WHERE section_tipo = ANY(${SCRATCH_TIPOS_ARRAY}::text[])
		   OR (section_tipo = 'test3' AND section_id BETWEEN ${TEST3_ID_LOW} AND ${TEST3_ID_HIGH})
	`;
	await sql`
		DELETE FROM matrix_time_machine
		WHERE section_tipo = ANY(${SCRATCH_TIPOS_ARRAY}::text[])
		   OR (section_tipo = 'test3' AND section_id::text ~ '^9210[0-9][0-9]$')
	`;
	await sql`
		DELETE FROM dd_ontology WHERE tipo = ANY(${SCRATCH_ONTOLOGY_TIPOS_ARRAY}::text[])
	`;
	await clearOntologyDerivedCaches();
}

/**
 * Provision a real dd_ontology section + its section_map child, run `body`, then
 * drop both and clear the ontology caches — on the success AND the failure path.
 *
 * `model` overrides the node's model. MEASURED (plan discrepancy): a node whose
 * model IS 'section' but which carries no matrix_table relation does NOT resolve to
 * null — getMatrixTableFromTipo falls back to the default 'matrix' table. The only
 * way to get a non-null model with a null table is a NON-section model, hence the
 * override.
 */
async function withScratchSection(
	sectionTipo: string,
	mapTipo: string,
	thesaurus: Record<string, unknown> | null,
	options: { matrixTable?: boolean; model?: string },
	body: () => Promise<void>,
): Promise<void> {
	const relations = options.matrixTable === false ? null : [{ tipo: 'test24' }];
	const model = options.model ?? 'section';
	try {
		await sql`
			INSERT INTO dd_ontology (tipo, model, parent, relations)
			VALUES (${sectionTipo}, ${model}, 'test1',
				${relations === null ? null : encodeForJsonb(relations)}::text::jsonb)
		`;
		if (thesaurus !== null) {
			await sql`
				INSERT INTO dd_ontology (tipo, model, parent, properties)
				VALUES (${mapTipo}, 'section_map', ${sectionTipo},
					${encodeForJsonb({ thesaurus })}::text::jsonb)
			`;
		}
		await clearOntologyDerivedCaches();
		await body();
	} finally {
		await sql`DELETE FROM matrix_test WHERE section_tipo = ${sectionTipo}`;
		await sql`DELETE FROM dd_ontology WHERE tipo IN (${sectionTipo}, ${mapTipo})`;
		await clearOntologyDerivedCaches();
	}
}

beforeAll(async () => {
	// A crashed earlier run must not make an EXECUTE case assert against stale rows.
	await purgeScratch();
	expect(await scratchRowCount()).toBe(0);
	expect(await scratchOntologyCount()).toBe(0);
});

afterAll(async () => {
	await purgeScratch();
	// Fail loud: both ends must reach zero, or this file poisoned a shared database.
	expect(await scratchRowCount()).toBe(0);
	expect(await scratchTimeMachineCount()).toBe(0);
	expect(await scratchOntologyCount()).toBe(0);
});

describe('fetchNodeInfo — batching, back-fill and formatting on test3', () => {
	test('one query per section_tipo group: every requested locator gets a key, missing rows back-fill', async () => {
		const info = await fetchNodeInfo([
			{ section_tipo: 'test3', section_id: 1 },
			{ section_tipo: 'test3', section_id: 2 },
			// inside this file's own id range and deliberately NOT seeded
			{ section_tipo: 'test3', section_id: 921099 },
		]);

		expect(info.size).toBe(3);
		// test3/1 carries number.test22 = [{id:1,value:99}] (canonical seed).
		expect(info.get('test3_1')).toEqual({ order: 99, is_indexable: false });
		// test3/2 exists but has no number data → the ->0->>'value' select is NULL.
		expect(info.get('test3_2')).toEqual({ order: null, is_indexable: false });
		// no row at all → the back-fill loop, not the row loop.
		expect(info.get('test3_921099')).toEqual({ order: null, is_indexable: false });

		// COVERAGE GAP, stated rather than pretended: test3's section_map declares no
		// thesaurus.is_indexable, so is_indexable is CONSTANT FALSE for every test3
		// locator and these three `false`s cannot redden an is_indexable regression.
		// The real is_indexable gate is the scratch-section describe below.
	});

	test('a section_id given as a string is normalized (Number/trunc) and still keys by the numeric id', async () => {
		const info = await fetchNodeInfo([{ section_tipo: 'test3', section_id: '1' }]);
		expect([...info.keys()]).toEqual(['test3_1']);
		expect(info.get('test3_1')?.order).toBe(99);
	});

	test('the order value goes through the component_number format (test22 declares no type → parseFloat)', async () => {
		await seedRow('test3', 921001, { test22: [{ id: 1, value: '3.7' }] }, {});
		const info = await fetchNodeInfo([{ section_tipo: 'test3', section_id: 921001 }]);
		// stored as the STRING '3.7'; test22's properties are {"a":1} — no `type` — so
		// formatNumberValue takes the no-type branch and returns the float 3.7.
		expect(info.get('test3_921001')?.order).toBe(3.7);
		expect(typeof info.get('test3_921001')?.order).toBe('number');
	});

	test('several section_tipo groups in ONE call each run their own query and merge', async () => {
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ order: 'test22', is_indexable: 'test88', is_descriptor: 'test88' },
			{},
			async () => {
				await seedRow('zzt921001', 921100, { test22: [{ id: 1, value: 7 }] }, {});
				const info = await fetchNodeInfo([
					{ section_tipo: 'test3', section_id: 1 },
					{ section_tipo: 'zzt921001', section_id: 921100 },
				]);
				expect(info.size).toBe(2);
				expect(info.get('test3_1')?.order).toBe(99);
				expect(info.get('zzt921001_921100')?.order).toBe(7);
			},
		);
	});
});

describe('fetchNodeInfo — parent-aware order (WC-015)', () => {
	// WC-015: the order value is paired to the PARENT-LINK item id. PHP matched
	// `id_key`, a field no write path ever wrote, and so returned the FIRST item's
	// stale value for a multi-parent / moved node (reorder reverts on reload). TS
	// pairs on `item.id_key ?? item.id`. A single-item dataframe cannot gate this —
	// both pickers agree — so this child deliberately carries TWO order entries.
	const CHILD_ID = 921002;

	beforeAll(async () => {
		await seedRow(
			'test3',
			CHILD_ID,
			{
				test22: [
					{ id: 5, value: 10 },
					{ id: 9, value: 20 },
				],
			},
			{
				test71: [
					{
						id: 9,
						type: 'dd47',
						section_id: 1,
						section_tipo: 'test3',
						from_component_tipo: 'test71',
					},
				],
			},
		);
	});

	test('order pairs to the parent-link locator id, not to entry 0', async () => {
		const info = await fetchNodeInfo([{ section_tipo: 'test3', section_id: CHILD_ID }], {
			section_tipo: 'test3',
			section_id: 1,
		});
		// parent test3/1 is linked through order-dataframe id 9 → its value, 20.
		// Reading index 0 blindly (the PHP behaviour WC-015 diverges from) yields 10.
		expect(info.get(`test3_${CHILD_ID}`)).toEqual({ order: 20, is_indexable: false });
	});

	test('no parent-link item for the requested parent → the documented fallback chain (first entry)', async () => {
		const info = await fetchNodeInfo([{ section_tipo: 'test3', section_id: CHILD_ID }], {
			section_tipo: 'test3',
			section_id: 2,
		});
		// No test71 locator points at test3/2, and no entry carries section-coords or
		// is unkeyed, so pickOrderValueForParent falls through to orderItems[0].
		expect(info.get(`test3_${CHILD_ID}`)?.order).toBe(10);
	});

	test('a row with NO order dataframe under a parent → null, not a throw', async () => {
		const info = await fetchNodeInfo([{ section_tipo: 'test3', section_id: 2 }], {
			section_tipo: 'test3',
			section_id: 1,
		});
		// order_arr is JSON null → not an array → orderItems [] → picker returns null.
		expect(info.get('test3_2')).toEqual({ order: null, is_indexable: false });
	});

	test('parent-aware is DISABLED when the section has no component_relation_parent (index-0 read)', async () => {
		await withScratchSection('zzt921001', 'zzt921002', { order: 'test22' }, {}, async () => {
			await seedRow(
				'zzt921001',
				921101,
				{
					test22: [
						{ id: 5, value: 10 },
						{ id: 9, value: 20 },
					],
				},
				{},
			);
			// The scratch section has no component_relation_parent child, so
			// parentRelationTipo() is null: despite a parentLocator being passed,
			// the query takes the plain ->0->>'value' select.
			const info = await fetchNodeInfo([{ section_tipo: 'zzt921001', section_id: 921101 }], {
				section_tipo: 'test3',
				section_id: 1,
			});
			expect(info.get('zzt921001_921101')?.order).toBe(10);
		});
	});
});

describe('fetchNodeInfo — is_indexable (only reachable on a provisioned section_map)', () => {
	test('is_indexable is true only when the flag locator resolves to section_id 1', async () => {
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ order: 'test22', is_indexable: 'test88', is_descriptor: 'test88' },
			{},
			async () => {
				await seedRow(
					'zzt921001',
					921102,
					{ test22: [{ id: 1, value: 7 }] },
					{ test88: [{ section_tipo: 'dd64', section_id: '1' }] },
				);
				await seedRow(
					'zzt921001',
					921103,
					{ test22: [{ id: 1, value: 7 }] },
					{ test88: [{ section_tipo: 'dd64', section_id: '2' }] },
				);
				await seedRow('zzt921001', 921104, {}, {});

				const info = await fetchNodeInfo([
					{ section_tipo: 'zzt921001', section_id: 921102 },
					{ section_tipo: 'zzt921001', section_id: 921103 },
					{ section_tipo: 'zzt921001', section_id: 921104 },
				]);
				expect(info.get('zzt921001_921102')).toEqual({ order: 7, is_indexable: true });
				// si-no locator = 2 ("no") → false
				expect(info.get('zzt921001_921103')).toEqual({ order: 7, is_indexable: false });
				// present row, no flag data at all → false
				expect(info.get('zzt921001_921104')).toEqual({ order: null, is_indexable: false });
			},
		);
	});

	test('a hierarchy* section is NEVER indexable, even with the flag set to 1 (roots rule)', async () => {
		await withScratchSection(
			'hierarchy921001',
			'hierarchy921002',
			{ order: 'test22', is_indexable: 'test88' },
			{},
			async () => {
				await seedRow(
					'hierarchy921001',
					921200,
					{ test22: [{ id: 1, value: 4 }] },
					{ test88: [{ section_tipo: 'dd64', section_id: '1' }] },
				);
				const info = await fetchNodeInfo([{ section_tipo: 'hierarchy921001', section_id: 921200 }]);
				// Identical row data yields is_indexable true on zzt921001 above; the
				// ONLY difference is the tipo prefix, so this pins the suppression.
				expect(info.get('hierarchy921001_921200')).toEqual({ order: 4, is_indexable: false });
			},
		);
	});

	test('a section_map with no order and no is_indexable → order null, is_indexable false', async () => {
		await withScratchSection('zzt921001', 'zzt921002', { term: 'test52' }, {}, async () => {
			await seedRow(
				'zzt921001',
				921105,
				{ test22: [{ id: 1, value: 7 }] },
				{ test88: [{ section_tipo: 'dd64', section_id: '1' }] },
			);
			// Both selects degrade to the literal NULL column: the data is present in
			// the row but the section does not DECLARE those functional components.
			const info = await fetchNodeInfo([{ section_tipo: 'zzt921001', section_id: 921105 }]);
			expect(info.get('zzt921001_921105')).toEqual({ order: null, is_indexable: false });
		});
	});
});

describe('fetchNodeInfo — hard failures (no legacy fallback in TS)', () => {
	test('a locator with no section_id throws', async () => {
		await expect(fetchNodeInfo([{ section_tipo: 'test3' }])).rejects.toThrow(/invalid locator/);
	});

	test('a locator with a non-numeric section_id throws', async () => {
		await expect(fetchNodeInfo([{ section_tipo: 'test3', section_id: 'abc' }])).rejects.toThrow(
			/invalid locator/,
		);
	});

	test('a locator with no section_tipo throws', async () => {
		await expect(fetchNodeInfo([{ section_id: 1 }])).rejects.toThrow(/invalid locator/);
	});

	test('an unresolvable section (no matrix table) throws — it does not silently yield nulls', async () => {
		await expect(fetchNodeInfo([{ section_tipo: 'nosuchtipo9', section_id: 1 }])).rejects.toThrow(
			/no matrix table for section 'nosuchtipo9'/,
		);
	});

	test('a resolvable NON-section node used as a section tipo throws (empty table string / null)', async () => {
		// PLAN DISCREPANCY, measured: the plan assumed "a section with no matrix_table
		// relation" reaches the null-table throw. It does not — a model='section' node
		// falls back to the default 'matrix' table. Only a NON-section model resolves
		// to a null table while still being a resolvable node.
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ order: 'test22' },
			{ matrixTable: false, model: 'component_number' },
			async () => {
				await expect(
					fetchNodeInfo([{ section_tipo: 'zzt921001', section_id: 921106 }]),
				).rejects.toThrow(/no matrix table for section 'zzt921001'/);
			},
		);
	});

	test('a section_map order tipo outside the tipo grammar throws (it is interpolated into SQL)', async () => {
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ order: "test22' OR '1'='1" },
			{},
			async () => {
				await expect(
					fetchNodeInfo([{ section_tipo: 'zzt921001', section_id: 921107 }]),
				).rejects.toThrow(/invalid tipo grammar in section_map of 'zzt921001'/);
			},
		);
	});

	test('a section_map is_indexable tipo outside the tipo grammar throws', async () => {
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ order: 'test22', is_indexable: 'TEST88' },
			{},
			async () => {
				await expect(
					fetchNodeInfo([{ section_tipo: 'zzt921001', section_id: 921108 }]),
				).rejects.toThrow(/invalid tipo grammar in section_map of 'zzt921001'/);
			},
		);
	});
});

describe('batchDescriptorFlags', () => {
	test('descriptor flag reads the first is_descriptor locator; a row without one is null', async () => {
		const flags = await batchDescriptorFlags([
			{ section_tipo: 'test3', section_id: 1 },
			{ section_tipo: 'test3', section_id: 2 },
			{ section_tipo: 'test3', section_id: 921098 },
		]);
		expect(flags.size).toBe(3);
		// test3/1 relation.test88 = [dd64/1, dd64/2] → the FIRST entry, 1 = descriptor.
		expect(flags.get('test3_1')).toBe(1);
		// present row, no is_descriptor data → null (NOT 0, NOT false).
		expect(flags.get('test3_2')).toBeNull();
		// absent row → the back-fill loop.
		expect(flags.get('test3_921098')).toBeNull();
	});

	test('flag 2 (non-descriptor) is preserved as 2, not coerced to a boolean', async () => {
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ is_descriptor: 'test88' },
			{},
			async () => {
				await seedRow(
					'zzt921001',
					921110,
					{},
					{ test88: [{ section_tipo: 'dd64', section_id: '1' }] },
				);
				await seedRow(
					'zzt921001',
					921111,
					{},
					{ test88: [{ section_tipo: 'dd64', section_id: '2' }] },
				);
				const flags = await batchDescriptorFlags([
					{ section_tipo: 'zzt921001', section_id: 921110 },
					{ section_tipo: 'zzt921001', section_id: 921111 },
				]);
				expect(flags.get('zzt921001_921110')).toBe(1);
				expect(flags.get('zzt921001_921111')).toBe(2);
			},
		);
	});

	test('an unresolvable model null-SKIPS its group instead of aborting the batch', async () => {
		// THE divergence from fetchNodeInfo: a bad section here degrades to null flags
		// for that group while every other group still resolves.
		const flags = await batchDescriptorFlags([
			{ section_tipo: 'test3', section_id: 1 },
			{ section_tipo: 'nosuchtipo9', section_id: 1 },
		]);
		expect(flags.size).toBe(2);
		expect(flags.get('test3_1')).toBe(1);
		expect(flags.get('nosuchtipo9_1')).toBeNull();

		// NOTE: 'nosuchtipo9' also has no section_map, so the is_descriptor null-skip
		// immediately below the model guard would produce the SAME map — this case
		// alone cannot tell the two guards apart. The next test isolates the model
		// guard by giving an unresolvable tipo a section_map that DECLARES
		// is_descriptor; there, only the model guard can stop the fall-through into
		// getMatrixTableFromTipo (which throws).
	});

	test('the model null-skip fires BEFORE the table lookup: a DECLARED is_descriptor on a tipo with no node yields null, not a throw', async () => {
		// Orphan section_map: parent 'zzt921003' has NO dd_ontology node row, so
		// getModelByTipo → null, while getSectionMap resolves and declares
		// thesaurus.is_descriptor. Remove the model null-skip arm and execution reaches
		// getMatrixTableFromTipo, which has no table for a nonexistent node → throws.
		try {
			await sql`
				INSERT INTO dd_ontology (tipo, model, parent, properties)
				VALUES ('zzt921004', 'section_map', 'zzt921003',
					${encodeForJsonb({ thesaurus: { is_descriptor: 'test88' } })}::text::jsonb)
			`;
			await clearOntologyDerivedCaches();

			// Precondition, asserted rather than assumed — if either half stops holding,
			// this case stops isolating the model guard and must FAIL, not pass quietly.
			expect(await getModelByTipo('zzt921003')).toBeNull();
			expect(
				((await getSectionMap('zzt921003')) as { thesaurus?: { is_descriptor?: unknown } } | null)
					?.thesaurus?.is_descriptor,
			).toBe('test88');

			const flags = await batchDescriptorFlags([
				{ section_tipo: 'test3', section_id: 1 },
				{ section_tipo: 'zzt921003', section_id: 921114 },
			]);
			expect(flags.size).toBe(2);
			expect(flags.get('test3_1')).toBe(1);
			expect(flags.get('zzt921003_921114')).toBeNull();
		} finally {
			await sql`DELETE FROM dd_ontology WHERE tipo = 'zzt921004'`;
			await clearOntologyDerivedCaches();
		}
	});

	test('a section whose map declares no is_descriptor null-skips (dd64 — a real section, no thesaurus map)', async () => {
		const flags = await batchDescriptorFlags([
			{ section_tipo: 'test3', section_id: 1 },
			{ section_tipo: 'dd64', section_id: 1 },
		]);
		expect(flags.size).toBe(2);
		expect(flags.get('test3_1')).toBe(1);
		// dd64's model IS 'section', so this lands on the is_descriptor null-skip,
		// not on the unresolvable-model short-circuit above.
		expect(flags.get('dd64_1')).toBeNull();
	});

	test('a malformed locator throws (the shared grouping guard)', async () => {
		await expect(batchDescriptorFlags([{ section_tipo: 'test3' }])).rejects.toThrow(
			/invalid locator/,
		);
	});

	test('an is_descriptor tipo outside the tipo grammar throws (it is interpolated into SQL)', async () => {
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ is_descriptor: "test88'" },
			{},
			async () => {
				await expect(
					batchDescriptorFlags([{ section_tipo: 'zzt921001', section_id: 921112 }]),
				).rejects.toThrow(/invalid tipo 'test88''/);
			},
		);
	});

	test('a resolvable model + declared is_descriptor but no matrix table throws', async () => {
		await withScratchSection(
			'zzt921001',
			'zzt921002',
			{ is_descriptor: 'test88' },
			// non-section model: resolvable (so it survives the model null-skip) yet
			// has no matrix table — see the withScratchSection note.
			{ matrixTable: false, model: 'component_number' },
			async () => {
				await expect(
					batchDescriptorFlags([{ section_tipo: 'zzt921001', section_id: 921113 }]),
				).rejects.toThrow(/no matrix table for section 'zzt921001'/);
			},
		);
	});

	test('an empty locator list resolves to an empty map (no query issued)', async () => {
		expect((await batchDescriptorFlags([])).size).toBe(0);
		expect((await fetchNodeInfo([])).size).toBe(0);
	});
});
