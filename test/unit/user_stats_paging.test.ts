/**
 * user_stats aggregateActivity — the PAGING invariant.
 *
 * WHY THIS GATE EXISTS (2026-07-30). `rebuild_user_stats` used to select every
 * matrix_activity row of one actor and fold it in TypeScript; on the 8.1M-row
 * mdcat actor that statement died on `DB_STATEMENT_TIMEOUT_MS`. It is now a
 * SQL-side aggregation walked in `(timestamp, id)` keyset pages, and the whole
 * bug class the rewrite could introduce lives in the page seam: a row counted
 * twice, a row skipped, or a dimension key landing at the wrong position in the
 * totals array because its first-encounter `min(id)` was lost.
 *
 * THE INVARIANT: the page size is a performance knob and NOTHING else. The
 * tallies for a window must be byte-identical at every page size — including
 * page sizes that split a single day, and page sizes of 1.
 *
 * widget_request_native.test.ts owns the aggregate's CONTENT (the WHAT_MAP /
 * WHERE_SKIP / dd1223→publish routing and the exact totals order). This gate
 * owns only the paging, and provisions the exotic jsonb shapes that the content
 * gate's tidy rows do not carry: an ARRAY-valued dd546, a boolean `top_tipo`,
 * an hour as a JSON string, an unmapped action code, and two rows sharing one
 * timestamp across a page boundary.
 *
 * Scratch hygiene: synthetic dd128 user 424262 (distinct from 424242 / 424252),
 * matrix_activity rows only, swept fail-loud in afterAll.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	aggregateActivity,
	deleteUserActivityStats,
	updateUserActivityStats,
} from '../../src/core/area_maintenance/user_stats.ts';
import { sql } from '../../src/core/db/postgres.ts';

/** Synthetic actor — never a real user. */
const UID = 424262;
/** A second synthetic actor that deliberately has NO activity at all. */
const SILENT_UID = 424263;
// int-canonical actor locator (WC-2026-08-10-section-id-int-canonical): the
// writer mints int now; the string twin covers pre-sweep rows.
const USER_FILTER = JSON.stringify({
	dd1522: [{ section_tipo: 'dd128', section_id: UID }],
});
const USER_FILTER_LEGACY = JSON.stringify({
	dd1522: [{ section_tipo: 'dd128', section_id: String(UID) }],
});
/**
 * The one directly-inserted dd1521 row (the "already updated" case). Reserved
 * scratch band 933000-933999; the afterAll sweep catches it through
 * USER_FILTER like every other row of this actor.
 */
const YESTERDAY_SECTION_ID = 933010;
const DAY_A = '2019-03-04';
const DAY_B = '2019-03-05';
const FROM = '2019-03-01';
const UNTIL = '2019-03-10';

const activityIds: number[] = [];

/**
 * One synthetic activity row. `whereValue` and `hour` are passed as RAW jsonb so
 * a test can provision the shapes the production log actually contains (an
 * array-wrapped value, a stringified hour) and not only the tidy ones.
 */
async function insertActivity(options: {
	day: string;
	time: string;
	/** dd545 locator section_id — the action code (unmapped codes must be dropped). */
	code: string;
	/** dd546 value, as jsonb source text. */
	whereValue: string;
	/** dd547 start.hour, as jsonb source text. */
	hour: string;
	/** dd551 message object, as jsonb source text; null omits misc entirely. */
	message?: string | null;
}): Promise<void> {
	const rows = (await sql.unsafe(
		`INSERT INTO matrix_activity (section_tipo, relation, string, date, misc, timestamp)
		 VALUES ('dd542', $1::text::jsonb, $2::text::jsonb, $3::text::jsonb, $4::text::jsonb, $5)
		 RETURNING id`,
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
						section_id: options.code,
						section_tipo: 'dd552',
						from_component_tipo: 'dd545',
					},
				],
			}),
			`{"dd546":[{"id":1,"lang":"lg-nolan","value":${options.whereValue}}]}`,
			`{"dd547":[{"id":1,"start":{"hour":${options.hour}}}]}`,
			options.message === null || options.message === undefined
				? '{}'
				: `{"dd551":[{"id":1,"lang":"lg-nolan","value":${options.message}}]}`,
			`${options.day} ${options.time}`,
		],
	)) as { id: number }[];
	activityIds.push(Number(rows[0]?.id));
}

