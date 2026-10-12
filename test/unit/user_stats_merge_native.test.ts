/**
 * mergeRawIntoCanonical — the user-activity widget's "today on top of history"
 * operator (src/core/area_maintenance/user_stats.ts). The only place a SAVED
 * aggregate (dd1521 canonical totals) and a LIVE aggregate (raw matrix_activity
 * items) meet. Pure apart from deterministic label lookups (the labels engine
 * for `what` action keys, the ontology term for `where`/`publish` SECTION
 * tipos), so this is a direct-call gate: no fixture, no clock, no DB write.
 *
 * Twin of the retired read-side differential
 * (test/parity/get_widget_data_differential.test.ts, permanently skipped
 * post-cutover — 5 skip / 0 pass). ORACLE_HARVEST's P1 map had no READ-side
 * twin row for this function; this file is it.
 *
 * PAIRING WITH 4.2.2 (getIntervalRawActivityData) — MUTUALLY LOAD-BEARING.
 * M2/M3 below gate the LABEL PRECEDENCE inside the merge (a raw `label` wins;
 * absent, the dimension's resolver answers). That precedence is only exercised in
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
 * WHAT KEYS ARE ACTIONS (WC-2026-10-12-user-activity-what-labels). A `what`
 * entry is keyed by its action ('save', 'login'…) and labelled from the labels
 * engine — never termByTipo: the v7 master reuses the retired label tipos
 * (dd694, dd700…) for other nodes. A legacy PHP-era item keyed by such a tipo
 * is READ through the frozen tipo→action map (M3b/M5b); an unknown one keeps
 * its raw key.
 *
 * DB WRITES: M3b only. Its unknown legacy tipo is a REAL non-label scratch node
 * (zzusm TLD, upsertDdOntologyNode, assertTestDatabase first, deleteTldNodes
 * before and after) whose term differs from its tipo — otherwise "kept raw" is
 * indistinguishable from termByTipo's own absent-tipo fallback. Everything else
 * is read-only.
 *
 * @twin-of      test/parity/get_widget_data_differential.test.ts
 * @twin-status  supplement
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
	type CanonicalEntry,
	type CanonicalTotals,
	LEGACY_WHAT_TIPOS,
	mergeRawIntoCanonical,
	type RawActivityItem,
	WHAT_ACTIONS,
} from '../../src/core/area_maintenance/user_stats.ts';
import { deleteTldNodes, upsertDdOntologyNode } from '../../src/core/db/dd_ontology.ts';
import { getLabels } from '../../src/core/labels/catalog.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';
import { termByTipo } from '../../src/core/ontology/labels.ts';
import { runWithRequestLangs } from '../../src/core/resolve/request_lang.ts';
import { assertTestDatabase } from '../../src/core/test_data/test_database_marker.ts';
import { DB_READY } from '../helpers/db_ready.ts';

const LANG = 'lg-eng';
/**
 * A REAL seed SECTION tipo whose term differs from the tipo string (dd542 =
 * 'Activity') — the kind of key `where`/`publish` carry. Never a label tipo:
 * those are not ontology lookups any more (the term guard refuses them).
 */
const TERM_TIPO = 'dd542';

/**
 * M3b's scratch TLD: one REAL non-label node, so a legacy what tipo that is
 * unknown to the action map EXISTS in the ontology with a term ≠ its tipo.
 */
