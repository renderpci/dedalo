/**
 * THE UNDO LOG IS INVISIBLE HISTORY (WC-2026-09-27-bulk-revert-undo-log §2.4)
 * — measured through the real serving doors, never through their SQL text.
 *
 * A bulk run writes, beside its ordinary visible after-rows, rows nobody ever
 * saw as history: the hidden BEFORE image of every write (tm_role 1), a BIRTH
 * marker for every record it created (3), and a whole-record snapshot for every
 * record its dataframe cascade deleted (4). Only the bulk revert may read them.
 * Every other reader of `matrix_time_machine` must behave as if they did not
 * exist — a leak is user-visible and wrong in a specific way:
 *   - the dd15 list / count / component history / record list would show a
 *     "version" that was never the value (a BEFORE is the PRE-run value, dated
 *     at the run) or a marker row with no data at all;
 *   - the dd1371 (Process) equality and range filters would count a run's
 *     writes twice;
 *   - the preview pane and apply_value would restore a hidden row's image;
 *   - a write-gate PROBE ("does this key already have history?") answered by a
 *     hidden row would SUPPRESS the visible baseline row the write owes.
 *
 * WHAT IS BUILT: a `zzthv` scratch situation (a section on `test1` →
 * matrix_test, one non-translatable input_text) and its records; undo rows
 * written by the REAL writers (createSectionRecord / saveComponentData /
 * deleteSectionRecord under a bulk id, and the time_machine.ts role writers)
 * plus, for the deep page and the probe, raw rows (a volume no door writes in
 * one gate, and a hidden-only key no door leaves behind — each named where
 * used). Bulk ids are synthetic integers in a range no dd800 counter reaches in
 * a suite database; every row is swept by section tipo. assertTestDatabase
 * guards the first write.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	readTimeMachineHistory,
	readTimeMachineRow,
	recordBulkBirth,
	recordBulkCascadeDelete,
} from '../../src/core/db/time_machine.ts';
import { isDedaloError } from '../../src/core/errors/dedalo_error.ts';
import { countTimeMachineData, readTimeMachineData } from '../../src/core/resolve/read_tm.ts';
import { readComponentData } from '../../src/core/section/read.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import {
	deleteSectionData,
	deleteSectionRecord,
} from '../../src/core/section/record/delete_record.ts';
import { recomputeExternalRelation } from '../../src/core/section/record/observers.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { fireSaveEvent } from '../../src/core/section_record/save_event.ts';
import { resolvePrincipal } from '../../src/core/security/permissions.ts';
import {
	dropSituation,
	ensureSituation,
	situation,
} from '../../src/core/test_data/situations/situation.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { toolTimeMachineApplyValue } from '../../tools/tool_time_machine/server/tool_time_machine.ts';

const SECTION = 'zzthv1';
const TEXT = 'zzthv2';
/** The referencing section of the observer pair (the `rsc205` role). */
const REF_SECTION = 'zzthv3';
/** component_autocomplete_hi on REF_SECTION — the OBSERVED indexer. */
const INDEXER = 'zzthv4';
/** component_autocomplete on SECTION — the OBSERVER mirror (set_dato_external). */
const MIRROR = 'zzthv5';
/** A plain portal on SECTION — the owner of an inverse reference. */
const PORTAL = 'zzthv6';
const TABLE = 'matrix_test';
const USER_ID = -1;
/** Synthetic run ids — far above any dd800 counter a suite database reaches. */
const BULK = 1_987_650_301;
const BULK_HIDDEN_ONLY = 1_987_650_302;
/** A FOREIGN run above this file's band — the RANGE test's built pollution. */
const BULK_STRAY = 1_987_650_399;

