/**
 * dataframeControlScan — the dd490 pairing integrity scan (and its fix mode).
 *
 * WHY A DEDICATED TABLE. `scanned` / `frames_checked` / `orphans` are counted
 * over the WHOLE table, and `fix=true` DELETES every relation entry the scan
 * calls an orphan from every row it walked. Pointed at the shared
 * `matrix_test` that means: unstable counts (any other file's fixtures move
 * them) and real destruction of other people's rows. So every case here runs
 * against `matrix_ts_test_dfscan`, a private `LIKE matrix_test INCLUDING ALL`
 * clone created in beforeAll and dropped in afterAll — the function already
 * takes `scopedTables`, which exists exactly for this. `fix=true` is NEVER
 * called against `matrix_test`.
 *
 * The clone deliberately carries no triggers (CREATE TABLE … LIKE never copies
 * them), so nothing here touches `matrix_relation_index` / `matrix_string_search`
 * either — and the scan's own writes go through updateMatrixKeysData, which
 * emits no Time Machine row.
 *
 * NOT COVERED, and why (no seam exists):
 *  - `status: 'exempt'` and `status: 'budget_exhausted'`. Both are reachable
 *    only from the DISCOVERY pass (`scopedTables === null`), which walks every
 *    matrix% table in the database. On this test DB that means a full
 *    `relation::text LIKE '%id_key%'` walk of matrix_hierarchy (2.26M rows,
 *    ~5 s per 500-row batch) — minutes of shared-DB I/O per run, ending in the
 *    45 s per-table budget. The budget constants are module consts with no
 *    override. The exemption LIST and the completeness verdict are gated
 *    purely in dataframe_scan_coverage_tripwire.test.ts.
 *  - `relation === null`: unreachable through the batch SQL
 *    (`relation::text LIKE '%id_key%'` is NULL for a NULL column, so the row is
 *    never selected). Same reason the plan's "plain locator is never checked"
 *    case was dropped.
 */

import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { dataframeControlScan } from '../../src/core/area_maintenance/widgets/dataframe_control.ts';
import { MATRIX_TABLE_ALLOWLIST } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';

/** Private scratch clone — the ONLY table this file writes to. */
const TABLE = 'matrix_ts_test_dfscan';
/**
 * A VIEW that is discovered as "has a jsonb relation column" but explodes on
 * the batch SELECT (no section_tipo column) — the only cheap, deterministic
 * way to reach the per-batch catch.
 */
const BAD_VIEW = 'matrix_ts_test_dfscan_bad';
const SECTION_TIPO = 'zztdfs1';
const SLOT = 'test999'; // the frame slot key (from_component_tipo)
const MAIN = 'test218'; // main component tipo of the frames

type Json = Record<string, unknown> | unknown[] | string | null;

interface SeedColumns {
	relation?: Json;
	string?: Json;
	number?: Json;
}

/** One scratch row. Explicit ids: never draw from the shared matrix_test sequence. */
async function seedRow(id: number, sectionId: number, columns: SeedColumns): Promise<void> {
	const encode = (value: Json | undefined): string | null =>
		value === undefined ? null : JSON.stringify(value);
	await sql.unsafe(
		`INSERT INTO "${TABLE}" (id, section_tipo, section_id, relation, "string", "number")
		 VALUES ($1, $2, $3, $4::text::jsonb, $5::text::jsonb, $6::text::jsonb)`,
		[
			id,
			SECTION_TIPO,
			sectionId,
			encode(columns.relation),
			encode(columns.string),
			encode(columns.number),
		],
	);
}

/** A well-formed dd490 pairing locator (the shape the scan checks). */
function frame(over: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id_key: 99,
		type: 'dd490',
		main_component_tipo: MAIN,
		from_component_tipo: SLOT,
		section_tipo: 'dd1706',
		section_id: '7',
		...over,
	};
}

/** A plain (non-frame) portal locator: no pairing keys, must be left alone. */
function plainLocator(id: number): Record<string, unknown> {
	return { id, type: 'dd151', section_id: '5', section_tipo: 'test2' };
}

