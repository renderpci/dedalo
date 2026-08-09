/**
 * user_activity — activityWindow + resolveActivityTotals (TS-native gate).
 *
 * Item 3.12 of the CRAP coverage plan. Pure: no DB, no fixtures — the three
 * user_stats readers arrive through the injected ActivityDeps seam, so every
 * tier boundary is observable by call args and by object IDENTITY.
 *
 * TZ HONESTY (the plan's option (a)): the in-process activityWindow cases pin
 * CALENDAR ARITHMETIC ONLY and could NOT, on their own, detect a local-vs-UTC
 * Date-getter swap — the process TZ here is whatever the host has (nothing in
 * bunfig.toml or the preloads pins it) and at TZ=UTC local and UTC getters are
 * byte-identical. The local-vs-UTC regression is therefore gated separately, in
 * TZ-PINNED SUBPROCESSES on two date-line-straddling zones (Pacific/Kiritimati
 * = UTC+14 and Pacific/Niue = UTC-11), where the UTC-noon anchor falls on a
 * DIFFERENT local calendar day and a local-getter implementation must diverge.
 */

import { describe, expect, test } from 'bun:test';
import type {
	CanonicalTotals,
	RawActivityItem,
} from '../../src/core/area_maintenance/user_stats.ts';
import {
	type ActivityDeps,
	activityWindow,
	resolveActivityTotals,
} from '../../src/core/components/component_info/widgets/dd/user_activity.ts';

const WIDGET_SOURCE_PATH = `${import.meta.dir}/../../src/core/components/component_info/widgets/dd/user_activity.ts`;

/** A recording ActivityDeps triple; every override is a delta from "nothing". */
function makeDeps(overrides: Partial<ActivityDeps> = {}): {
	deps: ActivityDeps;
	rangeCalls: unknown[][];
	rawCalls: unknown[][];
	mergeCalls: unknown[][];
} {
	const rangeCalls: unknown[][] = [];
	const rawCalls: unknown[][] = [];
	const mergeCalls: unknown[][] = [];
	const base: ActivityDeps = {
		crossUsersRangeData: async (dateIn, dateOut, userId, lang) => {
			rangeCalls.push([dateIn, dateOut, userId, lang]);
			return overrides.crossUsersRangeData
				? await overrides.crossUsersRangeData(dateIn, dateOut, userId, lang)
				: null;
		},
		getIntervalRawActivityData: async (userId, dateIn, dateOut) => {
			rawCalls.push([userId, dateIn, dateOut]);
			return overrides.getIntervalRawActivityData
				? await overrides.getIntervalRawActivityData(userId, dateIn, dateOut)
				: null;
		},
		mergeRawIntoCanonical: async (canonical, rawItems, lang) => {
			mergeCalls.push([canonical, rawItems, lang]);
			return overrides.mergeRawIntoCanonical
				? await overrides.mergeRawIntoCanonical(canonical, rawItems, lang)
				: emptyTotals();
		},
	};
	return { deps: base, rangeCalls, rawCalls, mergeCalls };
}

function emptyTotals(): CanonicalTotals {
	return { who: [], what: [], where: [], when: [], publish: [] };
}

/** First recorded call's arg list (index-safe under noUncheckedIndexedAccess). */
function firstCall(calls: unknown[][]): unknown[] {
	return calls[0] ?? [];
}

/** A tier-1 object with actionable data (isCanonicalEmpty === false). */
function nonEmptyTotals(): CanonicalTotals {
	return {
		who: [],
		what: [{ key: 'rsc167', label: 'Audiovisual', value: 3 }],
		where: [],
		when: [],
		publish: [],
	};
}