const SITUATION = situation({
	tld: 'zzthv',
	name: 'tm_history_visibility',
	nodes: [
		{ tipo: SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'TM visibility' } },
		{
			tipo: TEXT,
			parent: SECTION,
			model: 'component_input_text',
			term: { 'lg-eng': 'Text' },
			is_translatable: false,
		},
		{ tipo: REF_SECTION, parent: 'test1', model: 'section', term: { 'lg-eng': 'TM vis refs' } },
		{
			// The observer pair, field for field the shape observer_reconcile_native
			// drives (hierarchy93 ← rsc387): recomputeExternalRelation's own probe.
			tipo: INDEXER,
			parent: REF_SECTION,
			model: 'component_autocomplete_hi',
			term: { 'lg-eng': 'Indexer' },
			properties: {
				config_relation: { relation_type: 'dd96' },
				observers: [{ section_tipo: SECTION, component_tipo: MIRROR }],
			},
		},
		{
			tipo: MIRROR,
			parent: SECTION,
			model: 'component_autocomplete',
			term: { 'lg-eng': 'Mirror' },
			properties: {
				source: {
					mode: 'external',
					request_config: [
						{
							sqo: { section_tipo: [{ value: [REF_SECTION], source: 'section' }] },
							show: { sqo_config: { limit: 10 } },
						},
					],
					section_to_search: [REF_SECTION],
					component_to_search: [INDEXER],
				},
				observe: [
					{
						component_tipo: INDEXER,
						server: {
							config: { use_self_section: false, use_observable_dato: true },
							perform: {
								function: 'set_dato_external',
								params: { save: true, changed: false, current_dato: false, references_limit: 0 },
							},
						},
					},
				],
			},
		},
		{ tipo: PORTAL, parent: SECTION, model: 'component_portal', term: { 'lg-eng': 'Portal' } },
	],
});

interface TmRowRead {
	id: number;
	section_id: number;
	tipo: string;
	tm_role: number | null;
	bulk_process_id: number | null;
}

async function rowsOf(where: string, params: unknown[]): Promise<TmRowRead[]> {
	const rows = (await sql.unsafe(
		`SELECT id, section_id, tipo, tm_role, bulk_process_id FROM matrix_time_machine
		 WHERE section_tipo = $1 AND ${where} ORDER BY id ASC`,
		[SECTION, ...params],
	)) as TmRowRead[];
	return rows.map((row) => ({
		...row,
		id: Number(row.id),
		section_id: Number(row.section_id),
		tm_role: row.tm_role === null ? null : Number(row.tm_role),
		bulk_process_id: row.bulk_process_id === null ? null : Number(row.bulk_process_id),
	}));
}

/** The matrix ids a dd15 read lists, in order, plus its count twin. */
async function listed(sqo: Record<string, unknown>): Promise<{ ids: number[]; count: number }> {
	const { data } = await readTimeMachineData({
		sqo: { limit: 50, offset: 0, ...sqo },
		source: { lang: 'lg-nolan' },
	} as never);
	const entries = ((data[0] as { entries?: { matrix_id: number }[] }).entries ?? []).map((entry) =>
		Number(entry.matrix_id),
	);
	return { ids: entries, count: await countTimeMachineData({ sqo } as never) };
}

/** A dd1371 (Process) filter: one item per `q`, AND-ed (a bounded range is two). */
const dd1371 = (...qs: string[]) => ({
	filter: {
		$and: qs.map((q) => ({
			q,
			operator: '',
			path: [{ component_tipo: 'dd1371', section_tipo: 'dd15' }],
		})),
	},
});

let born = 0; // created BY the run: birth marker + two pairs
let cascaded = 0; // deleted under the run's id: its visible snapshot + a role-4 twin
let hiddenIds: number[] = [];
let visibleIds: number[] = [];

beforeAll(async () => {
	await assertTestDatabase('tm_history_visibility_native');
	await ensureSituation(SITUATION);
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [SECTION]);

	born = await createSectionRecord(SECTION, USER_ID, new Date(), undefined, {
		bulkProcessId: BULK,
	});
	for (const value of ['one', 'two']) {
		const saved = await saveComponentData({
			componentTipo: TEXT,
			sectionTipo: SECTION,
			sectionId: born,
			lang: 'lg-nolan',
			changedData: [{ action: 'set_data', value: [{ id: 1, lang: 'lg-nolan', value }] }],
			userId: USER_ID,
			bulkProcessId: BULK,
		});
		expect(saved.ok).toBe(true);
	}
	cascaded = await createSectionRecord(SECTION, USER_ID);
	await deleteSectionRecord(SECTION, cascaded, USER_ID, undefined, { bulkProcessId: BULK });

	const all = await rowsOf('bulk_process_id = $2', [BULK]);
	hiddenIds = all.filter((row) => row.tm_role !== null).map((row) => row.id);
	visibleIds = all.filter((row) => row.tm_role === null).map((row) => row.id);
	// SITUATION FLOOR — every hidden role the run can write is present, from the
	// real writers: birth (3), two BEFOREs (1), the cascade twin (4). Without
	// them every "never listed" below would pass on an empty set.
	expect(
		all
			.filter((row) => row.tm_role !== null)
			.map((row) => row.tm_role)
			.sort(),
	).toEqual([1, 1, 3, 4]);
	// the two after-rows (the delete's own visible snapshot is ordinary history:
	// it carries no bulk id — only its hidden twin does)
	expect(visibleIds.length).toBe(2);
}, 60_000);