async function readRelation(sectionId: number): Promise<Record<string, unknown> | null> {
	const rows = (await sql.unsafe(
		`SELECT relation FROM "${TABLE}" WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION_TIPO, sectionId],
	)) as { relation: Record<string, unknown> | null }[];
	return rows[0]?.relation ?? null;
}

type ScanResult = {
	scanned: number;
	frames_checked: number;
	orphans: number;
	orphan_items: string[];
	legacy_unmigrated: number;
	orphans_fixed: number;
	complete: boolean;
	coverage: {
		table: string;
		status: string;
		reason?: string;
		rows_scanned: number;
		last_id: number;
		batches: number;
	}[];
	uncovered: string[];
	errors: string[];
};

async function scan(
	fix: boolean,
	tables: string[] | null,
): Promise<{ result: ScanResult; msg: string }> {
	const response = await dataframeControlScan(fix, tables);
	return { result: response.result as ScanResult, msg: String(response.msg) };
}

beforeAll(async () => {
	await sql.unsafe(`DROP VIEW IF EXISTS "${BAD_VIEW}"`, []);
	await sql.unsafe(`DROP TABLE IF EXISTS "${TABLE}"`, []);
	await sql.unsafe(`CREATE TABLE "${TABLE}" (LIKE matrix_test INCLUDING ALL)`, []);
	await sql.unsafe(`CREATE VIEW "${BAD_VIEW}" AS SELECT id, relation FROM "${TABLE}"`, []);
});

afterEach(async () => {
	await sql.unsafe(`DELETE FROM "${TABLE}"`, []);
});

afterAll(async () => {
	await sql.unsafe(`DROP VIEW IF EXISTS "${BAD_VIEW}"`, []);
	await sql.unsafe(`DROP TABLE IF EXISTS "${TABLE}"`, []);

	// Fail loud if the cleanup did not reach zero.
	const left = (await sql.unsafe(
		`SELECT to_regclass('public.${TABLE}')::text AS t, to_regclass('public.${BAD_VIEW}')::text AS v`,
		[],
	)) as { t: string | null; v: string | null }[];
	expect(left[0]).toEqual({ t: null, v: null });

	// The scratch section_tipo must exist NOWHERE else: this file never writes
	// to the shared surfaces, and that has to be provable, not asserted in prose.
	const strays = (await sql.unsafe(
		`SELECT (SELECT count(*) FROM matrix_test WHERE section_tipo = $1)::int AS matrix_test,
		        (SELECT count(*) FROM matrix_time_machine WHERE section_tipo = $1)::int AS tm`,
		[SECTION_TIPO],
	)) as { matrix_test: number; tm: number }[];
	expect(strays[0]).toEqual({ matrix_test: 0, tm: 0 });

	// The allowlist patch of the fix-mode test must not have leaked.
	expect(MATRIX_TABLE_ALLOWLIST.includes(TABLE)).toBe(false);
});

describe('dataframeControlScan — read-only detection', () => {
	test('an unpaired frame is reported as an orphan with the operator-actionable context', async () => {
		await seedRow(1, 900001, { relation: { [SLOT]: [frame()] } });

		const { result, msg } = await scan(false, [TABLE]);

		expect({
			scanned: result.scanned,
			frames_checked: result.frames_checked,
			orphans: result.orphans,
			legacy: result.legacy_unmigrated,
			fixed: result.orphans_fixed,
			complete: result.complete,
			errors: result.errors,
			uncovered: result.uncovered,
		}).toEqual({
			scanned: 1,
			frames_checked: 1,
			orphans: 1,
			legacy: 0,
			fixed: 0,
			complete: true,
			errors: [],
			uncovered: [],
		});
		// batches === 2: one batch returning the row, one returning nothing.
		expect(result.coverage).toEqual([
			{
				table: TABLE,
				status: 'complete',
				reason: undefined,
				rows_scanned: 1,
				last_id: 1,
				batches: 2,
			},
		]);
		expect(result.orphan_items).toHaveLength(1);
		const line = result.orphan_items[0] ?? '';
		expect(line).toContain(`${TABLE} ${SECTION_TIPO}_900001`);
		expect(line).toContain('ORPHAN frame: main test218 has no item id 99');
		expect(line).toContain('slot test999');
		expect(line).toContain('target dd1706_7');
		expect(msg).toBe('OK. Integrity scan done. Orphans found: 1');
	});

	test('a frame whose main item carries the same id is paired', async () => {
		await seedRow(1, 900001, {
			relation: {
				[SLOT]: [frame({ id_key: 1 })],
				[MAIN]: [plainLocator(1)],
			},
		});

		const { result, msg } = await scan(false, [TABLE]);

		expect({ checked: result.frames_checked, orphans: result.orphans }).toEqual({
			checked: 1,
			orphans: 0,
		});
		expect(result.orphan_items).toEqual([]);
		expect(msg).toBe('OK. Integrity scan done. Orphans found: 0');
	});

	test('a main "item" that is itself a frame never pairs (both pairing keys disqualify it)', async () => {
		// The pairing rule is not "some item with this id" — it is "some item
		// with this id that is NOT a frame itself". Dropping either key check
		// would make both of these rows read as clean.
		await seedRow(1, 900001, {
			relation: { [SLOT]: [frame()], [MAIN]: [{ ...plainLocator(99), id_key: 5 }] },
		});
		await seedRow(2, 900002, {
			relation: { [SLOT]: [frame()], [MAIN]: [{ ...plainLocator(99), section_id_key: 5 }] },
		});

		const { result } = await scan(false, [TABLE]);

		expect({
			scanned: result.scanned,
			checked: result.frames_checked,
			orphans: result.orphans,
		}).toEqual({ scanned: 2, checked: 2, orphans: 2 });
	});

	test('a main item living in a NON-relation column (a literal) pairs just as well', async () => {
		// findMainItems walks every jsonb data column, not just `relation`.
		await seedRow(1, 900001, {
			relation: { [SLOT]: [frame({ id_key: 3, main_component_tipo: 'test52' })] },
			string: { test52: [{ id: 3, value: 'literal main item' }] },
		});

		const { result } = await scan(false, [TABLE]);

		expect({ checked: result.frames_checked, orphans: result.orphans }).toEqual({
			checked: 1,
			orphans: 0,
		});
	});

	test('a legacy frame (section_id_key only) on a RELATION-model main counts as unmigrated, not orphan', async () => {
		// test80 is a component_portal → its column is `relation`, so a frame
		// with no id_key predates the id_key migration and is reported apart.
		await seedRow(1, 900001, {
			relation: {
				[SLOT]: [
					{
						section_id_key: 4,
						type: 'dd490',
						main_component_tipo: 'test80',
						from_component_tipo: SLOT,
					},
				],
			},
		});

		const { result, msg } = await scan(false, [TABLE]);

		expect({
			checked: result.frames_checked,
			legacy: result.legacy_unmigrated,
			orphans: result.orphans,
		}).toEqual({ checked: 1, legacy: 1, orphans: 0 });
		expect(msg).toBe(
			'OK. Integrity scan done. Orphans found: 0 - legacy (pre-migration) frames: 1',
		);
	});

	test('section_id_key on a LITERAL main is checked normally (not excused as legacy)', async () => {
		// test52 is a component_input_text → column `string`, so the legacy
		// escape hatch must not fire: the key is checked against the main items.
		await seedRow(1, 900001, {
			relation: {
				[SLOT]: [
					{
						section_id_key: 7,
						type: 'dd490',
						main_component_tipo: 'test52',
						from_component_tipo: SLOT,
					},
				],
			},
			string: { test52: [{ id: 7, value: 'paired' }] },
		});
		await seedRow(2, 900002, {
			relation: {
				[SLOT]: [
					{
						section_id_key: 8,
						type: 'dd490',
						main_component_tipo: 'test52',
						from_component_tipo: SLOT,
					},
				],
			},
			string: { test52: [{ id: 1, value: 'other item' }] },
		});

		const { result } = await scan(false, [TABLE]);

		expect({
			checked: result.frames_checked,
			legacy: result.legacy_unmigrated,
			orphans: result.orphans,
		}).toEqual({ checked: 2, legacy: 0, orphans: 1 });
		expect(result.orphan_items[0] ?? '').toContain('has no item id 8');
	});

	test('entries that are not complete pairing locators are not checked at all', async () => {
		// Every element here contains the text `id_key` (so the row IS selected
		// by the batch prefilter) but none is a checkable frame.
		await seedRow(1, 900001, {
			relation: {
				[SLOT]: [
					plainLocator(1), // no pairing keys
					{ id_key: 5, main_component_tipo: MAIN }, // no from_component_tipo
					{ id_key: 6, from_component_tipo: SLOT }, // no main_component_tipo
					{ main_component_tipo: MAIN, from_component_tipo: SLOT }, // no key at all
					null,
					'id_key as a bare string',
				],
			},
		});

		const { result } = await scan(false, [TABLE]);

		expect({
			scanned: result.scanned,
			checked: result.frames_checked,
			orphans: result.orphans,
			legacy: result.legacy_unmigrated,
		}).toEqual({ scanned: 1, checked: 0, orphans: 0, legacy: 0 });
	});

	test('non-object relation shapes are skipped without throwing', async () => {
		await seedRow(1, 900001, { relation: [frame()] }); // a jsonb ARRAY
		await seedRow(2, 900002, { relation: { [SLOT]: 'id_key' } }); // key value not an array
		await seedRow(3, 900003, { relation: 'id_key' }); // a jsonb string scalar

		const { result } = await scan(false, [TABLE]);

		expect({
			scanned: result.scanned,
			checked: result.frames_checked,
			orphans: result.orphans,
			errors: result.errors,
		}).toEqual({ scanned: 3, checked: 0, orphans: 0, errors: [] });
	});

	test('orphan DETAILS are capped at 500 while the COUNT is not', async () => {
		const frames = Array.from({ length: 501 }, (_unused, index) => frame({ id_key: 1000 + index }));
		await seedRow(1, 900001, { relation: { [SLOT]: frames } });

		const { result } = await scan(false, [TABLE]);

		expect({
			checked: result.frames_checked,
			orphans: result.orphans,
			items: result.orphan_items.length,
		}).toEqual({ checked: 501, orphans: 501, items: 500 });
	});

	test('the batch cursor advances: a table larger than one batch is fully walked', async () => {
		// 501 rows > DATAFRAME_BATCH_SIZE (500). A cursor that does not advance
		// either loops forever (this test times out) or re-walks batch 1.
		await sql.unsafe(
			`INSERT INTO "${TABLE}" (id, section_tipo, section_id, relation)
			 SELECT gs, $1, 900000 + gs,
			        jsonb_build_object($2::text, jsonb_build_array($3::text::jsonb))
			   FROM generate_series(1, 501) AS gs`,
			[SECTION_TIPO, SLOT, JSON.stringify(frame())],
		);

		const { result } = await scan(false, [TABLE]);

		expect({ scanned: result.scanned, orphans: result.orphans }).toEqual({
			scanned: 501,
			orphans: 501,
		});
		expect(result.coverage[0]).toEqual({
			table: TABLE,
			status: 'complete',
			reason: undefined,
			rows_scanned: 501,
			last_id: 501,
			batches: 3, // 500 + 1 + the empty probe that ends the loop
		});
	}, 60_000);
});

describe('dataframeControlScan — table scoping and coverage', () => {
	test('a table with no jsonb relation column is structurally covered', async () => {
		const { result, msg } = await scan(false, ['matrix_time_machine']);

		expect(result.coverage).toEqual([
			{
				table: 'matrix_time_machine',
				status: 'no_relation_column',
				reason: 'no jsonb relation column — cannot hold frame locators (structural)',
				rows_scanned: 0,
				last_id: 0,
				batches: 0,
			},
		]);
		expect({
			complete: result.complete,
			uncovered: result.uncovered,
			scanned: result.scanned,
		}).toEqual({
			complete: true,
			uncovered: [],
			scanned: 0,
		});
		expect(msg).toBe('OK. Integrity scan done. Orphans found: 0');
	});

	test('an EXPLICIT scope overrides the exemption list', async () => {
		// matrix_activity is exempt in the discovery pass; naming it is a
		// deliberate operator choice and must win. Read-only (fix=false), and no
		// count is asserted — other suites write activity rows concurrently.
		const { result } = await scan(false, ['matrix_activity']);

		expect(result.coverage).toHaveLength(1);
		expect(result.coverage[0]?.table).toBe('matrix_activity');
		expect(result.coverage[0]?.status).toBe('complete');
		expect(result.coverage[0]?.reason).toBeUndefined();
	}, 60_000);

	test('a failing batch truncates ONE table and never aborts the scan', async () => {
		await seedRow(1, 900001, { relation: { [SLOT]: [frame()] } });

		const { result, msg } = await scan(false, [BAD_VIEW, TABLE]);

		expect(result.coverage).toHaveLength(2);
		const bad = result.coverage[0];
		expect(bad?.table).toBe(BAD_VIEW);
		expect(bad?.status).toBe('error');
		expect(bad?.reason ?? '').toContain('batch at id > 0 failed:');
		expect(bad?.reason ?? '').toContain('rows with id > 0 were NOT examined');
		expect(result.errors[0] ?? '').toContain(`${BAD_VIEW} | batch at id > 0 failed:`);

		// The SECOND table was still walked — that is the whole point.
		expect(result.coverage[1]?.status).toBe('complete');
		expect({ scanned: result.scanned, orphans: result.orphans }).toEqual({
			scanned: 1,
			orphans: 1,
		});

		// …and the verdict says so.
		expect(result.complete).toBe(false);
		expect(result.uncovered).toHaveLength(1);
		expect(msg).toBe(
			'PARTIAL. Integrity scan done. Orphans found: 1 - INCOMPLETE, 1 of 2 tables not fully examined',
		);
	});

	test('an empty scope fails CLOSED: nothing examined is never "complete"', async () => {
		const { result, msg } = await scan(false, []);

		expect({
			complete: result.complete,
			uncovered: result.uncovered,
			coverage: result.coverage,
			scanned: result.scanned,
		}).toEqual({
			complete: false,
			uncovered: ['no tables were discovered — the scan examined nothing'],
			coverage: [],
			scanned: 0,
		});
		expect(msg).toContain('PARTIAL.');
	});
});

describe('dataframeControlScan — fix mode', () => {
	test('a failing fix is reported per row and leaves the data untouched', async () => {
		// The scratch clone is not in MATRIX_TABLE_ALLOWLIST, so the write half
		// (updateMatrixKeysData) refuses it. That is the identifier gate doing
		// its job; what is under test here is the scan's CATCH: one row's failed
		// fix must be reported and must not abort the walk or lose the count.
		const before = { [SLOT]: [frame(), plainLocator(3)] };
		await seedRow(1, 900001, { relation: before });

		const { result } = await scan(true, [TABLE]);

		expect({ orphans: result.orphans, fixed: result.orphans_fixed }).toEqual({
			orphans: 1,
			fixed: 0,
		});
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0] ?? '').toContain(`${TABLE} ${SECTION_TIPO}_900001 | fix failed:`);
		expect(await readRelation(900001)).toEqual(before);
	});

	test('fix strips ONLY the orphan entries, per component key', async () => {
		const orphan = frame(); // id_key 99, no main item 99
		const paired = frame({ id_key: 1 });
		const sibling = plainLocator(7);
		await seedRow(1, 900001, {
			relation: {
				[SLOT]: [paired, orphan, sibling],
				test998: [frame({ id_key: 42 })], // every entry of this key is an orphan
				[MAIN]: [plainLocator(1)],
			},
		});

		// The scratch clone must be allowlisted for the duration of the write,
		// or the fix path cannot execute at all. Restored in the finally, and
		// re-asserted in afterAll.
		const allowlist = MATRIX_TABLE_ALLOWLIST as string[];
		allowlist.push(TABLE);
		let result: ScanResult;
		let msg: string;
		try {
			({ result, msg } = await scan(true, [TABLE]));
		} finally {
			allowlist.splice(allowlist.indexOf(TABLE), 1);
		}

		expect({ orphans: result.orphans, fixed: result.orphans_fixed, errors: result.errors }).toEqual(
			{
				orphans: 2,
				fixed: 2,
				errors: [],
			},
		);
		expect(msg).toBe('OK. Integrity scan done. Orphans removed: 2');

		const after = await readRelation(900001);
		expect(after).toEqual({
			// order preserved, survivors byte-identical
			[SLOT]: [paired, sibling],
			// a key that loses every entry is REMOVED, not left as []
			[MAIN]: [plainLocator(1)],
		});

		// Idempotent: the same scan now finds nothing to do.
		const second = await scan(false, [TABLE]);
		expect({ orphans: second.result.orphans, checked: second.result.frames_checked }).toEqual({
			orphans: 0,
			checked: 1,
		});
	});
});