describe('activityWindow — calendar arithmetic (TZ-agnostic assertions)', () => {
	test('ordinary day: neighbours and the year-ago lower bound', () => {
		expect(activityWindow('2026-08-08')).toEqual({
			dateIn: '2025-08-08',
			dateOut: '2026-08-08',
			todayStr: '2026-08-08',
			tomorrowStr: '2026-08-09',
			yesterdayStr: '2026-08-07',
		});
	});

	test('month + year rollovers on both neighbours', () => {
		const jan1 = activityWindow('2026-01-01');
		expect(jan1.tomorrowStr).toBe('2026-01-02');
		expect(jan1.yesterdayStr).toBe('2025-12-31');
		expect(jan1.dateIn).toBe('2025-01-01');

		const dec31 = activityWindow('2025-12-31');
		expect(dec31.tomorrowStr).toBe('2026-01-01');
		expect(dec31.yesterdayStr).toBe('2025-12-30');
	});

	test('leap day: 2024-02-29 neighbours, and the year-ago of 2024-02-29 overflows to 2023-03-01', () => {
		const leap = activityWindow('2024-02-29');
		expect(leap.yesterdayStr).toBe('2024-02-28');
		expect(leap.tomorrowStr).toBe('2024-03-01');
		// quirk: pinned, not fixed — setUTCFullYear on Feb 29 lands on the
		// non-existent 2023-02-29 and JS normalizes it forward to March 1.
		expect(leap.dateIn).toBe('2023-03-01');
		// and the day AFTER a leap day has an exact year-ago
		expect(activityWindow('2024-03-01').dateIn).toBe('2023-03-01');
	});

	test('dateOut is todayStr verbatim, and todayStr is echoed unchanged', () => {
		const w = activityWindow('2026-03-29'); // EU DST spring-forward day
		expect(w.dateOut).toBe(w.todayStr);
		expect(w.todayStr).toBe('2026-03-29');
		// DST-safe: the UTC-noon anchor keeps the ±1d hop inside the same date
		expect(w.yesterdayStr).toBe('2026-03-28');
		expect(w.tomorrowStr).toBe('2026-03-30');
		const fall = activityWindow('2026-10-25'); // EU DST fall-back day
		expect(fall.yesterdayStr).toBe('2026-10-24');
		expect(fall.tomorrowStr).toBe('2026-10-26');
	});
});

