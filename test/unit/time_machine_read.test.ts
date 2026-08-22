/**
 * Time Machine reader against the real DB.
 *
 * Also pins the two TM contract points that differ from standard matrix
 * tables (see time_machine.ts header): TM is NOT readable through the
 * standard matrix reader, and a row's section_tipo is the SOURCE section,
 * never 'dd15'.
 *
 * THE ROWS ARE BUILT HERE. This gate used to read a hard-coded primary key
 * ("oldest row in the dev DB, seen via psql during scaffolding") — an id no
 * rebuilt suite database holds, so it measured the ambient fixture instead of
 * the reader. It now appends its OWN audit trail through the engine's TM door
 * (recordTimeMachine, the call the save path makes) on a reserved scratch id
 * of the generic `test3` playground section, reads it back, and sweeps it.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { dbTimestamp } from '../../src/core/db/db_timestamp.ts';
import { readMatrixRecord } from '../../src/core/db/matrix.ts';
import { sql } from '../../src/core/db/postgres.ts';
import {
	readTimeMachineHistory,
	readTimeMachineRow,
	recordTimeMachine,
	TIME_MACHINE_SECTION_TIPO,
} from '../../src/core/db/time_machine.ts';

/** Generic playground section + a reserved scratch id (collides with nothing). */
const SOURCE_SECTION = 'test3';
const SOURCE_ID = 930501;
/** A real component of test3 — the audited component tipo. */
const COMPONENT = 'test52';
const LANG = 'lg-spa';
/** Three changes, oldest first: the history must come back reversed. */
const CHANGES = ['tm gate value one', 'tm gate value two', 'tm gate value three'];

/** The ids this file wrote, in write order. */
const writtenIds: number[] = [];

async function sweep(): Promise<void> {
	await sql.unsafe('DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2', [
		SOURCE_SECTION,
		SOURCE_ID,
	]);
}

beforeAll(async () => {
	await sweep(); // belt and braces for a crashed previous run
	let index = 0;
	for (const value of CHANGES) {
		// Distinct, increasing timestamps: the ordering contract is what the
		// history case measures, and same-second rows would not prove it.
		const stamp = dbTimestamp(new Date(Date.now() - (CHANGES.length - index) * 60_000));
		await recordTimeMachine(
			{
				sectionTipo: SOURCE_SECTION,
				sectionId: SOURCE_ID,
				componentTipo: COMPONENT,
				lang: LANG,
				userId: -1,
				data: [{ lang: LANG, value }],
			},
			stamp,
		);
		index++;
	}
	const rows = (await sql.unsafe(
		`SELECT id FROM matrix_time_machine
		  WHERE section_tipo = $1 AND section_id = $2 ORDER BY id ASC`,
		[SOURCE_SECTION, SOURCE_ID],
	)) as { id: number }[];
	writtenIds.push(...rows.map((row) => row.id));
	// Non-vacuity: every change this file made must be on the trail.
	expect(writtenIds.length).toBe(CHANGES.length);
});

afterAll(async () => {
	await sweep();
	const residue = (await sql.unsafe(
		'SELECT count(*)::int AS n FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
		[SOURCE_SECTION, SOURCE_ID],
	)) as { n: number }[];
	expect(residue[0]?.n).toBe(0);
});

describe('time machine read (real DB)', () => {
	test('reads a real TM row by primary key with the flat audit contract', async () => {
		const row = await readTimeMachineRow(writtenIds[0] as number);
		expect(row).not.toBeNull();
		// section_tipo is the SOURCE section — the dd15 mismatch contract.
		expect(row?.section_tipo).toBe(SOURCE_SECTION);
		expect(row?.section_tipo).not.toBe(TIME_MACHINE_SECTION_TIPO);
		expect(row?.tipo).toBe(COMPONENT);
		if (row?.dataText != null) {
			expect(JSON.parse(row.dataText)).toEqual(row.data);
		}
	});

	test('reads a component change history newest-first', async () => {
		const history = await readTimeMachineHistory(SOURCE_SECTION, SOURCE_ID, COMPONENT, 10);
		// Exactly the rows this file wrote — no more, no fewer.
		expect(history.length).toBe(CHANGES.length);
		// Newest first (search_tm default ordering). Compared as TIME VALUES: the
		// entries carry Date objects, and Array.sort's default comparator would
		// order them by their string form ("Thu Jul 09 …"), which is neither
		// chronological nor what the reader promises.
		const times = history.map((entry) => (entry.timestamp ? +new Date(entry.timestamp) : 0));
		expect(times).toEqual([...times].sort((a, b) => b - a));
		// …and the newest row carries the LAST change written.
		expect(JSON.stringify(history[0]?.data)).toContain(CHANGES[CHANGES.length - 1] as string);
	});

	test('standard matrix reader refuses matrix_time_machine (different contract)', async () => {
		await expect(readMatrixRecord('matrix_time_machine', 'dd15', 1)).rejects.toThrow(/allowlist/);
	});
});