const SCRATCH_TLD = 'zzusm';
const UNKNOWN_LEGACY_TIPO = `${SCRATCH_TLD}1`;
const UNKNOWN_LEGACY_TERM = 'Scratch non-label node';

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
				raw({ type: 'what', key: 'zzua1', value: 2, label: 'Saved' }),
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

	test('M2 — a raw `label` WINS over the resolved label', async () => {
		// Precondition: the action really does resolve to something else, so a
		// resolver-first mutation is observable.
		expect((await getLabels(LANG)).edit).not.toBe('Custom');

		const merged = await mergeRawIntoCanonical(
			null,
			[raw({ type: 'what', key: 'edit', value: 1, label: 'Custom' })],
			LANG,
		);
		expect(merged.what).toEqual([{ key: 'edit', label: 'Custom', value: 1 }]);
	});

	test('M3 — no raw label FALLS BACK: where → ontology term, what → labels engine', async () => {
		// In-test preconditions: fail loudly if either source stops carrying a
		// text, which would make the case vacuous (both fall back to the key).
		const term = await termByTipo(TERM_TIPO, LANG);
		expect(term).not.toBe(TERM_TIPO);
		const editLabel = (await getLabels(LANG)).edit;
		expect(editLabel).toBeString();
		expect(editLabel).not.toBe('edit');

		// `where` items are produced WITHOUT a label — see the 4.2.2 pairing note.
		// Both langs pinned: what labels follow the APPLICATION lang (M3c).
		const merged = await runWithRequestLangs({ applicationLang: LANG, dataLang: LANG }, () =>
			mergeRawIntoCanonical(
				null,
				[
					raw({ type: 'where', tipo: TERM_TIPO, value: 2 }),
					raw({ type: 'what', key: 'edit', value: 1 }),
				],
				LANG,
			),
		);
		expect(merged.where).toEqual([{ key: TERM_TIPO, label: term, value: 2 }]);
		expect(merged.what).toEqual([{ key: 'edit', label: editLabel as string, value: 1 }]);
	});

	describe.if(DB_READY)('M3b (scratch ontology node)', () => {
		beforeAll(async () => {
			await assertTestDatabase('user_stats_merge_native');
			await deleteTldNodes(SCRATCH_TLD);
			await upsertDdOntologyNode({
				tipo: UNKNOWN_LEGACY_TIPO,
				model: 'component_input',
				tld: SCRATCH_TLD,
				term: { 'lg-spa': UNKNOWN_LEGACY_TERM, [LANG]: UNKNOWN_LEGACY_TERM },
			});
			await clearOntologyDerivedCaches();
		});

		afterAll(async () => {
			await deleteTldNodes(SCRATCH_TLD);
			await clearOntologyDerivedCaches();
		});

		test('M3b — a LEGACY tipo-keyed what item is read as its action; an unknown tipo keeps its raw key', async () => {
			// PHP-era rows keyed what items by the label TIPO (dd694 = edit). The
			// merge maps it, never resolves it — and an unmapped tipo is kept raw,
			// labelled with itself (never dropped, never sent to the ontology).
			const spanish = await getLabels('lg-spa');
			expect(spanish.edit).toBeString();
			expect(spanish.edit).not.toBe((await getLabels(LANG)).edit);
			// DISCRIMINATING precondition: the unknown tipo is a real node whose
			// term differs from the tipo, so an ontology fall-through would show.
			expect(await termByTipo(UNKNOWN_LEGACY_TIPO, 'lg-spa')).toBe(UNKNOWN_LEGACY_TERM);

			const merged = await runWithRequestLangs(
				{ applicationLang: 'lg-spa', dataLang: 'lg-spa' },
				() =>
					mergeRawIntoCanonical(
						null,
						[
							raw({ type: 'what', tipo: 'dd694', value: 2 }),
							raw({ type: 'what', tipo: UNKNOWN_LEGACY_TIPO, value: 1 }),
						],
						'lg-spa',
					),
			);
			expect(merged.what).toEqual([
				{ key: 'edit', label: spanish.edit as string, value: 2 },
				{ key: UNKNOWN_LEGACY_TIPO, label: UNKNOWN_LEGACY_TIPO, value: 1 },
			]);
		});
	});

	test('M3c — application lang ≠ data lang: what → APPLICATION lang, where → DATA lang', async () => {
		// The raw tail (getIntervalRawActivityData) bakes what labels in the
		// application lang; a merged-in key resolved here must use the same one,
		// or one chart mixes two languages. `lang` (data lang) stays for where.
		const app = 'lg-ita';
		const data = 'lg-spa';
		const italian = (await getLabels(app)).edit;
		const spanish = (await getLabels(data)).edit;
		// precondition: the two langs really differ for this key
		expect(italian).toBeString();
		expect(italian).not.toBe(spanish);
		const term = await termByTipo(TERM_TIPO, data);

		const merged = await runWithRequestLangs({ applicationLang: app, dataLang: data }, () =>
			mergeRawIntoCanonical(
				null,
				[
					raw({ type: 'where', tipo: TERM_TIPO, value: 1 }),
					raw({ type: 'what', key: 'edit', value: 1 }),
					raw({ type: 'what', tipo: 'dd694', value: 1 }),
				],
				data,
			),
		);
		expect(merged.what).toEqual([{ key: 'edit', label: italian as string, value: 2 }]);
		expect(merged.where).toEqual([{ key: TERM_TIPO, label: term, value: 1 }]);
	});

	test('M4 — an EXISTING key accumulates into one entry and keeps the saved label', async () => {
		const canonical = canonicalOf({
			what: [{ key: 'zzua1', label: 'Saved', value: 3 }],
			publish: [{ key: 'zzua9', label: 'SavedPub', value: 1 }],
		});
		const merged = await mergeRawIntoCanonical(
			canonical,
			[
				raw({ type: 'what', key: 'zzua1', value: 2, label: 'Live' }),
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
			what: [{ key: 'save', label: 'Save', value: 1 }],
		});
		const merged = await mergeRawIntoCanonical(
			canonical,
			[
				raw({ type: 'what', key: 'zzua5', value: 1, label: 'Five' }),
				raw({ type: 'what', key: 'save', value: 1, label: 'ignored' }),
				raw({ type: 'what', key: 'zzua4', value: 1, label: 'Four' }),
			],
			LANG,
		);
		// This IS the pinned wire order: saved day first, then today's keys in
		// first-encounter order. Any sort()/unshift() breaks it.
		expect(merged.what.map((entry) => entry.key)).toEqual(['save', 'zzua5', 'zzua4']);
		expect(merged.what[0]).toEqual({ key: 'save', label: 'Save', value: 2 });
	});

	test('M5b — a legacy tipo-keyed item folds INTO the canonical action entry, not beside it', async () => {
		const canonical = canonicalOf({
			what: [{ key: 'save', label: 'Save', value: 1 }],
		});
		const merged = await mergeRawIntoCanonical(
			canonical,
			[raw({ type: 'what', tipo: 'dd700', value: 2 })],
			LANG,
		);
		// One generation, one entry: dd700 is 'save' (old rows and new rows of the
		// same action must never split the chart into two bars).
		expect(merged.what).toEqual([{ key: 'save', label: 'Save', value: 3 }]);
	});

	test('M6 — value === 0 is DROPPED and creates no key', async () => {
		const merged = await mergeRawIntoCanonical(
			null,
			[
				raw({ type: 'what', key: 'zzua1', value: 0, label: 'Zero' }),
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
			[raw({ type: 'what', key: 'zzua1', value: 1, label: 'One' })],
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
			[raw({ type: 'what', key: 'zzua1', value: 1, label: 'Live' })],
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
			[raw({ type: 'what', key: 'zzua1', value: 'abc', label: 'Bad' })],
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
			[raw({ type: 'what', key: '12', value: 2, label: 'Live' })],
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
				raw({ type: 'what', key: 12, value: 5 }),
				raw({ type: 'what', tipo: 12, value: 5 }),
				raw({ type: 'what', key: '', value: 5, label: 'Empty' }),
				raw({ type: 'what', value: 5, label: 'Neither' }),
				// Positive control: the loop really ran to the end.
				raw({ type: 'what', key: 'zzua1', value: 5, label: 'Kept' }),
			],
			LANG,
		);
		// PHP-faithful: `who` stays exactly as saved (its PHP producer is broken
		// and the retired differential pinned it on both engines).
		expect(merged.who).toEqual([{ key: '1', label: 'Admin', value: 4 }]);
		expect(merged.what).toEqual([{ key: 'zzua1', label: 'Kept', value: 5 }]);
	});
});

