/**
 * crossUsersRangeData — TIER 1 of the user-activity widget (the SAVED dd1521
 * history), and its extracted reduction seam `foldStatsRows`.
 *
 * WHY THIS GATE EXISTS. The only thing that ever covered this function was
 * test/parity/get_widget_data_differential.test.ts, permanently skipped since
 * the cutover: comp 26 at 0%. Two contracts here are load-bearing far beyond
 * their size:
 *
 *  1. NULL, NOT AN EMPTY CANONICAL, when the range holds no stats row. That
 *     null is the signal `resolveActivityTotals` reads as "the history has not
 *     been built"; return `{}` instead and tier 3 never fires — EVERY NEW
 *     USER'S WIDGET GOES BLANK, with no error anywhere. The null case is
 *     therefore always asserted PAIRED with a positive control over a range
 *     that does cover the scratch rows: alone it would pass against a function
 *     stubbed to `return null`.
 *  2. The int/string dual-form containment probe. Stored dd1522 locators carry
 *     string ids before the int sweep and int ids after
 *     (WC-2026-08-10-section-id-int-canonical); dropping either disjunct makes
 *     half the history vanish. This is a DEMONSTRATED live class — the same
 *     mistake had widget_request_native.test.ts red and leaking rows.
 *
 * SHAPE. `foldStatsRows` is the pure reduction, injected with the two label
 * resolvers; `crossUsersRangeData` keeps the SQL (user_stats.ts is the sole
 * declared owner of matrix_stats SQL — sql_confinement_tripwire) and the
 * null-vs-empty decision, which is a statement about the STORE and not about
 * the folded content. Both halves are gated here; the rewire itself is
 * asserted too, so the reduction cannot silently come back inline.
 *
 * NOT GATED HERE, deliberately: `make_date` on a malformed stored date (month
 * 0, day 32) raises `date field value out of range` and takes the whole query
 * down for that user forever. That is a real defect, not a contract, and
 * pinning the throw would retire it — it stays in the plan's §4.4 (L2).
 * Likewise the year/month-granularity stats row that is invisible to this
 * day-granular predicate (§4.4 L3).
 *
 * Scratch hygiene: synthetic dd128 uid 932777, matrix_stats section_id band
 * 932000-932999 only, direct SQL (saveUserActivity cannot mint the malformed
 * shapes), swept fail-loud in afterAll from matrix_stats AND
 * matrix_time_machine.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
	type CanonicalTotals,
	crossUsersRangeData,
	foldStatsRows,
	type StatsRow,
} from '../../src/core/area_maintenance/user_stats.ts';
import { sql } from '../../src/core/db/postgres.ts';

const LANG = 'lg-eng';
/** Synthetic dd128 user — never a real one. */
const UID = 932777;

// ---------------------------------------------------------------- pure half

/** component_json wrapper, as `misc->'dd1523'` stores it. */
const wrap = (totals: unknown): { value: unknown; lang: string; id: number }[] => [
	{ value: totals, lang: 'lg-nolan', id: 1 },
];

/** The dd1522 locator as it is stored inside the relation column. */
const userLocator = (id: number | string): Record<string, unknown> => ({
	id: 1,
	type: 'dd151',
	section_id: id,
	section_tipo: 'dd128',
	from_component_tipo: 'dd1522',
});

/**
 * The PRODUCTION relation column: keyed by component tipo, so its first-level
 * values are ARRAYS and the `who` scan never matches (the mirrored PHP defect).
 */
const relationColumn = (id: number | string): Record<string, unknown> => ({
	dd1522: [userLocator(id)],
});

/** The flat-array relation shape the fold also tolerates — this one DOES match. */
const relationFlat = (id: number | string): unknown[] => [userLocator(id)];

/** Recording resolvers: the fold must memoise, so the call log is the assertion. */
function makeResolvers(): {
	termCalls: string[];
	userCalls: string[];
	resolveTerm: (tipo: string) => Promise<string | null>;
	resolveUser: (key: string) => Promise<string | null>;
} {
	const termCalls: string[] = [];
	const userCalls: string[] = [];
	return {
		termCalls,
		userCalls,
		resolveTerm: async (tipo) => {
			termCalls.push(tipo);
			return `term:${tipo}`;
		},
		resolveUser: async (key) => {
			userCalls.push(key);
			return `user:${key}`;
		},
	};
}

