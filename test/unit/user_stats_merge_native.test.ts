/**
 * mergeRawIntoCanonical — the user-activity widget's "today on top of history"
 * operator (src/core/area_maintenance/user_stats.ts). The only place a SAVED
 * aggregate (dd1521 canonical totals) and a LIVE aggregate (raw matrix_activity
 * items) meet. Pure apart from one deterministic ontology term lookup, so this
 * is a direct-call gate: no fixture, no clock, no DB write.
 *
 * Twin of the retired read-side differential
 * (test/parity/get_widget_data_differential.test.ts, permanently skipped
 * post-cutover — 5 skip / 0 pass). ORACLE_HARVEST's P1 map had no READ-side
 * twin row for this function; this file is it.
 *
 * PAIRING WITH 4.2.2 (getIntervalRawActivityData) — MUTUALLY LOAD-BEARING.
 * M2/M3 below gate the LABEL PRECEDENCE inside the merge (a raw `label` wins;
 * absent, the ontology term is resolved). That precedence is only exercised in
 * production because the producer is ASYMMETRIC: `what` items carry a label,
 * `where`/`publish` items do NOT. So the getIntervalRawActivityData gate MUST
 * assert, on a non-empty per-dimension item count:
 *   - every emitted `what` item has a `label`;
 *   - no emitted `where` / `publish` item has one;
 *   - `hour` is emitted as the RAW string key (not Number()-ed).
 * If that asymmetry silently disappears there, M2/M3 here keep passing while
 * gating a branch nothing reaches — and vice versa.
 *
 * QUIRKS PINNED, NOT FIXED:
 *  - NaN poisoning (M11): a non-numeric `value` yields NaN, `NaN === 0` is
 *    false, so the entry's value becomes NaN and JSON.stringify emits `null`
 *    on the wire. Pinned as CURRENT behaviour; fixing it is a wire edit.
 *  - `who` is never written by the merge (M13). The retired differential
 *    pinned `who: []` on BOTH engines because PHP's array_find is broken.
 *
 * DROPPED AS VACUOUS: the `termCache` memoisation inside the merge. A repeated
 * key always takes the `existing.value +=` arm and never re-reaches the cache,
 * so removing the cache is unobservable from outside; there is no killing
 * mutation. (The observable term cache is the one in ontology/labels.ts.)
 *
 * No DB WRITES here: read-only ontology term lookups only, so no scratch band
 * and no sweep are required.
 *
 * @twin-of      test/parity/get_widget_data_differential.test.ts
 * @twin-status  supplement
 */

import { describe, expect, test } from 'bun:test';
import {
	type CanonicalEntry,
	type CanonicalTotals,
	mergeRawIntoCanonical,
	type RawActivityItem,
} from '../../src/core/area_maintenance/user_stats.ts';
import { termByTipo } from '../../src/core/ontology/labels.ts';

const LANG = 'lg-eng';
/** A REAL ontology tipo whose term differs from the tipo string (dd694 = 'Edit'). */
const TERM_TIPO = 'dd694';

/** Loose item builder: several cases deliberately feed malformed shapes. */
const raw = (item: unknown): RawActivityItem => item as RawActivityItem;

const canonicalOf = (partial: Partial<CanonicalTotals>): CanonicalTotals =>
	({
		who: [],
		what: [],
		where: [],
		when: [],
		publish: [],
		...partial,
	}) as CanonicalTotals;

