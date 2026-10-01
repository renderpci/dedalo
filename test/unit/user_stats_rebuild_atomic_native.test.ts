/**
 * A USER'S STATS REBUILD APPLIES WHOLE OR NOT AT ALL (OPS-6/PERF-11 review follow-up).
 *
 * THE DEFECT. `database_info.rebuild_user_stats` DELETED the user's dd1521
 * aggregates as one autocommit statement, then recomputed them from
 * matrix_activity and saved one dd1521 record per day, each its own autocommit
 * pair (create + update). Any failure after the DELETE — a save that threw, a
 * statement cut by a lock bound or a shutdown, a crash — left the user's
 * statistics deleted, or half rebuilt, with no way back (the activity log may be
 * shorter than the stats history, which is why the rebuild is lossy by design
 * even when it succeeds). And a day whose record could not be created was
 * skipped SILENTLY (`if (saved === false) continue`).
 *
 * THE LAW (measured here, through the real widget door, on a synthetic user):
 *  (a) a save that fails mid-rebuild (a BEFORE UPDATE trigger on matrix_stats
 *      refusing the SECOND day's record — the first was already written) fails
 *      the action, typed `maintenance.action_failed` naming the user, and the
 *      user's previous aggregates are exactly as they were: same records, same
 *      totals, no half-written day;
 *  (b) positive control: with the trigger gone the same rebuild replaces them,
 *      and the new totals carry the activity added since.
 *
 * SURFACES. Lane SUITE database (assertTestDatabase first). Synthetic dd128 user
 * 424272 (distinct from 424242/424252/424262/424263): its matrix_activity rows,
 * its dd1521 matrix_stats rows and their Time Machine tail, swept before and
 * after; the trigger + its function `zz_stats_rebuild_fail_<pid>`, dropped in
 * afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { databaseInfoRebuildUserStats } from '../../src/core/area_maintenance/widgets/database_info.ts';
import { sql } from '../../src/core/db/postgres.ts';
import { DedaloError } from '../../src/core/errors/index.ts';
import type { Principal } from '../../src/core/security/permissions.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';

const UID = 424272;
const ADMIN: Principal = { userId: -1, isGlobalAdmin: true, isDeveloper: true } as Principal;
const DAY_A = '2019-04-04';
const DAY_B = '2019-04-05';
const TRIGGER = `zz_stats_rebuild_fail_${process.pid}`;
const USER_FILTER = JSON.stringify({ dd1522: [{ section_tipo: 'dd128', section_id: UID }] });
const USER_FILTER_LEGACY = JSON.stringify({
	dd1522: [{ section_tipo: 'dd128', section_id: String(UID) }],
});
const ACTIVITY_FILTER = JSON.stringify({
	dd543: [{ section_tipo: 'dd128', section_id: String(UID) }],
});
const ACTIVITY_FILTER_INT = JSON.stringify({ dd543: [{ section_tipo: 'dd128', section_id: UID }] });

async function insertActivity(day: string, time: string, code: string, where: string) {
	await sql.unsafe(
		`INSERT INTO matrix_activity (section_tipo, relation, string, date, misc, timestamp)
		 VALUES ('dd542', $1::text::jsonb, $2::text::jsonb, $3::text::jsonb, '{}'::jsonb, $4)`,
		[
			JSON.stringify({
				dd543: [
					{
						id: 1,
						type: 'dd151',
						section_id: String(UID),
						section_tipo: 'dd128',
						from_component_tipo: 'dd543',
					},
				],
				dd545: [
					{
						id: 1,
						type: 'dd151',
						section_id: code,
						section_tipo: 'dd552',
						from_component_tipo: 'dd545',
					},
				],
			}),
			JSON.stringify({ dd546: [{ id: 1, lang: 'lg-nolan', value: where }] }),
			JSON.stringify({ dd547: [{ id: 1, start: { hour: Number(time.slice(0, 2)) } }] }),
			`${day} ${time}`,
		],
	);
}

/** The user's dd1521 aggregates: section_id, day, totals — the whole observable state. */
async function statsState(): Promise<{ section_id: number; day: string; totals: unknown }[]> {
	return (await sql.unsafe(
		`SELECT section_id,
		        concat_ws('-', date->'dd1530'->0->'start'->>'year', date->'dd1530'->0->'start'->>'month',
		                  date->'dd1530'->0->'start'->>'day') AS day,
		        misc->'dd1523'->0->'value' AS totals
		   FROM matrix_stats
		  WHERE section_tipo = 'dd1521'
		    AND (relation @> $1::text::jsonb OR relation @> $2::text::jsonb)
		  ORDER BY section_id`,
		[USER_FILTER, USER_FILTER_LEGACY],
	)) as { section_id: number; day: string; totals: unknown }[];
}

