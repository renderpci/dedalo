/**
 * user_activity widget — TS-NATIVE unit gate for isCanonicalEmpty
 * (src/core/components/component_info/widgets/dd/user_activity.ts).
 *
 * isCanonicalEmpty is the tier-3 switch of the three-tier pipeline: when it
 * says "empty" the widget throws away the cache-driven result and
 * re-aggregates a FULL YEAR of raw activity log rows, per request. So both
 * verdicts are load-bearing:
 *  - a false "empty" (a dimension check copy-pasted onto the wrong key, or the
 *    24-slot `when` histogram judged by `length > 0`) makes every request of a
 *    user whose only data is in that dimension pay the full-range fallback;
 *  - a false "non-empty" (`> 0` relaxed to `>= 0`, since the histogram is
 *    PRE-FILLED with 24 zero slots by emptyWhen()) kills the fallback for
 *    everyone, so a fresh user's widget renders permanently empty.
 *
 * Pure logic: no DB, no network, no filesystem. The only caller in the tree is
 * an oracle-gated parity gate that can no longer run, so this file is the
 * function's only mechanical gate.
 *
 * Production edit: `export` added to isCanonicalEmpty (allowed by the plan);
 * no behaviour change.
 */

import { describe, expect, test } from 'bun:test';
import type {
	CanonicalEntry,
	CanonicalTotals,
} from '../../src/core/area_maintenance/user_stats.ts';
import { isCanonicalEmpty } from '../../src/core/components/component_info/widgets/dd/user_activity.ts';

/** The five-dimension canonical shape with every dimension empty. */
function emptyTotals(): CanonicalTotals {
	return { who: [], what: [], where: [], when: [], publish: [] };
}

/** The 24 pre-filled zero hour slots emptyWhen() produces (keys 0..23). */
function zeroWhen(): CanonicalEntry[] {
	return Array.from({ length: 24 }, (_, hour) => ({
		key: hour,
		label: String(hour).padStart(2, '0'),
		value: 0,
	}));
}

describe('isCanonicalEmpty — non-object inputs', () => {
	// null is the tier-1 miss (endSaved < dateIn, or no stats rows at all):
	// it MUST route to the fallback, and it is checked before the typeof guard.
	test('null is empty', () => {
		expect(isCanonicalEmpty(null)).toBe(true);
	});

	// undefined / 0 / 'x' reach the typeof guard (null is short-circuited
	// earlier), so these are the cases that go red if the guard is dropped.
	// typeof null === 'object', hence the explicit === null test upstream.
	test('undefined is empty', () => {
		expect(isCanonicalEmpty(undefined as unknown as CanonicalTotals)).toBe(true);
	});
	test('the number 0 is empty (typeof guard)', () => {
		expect(isCanonicalEmpty(0 as unknown as CanonicalTotals)).toBe(true);
	});
	test('a string is empty (typeof guard)', () => {
		expect(isCanonicalEmpty('x' as unknown as CanonicalTotals)).toBe(true);
	});

	// An array IS typeof 'object': it survives the guard and must fall through
	// every Array.isArray(totals.<dim>) check on undefined properties.
	test('an array has no dimensions, so it is empty', () => {
		expect(isCanonicalEmpty([] as unknown as CanonicalTotals)).toBe(true);
	});
	test('a bare object with no dimensions is empty', () => {
		expect(isCanonicalEmpty({} as unknown as CanonicalTotals)).toBe(true);
	});
	test('all five dimensions present but empty is empty', () => {
		expect(isCanonicalEmpty(emptyTotals())).toBe(true);
	});
});