describe('mergeRawIntoCanonical', () => {
	test('M1 — canonical=null builds a fresh base and DENSIFIES when to 24 labelled slots', async () => {
		const merged = await mergeRawIntoCanonical(
			null,
			[
				raw({ type: 'what', tipo: 'zzua1', value: 2, label: 'Saved' }),
				raw({ type: 'where', tipo: 'zzua2', value: 3, label: 'Section' }),
				raw({ type: 'publish', tipo: 'zzua3', value: 4, label: 'Pub' }),
				raw({ type: 'when', hour: 5, value: 6 }),
			],
			LANG,
		);

		// The densification loop is the assertion — NOT "all five keys exist",
		// which the base literal alone satisfies while executing no merge.
		expect(merged.when.map((entry) => entry.key)).toEqual(Array.from({ length: 24 }, (_, i) => i));
		expect(merged.when.map((entry) => entry.label)).toEqual([
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
		expect(merged.when[5]?.value).toBe(6);
		// …and the three indexed dimensions really absorbed their item.
		expect(merged.what).toEqual([{ key: 'zzua1', label: 'Saved', value: 2 }]);
		expect(merged.where).toEqual([{ key: 'zzua2', label: 'Section', value: 3 }]);
		expect(merged.publish).toEqual([{ key: 'zzua3', label: 'Pub', value: 4 }]);
	});

	test('M2 — a raw `label` WINS over the ontology term', async () => {
		// Precondition: this tipo really does resolve to something else, so a
		// termByTipo-first mutation is observable.
		expect(await termByTipo(TERM_TIPO, LANG)).not.toBe('Custom');

		const merged = await mergeRawIntoCanonical(
			null,
			[raw({ type: 'what', tipo: TERM_TIPO, value: 1, label: 'Custom' })],
			LANG,
		);
		expect(merged.what).toEqual([{ key: TERM_TIPO, label: 'Custom', value: 1 }]);
	});

	test('M3 — no raw label FALLS BACK to the ontology term', async () => {
		// In-test precondition: fails loudly if the ontology stops carrying a
		// term for this tipo, which would make the case vacuous (termByTipo
		// falls back to returning the tipo itself).
		const term = await termByTipo(TERM_TIPO, LANG);
		expect(term).not.toBe(TERM_TIPO);

		// `where` items are produced WITHOUT a label — see the 4.2.2 pairing note.
		const merged = await mergeRawIntoCanonical(
			null,
			[raw({ type: 'where', tipo: TERM_TIPO, value: 2 })],
			LANG,
		);
		expect(merged.where).toEqual([{ key: TERM_TIPO, label: term, value: 2 }]);
	});

	test('M4 — an EXISTING key accumulates into one entry and keeps the saved label', async () => {
		const canonical = canonicalOf({
			what: [{ key: 'zzua1', label: 'Saved', value: 3 }],
			publish: [{ key: 'zzua9', label: 'SavedPub', value: 1 }],
		});
		const merged = await mergeRawIntoCanonical(
			canonical,
			[
				raw({ type: 'what', tipo: 'zzua1', value: 2, label: 'Live' }),
				raw({ type: 'publish', tipo: 'zzua9', value: 4 }),
			],
			LANG,
		);
		expect(merged.what).toHaveLength(1);
		expect(merged.what[0]).toEqual({ key: 'zzua1', label: 'Saved', value: 5 });
		expect(merged.publish).toHaveLength(1);
		expect(merged.publish[0]).toEqual({ key: 'zzua9', label: 'SavedPub', value: 5 });
	});

	test('M5 — new keys are APPENDED after canonical ones, in rawItems order', async () => {
		const canonical = canonicalOf({
			what: [{ key: 'dd700', label: 'Save', value: 1 }],
		});
		const merged = await mergeRawIntoCanonical(
			canonical,
			[
				raw({ type: 'what', tipo: 'zzua5', value: 1, label: 'Five' }),
				raw({ type: 'what', tipo: 'dd700', value: 1, label: 'ignored' }),
				raw({ type: 'what', tipo: 'zzua4', value: 1, label: 'Four' }),
			],
			LANG,
		);
		// This IS the pinned wire order: saved day first, then today's keys in
		// first-encounter order. Any sort()/unshift() breaks it.
		expect(merged.what.map((entry) => entry.key)).toEqual(['dd700', 'zzua5', 'zzua4']);
	});

	test('M6 — value === 0 is DROPPED and creates no key', async () => {
		const merged = await mergeRawIntoCanonical(
			null,
			[
				raw({ type: 'what', tipo: 'zzua1', value: 0, label: 'Zero' }),
				raw({ type: 'where', tipo: 'zzua2', value: 0 }),
				raw({ type: 'publish', tipo: 'zzua3', value: 0 }),
				raw({ type: 'when', hour: 3, value: 0 }),
			],
			LANG,
		);
		// If a zero-valued item created a key, isCanonicalEmpty(merged) turns
		// false, the tier-3 fallback never fires and the widget is blank forever.
		expect(merged.what).toHaveLength(0);
		expect(merged.where).toHaveLength(0);
		expect(merged.publish).toHaveLength(0);
		expect(merged.when.every((entry) => entry.value === 0)).toBe(true);
	});

	test('M7 — hour bounds: <0, >23 and NaN skipped; string hours coerced; 23 accepted', async () => {
		const merged = await mergeRawIntoCanonical(
			null,
			[
				raw({ type: 'when', hour: -1, value: 5 }),
				raw({ type: 'when', hour: 24, value: 5 }),
				raw({ type: 'when', hour: 'x', value: 5 }),
				raw({ type: 'when', hour: '07', value: 3 }),
				raw({ type: 'when', hour: 23, value: 4 }),
				raw({ type: 'when', hour: 0, value: 2 }),
			],
			LANG,
		);
		expect(merged.when).toHaveLength(24);
		expect(merged.when[0]?.value).toBe(2);
		expect(merged.when[7]?.value).toBe(3);
		expect(merged.when[23]?.value).toBe(4);
		// Nothing leaked into another slot and no 25th slot was created.
		expect(merged.when.reduce((sum, entry) => sum + entry.value, 0)).toBe(9);
	});

	test('M8 — a MALFORMED canonical `when` is repaired without losing saved values', async () => {
		const savedSlotZero = { key: '00', label: '00', value: 9 } as unknown as CanonicalEntry;
		const canonical = canonicalOf({
			when: [
				null as unknown as CanonicalEntry,
				{ label: 'no key', value: 4 } as unknown as CanonicalEntry,
				savedSlotZero,
				{ key: 11, label: '11', value: 7 },
			],
		});
		const merged = await mergeRawIntoCanonical(canonical, [], LANG);

		expect(merged.when).toHaveLength(24);
		expect(merged.when.map((entry) => Number(entry.key))).toEqual(
			Array.from({ length: 24 }, (_, i) => i),
		);
		// The saved histogram SURVIVES — by identity, in the right slot.
		expect(merged.when[0]).toBe(savedSlotZero);
		expect(merged.when[0]?.value).toBe(9);
		expect(merged.when[11]?.value).toBe(7);
	});

	test('M8b — the when slots are sorted NUMERICALLY, not lexically', async () => {
		const canonical = canonicalOf({ when: [{ key: 9, label: '09', value: 1 }] });
		const merged = await mergeRawIntoCanonical(canonical, [], LANG);
		// Lexical order would put 10..23 before 9 (and 2 before 10).
		expect(merged.when.map((entry) => Number(entry.key))).toEqual(
			Array.from({ length: 24 }, (_, i) => i),
		);
		expect(merged.when[9]?.value).toBe(1);
	});

	test('M9 — non-array canonical dimensions are REPAIRED to [] instead of throwing', async () => {
		const canonical = {
			who: null,
			what: null,
			where: 'legacy',
			when: undefined,
			publish: 42,
		} as unknown as CanonicalTotals;

		const merged = await mergeRawIntoCanonical(
			canonical,
			[raw({ type: 'what', tipo: 'zzua1', value: 1, label: 'One' })],
			LANG,
		);
		expect(Array.isArray(merged.who)).toBe(true);
		expect(merged.who).toHaveLength(0);
		expect(merged.what).toEqual([{ key: 'zzua1', label: 'One', value: 1 }]);
		expect(merged.where).toEqual([]);
		expect(merged.publish).toEqual([]);
		expect(merged.when).toHaveLength(24);
	});

	test('M10 — the canonical object is returned BY IDENTITY and mutated in place', async () => {
		const canonical = canonicalOf({ what: [{ key: 'zzua1', label: 'Saved', value: 1 }] });
		const merged = await mergeRawIntoCanonical(
			canonical,
			[raw({ type: 'what', tipo: 'zzua1', value: 1, label: 'Live' })],
			LANG,
		);
		// Cloning the return silently changes double-merge semantics; the
		// ActivityDeps-stubbed native gate cannot see that.
		expect(merged).toBe(canonical);
		expect(canonical.what[0]?.value).toBe(2);
	});

	test('M11 — QUIRK PINNED, NOT FIXED: a non-numeric value poisons the entry with NaN', async () => {
		const merged = await mergeRawIntoCanonical(
			null,
			[raw({ type: 'what', tipo: 'zzua1', value: 'abc', label: 'Bad' })],
			LANG,
		);
		// Number('abc') is NaN, NaN === 0 is false, so the item is NOT skipped
		// and the wire carries `null` after JSON.stringify. CURRENT behaviour —
		// changing it is a wire edit, not coverage work (plan §4.4 defect L4).
		expect(merged.what).toHaveLength(1);
		expect(Number.isNaN(merged.what[0]?.value as number)).toBe(true);
	});

	test('M12 — canonical keys are indexed via String(), so a numeric saved key still matches', async () => {
		const canonical = canonicalOf({ what: [{ key: 12, label: 'Twelve', value: 1 }] });
		const merged = await mergeRawIntoCanonical(
			canonical,
			[raw({ type: 'what', tipo: '12', value: 2, label: 'Live' })],
			LANG,
		);
		expect(merged.what).toHaveLength(1);
		expect(merged.what[0]).toEqual({ key: 12, label: 'Twelve', value: 3 });
	});

	test('M13 — `who` is never written, and unknown/malformed raw items are skipped', async () => {
		const canonical = canonicalOf({ who: [{ key: '1', label: 'Admin', value: 4 }] });
		const merged = await mergeRawIntoCanonical(
			canonical,
			[
				raw(null),
				raw('nonsense'),
				raw({ type: 'who', tipo: TERM_TIPO, value: 5 }),
				raw({ type: 'unknown', tipo: TERM_TIPO, value: 5 }),
				raw({ type: 'what', tipo: 12, value: 5 }),
				raw({ type: 'what', tipo: '', value: 5, label: 'Empty' }),
				// Positive control: the loop really ran to the end.
				raw({ type: 'what', tipo: 'zzua1', value: 5, label: 'Kept' }),
			],
			LANG,
		);
		// PHP-faithful: `who` stays exactly as saved (its PHP producer is broken
		// and the retired differential pinned it on both engines).
		expect(merged.who).toEqual([{ key: '1', label: 'Admin', value: 4 }]);
		expect(merged.what).toEqual([{ key: 'zzua1', label: 'Kept', value: 5 }]);
	});
});