describe('aggregateActivity paging (the page size is a knob, not a semantic)', () => {
	beforeAll(async () => {
		await sql.unsafe(
			`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND relation @> $1::text::jsonb`,
			[JSON.stringify({ dd543: [{ section_tipo: 'dd128', section_id: String(UID) }] })],
		);

		// day A — plain rows, one key repeated so counts must SUM across pages
		await insertActivity({
			day: DAY_A,
			time: '09:00:00',
			code: '1',
			whereValue: '"dd542"',
			hour: '9',
		});
		await insertActivity({
			day: DAY_A,
			time: '09:30:00',
			code: '5',
			whereValue: '"zztest1"',
			hour: '9',
		});
		await insertActivity({
			day: DAY_A,
			time: '10:00:00',
			code: '5',
			whereValue: '"zztest1"',
			hour: '10',
		});
		// an ARRAY-valued dd546 (the unwrap rule) + an hour that is a JSON STRING
		await insertActivity({
			day: DAY_A,
			time: '10:30:00',
			code: '6',
			whereValue: '["zztest2","ignored"]',
			hour: '"10"',
		});
		// dd1223 → publish, top_tipo wins
		await insertActivity({
			day: DAY_A,
			time: '11:00:00',
			code: '5',
			whereValue: '"dd1223"',
			hour: '11',
			message: '{"top_tipo":"zzpub1","section_tipo":"zzpub2"}',
		});
		// dd1223 → publish, top_tipo present but NULL: falls through to section_tipo
		await insertActivity({
			day: DAY_A,
			time: '11:10:00',
			code: '5',
			whereValue: '"dd1223"',
			hour: '11',
			message: '{"top_tipo":null,"section_tipo":"zzpub2"}',
		});
		// dd1223 → publish, top_tipo === false: contributes NOTHING (PHP writes false)
		await insertActivity({
			day: DAY_A,
			time: '11:20:00',
			code: '5',
			whereValue: '"dd1223"',
			hour: '11',
			message: '{"top_tipo":false,"section_tipo":"zzpub2"}',
		});
		// TWO rows on the SAME timestamp, straddling a page boundary at size 8/9
		await insertActivity({
			day: DAY_A,
			time: '12:00:00',
			code: '7',
			whereValue: '"zztest3"',
			hour: '12',
		});
		await insertActivity({
			day: DAY_A,
			time: '12:00:00',
			code: '7',
			whereValue: '"zztest3"',
			hour: '12',
		});

		// day B — an UNMAPPED action code (99) and a SKIPPED where (dd271)
		await insertActivity({
			day: DAY_B,
			time: '08:00:00',
			code: '99',
			whereValue: '"dd271"',
			hour: '8',
		});
		await insertActivity({
			day: DAY_B,
			time: '08:05:00',
			code: '8',
			whereValue: '"zztest1"',
			hour: '8',
		});
	});

	afterAll(async () => {
		const leaked: string[] = [];
		// dd1521 aggregates the save-path test produced, plus their TM audit rows
		const statsIds = (await sql.unsafe(
			`SELECT section_id FROM matrix_stats WHERE section_tipo = 'dd1521' AND (relation @> $1::text::jsonb OR relation @> $2::text::jsonb)`,
			[USER_FILTER, USER_FILTER_LEGACY],
		)) as { section_id: number }[];
		await sql.unsafe(
			`DELETE FROM matrix_stats WHERE section_tipo = 'dd1521' AND (relation @> $1::text::jsonb OR relation @> $2::text::jsonb)`,
			[USER_FILTER, USER_FILTER_LEGACY],
		);
		for (const row of statsIds) {
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd1521' AND section_id = $1`,
				[row.section_id],
			);
		}
		for (const id of activityIds) {
			const deleted = (await sql.unsafe(
				`DELETE FROM matrix_activity WHERE section_tipo = 'dd542' AND id = $1 RETURNING id`,
				[id],
			)) as unknown[];
			if (deleted.length === 0) leaked.push(`matrix_activity id ${id}`);
		}
		if (leaked.length > 0) throw new Error(`cleanup leaked tracked rows: ${leaked.join(', ')}`);
	});

	test('every page size yields byte-identical tallies and the same row count', async () => {
		const reference = await aggregateActivity(UID, FROM, UNTIL, 1000);
		expect(reference.rows).toBe(activityIds.length);
		expect(reference.tallies.length).toBeGreaterThan(0);

		// ANTI-VACUITY. Everything below asserts that paging changes NOTHING, which
		// is exactly what a silently-ignored page size would also produce. So first
		// prove the knob is really wired: at size 1 each row is its own page, so a
		// key seen on several rows MUST arrive as several tally rows, where the
		// single-page reference emits one per group.
		const split = await aggregateActivity(UID, FROM, UNTIL, 1);
		const groups = new Set(split.tallies.map((t) => `${t.day}|${t.kind}|${t.key}`));
		expect(split.tallies.length).toBeGreaterThan(groups.size);
		expect(reference.tallies.length).toBe(
			new Set(reference.tallies.map((t) => `${t.day}|${t.kind}|${t.key}`)).size,
		);

		// 1 forces a page per row (every seam exercised); 8 and 9 split the
		// same-timestamp pair; 11 is exactly the row count (the boundary where a
		// full page is also the last).
		for (const pageRows of [1, 2, 3, 5, 8, 9, 11, 12]) {
			const paged = await aggregateActivity(UID, FROM, UNTIL, pageRows);
			expect(paged.rows).toBe(reference.rows);
			// Tally identity INCLUDING minId: the order carrier must survive paging.
			expect(normalize(paged.tallies)).toEqual(normalize(reference.tallies));
		}
	}, 60000);

	test('the exotic jsonb shapes route to the dimension the row loop chose', async () => {
		const { tallies } = await aggregateActivity(UID, FROM, UNTIL, 3);
		// (!) A page-split key legitimately arrives as SEVERAL tally rows — summing
		// them is foldTallies' job, so the assertion helper has to do it too.
		const at = (day: string, kind: string, key: string): number | undefined => {
			const hits = tallies.filter((t) => t.day === day && t.kind === kind && t.key === key);
			return hits.length === 0 ? undefined : hits.reduce((sum, t) => sum + t.n, 0);
		};

		// array-valued dd546 unwraps to element 0, and only element 0
		expect(at(DAY_A, 'where', 'zztest2')).toBe(1);
		expect(at(DAY_A, 'where', 'ignored')).toBeUndefined();
		// hour as a JSON string keys the same bucket as the numeric 10
		expect(at(DAY_A, 'when', '10')).toBe(2);
		// dd1223 rows never land in `where`
		expect(at(DAY_A, 'where', 'dd1223')).toBeUndefined();
		// top_tipo wins; null falls through to section_tipo; false contributes nothing
		expect(at(DAY_A, 'publish', 'zzpub1')).toBe(1);
		expect(at(DAY_A, 'publish', 'zzpub2')).toBe(1);
		// the unmapped code is emitted RAW (WHAT_MAP drops it TS-side, not here)
		expect(at(DAY_B, 'what', '99')).toBe(1);
		// WHERE_SKIP is likewise a TS-side rule — the tally is present, unfiltered
		expect(at(DAY_B, 'where', 'dd271')).toBe(1);
		// repeated keys sum
		expect(at(DAY_A, 'where', 'zztest1')).toBe(2);
		expect(at(DAY_A, 'where', 'zztest3')).toBe(2);
	}, 60000);

	test('minId is the FIRST occurrence, so totals order survives any paging', async () => {
		const wide = await aggregateActivity(UID, FROM, UNTIL, 1000);
		const narrow = await aggregateActivity(UID, FROM, UNTIL, 1);
		// The emitted totals order: keys merged to their EARLIEST minId (what
		// foldTallies' Map insertion does), then read out in that order.
		const seq = (rows: typeof wide.tallies): string => {
			const earliest = new Map<string, number>();
			for (const row of rows) {
				if (row.day !== DAY_A || row.kind !== 'where') continue;
				const seen = earliest.get(row.key);
				if (seen === undefined || row.minId < seen) earliest.set(row.key, row.minId);
			}
			return [...earliest.entries()]
				.sort((a, b) => a[1] - b[1])
				.map(([key]) => key)
				.join(',');
		};
		// dd542 (id lowest) ... then zztest1, zztest2, zztest3 in insertion order
		expect(seq(wide.tallies)).toBe('dd542,zztest1,zztest2,zztest3');
		expect(seq(narrow.tallies)).toBe(seq(wide.tallies));
	}, 60000);
	// ---- the SAVED artifact, not just the tallies -------------------------
	// aggregateActivity's tallies are an intermediate; what the wire contract
	// pins is the dd1523 totals ARRAY on the saved dd1521 record. Driving the
	// page size through updateUserActivityStats is the only way to produce that
	// array from more than one page.

	/** The wire artifact itself: dd1523 totals, in emission order, per day. */
	const savedTotals = async (): Promise<string> => {
		const rows = (await sql.unsafe(
			`SELECT misc->'dd1523' AS totals
			 FROM matrix_stats
			 WHERE section_tipo = 'dd1521'
			   AND (relation @> $1::text::jsonb OR relation @> $2::text::jsonb)
			 ORDER BY ("date"->'dd1530'->0->'start'->>'year')::int,
			          ("date"->'dd1530'->0->'start'->>'month')::int,
			          ("date"->'dd1530'->0->'start'->>'day')::int, id`,
			[USER_FILTER, USER_FILTER_LEGACY],
		)) as { totals: unknown }[];
		return JSON.stringify(rows.map((row) => row.totals));
	};

	/** Rebuild from scratch at one page size, then read back what was SAVED. */
	const rebuildAt = async (pageRows: number): Promise<string> => {
		await deleteUserActivityStats(UID);
		const response = await updateUserActivityStats(UID, 0, pageRows);
		expect(response.errors).toEqual([]);
		return savedTotals();
	};

	test('the saved dd1523 totals are byte-identical at any page size', async () => {
		// The default page swallows the whole fixture in ONE statement — that is
		// the shape widget_request_native pins, so it is the reference.
		const reference = await rebuildAt(100000);
		expect(reference).not.toBe('[]');
		// 1 puts every row in its own page; 2 splits the same-timestamp pair AND
		// splits day A — the seams that could reorder or double-count.
		expect(await rebuildAt(1)).toBe(reference);
		expect(await rebuildAt(2)).toBe(reference);
	}, 60000);

	// ---- the "already updated" early return (plan §4.2.3) -----------------
	// updateUserActivityStats:373-375 short-circuits when the newest saved stats
	// day is yesterday or later. Uncovered until 2026-08-10 — every other case
	// in this file rebuilds from an EMPTY history, where lastAggregated is null
	// and the guard is unreachable. Without it every panel load re-runs the
	// whole aggregation.

	/** dd1521 rows of THE SCRATCH ACTOR only — never a table-global count. */
	const scratchStatsCount = async (): Promise<number> => {
		const rows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_stats
			 WHERE section_tipo = 'dd1521'
			   AND (relation @> $1::text::jsonb OR relation @> $2::text::jsonb)`,
			[USER_FILTER, USER_FILTER_LEGACY],
		)) as { n: number }[];
		return rows[0]?.n ?? 0;
	};

	test('a saved day of YESTERDAY short-circuits the whole aggregation', async () => {
		// POSITIVE CONTROL: a rebuild from empty really does write rows, so the
		// "count did not move" assertion below is a floor and not a tautology.
		await deleteUserActivityStats(UID);
		const rebuilt = await updateUserActivityStats(UID);
		expect(rebuilt.errors).toEqual([]);
		expect((rebuilt.value as { date: string }[]).map((day) => day.date)).toEqual([DAY_A, DAY_B]);
		expect(await scratchStatsCount()).toBe(2);

		// CONTRAST: the guard is DATE-conditional, not "any second call". The
		// saved history is 2019, so calling again must NOT short-circuit — it
		// re-scans [2019-03-06, today) and finds nothing.
		const stale = await updateUserActivityStats(UID);
		expect(stale.msg).toBe('No activity records found');
		expect(stale.value).toEqual([]);

		// Now make the newest saved day YESTERDAY. Same local-Date arithmetic the
		// function uses, so the two cannot drift across a DST/timezone edge.
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);
		// Direct SQL: saveUserActivity would stamp today's aggregate, and the row
		// only has to be the newest by id (which is what the guard's probe reads).
		await sql.unsafe(
			`INSERT INTO matrix_stats (section_id, section_tipo, relation, date, misc)
			 VALUES ($1, 'dd1521', $2::text::jsonb, $3::text::jsonb, '{"dd1523":[]}'::jsonb)`,
			[
				YESTERDAY_SECTION_ID,
				USER_FILTER,
				JSON.stringify({
					dd1530: [
						{
							start: {
								year: yesterday.getFullYear(),
								month: yesterday.getMonth() + 1,
								day: yesterday.getDate(),
							},
						},
					],
				}),
			],
		);

		const before = await scratchStatsCount();
		expect(before).toBe(3);
		const response = await updateUserActivityStats(UID);
		// The exact early-return wire shape: result is the NUMBER 0, not [].
		expect(response.value).toBe(0);
		expect(response.msg).toBe('Stats are already updated');
		expect(await scratchStatsCount()).toBe(before);
	}, 60000);
});

describe('an actor with no activity at all', () => {
	test('reports the zero-activity contract instead of writing anything', async () => {
		const response = await updateUserActivityStats(SILENT_UID);
		expect(response.msg).toBe('No activity records found');
		expect(response.value).toEqual([]);
		expect(response.errors).toEqual([]);

		const written = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM matrix_stats
			 WHERE section_tipo = 'dd1521' AND relation @> $1::text::jsonb`,
			[JSON.stringify({ dd1522: [{ section_tipo: 'dd128', section_id: String(SILENT_UID) }] })],
		)) as { n: number }[];
		expect(written[0]?.n).toBe(0);
	}, 60000);
});

/** Tallies are set-like across pages — compare on a canonical order. */
function normalize(
	tallies: { day: string; kind: string; key: string; n: number; minId: number }[],
): string[] {
	// Merge the per-page splits the way foldTallies does, then sort canonically:
	// a key split across pages must reduce to one (sum, min) entry.
	const merged = new Map<string, { n: number; minId: number }>();
	for (const tally of tallies) {
		const id = `${tally.day}|${tally.kind}|${tally.key}`;
		const existing = merged.get(id);
		if (existing === undefined) merged.set(id, { n: tally.n, minId: tally.minId });
		else {
			existing.n += tally.n;
			existing.minId = Math.min(existing.minId, tally.minId);
		}
	}
	return [...merged.entries()].map(([id, v]) => `${id}=${v.n}@${v.minId}`).sort();
}