describe('activityWindow — TZ-pinned subprocesses (the local-vs-UTC getter gate)', () => {
	// Each zone runs activityWindow in a FRESH bun process with TZ pinned, on
	// dates where the UTC-noon anchor sits on a different LOCAL calendar day
	// (+14 → next day, -11 → same day but 01:00; the year-ago/neighbour
	// formatting must stay UTC-derived regardless).
	// MEASURED honesty: with a local-getter regression injected, Kiritimati
	// (+14) FAILS these assertions and Niue (-11) does not — at UTC-11 the
	// UTC-noon anchor still lands on the same local calendar day. Niue is kept
	// as the other side of the date line, but Kiritimati is the detecting zone.
	const probe = async (tz: string, dates: string[]): Promise<Record<string, unknown>[]> => {
		const script = `
			const { activityWindow } = await import(${JSON.stringify(WIDGET_SOURCE_PATH)});
			const out = ${JSON.stringify(dates)}.map((d) => activityWindow(d));
			console.log(JSON.stringify(out));
		`;
		const proc = Bun.spawn(['bun', '-e', script], {
			env: { ...process.env, TZ: tz },
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (code !== 0) throw new Error(`TZ=${tz} probe failed (${code}): ${err}`);
		return JSON.parse(out.trim().split('\n').pop() as string);
	};

	const DATES = ['2026-08-08', '2025-12-31', '2024-02-29', '2026-01-01'];
	const EXPECTED = DATES.map((d) => activityWindow(d));

	for (const tz of ['Pacific/Kiritimati', 'Pacific/Niue']) {
		test(`TZ=${tz} produces byte-identical windows`, async () => {
			const got = await probe(tz, DATES);
			expect(got).toEqual(JSON.parse(JSON.stringify(EXPECTED)));
			// spot-check the value a local-getter implementation would break at +14
			expect(got[1]).toMatchObject({ todayStr: '2025-12-31', tomorrowStr: '2026-01-01' });
		}, 30000);
	}
});

describe('resolveActivityTotals — the three tiers', () => {
	const W = activityWindow('2026-08-08');
	const USER = 987654;
	const LANG = 'lg-eng';

	test('tier 1 satisfied + no today rows: the tier-1 object is returned BY IDENTITY', async () => {
		const t1 = nonEmptyTotals();
		const { deps, rangeCalls, rawCalls, mergeCalls } = makeDeps({
			crossUsersRangeData: async () => t1,
		});
		const got = await resolveActivityTotals(W, USER, LANG, deps);

		expect(got).toBe(t1); // identity, not structural equality
		expect(rangeCalls).toEqual([[W.dateIn, W.yesterdayStr, USER, LANG]]);
		expect(rawCalls).toEqual([[USER, W.todayStr, W.tomorrowStr]]);
		expect(rawCalls.length).toBe(1);
		expect(mergeCalls.length).toBe(0);
	});

	test('tier 1 + a today merge: merge receives exactly (T1, rawArray, lang), one raw call', async () => {
		const t1 = nonEmptyTotals();
		const merged = nonEmptyTotals();
		const rawToday: RawActivityItem[] = [{ type: 'when', hour: 11, value: 2 }];
		const { deps, rawCalls, mergeCalls } = makeDeps({
			crossUsersRangeData: async () => t1,
			getIntervalRawActivityData: async () => rawToday,
			mergeRawIntoCanonical: async () => merged,
		});
		const got = await resolveActivityTotals(W, USER, LANG, deps);

		expect(got).toBe(merged);
		expect(rawCalls).toEqual([[USER, W.todayStr, W.tomorrowStr]]);
		expect(mergeCalls.length).toBe(1);
		expect(firstCall(mergeCalls)[0]).toBe(t1);
		expect(firstCall(mergeCalls)[1]).toBe(rawToday);
		expect(firstCall(mergeCalls)[2]).toBe(LANG);
	});

	test('empty tier 1 and 2: the fallback raw call is (userId, dateIn, tomorrowStr) and merge base is NULL', async () => {
		const rawFull: RawActivityItem[] = [{ type: 'where', tipo: 'rsc167', value: 5 }];
		const merged = nonEmptyTotals();
		let rawCallIndex = 0;
		const { deps, rawCalls, mergeCalls } = makeDeps({
			crossUsersRangeData: async () => null,
			getIntervalRawActivityData: async () => (rawCallIndex++ === 0 ? null : rawFull),
			mergeRawIntoCanonical: async () => merged,
		});
		const got = await resolveActivityTotals(W, USER, LANG, deps);

		expect(got).toBe(merged);
		expect(rawCalls.length).toBe(2);
		expect(firstCall(rawCalls)).toEqual([USER, W.todayStr, W.tomorrowStr]);
		expect(rawCalls[1]).toEqual([USER, W.dateIn, W.tomorrowStr]);
		expect(mergeCalls.length).toBe(1);
		expect(firstCall(mergeCalls)[0]).toBeNull(); // NULL base, not the empty tier-1 result
		expect(firstCall(mergeCalls)[1]).toBe(rawFull);
	});

	test('all-zero (non-null) tier 1: the fallback still fires — a null-check-only regression would not', async () => {
		// Structurally present but with no actionable data: every dimension
		// empty except a zero-valued `when` entry. `totals !== null` here, so
		// only isCanonicalEmpty can trigger tier 3.
		const allZero: CanonicalTotals = {
			who: [],
			what: [],
			where: [],
			publish: [],
			when: [{ key: '00', label: null, value: 0 }],
		};
		const rawFull: RawActivityItem[] = [{ type: 'what', tipo: 'rsc167', value: 1, label: 'A' }];
		const merged = nonEmptyTotals();
		let rawCallIndex = 0;
		const { deps, rawCalls, mergeCalls } = makeDeps({
			crossUsersRangeData: async () => allZero,
			getIntervalRawActivityData: async () => (rawCallIndex++ === 0 ? null : rawFull),
			mergeRawIntoCanonical: async () => merged,
		});
		const got = await resolveActivityTotals(W, USER, LANG, deps);

		expect(got).toBe(merged);
		expect(got).not.toBe(allZero);
		expect(rawCalls.length).toBe(2);
		expect(rawCalls[1]).toEqual([USER, W.dateIn, W.tomorrowStr]);
		expect(firstCall(mergeCalls)[0]).toBeNull();
	});

	test('nothing anywhere: null, NOT {}', async () => {
		const { deps, rawCalls, mergeCalls } = makeDeps();
		const got = await resolveActivityTotals(W, USER, LANG, deps);

		expect(got).toBeNull();
		expect(got).not.toEqual({} as unknown as CanonicalTotals);
		expect(rawCalls.length).toBe(2);
		expect(mergeCalls.length).toBe(0);
	});
});

describe('rewire — the inline pipeline is GONE from the widget', () => {
	test('computeUserActivity delegates; no inline tier code survives', async () => {
		const source = await Bun.file(WIDGET_SOURCE_PATH).text();
		// the extracted call sites are the ONLY copies
		expect(source).toContain('activityWindow(dbTimestamp().slice(0, 10))');
		expect(source).toContain('await resolveActivityTotals(window, userId, lang, deps)');
		// inline tier tokens must not appear inside computeUserActivity: each of
		// these now exists exactly once, inside the extraction.
		const computeBody = source.slice(source.indexOf('async function computeUserActivity'));
		expect(computeBody).not.toContain('const endSaved =');
		expect(computeBody).not.toContain('isCanonicalEmpty(totals)');
		expect(computeBody).not.toContain('T12:00:00Z');
		expect(computeBody).not.toContain('setUTCFullYear');
		expect(computeBody).not.toContain('falling back to live full-range aggregation');
		// and there is exactly ONE occurrence of each in the whole file
		for (const token of ['const endSaved =', 'T12:00:00Z', 'setUTCFullYear']) {
			expect(source.split(token).length - 1).toBe(1);
		}
	});
});
