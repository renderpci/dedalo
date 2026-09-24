/**
 * THE CLIENT RUN SWEEPS WHAT IT CREATED — behavioural gate for
 * src/core/test_data/run_created_records.ts (the client runner's post-run
 * sweep, scripts/client_test_runner.ts).
 *
 * A browser suite creates test3 records through the engine and deletes them
 * again; the delete keeps its time-machine snapshot and the create/delete
 * activity by design, and the reseed keeps TM history — so each run grew the
 * suite database. Measured here on OUTCOMES, on the suite database:
 *
 *  A. a record created AFTER the run's mark and deleted through the engine
 *     leaves TM + activity rows (non-vacuous), and the sweep removes every one
 *     of them — and a record the run did not delete, too;
 *  B. a record created BEFORE the mark — the mark's own id, the boundary —
 *     keeps all its rows (the sweep reaches only what the run created);
 *  C. the doors refuse without the marker are covered by
 *     test_db_marker_tripwire (both call assertTestDatabase first);
 *  D. the rule is "above the mark", WHOEVER wrote the row: a raw row planted
 *     at an explicit id above the counter (what the export gates' fixtures
 *     do) is swept as well — one test run per suite database (see the
 *     module header), not provenance, is what makes that "this run's".
 *  E. the ARMED sweeper the runner uses: its mark is the counter at arming,
 *     a body that THROWS mid-run still has every trace swept by the
 *     try/finally around it, and a second sweep (finally AND signal) deletes
 *     nothing.
 *
 * The situation is built here (generic test TLD) and swept in afterAll.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { sql } from '../../src/core/db/postgres.ts';
import { createSectionRecord } from '../../src/core/section/record/create_record.ts';
import { deleteSectionRecord } from '../../src/core/section/record/delete_record.ts';
import {
	armRunCreatedSweep,
	runCounterMark,
	sweepRecordsCreatedSince,
} from '../../src/core/test_data/run_created_records.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const SECTION = 'test3';
const TABLE = 'matrix_test';
const ROOT_USER = -1;

/** Every row the engine holds about one test3 record. */
async function traces(
	sectionId: number,
): Promise<{ record: number; tm: number; activity: number }> {
	const [row] = (await sql.unsafe(
		`SELECT
		   (SELECT count(*) FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2) AS record,
		   (SELECT count(*) FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2) AS tm,
		   (SELECT count(*) FROM matrix_activity WHERE section_tipo = 'dd542'
		      AND misc->'dd551'->0->'value'->>'section_tipo' = $1
		      AND misc->'dd551'->0->'value'->>'section_id' = $2::text) AS activity`,
		[SECTION, sectionId],
	)) as { record: number | string; tm: number | string; activity: number | string }[];
	return { record: Number(row?.record), tm: Number(row?.tm), activity: Number(row?.activity) };
}

let before = 0;
/**
 * Every mark a leg took. A leg that fails between creating records and its own
 * sweep would otherwise leave them — and their TM + activity rows, which the
 * next process's test3 reseed deliberately keeps — on the suite database for
 * good: the pollution this module exists to stop. afterAll sweeps above the
 * LOWEST mark (all the rows above it are this file's: one run per suite DB).
 */
const marks: number[] = [];