afterAll(async () => {
	for (const section of [SECTION, REF_SECTION]) {
		await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1', [section]);
		await sql.unsafe(`DELETE FROM "${TABLE}" WHERE section_tipo = $1`, [section]);
	}
	await sql.unsafe(`DELETE FROM matrix_activity WHERE data->>'section_tipo' = $1`, [SECTION]);
	await fireSaveEvent(SECTION);
	expect(await dropSituation(SITUATION)).toBe(0);
});

describe('the dd15 readers list only visible rows', () => {
	test('component history (filter_by_locators + tipo): the after-rows, never a BEFORE', async () => {
		const expected = (
			await rowsOf('section_id = $2 AND tipo = $3 AND tm_role IS NULL', [born, TEXT])
		)
			.map((row) => row.id)
			.reverse();
		expect(expected.length).toBe(2);
		const read = await listed({
			filter_by_locators: [{ section_tipo: SECTION, section_id: born, tipo: TEXT }],
		});
		expect(read.ids).toEqual(expected);
		expect(read.count).toBe(expected.length);
		expect(read.ids.filter((id) => hiddenIds.includes(id))).toEqual([]);
	});

	test('record history (filter_by_locators, no tipo): no birth marker', async () => {
		const read = await listed({
			filter_by_locators: [{ section_tipo: SECTION, section_id: born }],
		});
		expect(read.ids.length).toBe(2);
		expect(read.ids.filter((id) => hiddenIds.includes(id))).toEqual([]);
		expect(read.count).toBe(2);
	});

	test('the record LIST (tipo = section): the delete snapshot, never a birth or cascade twin', async () => {
		// Birth markers and cascade twins are tipo = section_tipo rows — exactly
		// the shape this browse lists. Leaked, a created record would show as a
		// "deleted record" with no data, and a cascade delete would list twice.
		const recordRows = await rowsOf('tipo = $2', [SECTION]);
		expect(recordRows.filter((row) => row.tm_role !== null).length).toBe(2); // floor
		const read = await listed({ filter: { $and: [{ q: SECTION, column_name: 'tipo' }] } });
		const expected = recordRows
			.filter((row) => row.tm_role === null)
			.map((row) => row.id)
			.reverse();
		expect(expected.length).toBe(1);
		expect(read.ids).toEqual(expected);
		expect(read.count).toBe(1);
	});

	test('dd1371 (Process) EQUALITY lists the run’s visible rows once each', async () => {
		const read = await listed(dd1371(String(BULK)));
		expect(read.ids).toEqual([...visibleIds].reverse());
		expect(read.count).toBe(visibleIds.length);
	});

	test('dd1371 RANGE (the planner-barrier query shape) lists the same set', async () => {
		// BOUNDED to this file's own band: an open `>= BULK` spans the whole table,
		// so a stray visible row another gate's crashed run left above BULK (e.g.
		// bulk_undo_capture_native's synthetic ids from 1_987_651_001) would red
		// this gate for pollution, not for a visibility leak. The band also
		// admits BULK_HIDDEN_ONLY's rows — of which none is visible.
		// The pollution, BUILT: a visible row of a foreign run above the band.
		const stray = (await sql.unsafe(
			`INSERT INTO matrix_time_machine
			   (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data)
			 VALUES ($1, $2, $3, 'lg-nolan', now(), '-1', $4, '[]'::jsonb) RETURNING id`,
			[cascaded, SECTION, TEXT, BULK_STRAY],
		)) as { id: number }[];
		try {
			const read = await listed(dd1371(`>=${BULK}`, `<=${BULK_HIDDEN_ONLY}`));
			expect(read.ids).toEqual([...visibleIds].reverse());
			expect(read.count).toBe(visibleIds.length);
		} finally {
			await sql.unsafe('DELETE FROM matrix_time_machine WHERE id = $1', [stray[0]?.id]);
		}
	});

	test('the BARE dd15 count ignores rows that are hidden', async () => {
		await fireSaveEvent(SECTION); // bust the bare-count cache
		const before = await countTimeMachineData({ sqo: { section_tipo: ['dd15'] } } as never);
		// Hidden-ONLY writes: a birth marker and a cascade twin, nothing visible.
		const birthId = await recordBulkBirth({
			sectionTipo: SECTION,
			sectionId: born,
			userId: USER_ID,
			bulkId: BULK_HIDDEN_ONLY,
		});
		const twinId = await recordBulkCascadeDelete({
			sectionTipo: SECTION,
			sectionId: cascaded,
			userId: USER_ID,
			bulkId: BULK_HIDDEN_ONLY,
			snapshot: { string: { [TEXT]: [{ value: 'hidden' }] } },
		});
		expect(birthId).toBeGreaterThan(0);
		expect(twinId).toBeGreaterThan(0);
		await fireSaveEvent(SECTION);
		expect(await countTimeMachineData({ sqo: { section_tipo: ['dd15'] } } as never)).toBe(before);
		// …and the scoped (never cached) filter agrees: the run has no visible row.
		expect((await listed(dd1371(String(BULK_HIDDEN_ONLY)))).count).toBe(0);
	});
});

