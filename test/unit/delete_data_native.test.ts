/**
 * delete_data end-state — TS-NATIVE half, the DEC-14b survival twin of
 * test/parity/delete_data_differential.test.ts (that gate emptied twin
 * test3 records via live PHP + TS and deep-compared the surviving rows and
 * TM pairs; the PHP side dies with the oracle, the end-state it pinned EQUAL
 * to live PHP survives HERE, asserted against the TS engine alone).
 *
 * delete_data (the PHP DEFAULT delete mode) keeps the row and empties every
 * component. Differential-pinned end-state, re-expressed:
 *   - the component KEY is REMOVED — the emptied column is '{}', not
 *     null-valued (jsonb_set_lax delete_key semantics);
 *   - meta counters are KEPT;
 *   - dd197/dd201 modified stamps refreshed (the dd197 locator and the dd201
 *     item minus its start were pinned VERBATIM by the differential's
 *     full-row compare);
 *   - Time Machine: a backfill row with the OLD full value, then the save
 *     row with data null — both lang lg-spa (test52 is translatable; the
 *     data lang), backfill stamped exactly 60_000 ms BEFORE the save row
 *     (the differential pins the delta on both engines).
 *
 * SOFTENED / TS-side notes (never oracle-pinned by the differential):
 *  - dd201's start instant: virtual-calendar self-consistency + wall-clock
 *    sanity (the differential normalized starts);
 *  - the result shape {deleted:[id-as-string], removed:false}: PHP
 *    sections::delete result contract, not differential-compared.
 *
 * Driven at the ENGINE chokepoint (deleteSectionData) — dispatch envelope +
 * activity row anatomy live in activity_log_native.test.ts. Fixture: the
 * differential's exact seed (fresh test3 twin, test52 value + meta counter
 * written via direct SQL so no save-path side effects skew it). Row + TM
 * rows swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import {
	createSectionRecord,
	virtualDateNow,
} from '../../src/core/section/record/create_record.ts';
import {
	type DeleteRecordResult,
	deleteSectionData,
} from '../../src/core/section/record/delete_record.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const COMPONENT = 'test52'; // component_input_text, translatable
const USER_ID = -1; // root
const VALUE = [{ id: 1, lang: 'lg-nolan', value: 'DELETE_DATA_NATIVE' }];

/** Virtual-calendar seconds tolerance (dd201 instant vs the test wall clock). */
const TOLERANCE_VIRTUAL_SECONDS = 120;

/** The PHP dd_date virtual-date field set (fixed 372-day years / 31-day months). */
interface VirtualStart {
	day: number;
	hour: number;
	time: number;
	year: number;
	month: number;
	minute: number;
	second: number;
}

interface SurvivingRow {
	data: Record<string, unknown>;
	string: Record<string, unknown>;
	relation: Record<string, unknown>;
	date: Record<string, { id?: unknown; lang?: unknown; start?: Record<string, number> }[]>;
	meta: Record<string, unknown>;
}

let recordId = 0;
let outcome: DeleteRecordResult | undefined;
let row: SurvivingRow | undefined;
let tmRows: Record<string, unknown>[] = [];

beforeAll(async () => {
	recordId = await createSectionRecord(SECTION, USER_ID);
	// The differential's exact seed: value + meta counter via direct SQL.
	await sql.unsafe(
		`UPDATE ${TABLE}
		 SET string = jsonb_build_object($3::text, $4::text::jsonb),
		     meta = jsonb_build_object($3::text, '[{"count":1}]'::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, recordId, COMPONENT, JSON.stringify(VALUE)],
	);

	outcome = await deleteSectionData(SECTION, recordId, USER_ID);

	const rows = (await sql.unsafe(
		`SELECT data, string, relation, date, meta FROM ${TABLE}
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, recordId],
	)) as SurvivingRow[];
	row = rows[0];
	tmRows = (await sql.unsafe(
		`SELECT tipo, lang, data, timestamp::text AS ts FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 AND tipo = $3 ORDER BY id`,
		[SECTION, recordId, COMPONENT],
	)) as Record<string, unknown>[];
}, 30000);

afterAll(async () => {
	if (recordId > 0) await cleanScratchRecord(SECTION, recordId, TABLE);
});

describe('delete_data end-state (TS-native, differential-pinned shapes)', () => {
	test('the row survives with the component KEY REMOVED (column = {})', () => {
		expect(row).toBeDefined();
		expect(outcome).toEqual({ deleted: [String(recordId)], removed: false });
		// The key is GONE, not null-valued — the emptied column keeps '{}'.
		expect((row as SurvivingRow).string).toEqual({});
	});

	test('meta counters are KEPT', () => {
		expect((row as SurvivingRow).meta).toEqual({ [COMPONENT]: [{ count: 1 }] });
	});

	test('dd197/dd201 modified stamps refreshed (verbatim locator, fresh instant)', () => {
		// relation: the creation audit stays, the modified-by locator appears
		// (both were inside the differential's full-row deep-compare).
		expect((row as SurvivingRow).relation).toEqual({
			dd197: [
				{
					id: 1,
					type: 'dd151',
					section_id: String(USER_ID),
					section_tipo: 'dd128',
					from_component_tipo: 'dd197',
				},
			],
			dd200: [
				{
					id: 1,
					type: 'dd151',
					section_id: String(USER_ID),
					section_tipo: 'dd128',
					from_component_tipo: 'dd200',
				},
			],
		});
		const date = (row as SurvivingRow).date;
		expect(Array.isArray(date.dd199)).toBe(true); // creation date kept
		const items = date.dd201 ?? [];
		expect(items.length).toBe(1);
		const item = items[0] as { id?: unknown; lang?: unknown; start?: Record<string, number> };
		expect(item.id).toBe(1);
		expect(item.lang).toBe('lg-nolan');
		// Start: virtual-calendar self-consistent + at the wall clock (TS-side —
		// the differential normalized instants).
		const start = item.start as unknown as VirtualStart;
		const recomputed =
			start.year * 372 * 86400 +
			(start.month - 1) * 31 * 86400 +
			(start.day - 1) * 86400 +
			start.hour * 3600 +
			start.minute * 60 +
			start.second;
		expect(start.time).toBe(recomputed);
		expect(Math.abs(start.time - virtualDateNow(new Date()).time)).toBeLessThan(
			TOLERANCE_VIRTUAL_SECONDS,
		);
	});

	test('TM pair: backfill (old value, lg-spa) then null save row, −60s apart', () => {
		const shape = tmRows.map((tm) => ({ tipo: tm.tipo, lang: tm.lang, data: tm.data }));
		expect(shape).toEqual([
			{ tipo: COMPONENT, lang: 'lg-spa', data: VALUE },
			{ tipo: COMPONENT, lang: 'lg-spa', data: null },
		]);
		// The backfill precedes the save row by exactly 60 seconds (pinned live).
		const delta =
			new Date(String(tmRows[1]?.ts)).getTime() - new Date(String(tmRows[0]?.ts)).getTime();
		expect(delta).toBe(60_000);
	});
});