async function sweep(): Promise<void> {
	const stale = (await sql.unsafe(
		`DELETE FROM matrix_stats WHERE section_tipo = 'dd1521'
		   AND (relation @> $1::text::jsonb OR relation @> $2::text::jsonb) RETURNING section_id`,
		[USER_FILTER, USER_FILTER_LEGACY],
	)) as { section_id: number }[];
	for (const row of stale) {
		await sql.unsafe(
			`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd1521' AND section_id = $1`,
			[row.section_id],
		);
	}
	await sql.unsafe(
		`DELETE FROM matrix_activity WHERE section_tipo = 'dd542'
		   AND (relation @> $1::text::jsonb OR relation @> $2::text::jsonb)`,
		[ACTIVITY_FILTER, ACTIVITY_FILTER_INT],
	);
}

async function dropTrigger(): Promise<void> {
	await sql.unsafe(`DROP TRIGGER IF EXISTS ${TRIGGER} ON matrix_stats`, []);
	await sql.unsafe(`DROP FUNCTION IF EXISTS ${TRIGGER}()`, []);
}

beforeAll(async () => {
	await assertTestDatabase('user_stats_rebuild_atomic_native');
	await dropTrigger();
	await sweep();
	await insertActivity(DAY_A, '09:00:00', '1', 'dd542'); // login
	await insertActivity(DAY_A, '10:00:00', '5', 'test6099'); // save
	await insertActivity(DAY_B, '11:00:00', '7', 'test6099'); // list
	// The PREVIOUS aggregates the failed rebuild must not destroy.
	await databaseInfoRebuildUserStats({ users: [UID] }, ADMIN);
}, 60000);

afterAll(async () => {
	await dropTrigger();
	await sweep();
});

describe('database_info.rebuild_user_stats: one user = one atomic unit', () => {
	test('(a) a save failing on the SECOND day fails the action, typed, and leaves the previous aggregates exactly as they were', async () => {
		const before = await statsState();
		expect(before.map((row) => row.day)).toEqual(['2019-4-4', '2019-4-5']);
		// New activity since: a rebuild that landed would change day A's totals.
		await insertActivity(DAY_A, '12:00:00', '6', 'test6100'); // edit
		await sql.unsafe(
			`CREATE FUNCTION ${TRIGGER}() RETURNS trigger LANGUAGE plpgsql AS $$
			 BEGIN
			   IF NEW.section_tipo = 'dd1521'
			      AND NEW.relation @> '${USER_FILTER}'::jsonb
			      AND (NEW.date->'dd1530'->0->'start'->>'day')::int = 5 THEN
			     RAISE EXCEPTION 'zz rebuild failure stand-in';
			   END IF;
			   RETURN NEW;
			 END $$`,
			[],
		);
		await sql.unsafe(
			`CREATE TRIGGER ${TRIGGER} BEFORE UPDATE ON matrix_stats FOR EACH ROW EXECUTE FUNCTION ${TRIGGER}()`,
			[],
		);
		let caught: unknown = null;
		try {
			await databaseInfoRebuildUserStats({ users: [UID] }, ADMIN);
		} catch (error) {
			caught = error;
		} finally {
			await dropTrigger();
		}
		expect(caught).toBeInstanceOf(DedaloError);
		expect((caught as DedaloError).code).toBe('maintenance.action_failed');
		expect(String((caught as DedaloError).publicMessage)).toContain(String(UID));
		expect(await statsState()).toEqual(before);
	}, 60000);

	test('(b) positive control: unblocked, the same rebuild replaces the aggregates with the current activity', async () => {
		const before = await statsState();
		const response = await databaseInfoRebuildUserStats({ users: [UID] }, ADMIN);
		expect(response.data).toBe(true);
		const after = await statsState();
		expect(after.map((row) => row.day)).toEqual(['2019-4-4', '2019-4-5']);
		// New records (the old ones were replaced), and day A now counts the edit.
		expect(after.map((row) => row.section_id)).not.toEqual(before.map((row) => row.section_id));
		expect(JSON.stringify(after[0]?.totals)).toContain('dd694');
		expect(JSON.stringify(before[0]?.totals)).not.toContain('dd694');
	}, 60000);
});
