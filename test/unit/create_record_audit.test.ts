/**
 * Record-creation audit metadata — TS-NATIVE half, the DEC-14b survival twin
 * of test/parity/create_differential.test.ts (that gate created twin records
 * via live PHP + TS dispatch and deep-compared the rows; the PHP side dies
 * with the oracle, the row anatomy it pinned survives HERE).
 *
 * createSectionRecord (PHP section::create_record → section_record::create)
 * writes ONE new matrix row carrying:
 *   data     = {label, created_date, section_id:null, section_tipo,
 *              diffusion_info:null, created_by_user_id}  (PHP build_metadata)
 *   relation = {dd200: [created-by user locator → dd128]}
 *   date     = {dd199: [{id:1, start:<virtual date>, lang:'lg-nolan'}]}
 * The differential pinned the data key set/values (created_date normalized),
 * the relation column VERBATIM, and the dd199 item shape (start instant
 * normalized). The label VALUE is section-dependent (ontology term) — the
 * differential compared it between twin creates of the SAME section, so here
 * only its presence/type is asserted. The start's INTERNAL field set was
 * normalized away by the differential; it is asserted here against the PHP
 * dd_date virtual-calendar encoding (create_record.ts virtualDateNow, ported
 * from PHP dd_date — fixed 372-day years / 31-day months).
 *
 * Scratch hygiene: one disposable numisdata6 twin (matrix), row + TM rows
 * deleted in afterAll (the tm_wallclock pattern).
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dbTimestamp } from '../../src/core/db/db_timestamp.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	createSectionRecord,
	virtualDateNow,
} from '../../src/core/section/record/create_record.ts';

const SECTION = 'numisdata6';
const TABLE = 'matrix';
const USER_ID = -1;

/** Allowed |stamp − wall clock| (ms for created_date, virtual seconds for
 * dd199) — the guarded corruption class is a whole timezone offset ≥ 1h. */
const TOLERANCE_MS = 120_000;
const TOLERANCE_VIRTUAL_SECONDS = 120;

interface CreatedRow {
	data: Record<string, unknown>;
	relation: Record<string, unknown>;
	date: { dd199?: { id?: unknown; lang?: unknown; start?: Record<string, number> }[] };
}

let twin = 0;
let row: CreatedRow | undefined;

/** Uniform wall-clock epoch for 'YYYY-MM-DD HH:MM:SS' strings (both sides
 * parsed with the SAME rule, so the diff measures wall-clock skew). */
function wallClockEpoch(stamp: string): number {
	return Date.parse(`${stamp.replace(' ', 'T')}Z`);
}

beforeAll(async () => {
	twin = await createSectionRecord(SECTION, USER_ID);
	const rows = (await sql.unsafe(
		`SELECT data, relation, date FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, twin],
	)) as CreatedRow[];
	row = rows[0];
}, 30000);

afterAll(async () => {
	if (twin > 0) {
		await sql.unsafe(`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
			SECTION,
			twin,
		]);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, twin],
		);
	}
});

describe('record-creation audit metadata (TS-native, PHP build_metadata shape)', () => {
	test('the allocated section_id is a positive integer', () => {
		expect(Number.isInteger(twin)).toBe(true);
		expect(twin).toBeGreaterThan(0);
		expect(row).toBeDefined();
	});

	test('data metadata: exact key set, values, wall-clock-sane created_date', () => {
		const data = (row as CreatedRow).data;
		expect(Object.keys(data).sort()).toEqual([
			'created_by_user_id',
			'created_date',
			'diffusion_info',
			'label',
			'section_id',
			'section_tipo',
		]);
		expect(typeof data.label).toBe('string'); // ontology term (section-dependent value)
		expect(data.section_id).toBeNull(); // PHP writes it null (real id lives structurally)
		expect(data.section_tipo).toBe(SECTION);
		expect(data.diffusion_info).toBeNull();
		expect(data.created_by_user_id).toBe(USER_ID);

		// created_date: 'YYYY-MM-DD HH:MM:SS' in DEDALO_TIMEZONE wall-clock time.
		const createdDate = data.created_date as string;
		expect(createdDate).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
		const skew = Math.abs(wallClockEpoch(createdDate) - wallClockEpoch(dbTimestamp()));
		expect(skew).toBeLessThan(TOLERANCE_MS);
	});

	test('relation: the dd200 created-by locator, verbatim (differential-pinned)', () => {
		expect((row as CreatedRow).relation).toEqual({
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
	});

	test('date: one dd199 item (id 1, lg-nolan) with a consistent virtual-date start', () => {
		const items = (row as CreatedRow).date.dd199 ?? [];
		expect(items.length).toBe(1);
		// PHP dd_date virtual-date field set (fixed 372-day years / 31-day months).
		interface VirtualStart {
			day: number;
			hour: number;
			time: number;
			year: number;
			month: number;
			minute: number;
			second: number;
		}
		const item = items[0] as unknown as { id: unknown; lang: unknown; start: VirtualStart };
		expect(Object.keys(item).sort()).toEqual(['id', 'lang', 'start']);
		expect(item.id).toBe(1);
		expect(item.lang).toBe('lg-nolan');

		const start = item.start;
		expect(Object.keys(start).sort()).toEqual([
			'day',
			'hour',
			'minute',
			'month',
			'second',
			'time',
			'year',
		]);
		// PHP dd_date virtual-calendar encoding: time recomputes from its own fields.
		const recomputed =
			start.year * 372 * 86400 +
			(start.month - 1) * 31 * 86400 +
			(start.day - 1) * 86400 +
			start.hour * 3600 +
			start.minute * 60 +
			start.second;
		expect(start.time).toBe(recomputed);
		// …and the instant is wall-clock sane (not UTC-shifted).
		const skew = Math.abs(start.time - virtualDateNow(new Date()).time);
		expect(skew).toBeLessThan(TOLERANCE_VIRTUAL_SECONDS);
	});
});