describe('the generic search engine is not a TM reader', () => {
	test('the generic search engine cannot become a second, unnarrowed TM reader', async () => {
		// (DB tier: the census sibling, tm_history_visibility_tripwire, is
		// hermetic.) dd15 resolves to matrix_time_machine; if the SQO assembler (driven by
		// client SQOs in update_cache, propagate, export…) accepted that table, it
		// would read the undo log with no narrowing at all. Measured: it refuses.
		const { getMatrixTableFromTipo } = await import('../../src/core/ontology/resolver.ts');
		const { buildSearchSql } = await import('../../src/core/search/sql_assembler.ts');
		expect(await getMatrixTableFromTipo('dd15')).toBe('matrix_time_machine');
		await expect(buildSearchSql({ section_tipo: ['dd15'], limit: 1 } as never)).rejects.toThrow(
			'matrix_time_machine',
		);
	});
});

describe('the DEEP page (late row lookup + order flip) counts and pages visible rows only', () => {
	// RAW rows, named: the late-lookup rewrite engages at offset >=
	// SEARCH_LATE_ROW_LOOKUP_OFFSET (1000) and flips when the offset is in the
	// far half of the key's TOTAL — so the total must be real and large. No door
	// writes 2000 rows in a gate's time budget. 1005 visible rows interleaved
	// with 1005 hidden ones: a total that counted the hidden rows would flip at
	// the wrong place and serve hidden or wrong rows.
	let deep = 0;
	beforeAll(async () => {
		deep = await createSectionRecord(SECTION, USER_ID);
		await sql.unsafe(
			`INSERT INTO matrix_time_machine
			   (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data, tm_role)
			 SELECT $1, $2, $3, 'lg-nolan', now(), '-1', $4, jsonb_build_array(g),
			        CASE WHEN g % 2 = 0 THEN 1 ELSE NULL END
			   FROM generate_series(1, 2010) AS g ORDER BY g`,
			[deep, SECTION, TEXT, BULK],
		);
	}, 60_000);

	test('offset 1000 of 1005 visible rows: the five OLDEST visible rows, in order', async () => {
		const visible = (await rowsOf('section_id = $2 AND tm_role IS NULL', [deep])).map(
			(row) => row.id,
		);
		expect(visible.length).toBe(1005);
		const { data } = await readTimeMachineData({
			sqo: {
				filter_by_locators: [{ section_tipo: SECTION, section_id: deep, tipo: TEXT }],
				limit: 10,
				offset: 1000,
			},
			source: { lang: 'lg-nolan' },
		} as never);
		const ids = ((data[0] as { entries?: { matrix_id: number }[] }).entries ?? []).map((entry) =>
			Number(entry.matrix_id),
		);
		expect(ids).toEqual(visible.slice(0, 5).reverse());
		expect(
			await countTimeMachineData({
				sqo: { filter_by_locators: [{ section_tipo: SECTION, section_id: deep, tipo: TEXT }] },
			} as never),
		).toBe(1005);
	});
});