// ---------------------------------------------------------------------------
// THE TWO TABLES (hermetic): every what action is labelled from a key the
// labels engine DEFINES, and the legacy fold covers exactly the same actions.
// ---------------------------------------------------------------------------

describe('WHAT_ACTIONS / LEGACY_WHAT_TIPOS tables', () => {
	const masterKeys = new Set(
		Object.keys(
			JSON.parse(
				readFileSync(new URL('../../src/core/labels/master.json', import.meta.url), 'utf-8'),
			) as Record<string, unknown>,
		),
	);
	const entries = Object.entries(WHAT_ACTIONS);
	const actions = entries.map(([, entry]) => entry.action);

	test('T1 — exactly the 16 activity codes 1..16, each a distinct action', () => {
		expect(entries.map(([code]) => code)).toEqual(
			Array.from({ length: 16 }, (_, i) => String(i + 1)),
		);
		expect(new Set(actions).size).toBe(16);
	});

	test('T2 — every labelKey is a src/core/labels/master.json key', () => {
		expect(masterKeys.size).toBeGreaterThan(16); // anti-vacuity: the master really parsed
		const missing = entries
			.filter(([, entry]) => !masterKeys.has(entry.labelKey))
			.map(([code, entry]) => `${code}: ${entry.labelKey}`);
		expect(missing).toEqual([]);
	});

	test('T3 — LEGACY_WHAT_TIPOS covers exactly the WHAT_ACTIONS action set, one tipo each', () => {
		const legacyActions = Object.values(LEGACY_WHAT_TIPOS);
		expect(legacyActions.length).toBe(16);
		expect([...new Set(legacyActions)].sort()).toEqual([...actions].sort());
	});

	test('T4 — both tables are read-only all the way down', () => {
		expect(Object.isFrozen(WHAT_ACTIONS)).toBe(true);
		expect(Object.isFrozen(LEGACY_WHAT_TIPOS)).toBe(true);
		for (const [code, entry] of entries) {
			expect({ code, frozen: Object.isFrozen(entry) }).toEqual({ code, frozen: true });
		}
	});
});