const fold = async (rows: StatsRow[]): Promise<CanonicalTotals> => {
	const { resolveTerm, resolveUser } = makeResolvers();
	return foldStatsRows(rows, resolveTerm, resolveUser);
};

describe('foldStatsRows (the reduction half)', () => {
	test('every stored totals wrapper variant is unwrapped, including the double-nested legacy one', async () => {
		const out = await fold([
			// the canonical component_json wrapper
			{ relation: relationColumn(UID), totals: wrap([{ type: 'what', tipo: 'zzxuA', value: 2 }]) },
			// a BARE object (no array wrapper) — older writers stored this
			{
				relation: relationColumn(UID),
				totals: { value: [{ type: 'what', tipo: 'zzxuA', value: 3 }] },
			},
			// null misc->dd1523: contributes nothing, must not throw
			{ relation: relationColumn(UID), totals: null },
			// DOUBLE-NESTED legacy payload — only `.flat()` reaches it. Dropping the
			// flat() reads these rows as empty and YEARS OF HISTORY silently vanish.
			{
				relation: relationColumn(UID),
				totals: wrap([[{ type: 'what', tipo: 'zzxuA', value: 5 }]]),
			},
		]);
		// the SUMMED value, not "the result is an object"
		expect(out.what).toEqual([{ key: 'zzxuA', label: 'term:zzxuA', value: 10 }]);
	});

	test('a row whose totals are empty yields the bare pre-filled canonical', async () => {
		// relationFlat DOES resolve a user, so nothing but the row-level skip and
		// the where-actions guard keep every dimension empty here.
		const out = await fold([{ relation: relationFlat(UID), totals: wrap([]) }]);
		expect(out.who).toEqual([]);
		expect(out.what).toEqual([]);
		expect(out.where).toEqual([]);
		expect(out.publish).toEqual([]);
		// the histogram is still pre-filled: 24 slots, all zero
		expect(out.when.length).toBe(24);
		expect(out.when.every((entry) => entry.value === 0)).toBe(true);
	});

	test('a row with no WHERE actions never reaches who, even when its user resolves', async () => {
		// (!) Written this way ON PURPOSE. The row-level `totals.length === 0`
		// skip has NO killing mutation of its own: an empty-totals row also
		// accumulates no where-actions, so the `whereActionsTotal > 0` guard
		// masks it. The guard is the observable rule, and only a row that IS
		// folded (a `what` entry) with a user that DOES resolve exposes it.
		const out = await fold([
			{ relation: relationFlat(UID), totals: wrap([]) },
			{ relation: relationFlat(UID), totals: wrap([{ type: 'what', tipo: 'zzxuW1', value: 9 }]) },
		]);
		expect(out.what).toEqual([{ key: 'zzxuW1', label: 'term:zzxuW1', value: 9 }]);
		expect(out.who).toEqual([]);
	});

	test('values sum per key across rows while the emitted order stays FIRST-SEEN', async () => {
		const out = await fold([
			{
				relation: relationColumn(UID),
				totals: wrap([
					{ type: 'what', tipo: 'zzxuW1', value: 1 },
					{ type: 'where', tipo: 'zzxuR1', value: 2 },
					{ type: 'publish', tipo: 'zzxuP1', value: 1 },
				]),
			},
			{
				relation: relationColumn(UID),
				totals: wrap([
					{ type: 'what', tipo: 'zzxuW2', value: 3 },
					{ type: 'what', tipo: 'zzxuW1', value: 4 },
					{ type: 'where', tipo: 'zzxuR0', value: 5 },
					{ type: 'where', tipo: 'zzxuR1', value: 6 },
				]),
			},
		]);
		// full ordered arrays: the emitted order IS the pinned wire order, and
		// zzxuR0 sorting BEFORE zzxuR1 alphabetically is what makes a re-sort visible
		expect(out.what).toEqual([
			{ key: 'zzxuW1', label: 'term:zzxuW1', value: 5 },
			{ key: 'zzxuW2', label: 'term:zzxuW2', value: 3 },
		]);
		expect(out.where).toEqual([
			{ key: 'zzxuR1', label: 'term:zzxuR1', value: 8 },
			{ key: 'zzxuR0', label: 'term:zzxuR0', value: 5 },
		]);
		expect(out.publish).toEqual([{ key: 'zzxuP1', label: 'term:zzxuP1', value: 1 }]);
	});

	test('a tipo repeated across rows costs exactly ONE term lookup', async () => {
		const { termCalls, resolveTerm, resolveUser } = makeResolvers();
		await foldStatsRows(
			[
				{
					relation: relationColumn(UID),
					totals: wrap([{ type: 'what', tipo: 'zzxuA', value: 1 }]),
				},
				// same tipo, DIFFERENT dimension and a different row: without the term
				// cache a year of stats rows becomes hundreds of ontology queries
				{
					relation: relationColumn(UID),
					totals: wrap([
						{ type: 'where', tipo: 'zzxuA', value: 1 },
						{ type: 'where', tipo: 'zzxuB', value: 1 },
					]),
				},
			],
			resolveTerm,
			resolveUser,
		);
		// the ENGINE (the call count), not the stub's return value
		expect(termCalls.filter((tipo) => tipo === 'zzxuA').length).toBe(1);
		expect(termCalls).toEqual(['zzxuA', 'zzxuB']);
	});

	test('where and publish DO carry labels here (asymmetric with the raw reader)', async () => {
		const out = await fold([
			{
				relation: relationColumn(UID),
				totals: wrap([
					{ type: 'what', tipo: 'zzxuW1', value: 1 },
					{ type: 'where', tipo: 'zzxuR1', value: 1 },
					{ type: 'publish', tipo: 'zzxuP1', value: 1 },
				]),
			},
		]);
		expect(out.what[0]?.label).toBe('term:zzxuW1');
		expect(out.where[0]?.label).toBe('term:zzxuR1');
		expect(out.publish[0]?.label).toBe('term:zzxuP1');
	});

	test('an out-of-range hour adds a slot placed by the LABEL-STRING sort', async () => {
		const out = await fold([
			{
				relation: relationColumn(UID),
				totals: wrap([
					{ type: 'when', hour: 3, value: 2 },
					{ type: 'when', hour: 100, value: 7 },
					{ type: 'when', hour: 3, value: 5 },
				]),
			},
		]);
		expect(out.when.length).toBe(25);
		// '100' lands between '10' and '11' — a numeric sort would put it last.
		expect(out.when.map((entry) => entry.label)).toEqual([
			'00',
			'01',
			'02',
			'03',
			'04',
			'05',
			'06',
			'07',
			'08',
			'09',
			'10',
			'100',
			'11',
			'12',
			'13',
			'14',
			'15',
			'16',
			'17',
			'18',
			'19',
			'20',
			'21',
			'22',
			'23',
		]);
		expect(out.when.find((entry) => entry.key === 100)).toEqual({
			key: 100,
			label: '100',
			value: 7,
		});
		// an in-range hour accumulates into the pre-filled slot
		expect(out.when.find((entry) => entry.key === 3)?.value).toBe(7);
	});

	test('who stays EMPTY on a production relation column that does contain a dd1522 locator', async () => {
		const out = await fold([
			{
				relation: relationColumn(UID),
				totals: wrap([
					{ type: 'where', tipo: 'zzxuR1', value: 4 },
					{ type: 'what', tipo: 'zzxuW1', value: 2 },
				]),
			},
		]);
		// THE FLOOR FIRST: prove the row was actually folded, so `who: []` cannot
		// be passing because the row was skipped or the seam is mis-wired.
		expect(out.what).toEqual([{ key: 'zzxuW1', label: 'term:zzxuW1', value: 2 }]);
		expect(out.where).toEqual([{ key: 'zzxuR1', label: 'term:zzxuR1', value: 4 }]);
		// (!) The mirrored PHP defect: the relation COLUMN's first-level values are
		// per-tipo ARRAYS, so no locator is ever matched. Flattening them "to fix
		// the bug" populates `who` and diverges from the pinned wire shape.
		expect(out.who).toEqual([]);
	});

	test('the flat-array relation shape does resolve a user, once, summing where-actions', async () => {
		const { userCalls, resolveTerm, resolveUser } = makeResolvers();
		const out = await foldStatsRows(
			[
				{
					relation: relationFlat(UID),
					totals: wrap([{ type: 'where', tipo: 'zzxuR1', value: 4 }]),
				},
				{
					relation: relationFlat(UID),
					totals: wrap([{ type: 'where', tipo: 'zzxuR2', value: 6 }]),
				},
				// `what` alone contributes no where-actions, so it adds nothing to who
				{ relation: relationFlat(UID), totals: wrap([{ type: 'what', tipo: 'zzxuW1', value: 9 }]) },
			],
			resolveTerm,
			resolveUser,
		);
		expect(out.who).toEqual([{ key: String(UID), label: `user:${UID}`, value: 10 }]);
		expect(userCalls).toEqual([String(UID)]);
	});
});