afterAll(async () => {
	if (marks.length > 0) {
		await sweepRecordsCreatedSince(Math.min(...marks), SECTION, TABLE);
	}
	if (before > 0) {
		await deleteSectionRecord(SECTION, before, ROOT_USER);
		await sql.unsafe(
			'DELETE FROM matrix_time_machine WHERE section_tipo = $1 AND section_id = $2',
			[SECTION, before],
		);
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE section_tipo = 'dd542'
			   AND misc->'dd551'->0->'value'->>'section_tipo' = $1
			   AND misc->'dd551'->0->'value'->>'section_id' = $2::text`,
			[SECTION, before],
		);
		expect(await traces(before)).toEqual({ record: 0, tm: 0, activity: 0 });
	}
});

describe('the client run sweeps the records it created — and only those', () => {
	test('created after the mark: every trace swept; created before: untouched', async () => {
		await assertTestDatabase('run_created_records_native');
		// B's record: exists BEFORE the run's mark — live, AT the mark (the
		// boundary: `> mark`, never `>= mark`).
		before = await createSectionRecord(SECTION, ROOT_USER);
		const beforeTraces = await traces(before);
		expect(beforeTraces.record).toBe(1);

		const mark = await runCounterMark(SECTION);
		marks.push(mark);
		expect(mark).toBe(before);

		// A: what a suite does — create, then delete through the engine; plus one
		// record the "suite" forgot to delete.
		const deleted = await createSectionRecord(SECTION, ROOT_USER);
		await deleteSectionRecord(SECTION, deleted, ROOT_USER);
		const forgotten = await createSectionRecord(SECTION, ROOT_USER);
		expect(deleted).toBeGreaterThan(mark);
		expect(forgotten).toBeGreaterThan(mark);
		const left = await traces(deleted);
		// non-vacuous: the engine's delete really leaves history behind
		expect(left.record).toBe(0);
		expect(left.tm).toBeGreaterThan(0);
		expect(left.activity).toBeGreaterThan(0);

		const swept = await sweepRecordsCreatedSince(mark, SECTION, TABLE);
		expect(swept.records).toBeGreaterThanOrEqual(1);
		expect(swept.timeMachine).toBeGreaterThanOrEqual(left.tm);
		expect(await traces(deleted)).toEqual({ record: 0, tm: 0, activity: 0 });
		expect(await traces(forgotten)).toEqual({ record: 0, tm: 0, activity: 0 });
		// the record from before the mark keeps every row
		expect(await traces(before)).toEqual(beforeTraces);
	});
});

describe('D. the pinned semantics: above the mark, whoever wrote it', () => {
	test('a raw row planted above the counter WITHOUT raising it is swept too', async () => {
		await assertTestDatabase('run_created_records_native');
		const mark = await runCounterMark(SECTION);
		marks.push(mark);
		// an explicit id far above the counter, the counter left where it is
		const planted = mark + 50_000;
		try {
			await sql.unsafe(`INSERT INTO ${TABLE} (section_tipo, section_id) VALUES ($1, $2)`, [
				SECTION,
				planted,
			]);
			expect(await runCounterMark(SECTION)).toBe(mark);
			expect((await traces(planted)).record).toBe(1);
			const swept = await sweepRecordsCreatedSince(mark, SECTION, TABLE);
			expect(swept.records).toBeGreaterThanOrEqual(1);
			expect((await traces(planted)).record).toBe(0);
		} finally {
			await sql.unsafe(`DELETE FROM ${TABLE} WHERE section_tipo = $1 AND section_id = $2`, [
				SECTION,
				planted,
			]);
		}
	});
});

describe('E. the armed sweeper: a throwing run is swept, and only once', () => {
	test('arm, create + delete, throw: the finally sweep leaves no trace; the second sweep is a no-op', async () => {
		await assertTestDatabase('run_created_records_native');
		const sweeper = await armRunCreatedSweep(SECTION, TABLE);
		marks.push(sweeper.mark);
		expect(sweeper.mark).toBe(await runCounterMark(SECTION));
		let created: number[] = [];
		let caught: unknown = null;
		try {
			try {
				const deleted = await createSectionRecord(SECTION, ROOT_USER);
				await deleteSectionRecord(SECTION, deleted, ROOT_USER);
				const forgotten = await createSectionRecord(SECTION, ROOT_USER);
				created = [deleted, forgotten];
				// non-vacuous: there IS history to sweep when the run dies
				expect((await traces(deleted)).tm).toBeGreaterThan(0);
				throw new Error('suite died mid-run');
			} finally {
				const swept = await sweeper.sweep();
				expect(swept).not.toBeNull();
				expect(swept!.records).toBeGreaterThanOrEqual(1);
			}
		} catch (error) {
			caught = error;
		}
		expect((caught as Error).message).toBe('suite died mid-run');
		for (const id of created) {
			expect(id).toBeGreaterThan(sweeper.mark);
			expect(await traces(id)).toEqual({ record: 0, tm: 0, activity: 0 });
		}
		// once-only: a later record above the same mark is NOT the armed run's to sweep
		const later = await createSectionRecord(SECTION, ROOT_USER);
		expect(await sweeper.sweep()).toBeNull();
		expect((await traces(later)).record).toBe(1);
		// (afterAll sweeps it above the recorded mark)
	});
});