describe('single-row doors refuse a hidden id', () => {
	test('readTimeMachineRow: null for every hidden role; the after-row reads', async () => {
		expect(hiddenIds.length).toBe(4);
		for (const id of hiddenIds) expect(await readTimeMachineRow(id)).toBeNull();
		expect(await readTimeMachineRow(visibleIds[0] as number)).not.toBeNull();
	});

	test('readTimeMachineHistory never serves a hidden row', async () => {
		const history = await readTimeMachineHistory(SECTION, born, TEXT);
		const ids = (history as { id: number }[]).map((row) => Number(row.id));
		expect(ids.length).toBe(2);
		expect(ids.filter((id) => hiddenIds.includes(id))).toEqual([]);
	});

	test('the PREVIEW pane previews empty for a hidden BEFORE, and the after-row for real', async () => {
		const before = (await rowsOf('section_id = $2 AND tipo = $3 AND tm_role = 1', [born, TEXT]))[1];
		const after = (
			await rowsOf('section_id = $2 AND tipo = $3 AND tm_role IS NULL', [born, TEXT])
		)[0];
		const preview = async (matrixId: number): Promise<unknown[]> =>
			(await readComponentData({
				source: {
					tipo: TEXT,
					section_tipo: SECTION,
					section_id: born,
					lang: 'lg-nolan',
					data_source: 'tm',
					matrix_id: matrixId,
				},
			} as never)) as unknown[];
		// the second BEFORE holds ['one'] — a real value, so "empty" is a refusal
		expect(await preview(before?.id as number)).toEqual([]);
		expect((await preview(after?.id as number)).length).toBeGreaterThan(0);
	});

	test('apply_value refuses a hidden id (tool.target_not_found) and writes nothing', async () => {
		const before = (await rowsOf('section_id = $2 AND tipo = $3 AND tm_role = 1', [born, TEXT]))[1];
		const liveBefore = await sql.unsafe(
			`SELECT string->$3 AS v FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, born, TEXT],
		);
		let refusal: unknown = null;
		try {
			await toolTimeMachineApplyValue({
				principal: await resolvePrincipal(USER_ID),
				userId: USER_ID,
				options: {
					section_tipo: SECTION,
					section_id: born,
					tipo: TEXT,
					lang: 'lg-nolan',
					matrix_id: before?.id,
				},
				background: false,
			} as never);
		} catch (error) {
			refusal = error;
		}
		expect(isDedaloError(refusal) ? refusal.code : String(refusal)).toBe('tool.target_not_found');
		const liveAfter = await sql.unsafe(
			`SELECT string->$3 AS v FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, born, TEXT],
		);
		expect(liveAfter).toEqual(liveBefore);
	});
});

