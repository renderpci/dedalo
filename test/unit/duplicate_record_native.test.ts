/**
 * duplicate core contract — TS-NATIVE half, the DEC-14b survival twin of
 * test/parity/duplicate_differential.test.ts (that gate duplicated twin
 * sources via live PHP + TS and deep-compared the duplicate rows and their
 * TM audit rows; the PHP side dies with the oracle, the row anatomy it
 * pinned EQUAL to live PHP survives HERE, asserted against the TS engine
 * alone).
 *
 * Duplicating a record spawns a NEW record (fresh counter-allocated id):
 *   - FRESH audit stamps: created dd200/dd199 AND modified dd197/dd201 all
 *     point at the duplicating user "now" — proven here by seeding the
 *     SOURCE one hour in the past, so a copied stamp would fail the
 *     freshness checks;
 *   - `data` column: fresh build_metadata, NOT copied;
 *   - source component data copied with the audit tipos
 *     (dd197/dd199/dd200/dd201) DROPPED;
 *   - `meta`: [{count: maxItemId}] per copied component tipo;
 *   - Time Machine: one backfill+save pair per copied component — backfill
 *     with the FULL copied value, save row with the DATA-LANG slice
 *     (lg-spa; test52 is translatable), in that order.
 *
 * SOFTENED / TS-side notes (never oracle-pinned by the differential):
 *  - the 60_000 ms backfill→save delta: the differential compared TM
 *    tipo/lang/data in id order but not timestamps; the delta is the
 *    engine's shared backfill mechanism, pinned live at 60s by the
 *    delete_data differential;
 *  - instants (created_date, dd199/dd201 starts): normalized by the
 *    differential; asserted here as fresh + virtual-calendar consistent.
 *
 * Media files_info duplication is covered by duplicate_record_media.test.ts
 * — deliberately NOT re-asserted. Driven at the ENGINE chokepoint
 * (duplicateSectionRecord); the dispatch envelope/activity row have their
 * own native gates. Fixture: one test3 source with a two-lang test52 value
 * (direct-SQL seed; the differential used test2/numisdata16 — same
 * matrix_test contract). Source + duplicate + TM swept in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dbTimestamp } from '../../src/core/db/db_timestamp.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	createSectionRecord,
	virtualDateNow,
} from '../../src/core/section/record/create_record.ts';
import { duplicateSectionRecord } from '../../src/core/section/record/duplicate_record.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const COMPONENT = 'test52'; // component_input_text, translatable
const USER_ID = -1; // root

/** Two-lang component value seeded into the source (the differential's shape). */
const SEED_VALUE = [
	{ id: 1, lang: 'lg-spa', value: 'dup-a' },
	{ id: 2, lang: 'lg-eng', value: 'dup-b' },
];

/** The source is created ONE HOUR in the past: any copied-instead-of-fresh
 * audit stamp on the duplicate lands an hour off and fails the skew checks. */
const SOURCE_AGE_MS = 3_600_000;
const TOLERANCE_MS = 120_000;
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

interface DupRow {
	data: Record<string, unknown>;
	relation: Record<string, unknown>;
	string: Record<string, unknown>;
	date: Record<string, { id?: unknown; lang?: unknown; start?: Record<string, number> }[]>;
	meta: Record<string, unknown> | null;
	relation_search: unknown;
}

let sourceId = 0;
let dupId = 0;
let dup: DupRow | undefined;
let tmRows: Record<string, unknown>[] = [];

function wallClockEpoch(stamp: string): number {
	return Date.parse(`${stamp.replace(' ', 'T')}Z`);
}

/** PHP dd_date virtual-calendar consistency + wall-clock freshness. */
function assertFreshStart(start: Record<string, number> | undefined): void {
	expect(start).toBeDefined();
	const s = start as unknown as VirtualStart;
	const recomputed =
		s.year * 372 * 86400 +
		(s.month - 1) * 31 * 86400 +
		(s.day - 1) * 86400 +
		s.hour * 3600 +
		s.minute * 60 +
		s.second;
	expect(s.time).toBe(recomputed);
	expect(Math.abs(s.time - virtualDateNow(new Date()).time)).toBeLessThan(
		TOLERANCE_VIRTUAL_SECONDS,
	);
}

