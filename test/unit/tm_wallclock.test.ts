/**
 * TM timestamps are DEDALO_TIMEZONE wall-clock time (S1-03), TS-NATIVE half —
 * the DEC-14b survival twin of test/parity/tm_wallclock_differential.test.ts's
 * first test (that gate's cross-engine agreement half retires with the PHP
 * oracle; THIS single-engine wall-clock assertion is the contract that must
 * outlive it).
 *
 * matrix_time_machine.timestamp is text-sorted; the engine stamps local
 * wall-clock time in DEDALO_TIMEZONE via the ONE shared helper (dbTimestamp).
 * A UTC-stamped row misses by the full zone offset (2h in Madrid summer) and
 * mis-sorts every restore timeline in the skew window.
 *
 * Scratch hygiene: disposable numisdata6 twin; twin + TM rows deleted in
 * afterAll.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { dbTimestamp } from '../../src/core/db/db_timestamp.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';

const SECTION = 'numisdata6';
const COMPONENT = 'numisdata16'; // input_text → 'string' column

/** Allowed |stamp − wall clock| in ms (the guarded corruption class is a
 * whole timezone offset ≥ 1h; 120s absorbs runtime + clock drift). */
const TOLERANCE_MS = 120_000;

const created: number[] = [];

/** Uniform wall-clock epoch for 'YYYY-MM-DD HH:MM:SS' strings — both sides
 * parsed with the SAME (UTC) rule so the diff measures wall-clock skew. */
function wallClockEpoch(stamp: string): number {
	return Date.parse(`${stamp.replace(' ', 'T')}Z`);
}

afterAll(async () => {
	for (const id of created) {
		await sql.unsafe('DELETE FROM matrix WHERE section_tipo = $1 AND section_id = $2', [
			SECTION,
			id,
		]);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, id],
		);
	}
});

describe('TM timestamp wall-clock (S1-03, TS-native)', () => {
	test('the save path stamps DEDALO_TIMEZONE wall-clock time', async () => {
		const twin = await createSectionRecord(SECTION, -1);
		created.push(twin);
		const outcome = await saveComponentData({
			componentTipo: COMPONENT,
			sectionTipo: SECTION,
			sectionId: twin,
			lang: 'lg-spa',
			changedData: [
				{ action: 'update', id: null, value: { lang: 'lg-spa', value: 'reloj de pared' } },
			],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		const rows = (await sql`
			SELECT timestamp FROM matrix_time_machine
			WHERE section_tipo = ${SECTION} AND section_id = ${twin} AND tipo = ${COMPONENT}
			ORDER BY id DESC LIMIT 1
		`) as { timestamp: string | Date }[];
		const raw = rows[0]?.timestamp ?? null;
		expect(raw).not.toBeNull();
		const stamp =
			raw instanceof Date
				? raw.toISOString().slice(0, 19).replace('T', ' ')
				: String(raw).slice(0, 19).replace('T', ' ');

		const skew = Math.abs(wallClockEpoch(stamp) - wallClockEpoch(dbTimestamp()));
		expect(skew).toBeLessThan(TOLERANCE_MS);
	}, 60000);
});
