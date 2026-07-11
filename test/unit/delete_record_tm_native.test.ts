/**
 * delete_record Time Machine snapshot anatomy — TS-NATIVE half, the DEC-14b
 * survival twin of test/parity/delete_differential.test.ts (that gate created
 * and deleted twin records via live PHP + TS and deep-compared the TM rows;
 * the PHP side dies with the oracle, the row anatomy it pinned EQUAL to live
 * PHP survives HERE, asserted against the TS engine alone).
 *
 * delete_record removes the matrix row and FIRST writes one record-level
 * Time Machine snapshot (PHP section_record::delete → tm_record::create):
 *   header: section_tipo = the section, tipo = the SECTION tipo (not a
 *           component), lang = 'lg-nolan', user_id = the acting user;
 *   data:   the record's FULL get_data() object — EVERY matrix jsonb column
 *           (data, relation, string, date, iri, geo, number, media, misc,
 *           relation_search, meta), unpopulated columns null.
 * The differential pinned the header fields and the snapshot equal between
 * engines (created_date / data.section_id / date starts normalized); the
 * lang/tipo VALUES below are what TS wrote while that cross-engine equality
 * held live, so they are oracle-anchored.
 *
 * SOFTENED / TS-side notes (never oracle-pinned by the differential):
 *  - data.data.section_id: normalized away cross-engine; a TS-created record
 *    stores null (build_metadata) — asserted as the TS engine fact;
 *  - result shape {deleted:[id-as-string], removed:true}: the PHP
 *    sections::delete result contract (delete_multi_native pins the string
 *    ids at the dispatch envelope);
 *  - the TM row timestamp: wall-clock sanity only.
 *
 * Driven at the ENGINE chokepoint (deleteSectionRecord) — the dispatch
 * envelope, activity dd542 row and children guard have their own native
 * gates (activity_log_native / delete_multi_native / delete_children_guard).
 * Fixture: one fresh test3 twin (matrix_test; the differential used test2 —
 * same table contract, test3 matches the sibling natives and stays clear of
 * the observer/indexation scratch surfaces). Row + TM rows swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dbTimestamp } from '../../src/core/db/db_timestamp.ts';
import { MATRIX_JSONB_COLUMNS } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import {
	type DeleteRecordResult,
	deleteSectionRecord,
} from '../../src/core/section/record/delete_record.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const COMPONENT = 'test52'; // component_input_text of test3 (the sibling natives' twin)
const USER_ID = -1; // root
const VALUE = [{ id: 1, lang: 'lg-nolan', value: 'DELETE_TM_NATIVE' }];

/** Allowed |stamp − wall clock| — the guarded corruption class is a whole
 * timezone offset ≥ 1h. */
const TOLERANCE_MS = 120_000;

interface TmRow {
	section_tipo: string;
	tipo: string;
	lang: string;
	user_id: string | number;
	data: Record<string, unknown>;
	ts: string;
}

let recordId = 0;
let preDeleteColumns: Record<string, unknown> | undefined;
let outcome: DeleteRecordResult | undefined;
let tmRows: TmRow[] = [];

function wallClockEpoch(stamp: string): number {
	return Date.parse(`${stamp.replace(' ', 'T')}Z`);
}

beforeAll(async () => {
	recordId = await createSectionRecord(SECTION, USER_ID);
	// Seed a component value so the snapshot must carry a REAL data column,
	// not just the creation metadata (same direct-SQL seed as the sibling
	// delete_data fixture — no engine save side effects).
	await sql.unsafe(
		`UPDATE ${TABLE} SET string = jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, recordId, COMPONENT, JSON.stringify(VALUE)],
	);

	// The full pre-delete record — what the snapshot must equal.
	const columnList = MATRIX_JSONB_COLUMNS.map((column) => `"${column}"`).join(', ');
	const rows = (await sql.unsafe(
		`SELECT ${columnList} FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, recordId],
	)) as Record<string, unknown>[];
	preDeleteColumns = rows[0];

	outcome = await deleteSectionRecord(SECTION, recordId, USER_ID);

	tmRows = (await sql.unsafe(
		`SELECT section_tipo, tipo, lang, user_id, data, timestamp::text AS ts
		 FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 ORDER BY id`,
		[SECTION, recordId],
	)) as TmRow[];
}, 30000);

afterAll(async () => {
	if (recordId > 0) await cleanScratchRecord(SECTION, recordId, TABLE);
});

describe('delete_record TM snapshot (TS-native anatomy)', () => {
	test('the matrix row is gone and the result is the PHP delete shape', async () => {
		const rows = (await sql.unsafe(
			`SELECT 1 FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
			[SECTION, recordId],
		)) as unknown[];
		expect(rows.length).toBe(0);
		expect(outcome).toEqual({ deleted: [String(recordId)], removed: true });
	});

	test('exactly ONE TM row: the record-level snapshot header', () => {
		expect(tmRows.length).toBe(1);
		const row = tmRows[0] as TmRow;
		expect(row.section_tipo).toBe(SECTION);
		expect(row.tipo).toBe(SECTION); // the SECTION tipo — the record-level audit point
		expect(row.lang).toBe('lg-nolan');
		expect(String(row.user_id)).toBe(String(USER_ID));
		// Wall-clock sanity (TS-side; the differential normalized instants).
		const skew = Math.abs(wallClockEpoch(String(row.ts)) - wallClockEpoch(dbTimestamp()));
		expect(skew).toBeLessThan(TOLERANCE_MS);
	});

	test('snapshot data = EVERY matrix jsonb column of the pre-delete record', () => {
		const snapshot = (tmRows[0] as TmRow).data;
		expect(Object.keys(snapshot).sort()).toEqual([...MATRIX_JSONB_COLUMNS].sort());
		// Byte-for-byte the record that was removed (full-column snapshot).
		expect(snapshot).toEqual(preDeleteColumns as Record<string, unknown>);
	});

	test('snapshot spot-pins: seeded value, creation audit, nulls for empty columns', () => {
		const snapshot = (tmRows[0] as TmRow).data;
		expect(snapshot.string).toEqual({ [COMPONENT]: VALUE });
		// Creation audit (dd200 created-by locator — the create_record contract).
		expect(snapshot.relation).toEqual({
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
		const date = snapshot.date as Record<string, unknown[]>;
		expect(Array.isArray(date.dd199)).toBe(true); // creation date item
		// data-column metadata rides inside the snapshot (section_id null on a
		// TS-created record — build_metadata; the differential normalized it).
		const meta = snapshot.data as Record<string, unknown>;
		expect(meta.section_tipo).toBe(SECTION);
		expect(meta.section_id).toBeNull();
		expect(meta.created_by_user_id).toBe(USER_ID);
		// Never-populated columns are present as null, not absent.
		for (const column of ['iri', 'geo', 'number', 'media', 'misc', 'relation_search', 'meta']) {
			expect(snapshot[column]).toBeNull();
		}
	});
});