// --------------------------------------------------------- the rewire itself

describe('the reduction is REWIRED, not duplicated', () => {
	test('crossUsersRangeData delegates and holds no inline reduction', async () => {
		const source = await Bun.file(
			`${import.meta.dir}/../../src/core/area_maintenance/user_stats.ts`,
		).text();
		const start = source.indexOf('export async function crossUsersRangeData');
		const end = source.indexOf('export interface StatsRow');
		expect(start).toBeGreaterThan(-1);
		expect(end).toBeGreaterThan(start);
		const body = source.slice(start, end);
		expect(body).toContain('foldStatsRows(');
		// the reduction's markers must live in the seam ONLY
		for (const marker of ['whereActionsTotal', 'emptyWhen()', 'userLabelCache', 'termCache']) {
			expect(body).not.toContain(marker);
		}
	});
});

// ------------------------------------------------------------------ DB half

/** matrix_stats section_ids this file minted, for the fail-loud sweep. */
const mintedIds: number[] = [];

/** One dd1521 stats row, written with DIRECT SQL. */
async function insertStats(options: {
	sectionId: number;
	year: number;
	month: number;
	day: number;
	/** Stored dd1522 section_id FORM — the dual-form containment class. */
	idForm: 'int' | 'string';
	/** A unique `where` tipo, so the folded output names exactly which rows landed. */
	marker: string;
}): Promise<void> {
	await sql.unsafe(
		`INSERT INTO matrix_stats (section_id, section_tipo, relation, string, date, misc)
		 VALUES ($1, 'dd1521', $2::text::jsonb, $3::text::jsonb, $4::text::jsonb, $5::text::jsonb)`,
		[
			options.sectionId,
			JSON.stringify(relationColumn(options.idForm === 'int' ? UID : String(UID))),
			JSON.stringify({ dd1531: [{ value: 'day', lang: 'lg-nolan', id: 1 }] }),
			JSON.stringify({
				dd1530: [{ id: 1, start: { year: options.year, month: options.month, day: options.day } }],
			}),
			JSON.stringify({
				dd1523: wrap([{ type: 'where', tipo: options.marker, value: 1 }]),
			}),
		],
	);
	mintedIds.push(options.sectionId);
}