describe('isCanonicalEmpty — the four length-checked dimensions', () => {
	// One case per dimension, each the ONLY non-empty one: a check copy-pasted
	// onto the wrong key (the classic four-line copy edit) reddens exactly one
	// of these instead of hiding behind a sibling dimension.
	for (const dim of ['who', 'what', 'where', 'publish'] as const) {
		test(`${dim} alone non-empty ⇒ not empty`, () => {
			const totals = emptyTotals();
			totals[dim] = [{ key: 'k1', label: 'label', value: 1 }];
			expect(isCanonicalEmpty(totals)).toBe(false);
		});
	}

	// The dimension checks are pure length checks — the entry's own value is
	// never inspected, so a zero-valued (or null-labelled) entry still counts
	// as actionable data. Pins that nobody "improves" them into value checks.
	test('a what entry with value 0 still counts as data', () => {
		const totals = emptyTotals();
		totals.what = [{ key: 'x', label: null, value: 0 }];
		expect(isCanonicalEmpty(totals)).toBe(false);
	});

	// A malformed (non-array) dimension must be skipped, not crash: the totals
	// can arrive from a hand-edited/partial stats row.
	test('a non-array dimension is skipped, not thrown on', () => {
		const totals = { ...emptyTotals(), what: 'not-an-array' } as unknown as CanonicalTotals;
		expect(isCanonicalEmpty(totals)).toBe(true);
	});
});

describe('isCanonicalEmpty — the when histogram', () => {
	// THE case that forbids `when.length > 0`: emptyWhen() pre-fills 24 zero
	// slots, so a fresh user always has a full-length all-zero histogram and
	// must still be judged empty (else tier 3 never runs for them).
	test('24 pre-filled zero slots are empty', () => {
		const totals = { ...emptyTotals(), when: zeroWhen() };
		expect(totals.when.length).toBe(24);
		expect(isCanonicalEmpty(totals)).toBe(true);
	});

	// One non-zero hour anywhere in the histogram is real activity.
	test('one non-zero hour ⇒ not empty', () => {
		const when = zeroWhen();
		when[14] = { key: 14, label: '14', value: 3 };
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(false);
	});

	// Stats rows come back out of jsonb where counts are frequently strings:
	// the Number() coercion is what makes '2' actionable. Drop it and every
	// string-valued histogram reads as empty.
	test("a string value '2' coerces and counts", () => {
		const when = zeroWhen();
		when[0] = { key: 0, label: '00', value: '2' as unknown as number };
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(false);
	});
	test("a string value '0' is still zero", () => {
		const when = zeroWhen();
		when[0] = { key: 0, label: '00', value: '0' as unknown as number };
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(true);
	});
	// Non-numeric junk must NOT become "activity" (NaN > 0 is false) and must
	// not abort the scan of the remaining hours.
	test('a non-numeric value is not activity, and the scan continues', () => {
		const when = zeroWhen();
		when[0] = { key: 0, label: '00', value: 'abc' as unknown as number };
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(true);
		when[23] = { key: 23, label: '23', value: 5 };
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(false);
	});
	// Missing/undefined value ⇒ ?? 0, not NaN.
	test('an entry with no value is zero', () => {
		const when = zeroWhen();
		when[3] = { key: 3, label: '03' } as unknown as CanonicalEntry;
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(true);
	});

	// A null hole in the histogram must be skipped: typeof null === 'object',
	// so without the explicit !== null guard this throws instead of returning.
	test('a null entry is skipped without throwing', () => {
		const when = zeroWhen();
		when[7] = null as unknown as CanonicalEntry;
		expect(() => isCanonicalEmpty({ ...emptyTotals(), when })).not.toThrow();
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(true);
	});
	// A non-object entry (scalar in the slot) is likewise not activity.
	test('a scalar entry is not activity', () => {
		const when = zeroWhen();
		when[7] = 9 as unknown as CanonicalEntry;
		expect(isCanonicalEmpty({ ...emptyTotals(), when })).toBe(true);
	});

	// when is the LAST dimension checked: a non-empty when with everything
	// else empty must still be reported non-empty (the loop is reachable).
	test('when-only activity is reachable past the four length checks', () => {
		expect(isCanonicalEmpty({ ...emptyTotals(), when: [{ key: 9, label: '09', value: 1 }] })).toBe(
			false,
		);
	});
});
