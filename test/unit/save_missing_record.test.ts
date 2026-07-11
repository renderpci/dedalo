/**
 * S1-02 Wave-2 gate: the materialize-and-relock branch of saveComponentData
 * (src/core/section/record/save_component.ts, lockRows.length === 0).
 *
 * PHP set_dato UPSERTS: saving component data into a section_id whose matrix
 * row does not exist yet CREATES the record instead of erroring. The TS twin
 * materializes via createSectionRecord({conflictTolerant: true}) and RE-LOCKS
 * the fresh row — the Wave-2 correction, because the original upsert branch
 * locked NOTHING when a concurrent save materialized the row first, reopening
 * the exact lost-update window the S1-02 tx-wrap closed.
 *
 * Covered here:
 *  1. A save into a missing (scratch test-TLD) section_id creates the record —
 *     exactly ONE row — with the create metadata, and persists the value.
 *  2. Two CONCURRENT saves into the SAME missing section_id: both succeed
 *     (conflict-tolerant create + re-lock), exactly ONE row exists, and BOTH
 *     values are present (atomic-append inserts) with distinct item ids.
 *
 * Scratch surfaces only: 'test2' (test TLD section whose ontology matrix_table
 * resolves to matrix_test — same fixture as save_roundtrip.test.ts) at high
 * reserved section_ids. The explicit-id create RAISES matrix_counter for
 * 'test2' (GREATEST) into the 917xxx scratch band, so the counter row is
 * snapshotted in beforeAll and restored in afterAll — safe because a lagging
 * counter self-heals (S2-01). Cleanup runs before AND after.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { saveComponentData } from '../../src/core/section/record/save_component.ts';
import { cleanScratchRecord } from '../helpers/test_data.ts';

const TEST_TABLE = 'matrix_test';
const TEST_SECTION_TIPO = 'test2';
/** numisdata16 = input_text → 'string' column (the save_roundtrip fixture). */
const COMPONENT_TIPO = 'numisdata16';
/** Reserved high ids — clear of genuine test records and other suites' scratch. */
const SINGLE_ID = 917201;
const RACE_ID = 917202;

/** matrix_counter value for 'test2' before this file ran (null = no row). */
let counterSnapshot: number | null = null;

function cleanRecord(sectionId: number): Promise<void> {
	return cleanScratchRecord(TEST_SECTION_TIPO, sectionId, TEST_TABLE);
}

async function readItems(sectionId: number): Promise<{ id: number; value: string }[]> {
	const rows = (await sql.unsafe(
		`SELECT string->$1 AS items FROM ${TEST_TABLE}
		 WHERE section_tipo = $2 AND section_id = $3`,
		[COMPONENT_TIPO, TEST_SECTION_TIPO, sectionId],
	)) as { items: { id: number; value: string }[] | null }[];
	return rows[0]?.items ?? [];
}

async function rowCount(sectionId: number): Promise<number> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM ${TEST_TABLE} WHERE section_tipo = $1 AND section_id = $2`,
		[TEST_SECTION_TIPO, sectionId],
	)) as unknown[];
	return rows.length;
}

beforeAll(async () => {
	const counterRows = (await sql.unsafe('SELECT value FROM matrix_counter WHERE tipo = $1', [
		TEST_SECTION_TIPO,
	])) as { value: number | string }[];
	counterSnapshot = counterRows.length === 0 ? null : Number(counterRows[0]?.value);
	await cleanRecord(SINGLE_ID);
	await cleanRecord(RACE_ID);
});

afterAll(async () => {
	await cleanRecord(SINGLE_ID);
	await cleanRecord(RACE_ID);
	// Restore the per-tipo counter the explicit-id create raised (see header) —
	// leaving it at 917xxx would push later counter-driven test2 creates into
	// the band other suites reserve for EXPLICIT scratch ids.
	if (counterSnapshot === null) {
		await sql.unsafe('DELETE FROM matrix_counter WHERE tipo = $1', [TEST_SECTION_TIPO]);
	} else {
		await sql.unsafe('UPDATE matrix_counter SET value = $2 WHERE tipo = $1', [
			TEST_SECTION_TIPO,
			counterSnapshot,
		]);
	}
});

describe('S1-02 Wave-2 — save into a non-existent record materializes and re-locks', () => {
	test('save creates the missing record (exactly ONE row) and persists the value', async () => {
		expect(await rowCount(SINGLE_ID)).toBe(0); // truly missing pre-save

		const outcome = await saveComponentData({
			componentTipo: COMPONENT_TIPO,
			sectionTipo: TEST_SECTION_TIPO,
			sectionId: SINGLE_ID,
			lang: 'lg-spa',
			// The client's ordinary first-value save: an id-less 'update' appends;
			// the set_data safety net stamps a fresh counter id before the write.
			changedData: [
				{ action: 'update', id: null, value: { lang: 'lg-spa', value: 'materialized-on-save' } },
			],
			userId: -1,
		});
		expect(outcome.ok).toBe(true);

		// Exactly ONE row was created.
		expect(await rowCount(SINGLE_ID)).toBe(1);

		// The value landed, id-stamped and lang-stamped.
		const items = await readItems(SINGLE_ID);
		expect(items.length).toBe(1);
		expect(items[0]?.value).toBe('materialized-on-save');
		expect(Number(items[0]?.id)).toBeGreaterThan(0);

		// The row is a REAL created record (createSectionRecord ran): the data
		// column carries the fresh-record metadata with the saving user.
		const metadata = (await sql.unsafe(
			`SELECT data->>'created_by_user_id' AS created_by FROM ${TEST_TABLE}
			 WHERE section_tipo = $1 AND section_id = $2`,
			[TEST_SECTION_TIPO, SINGLE_ID],
		)) as { created_by: string | null }[];
		expect(Number(metadata[0]?.created_by)).toBe(-1);
	}, 30000);

	test('two CONCURRENT saves into the SAME missing section_id: both succeed, ONE row, both values', async () => {
		expect(await rowCount(RACE_ID)).toBe(0); // truly missing pre-race

		const saveValue = (value: string) =>
			saveComponentData({
				componentTipo: COMPONENT_TIPO,
				sectionTipo: TEST_SECTION_TIPO,
				sectionId: RACE_ID,
				lang: 'lg-spa',
				changedData: [{ action: 'insert', value: { lang: 'lg-spa', value } }],
				userId: -1,
			});

		// Both saves find no row; both try to materialize it. The loser's create
		// is conflict-tolerated and its re-lock queues behind the winner's COMMIT
		// — no throw, no second row, no lost item.
		const [first, second] = await Promise.all([saveValue('race-first'), saveValue('race-second')]);
		expect(first.ok).toBe(true);
		expect(second.ok).toBe(true);

		// Exactly ONE row exists.
		expect(await rowCount(RACE_ID)).toBe(1);

		// BOTH values are present (atomic-append inserts) with distinct ids.
		const items = await readItems(RACE_ID);
		const values = items.map((item) => item.value);
		expect(values).toContain('race-first');
		expect(values).toContain('race-second');
		expect(items.length).toBe(2);
		expect(new Set(items.map((item) => Number(item.id))).size).toBe(2);
	}, 30000);
});