beforeAll(async () => {
	sourceId = await createSectionRecord(SECTION, USER_ID, new Date(Date.now() - SOURCE_AGE_MS));
	await sql.unsafe(
		`UPDATE ${TABLE} SET string = jsonb_build_object($3::text, $4::text::jsonb)
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, sourceId, COMPONENT, JSON.stringify(SEED_VALUE)],
	);

	dupId = await duplicateSectionRecord(SECTION, sourceId, USER_ID);

	const rows = (await sql.unsafe(
		`SELECT data, relation, string, date, meta, relation_search FROM ${TABLE}
		 WHERE section_tipo = $1 AND section_id = $2`,
		[SECTION, dupId],
	)) as DupRow[];
	dup = rows[0];
	tmRows = (await sql.unsafe(
		`SELECT tipo, lang, data, timestamp::text AS ts FROM matrix_time_machine
		 WHERE section_tipo = $1 AND section_id = $2 ORDER BY id`,
		[SECTION, dupId],
	)) as Record<string, unknown>[];
}, 30000);

afterAll(async () => {
	for (const id of [sourceId, dupId]) {
		if (id > 0) await cleanScratchRecord(SECTION, id, TABLE);
	}
});

describe('duplicate core contract (TS-native, differential-pinned anatomy)', () => {
	test('a NEW record exists at a fresh counter-allocated id', () => {
		expect(dupId).toBeGreaterThan(0);
		expect(dupId).not.toBe(sourceId);
		expect(dup).toBeDefined();
	});

	test('data column: fresh build_metadata, NOT copied from the source', () => {
		const data = (dup as DupRow).data;
		expect(Object.keys(data).sort()).toEqual([
			'created_by_user_id',
			'created_date',
			'diffusion_info',
			'label',
			'section_id',
			'section_tipo',
		]);
		expect(typeof data.label).toBe('string');
		expect(data.section_id).toBeNull();
		expect(data.section_tipo).toBe(SECTION);
		expect(data.diffusion_info).toBeNull();
		expect(data.created_by_user_id).toBe(USER_ID);
		// Fresh: NOW, not the source's hour-old creation stamp.
		const skew = Math.abs(
			wallClockEpoch(data.created_date as string) - wallClockEpoch(dbTimestamp()),
		);
		expect(skew).toBeLessThan(TOLERANCE_MS);
	});

	test('fresh created dd200/dd199 AND modified dd197/dd201 stamps (audit tipos not copied)', () => {
		// relation: BOTH audit locators, nothing else (differential-pinned shape).
		expect((dup as DupRow).relation).toEqual({
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
		// date: created dd199 + modified dd201, each one fresh nolan item — an
		// hour-old (copied) start would fail the freshness skew.
		const date = (dup as DupRow).date;
		expect(Object.keys(date).sort()).toEqual(['dd199', 'dd201']);
		for (const key of ['dd199', 'dd201'] as const) {
			const items = date[key] ?? [];
			expect(items.length).toBe(1);
			expect(items[0]?.id).toBe(1);
			expect(items[0]?.lang).toBe('lg-nolan');
			assertFreshStart(items[0]?.start);
		}
	});

	test('source component data copied; meta gets the per-component counter', () => {
		expect((dup as DupRow).string).toEqual({ [COMPONENT]: SEED_VALUE });
		// [{count: maxItemId}] per copied tipo (PHP canonical array shape).
		expect((dup as DupRow).meta).toEqual({ [COMPONENT]: [{ count: 2 }] });
		expect((dup as DupRow).relation_search).toBeNull(); // nothing to copy
	});

	test('TM: one backfill+save pair for the copied component (full value → lg-spa slice)', () => {
		const shapes = tmRows.map((tm) => ({ tipo: tm.tipo, lang: tm.lang, data: tm.data }));
		expect(shapes).toEqual([
			{ tipo: COMPONENT, lang: 'lg-spa', data: SEED_VALUE }, // backfill: FULL copied value
			{ tipo: COMPONENT, lang: 'lg-spa', data: [SEED_VALUE[0]] }, // save: data-lang slice
		]);
		// Backfill precedes the save row by 60s (engine mechanism — see header).
		const delta =
			new Date(String(tmRows[1]?.ts)).getTime() - new Date(String(tmRows[0]?.ts)).getTime();
		expect(delta).toBe(60_000);
	});
});