describe('a write-gate PROBE is never answered by a hidden row', () => {
	test('delete data: a key whose only history is HIDDEN still gets its visible baseline', async () => {
		// The probe asks "does this key already have history?" and, when not,
		// backfills the OLD value as a visible row before the wipe's null row — the
		// only record of the value the curator is about to lose. A hidden undo-log
		// row is NOT that history. RAW hidden-only row, named: no writer leaves a
		// BEFORE without its visible after-row, so this is the probe's own law
		// tested at its edge (delete_record.ts deleteSectionData).
		const record = await createSectionRecord(SECTION, USER_ID);
		await sql.unsafe(
			`UPDATE "${TABLE}" SET string = COALESCE(string, '{}'::jsonb) || jsonb_build_object($3::text, '[{"id":1,"lang":"lg-nolan","value":"keep me"}]'::jsonb)
			 WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, record, TEXT],
		);
		await sql.unsafe(
			`INSERT INTO matrix_time_machine
			   (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data, tm_role)
			 VALUES ($1, $2, $3, 'lg-nolan', now(), '-1', $4, '[]'::jsonb, 1)`,
			[record, SECTION, TEXT, BULK_HIDDEN_ONLY],
		);
		await deleteSectionData(SECTION, record, USER_ID);
		const visible = (
			(await sql.unsafe(
				`SELECT data FROM matrix_time_machine
				 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND tm_role IS NULL ORDER BY id`,
				[SECTION, record, TEXT],
			)) as { data: unknown }[]
		).map((row) => row.data);
		// the backfilled baseline (the value lost), then the wipe's null row
		expect(visible).toEqual([[{ id: 1, lang: 'lg-nolan', value: 'keep me' }], null]);
	});

	test('removeAllInverseReferences: an owner key whose only history is HIDDEN still gets its visible baseline', async () => {
		// delete_record.ts removeAllInverseReferences: deleting a record strips the
		// locators OTHER records hold to it, and the owner key's probe decides
		// whether the stripped bag is backfilled as the visible baseline. A hidden
		// role-1 row must not answer it. RAW hidden-only row, named as above.
		const [owner, target] = [
			await createSectionRecord(SECTION, USER_ID),
			await createSectionRecord(SECTION, USER_ID),
		];
		const bag = [
			{
				id: 1,
				type: 'dd151',
				section_tipo: SECTION,
				section_id: target,
				from_component_tipo: PORTAL,
			},
		];
		await seedHiddenOnly(owner, PORTAL, 'relation', bag);
		await deleteSectionRecord(SECTION, target, USER_ID);
		// the backfilled baseline (the bag as it stood), then the strip's null row
		expect(await visibleData(owner, PORTAL)).toEqual([bag, null]);
	});

	test('recomputeExternalRelation: a mirror whose only history is HIDDEN still gets its visible baseline', async () => {
		// observers.ts recomputeExternalRelation: a mirror recompute backfills the
		// pre-recompute value as the visible baseline when the key has no history.
		const host = await createSectionRecord(SECTION, USER_ID);
		const referencer = await createSectionRecord(REF_SECTION, USER_ID);
		await sql.unsafe(
			`UPDATE "${TABLE}" SET relation = COALESCE(relation, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = $2`,
			[
				REF_SECTION,
				referencer,
				INDEXER,
				JSON.stringify([
					{
						id: 1,
						type: 'dd96',
						section_tipo: SECTION,
						section_id: host,
						from_component_tipo: INDEXER,
					},
				]),
			],
		);
		await seedHiddenOnly(host, MIRROR, 'relation', null);
		const outcome = await recomputeExternalRelation(MIRROR, SECTION, host, USER_ID, new Date(), {});
		expect(outcome.wrote).toBe(true);
		const visible = await visibleData(host, MIRROR);
		// the baseline (the mirror was empty: null), then the recomputed mirror
		expect(visible.length).toBe(2);
		expect(visible[0]).toBeNull();
		expect(visible[1]).toEqual([
			{
				id: 1,
				type: 'dd151',
				section_tipo: REF_SECTION,
				section_id: referencer,
				from_component_tipo: MIRROR,
			},
		]);
	});
});

/** Seed a key's value (raw) and a HIDDEN-only role-1 TM row for it (no visible history). */
async function seedHiddenOnly(
	record: number,
	tipo: string,
	column: 'relation',
	value: unknown[] | null,
): Promise<void> {
	if (value !== null) {
		await sql.unsafe(
			`UPDATE "${TABLE}" SET ${column} = COALESCE(${column}, '{}'::jsonb) || jsonb_build_object($3::text, $4::text::jsonb)
			 WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, record, tipo, JSON.stringify(value)],
		);
	}
	await sql.unsafe(
		`INSERT INTO matrix_time_machine
		   (section_id, section_tipo, tipo, lang, timestamp, user_id, bulk_process_id, data, tm_role)
		 VALUES ($1, $2, $3, 'lg-nolan', now(), '-1', $4, '[]'::jsonb, 1)`,
		[record, SECTION, tipo, BULK_HIDDEN_ONLY],
	);
}

/** The VISIBLE TM rows' data of one key, id ASC. */
async function visibleData(record: number, tipo: string): Promise<unknown[]> {
	return (
		(await sql.unsafe(
			`SELECT data FROM matrix_time_machine
			 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 AND tm_role IS NULL ORDER BY id`,
			[SECTION, record, tipo],
		)) as { data: unknown }[]
	).map((row) => row.data);
}