/** The markers that landed, in emitted order — the observable of "which rows". */
const markers = (totals: CanonicalTotals | null): string[] =>
	(totals?.where ?? []).map((entry) => String(entry.key));

describe('crossUsersRangeData (the SQL half)', () => {
	beforeAll(async () => {
		// idempotent pre-sweep of OUR band only (never a table-global statement)
		await sql.unsafe(
			`DELETE FROM matrix_stats WHERE section_tipo = 'dd1521' AND section_id BETWEEN 932000 AND 932999`,
		);

		// --- inclusive-bounds fixture, window 1902-03-10 … 1902-03-12.
		// The IN-RANGE upper row is inserted FIRST (lowest id) so a query ordered
		// by id alone would emit the pair in the wrong order.
		await insertStats({
			sectionId: 932011,
			year: 1902,
			month: 3,
			day: 12,
			idForm: 'int',
			marker: 'zzxu_in_hi',
		});
		await insertStats({
			sectionId: 932012,
			year: 1902,
			month: 3,
			day: 10,
			idForm: 'int',
			marker: 'zzxu_in_lo',
		});
		await insertStats({
			sectionId: 932013,
			year: 1902,
			month: 3,
			day: 9,
			idForm: 'int',
			marker: 'zzxu_out_lo',
		});
		await insertStats({
			sectionId: 932014,
			year: 1902,
			month: 3,
			day: 13,
			idForm: 'int',
			marker: 'zzxu_out_hi',
		});

		// --- dual-form fixture, one form per DAY (the int row first, lower id).
		// Deliberately NOT the same day: a day is a single aggregation run, and
		// the reader keeps one row per day (see the duplicate-day case below), so
		// two same-day rows would test the dedup rather than the probe.
		await insertStats({
			sectionId: 932021,
			year: 1903,
			month: 5,
			day: 5,
			idForm: 'int',
			marker: 'zzxu_int',
		});
		await insertStats({
			sectionId: 932022,
			year: 1903,
			month: 5,
			day: 6,
			idForm: 'string',
			marker: 'zzxu_str',
		});

		// --- duplicate-day fixture: the SAME day aggregated twice (what a
		// re-aggregation over a non-swept store leaves behind). Highest id wins.
		await insertStats({
			sectionId: 932031,
			year: 1904,
			month: 7,
			day: 7,
			idForm: 'int',
			marker: 'zzxu_dup_old',
		});
		await insertStats({
			sectionId: 932032,
			year: 1904,
			month: 7,
			day: 7,
			idForm: 'int',
			marker: 'zzxu_dup_new',
		});
	});

	afterAll(async () => {
		const leaked: string[] = [];
		for (const sectionId of mintedIds) {
			const deleted = (await sql.unsafe(
				`DELETE FROM matrix_stats WHERE section_tipo = 'dd1521' AND section_id = $1 RETURNING section_id`,
				[sectionId],
			)) as unknown[];
			// a 0-row delete means the filter is wrong — the exact bug class F1 was
			if (deleted.length === 0) leaked.push(`matrix_stats section_id ${sectionId}`);
			await sql.unsafe(
				`DELETE FROM matrix_time_machine WHERE section_tipo = 'dd1521' AND section_id = $1`,
				[sectionId],
			);
		}
		if (leaked.length > 0) throw new Error(`cleanup leaked tracked rows: ${leaked.join(', ')}`);
	});

	test('an empty range returns NULL — and the same fixture returns a canonical when covered', async () => {
		// (1) no stats row for this user in 1901: the "history not built" signal.
		// `{}`/an empty canonical here blanks the widget for every new user.
		expect(await crossUsersRangeData('1901-01-01', '1901-12-31', UID, LANG)).toBeNull();

		// (2) THE POSITIVE CONTROL, in the same file and the same fixture: without
		// it, (1) also passes against a function that always returns null.
		const covered = await crossUsersRangeData('1902-03-10', '1902-03-12', UID, LANG);
		expect(covered).not.toBeNull();
		expect(markers(covered)).toEqual(['zzxu_in_lo', 'zzxu_in_hi']);
		expect(covered?.where.map((entry) => entry.value)).toEqual([1, 1]);
		expect(covered?.when.length).toBe(24);
	});

	test('the day bounds are INCLUSIVE at both ends, and the order is day then id', async () => {
		const totals = await crossUsersRangeData('1902-03-10', '1902-03-12', UID, LANG);
		// exactly the two in-range rows of the four provisioned; a </<= flip on
		// either end silently drops a whole day out of every report. The ORDER
		// proves the day sort: zzxu_in_hi was written first and has the lower id.
		expect(markers(totals)).toEqual(['zzxu_in_lo', 'zzxu_in_hi']);

		// the excluded neighbours are reachable when the window is widened —
		// so "absent" above is exclusion, not a fixture that never existed
		const wide = await crossUsersRangeData('1902-03-09', '1902-03-13', UID, LANG);
		expect(markers(wide)).toEqual(['zzxu_out_lo', 'zzxu_in_lo', 'zzxu_in_hi', 'zzxu_out_hi']);
	});

	test('both stored id FORMS of the user locator are returned (the dual-form probe)', async () => {
		const totals = await crossUsersRangeData('1903-05-01', '1903-05-31', UID, LANG);
		// section_id 932021 stores an INT dd1522 id, 932022 a STRING one. Dropping
		// either disjunct of the containment pair makes half the history disappear.
		expect(markers(totals)).toEqual(['zzxu_int', 'zzxu_str']);
		expect(totals?.where.length).toBe(2);
	});

	test('a day aggregated TWICE is counted ONCE — the newest run wins', async () => {
		const totals = await crossUsersRangeData('1904-07-01', '1904-07-31', UID, LANG);
		// Both rows are the same day and each IS that day's totals: summing them
		// reports more activity than the log holds (measured live: 191 duplicated
		// days inflated one user to 41,051 events over a 35,123-row log).
		expect(markers(totals)).toEqual(['zzxu_dup_new']);
		expect(totals?.where.map((entry) => entry.value)).toEqual([1]);
	});
});
