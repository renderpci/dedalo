/**
 * Observer reconcile — the CLASSIFIER and the DISCOVERY halves, gated pure.
 *
 * Sibling files, different subjects: `observer_reconcile_native.test.ts` gates
 * the kernel's one-record law against the suite DB, and
 * `observer_reconcile_sweep_native.test.ts` gates a real scratch sweep. This
 * file gates the two decision surfaces the sweep is built out of — which
 * declared edges become tuples, and what ONE kernel outcome does to the
 * census/counters/report — with a fully stubbed `ReconcileIO`: no DB, no
 * ontology, no writes (scratch namespace: none needed).
 *
 * It also SOURCE-ASSERTS the rewire: the extracted logic must exist exactly
 * once, above the orchestrator, and the orchestrator must call it. A revert
 * that re-inlines the classifier turns this RED even if every behaviour
 * expectation is still satisfiable by the inline copy.
 */
// BINDS INSTALL TLDs: dc, numisdata, rsc, tchi — install-specific fixtures, grandfathered in
// engineering/generic_tld_baseline.json (generic_tld_tripwire, shrink-only). This test
// is meaningful only on a database holding those installs' records. Migrate it to a
// built situation (src/core/test_data/situations) or the generic `test` TLD, then
// regenerate the baseline (`bun run scripts/generic_tld_baseline.ts`).

import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getCounters } from '../../src/core/api/counters.ts';
import {
	classifyReconcileOutcome,
	type ExternalRecomputeOutcome,
	expandTuplesByIndexSections,
	type ReconcileIO,
	type ReconcileRecord,
	type ReconcileTuple,
	reconcileObserverMirrors,
	selectReconcileTuples,
} from '../../src/core/section/record/observer_reconcile.ts';
import type {
	ObserveEntry,
	ObserverSubscription,
	SubscriptionIndex,
} from '../../src/core/section/record/observer_subscriptions.ts';

const REPO_ROOT = join(import.meta.dir, '../..');
const RECONCILE_SOURCE = readFileSync(
	join(REPO_ROOT, 'src/core/section/record/observer_reconcile.ts'),
	'utf-8',
);

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

/** The ONE covered server shape: use_observable_dato + set_dato_external. */
function coveredEntry(): ObserveEntry {
	return {
		component_tipo: 'obs1',
		server: {
			config: { use_observable_dato: true },
			perform: { function: 'set_dato_external' },
		},
	};
}

function edge(over: Partial<ObserverSubscription> = {}): ObserverSubscription {
	return {
		observedTipo: 'observed1',
		observerTipo: 'observer1',
		declaration: 'reverse-only',
		viaWildcard: false,
		entry: coveredEntry(),
		hostSection: 'host1',
		...over,
	};
}

function tuple(over: Partial<ReconcileTuple> = {}): ReconcileTuple {
	return {
		observedTipo: 'observed1',
		observerTipo: 'observer1',
		hostSection: 'host1',
		componentToSearch: 'C',
		sectionToSearch: 'all',
		sublaw: null,
		...over,
	};
}

function outcome(over: Partial<ExternalRecomputeOutcome> = {}): ExternalRecomputeOutcome {
	return { changed: true, before: 0, after: 0, ...over };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. classifyReconcileOutcome — the per-candidate adjudication
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyReconcileOutcome', () => {
	test('unchanged outcome: nothing drifted, nothing counted, nothing logged', () => {
		const verdict = classifyReconcileOutcome(
			outcome({ changed: false, before: 7, after: 7 }),
			tuple(),
			5,
			true,
		);
		expect(verdict.drifted).toBe(false);
		expect(verdict.record).toBeNull();
		expect(verdict.log).toBeNull();
		expect(verdict.counted).toEqual({
			droppedRecords: 0,
			droppedLocators: 0,
			degradedSeedRecords: 0,
			bigResultRefused: 0,
			shrinksSkipped: 0,
			repaired: 0,
		});
	});

	test('>2000-reference FREEZE is drifted, counted as refused, and NEVER repaired', () => {
		// The PHP freeze: the kernel computed the diff and persisted nothing.
		const verdict = classifyReconcileOutcome(
			outcome({ before: 4547, after: 4600, dropped: 0, added: 53, refusedBigResult: true }),
			tuple({ hostSection: 'rsc167', observerTipo: 'rsc387' }),
			91,
			true,
		);
		expect(verdict.drifted).toBe(true);
		expect(verdict.counted.bigResultRefused).toBe(1);
		expect(verdict.counted.repaired).toBe(0);
		expect(verdict.counted.droppedRecords).toBe(0);
		expect(verdict.counted.droppedLocators).toBe(0);
		expect(verdict.record?.refusal).toBe('big_result');
		expect(verdict.record?.added).toBe(53);
		expect(verdict.log).toContain('>2000-reference FREEZE');
		expect(verdict.log).toContain('not written');
	});

	test('freeze in DRY RUN says "an apply would refuse", not "not written"', () => {
		const verdict = classifyReconcileOutcome(
			outcome({ before: 4547, after: 4600, dropped: 0, added: 53, refusedBigResult: true }),
			tuple(),
			91,
			false,
		);
		expect(verdict.log).toContain('an apply would refuse');
		expect(verdict.log).not.toContain('not written');
	});

	test('DEGRADED SEED: shrink held, drops still counted, nothing repaired', () => {
		// Corrected input — observers.ts only sets skippedShrink when it actually
		// withheld drops (`withheld = dropped > 0 && defects.length > 0`), so a
		// `dropped:0` degraded-seed outcome is unreachable. The drop counters are
		// what the shrink budget adjudicates, so they MUST move here too.
		const verdict = classifyReconcileOutcome(
			outcome({
				before: 1077,
				after: 960,
				dropped: 117,
				added: 0,
				skippedShrink: true,
				seedDefects: ['peer_node_missing:numisdata36'],
			}),
			tuple({ hostSection: 'rsc205', observerTipo: 'rsc387' }),
			91098,
			true,
		);
		expect(verdict.drifted).toBe(true);
		expect(verdict.counted.shrinksSkipped).toBe(1);
		expect(verdict.counted.repaired).toBe(0);
		expect(verdict.counted.degradedSeedRecords).toBe(1);
		expect(verdict.counted.droppedRecords).toBe(1);
		expect(verdict.counted.droppedLocators).toBe(117);
		expect(verdict.counted.bigResultRefused).toBe(0);
		expect(verdict.record?.refusal).toBe('degraded_seed');
		expect(verdict.record?.seedDefects).toEqual(['peer_node_missing:numisdata36']);
		expect(verdict.log).toContain('SHRINK held — DEGRADED SEED: peer_node_missing:numisdata36');
		expect(verdict.log).toContain('grows applied');
	});

	test('MASKED SWAP: equal length, membership counts still report the 2 drops', () => {
		// The exact regression shape the budget exists to catch — `before - after`
		// is 0 here, so a length-delta census would sail straight through.
		const verdict = classifyReconcileOutcome(
			outcome({ before: 3, after: 3, dropped: 2, added: 2 }),
			tuple(),
			1,
			true,
		);
		expect(verdict.counted.droppedLocators).toBe(2);
		expect(verdict.counted.droppedRecords).toBe(1);
		expect(verdict.record?.dropped).toBe(2);
		expect(verdict.record?.added).toBe(2);
		expect(verdict.counted.repaired).toBe(1);
		expect(verdict.log).not.toContain('[shrink]');
		expect(verdict.log).toContain('[repaired]');
	});

	test('LEGACY outcome without membership counts falls back to the length delta', () => {
		const verdict = classifyReconcileOutcome(outcome({ before: 5, after: 2 }), tuple(), 1, false);
		expect(verdict.record?.dropped).toBe(3);
		expect(verdict.record?.added).toBe(0);
		expect(verdict.counted.droppedRecords).toBe(1);
		expect(verdict.counted.droppedLocators).toBe(3);
		// Dry run: never repaired, and the shrink marker is on the line.
		expect(verdict.counted.repaired).toBe(0);
		expect(verdict.log).toContain('[shrink]');
		expect(verdict.log).not.toContain('[repaired]');
	});

	test('legacy GROW-only fallback clamps at 0 — Math.max, not a negative drop', () => {
		const verdict = classifyReconcileOutcome(outcome({ before: 2, after: 5 }), tuple(), 1, false);
		expect(verdict.record?.dropped).toBe(0);
		expect(verdict.record?.added).toBe(3);
		expect(verdict.counted.droppedRecords).toBe(0);
	});

	test('clean apply: repaired 1; the same outcome dry-run: repaired 0', () => {
		const clean = outcome({ before: 1, after: 2, dropped: 0, added: 1 });
		expect(classifyReconcileOutcome(clean, tuple(), 1, true).counted.repaired).toBe(1);
		expect(classifyReconcileOutcome(clean, tuple(), 1, false).counted.repaired).toBe(0);
	});

	test('refusal precedence: big_result wins over a simultaneous skippedShrink', () => {
		const verdict = classifyReconcileOutcome(
			outcome({
				before: 10,
				after: 4,
				dropped: 6,
				added: 0,
				refusedBigResult: true,
				skippedShrink: true,
				seedDefects: ['x'],
			}),
			tuple(),
			1,
			true,
		);
		expect(verdict.record?.refusal).toBe('big_result');
		expect(verdict.counted.bigResultRefused).toBe(1);
		expect(verdict.counted.shrinksSkipped).toBe(0);
	});

	test('no seedDefects key at all when the kernel reported none', () => {
		const verdict = classifyReconcileOutcome(outcome({ before: 1, after: 2 }), tuple(), 1, false);
		expect(Object.hasOwn(verdict.record as ReconcileRecord, 'seedDefects')).toBe(false);
		expect(Object.hasOwn(verdict.record as ReconcileRecord, 'refusal')).toBe(false);
	});

	test('the report line carries the tuple/record identity verbatim', () => {
		const verdict = classifyReconcileOutcome(
			outcome({ before: 1, after: 2 }),
			tuple({ hostSection: 'dc1', observerTipo: 'hierarchy93' }),
			58,
			false,
		);
		expect(verdict.log).toBe('  dc1 §58 hierarchy93: 1 → 2 entrie(s)');
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. selectReconcileTuples — the pure edge → tuple law
// ─────────────────────────────────────────────────────────────────────────────

const SOURCE_WITH_C = (): unknown => ({ component_to_search: ['C'] });

describe('selectReconcileTuples', () => {
	test('only the COVERED server shape reconciles (the four shapes differ ONLY in `server`)', () => {
		// Every other field is identical on purpose: same hostSection, same
		// observerTipo family, same source. If the shape filter were removed,
		// (b)/(c)/(d) would survive — they cannot die at the
		// `typeof componentToSearch !== 'string'` skip, because they all have one.
		const edges: ObserverSubscription[] = [
			edge({ observerTipo: 'a' }),
			edge({
				observerTipo: 'b',
				entry: {
					component_tipo: 'obs1',
					server: {
						config: { use_observable_dato: false },
						perform: { function: 'set_dato_external' },
					},
				},
			}),
			edge({
				observerTipo: 'c',
				entry: {
					component_tipo: 'obs1',
					server: { config: { use_observable_dato: true }, perform: { function: 'relay' } },
				},
			}),
			edge({ observerTipo: 'd', entry: { component_tipo: 'obs1' } }),
		];
		const { tuples } = selectReconcileTuples(edges, SOURCE_WITH_C, null);
		expect(tuples.length).toBe(1);
		expect(tuples[0]?.observerTipo).toBe('a');
		expect(tuples[0]?.componentToSearch).toBe('C');
		expect(tuples[0]?.sectionToSearch).toBe('all');
		expect(tuples[0]?.sublaw).toBeNull();
	});

	test('sub-law detection runs BEFORE component_to_search — the tuple surfaces refused', () => {
		const a = selectReconcileTuples([edge()], () => ({ source_overwrite: true }), null);
		expect(a.tuples.length).toBe(1);
		expect(a.tuples[0]?.sublaw).toBe('source_overwrite');
		expect(a.tuples[0]?.componentToSearch).toBe('');

		const b = selectReconcileTuples(
			[edge()],
			() => ({ set_observed_data: {}, component_to_search: ['numisdata161'] }),
			null,
		);
		expect(b.tuples[0]?.sublaw).toBe('set_observed_data');
		expect(b.tuples[0]?.componentToSearch).toBe('numisdata161');
	});

	test('set_observed_data wins over source_overwrite (declared key order)', () => {
		const { tuples } = selectReconcileTuples(
			[edge()],
			() => ({ source_overwrite: true, set_observed_data: {} }),
			null,
		);
		expect(tuples[0]?.sublaw).toBe('set_observed_data');
	});

	test('MALFORMED scalar source: no sub-law, no tuple, no throw', () => {
		for (const bad of ['some string', 42, null, undefined, true]) {
			const { tuples, hostUnresolved } = selectReconcileTuples([edge()], () => bad, null);
			expect(tuples).toEqual([]);
			expect(hostUnresolved).toEqual([]);
		}
	});

	test('an ARRAY source is an object but carries neither sub-law key nor a component', () => {
		const { tuples } = selectReconcileTuples([edge()], () => ['set_observed_data'], null);
		expect(tuples).toEqual([]);
	});

	test('component_to_search as a bare STRING is accepted (not only the array form)', () => {
		const { tuples } = selectReconcileTuples(
			[edge()],
			() => ({ component_to_search: 'C', section_to_search: ['s1', 's2'] }),
			null,
		);
		expect(tuples[0]?.componentToSearch).toBe('C');
		expect(tuples[0]?.sectionToSearch).toEqual(['s1', 's2']);
	});

	test('UNRESOLVED host: no tuple, but returned loudly as `observed->observer`', () => {
		const { tuples, hostUnresolved } = selectReconcileTuples(
			[
				edge({
					hostSection: undefined,
					observedTipo: 'numisdata282',
					observerTipo: 'numisdata321',
				}),
			],
			SOURCE_WITH_C,
			null,
		);
		expect(tuples).toEqual([]);
		expect(hostUnresolved).toEqual(['numisdata282->numisdata321']);
	});

	test('dedup on observerTipo|hostSection — the FIRST edge wins', () => {
		const { tuples } = selectReconcileTuples(
			[
				edge({ observedTipo: 'first' }),
				edge({ observedTipo: 'second' }),
				edge({ observedTipo: 'third', hostSection: 'host2' }),
			],
			SOURCE_WITH_C,
			null,
		);
		expect(tuples.map((t) => `${t.observedTipo}@${t.hostSection}`)).toEqual([
			'first@host1',
			'third@host2',
		]);
	});

	test('onlyObserver filters by observer tipo', () => {
		const edges = [edge({ observerTipo: 'keep' }), edge({ observerTipo: 'drop' })];
		const { tuples } = selectReconcileTuples(edges, SOURCE_WITH_C, 'keep');
		expect(tuples.map((t) => t.observerTipo)).toEqual(['keep']);
	});

	test('an unresolved host is reported even when onlyObserver would exclude it', () => {
		// Order matters: the never-narrow signal fires BEFORE the --observer
		// filter, so an operator narrowing a run still sees the broken edge.
		const { tuples, hostUnresolved } = selectReconcileTuples(
			[edge({ observerTipo: 'other', hostSection: undefined })],
			SOURCE_WITH_C,
			'keep',
		);
		expect(tuples).toEqual([]);
		expect(hostUnresolved).toEqual(['observed1->other']);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. expandTuplesByIndexSections — the index-truth fan-out
// ─────────────────────────────────────────────────────────────────────────────

describe('expandTuplesByIndexSections', () => {
	test('index faces are unioned in, originals kept, already-seen keys skipped', async () => {
		const seed = [tuple({ hostSection: 'numisdata276', componentToSearch: 'C' })];
		const out = await expandTuplesByIndexSections(seed, async () => [
			'numisdata276', // already seen — must not duplicate
			'numisdata5',
			'tchi1',
			'numisdata5', // duplicate inside one result set
		]);
		expect(out.map((t) => t.hostSection)).toEqual(['numisdata276', 'numisdata5', 'tchi1']);
		// The fan-out clones every other field verbatim.
		expect(out[1]?.componentToSearch).toBe('C');
		expect(out[1]?.observedTipo).toBe('observed1');
	});

	test('SUB-LAW tuples are never fanned out — even with a real component_to_search', async () => {
		// The corrected shape: give the refused tuple a NON-EMPTY
		// componentToSearch whose index knows two sections. Deleting the
		// `if (tuple.sublaw !== null) continue` guard therefore ADDS tuples.
		const calls: string[] = [];
		const out = await expandTuplesByIndexSections(
			[tuple({ sublaw: 'set_observed_data', componentToSearch: 'numisdata161' })],
			async (component) => {
				calls.push(component);
				return ['numisdata5', 'tchi1'];
			},
		);
		expect(out.length).toBe(1);
		expect(out[0]?.hostSection).toBe('host1');
		expect(calls).toEqual([]);
	});

	test('an index-seeded tuple is NOT re-expanded (only the input list is walked)', async () => {
		const seen: string[] = [];
		await expandTuplesByIndexSections([tuple({ componentToSearch: 'C' })], async (component) => {
			seen.push(component);
			return ['s1', 's2'];
		});
		// One lookup for the ONE input tuple — not three.
		expect(seen).toEqual(['C']);
	});

	test('two tuples sharing an observer dedupe against each other', async () => {
		const out = await expandTuplesByIndexSections(
			[tuple({ hostSection: 'h1' }), tuple({ hostSection: 'h2' })],
			async () => ['h3'],
		);
		expect(out.map((t) => t.hostSection)).toEqual(['h1', 'h2', 'h3']);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. reconcileObserverMirrors — the orchestrator, over a stubbed IO
// ─────────────────────────────────────────────────────────────────────────────

interface Spy {
	candidateIdsCalls: number;
	recomputeCalls: { id: number; opts: { write: boolean }; userId: number }[];
}

function stubIO(
	over: Partial<ReconcileIO>,
	spy: Spy,
	edges: ObserverSubscription[],
	source: unknown = SOURCE_WITH_C(),
): ReconcileIO {
	return {
		getRegistry: async (): Promise<SubscriptionIndex> => ({
			byObserved: new Map(),
			edges,
			diagnostics: {
				mirroredServer: [],
				reverseOnly: [],
				forwardOnly: [],
				deadWildcards: [],
				wildcardCompiled: new Map(),
				hostUnresolved: [],
				cycles: [],
				malformedSpecs: [],
				malformedServerEntries: [],
			},
		}),
		getNodeProperties: async () => ({ source }) as Record<string, unknown>,
		indexSectionsFor: async () => [],
		matrixTableFor: async () => 'matrix_test',
		candidateIds: async () => {
			spy.candidateIdsCalls++;
			return [1];
		},
		recompute: async (_observer, _host, id, userId, _at, opts) => {
			spy.recomputeCalls.push({ id, opts, userId });
			return outcome({ changed: false });
		},
		...over,
	};
}

function freshSpy(): Spy {
	return { candidateIdsCalls: 0, recomputeCalls: [] };
}

describe('reconcileObserverMirrors (stubbed IO)', () => {
	test('SUB-LAW tuple: refused wholesale — never swept, never reported clean', async () => {
		const spy = freshSpy();
		const lines: string[] = [];
		const summary = await reconcileObserverMirrors(
			{ log: (line) => lines.push(line) },
			stubIO({}, spy, [edge()], { set_observed_data: {}, component_to_search: ['numisdata161'] }),
		);
		expect(summary.tuples).toBe(1);
		expect(summary.sublawRefused).toBe(1);
		expect(summary.candidates).toBe(0);
		expect(summary.drifted).toBe(0);
		expect(spy.candidateIdsCalls).toBe(0);
		expect(spy.recomputeCalls.length).toBe(0);
		expect(lines.join('\n')).toContain('REFUSED');
		expect(lines.join('\n')).toContain('set_observed_data');
	});

	test('UNPROVISIONED host: the tuple exists but is skipped loudly, nothing recomputed', async () => {
		const spy = freshSpy();
		const lines: string[] = [];
		const summary = await reconcileObserverMirrors(
			{ log: (line) => lines.push(line) },
			stubIO({ matrixTableFor: async () => null }, spy, [edge()]),
		);
		// tuples === 1 as well as candidates === 0: a stub that discovered
		// nothing at all cannot pass this.
		expect(summary.tuples).toBe(1);
		expect(summary.candidates).toBe(0);
		expect(spy.recomputeCalls.length).toBe(0);
		expect(lines.join('\n')).toContain('SKIP (no matrix table');
	});

	test('DRY RUN IS THE DEFAULT: recompute is called with { write: false }', async () => {
		const spy = freshSpy();
		await reconcileObserverMirrors({}, stubIO({}, spy, [edge()]));
		expect(spy.recomputeCalls.length).toBe(1);
		expect(spy.recomputeCalls[0]?.opts).toEqual({ write: false });
		// The sweep always acts as the SYSTEM user.
		expect(spy.recomputeCalls[0]?.userId).toBe(-1);
	});

	test('apply:true threads { write: true }; any other truthy-ish value does NOT', async () => {
		const applied = freshSpy();
		await reconcileObserverMirrors({ apply: true }, stubIO({}, applied, [edge()]));
		expect(applied.recomputeCalls[0]?.opts).toEqual({ write: true });

		const coerced = freshSpy();
		await reconcileObserverMirrors(
			{ apply: 1 as unknown as boolean },
			stubIO({}, coerced, [edge()]),
		);
		expect(coerced.recomputeCalls[0]?.opts).toEqual({ write: false });
	});

	test('onlySection matches a face reachable ONLY through the index fan-out', async () => {
		// The registry never yields `numisdata5`; only indexSectionsFor does. A
		// filter applied before the fan-out would return 0 tuples here — the exact
		// regression the "--section filters LAST" comment describes.
		const spy = freshSpy();
		const summary = await reconcileObserverMirrors(
			{ onlySection: 'numisdata5' },
			stubIO({ indexSectionsFor: async () => ['numisdata5', 'tchi1'] }, spy, [
				edge({ hostSection: 'numisdata276' }),
			]),
		);
		expect(summary.tuples).toBe(1);
		expect(spy.recomputeCalls.length).toBe(1);
	});

	test('census + counters aggregate across candidates, and onRecord fires per drifted record', async () => {
		const spy = freshSpy();
		const records: ReconcileRecord[] = [];
		const lines: string[] = [];
		const outcomes: Record<number, ExternalRecomputeOutcome> = {
			1: outcome({ changed: false }),
			2: outcome({ before: 3, after: 3, dropped: 2, added: 2 }),
			3: outcome({
				before: 1077,
				after: 960,
				dropped: 117,
				added: 0,
				skippedShrink: true,
				seedDefects: ['peer_node_missing:numisdata36'],
			}),
			4: outcome({ before: 4547, after: 4600, dropped: 0, added: 53, refusedBigResult: true }),
			5: outcome({ before: 1, after: 2, dropped: 0, added: 1 }),
		};
		const summary = await reconcileObserverMirrors(
			{ apply: true, log: (line) => lines.push(line), onRecord: (r) => records.push(r) },
			stubIO(
				{
					candidateIds: async () => [1, 2, 3, 4, 5],
					recompute: async (_o, _h, id, _u, _a, opts) => {
						spy.recomputeCalls.push({ id, opts, userId: _u });
						const found = outcomes[id];
						if (found === undefined) throw new Error(`no fixture outcome for id ${id}`);
						return found;
					},
				},
				spy,
				[edge()],
			),
		);
		expect(summary.candidates).toBe(5);
		expect(summary.drifted).toBe(4);
		expect(summary.repaired).toBe(2); // the swap + the clean grow
		expect(summary.shrinksSkipped).toBe(1);
		expect(summary.bigResultRefused).toBe(1);
		expect(summary.degradedSeedRecords).toBe(1);
		expect(summary.droppedRecords).toBe(2); // the swap (2) + the held shrink (117)
		expect(summary.droppedLocators).toBe(119);
		expect(records.map((r) => r.sectionId)).toEqual([2, 3, 4, 5]);
		expect(records.map((r) => r.refusal)).toEqual([
			undefined,
			'degraded_seed',
			'big_result',
			undefined,
		]);
		// The per-tuple tail line reports the skipped shrink count.
		expect(lines.at(-1)).toBe(
			'- observer1 @ host1 (← observed1): 5 candidate(s), 4 drifted (1 shrink(s) skipped), repaired',
		);
	});

	test('an UNRESOLVED host bumps observers_host_section_unresolved', async () => {
		const before = getCounters().observers_host_section_unresolved ?? 0;
		const summary = await reconcileObserverMirrors(
			{},
			stubIO({}, freshSpy(), [edge({ hostSection: undefined })]),
		);
		expect(summary.tuples).toBe(0);
		// Delta, never a global absolute — other suites share this counter.
		expect((getCounters().observers_host_section_unresolved ?? 0) - before).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. THE REWIRE (static) — the extraction must be the code that RUNS
// ─────────────────────────────────────────────────────────────────────────────

describe('observer reconcile extraction is rewired (static)', () => {
	const orchestratorAt = RECONCILE_SOURCE.indexOf('export async function reconcileObserverMirrors');
	const discoveryAt = RECONCILE_SOURCE.indexOf('async function discoverTuples');

	test('the orchestrator CALLS the extracted functions', () => {
		expect(orchestratorAt).toBeGreaterThan(-1);
		const orchestrator = RECONCILE_SOURCE.slice(orchestratorAt);
		expect(orchestrator).toContain('classifyReconcileOutcome(outcome, tuple, id, apply)');
		const discovery = RECONCILE_SOURCE.slice(discoveryAt, orchestratorAt);
		expect(discovery).toContain('selectReconcileTuples(');
		expect(discovery).toContain('expandTuplesByIndexSections(');
	});

	for (const marker of [
		// classifier internals
		'outcome.dropped ??',
		'outcome.added ??',
		"refusal: 'big_result'",
		'>2000-reference FREEZE',
		'SHRINK held — DEGRADED SEED',
		// discovery internals
		'use_observable_dato !== true',
		"['set_observed_data', 'source_overwrite']",
		"if (sublaw === null && typeof componentToSearch !== 'string') continue;",
		'SELECT DISTINCT target_section_tipo',
	]) {
		test(`inline copy of \`${marker}\` is GONE — it exists once, above the orchestrator`, () => {
			const occurrences = RECONCILE_SOURCE.split(marker).length - 1;
			expect(
				occurrences,
				`\`${marker}\` must appear exactly once (inside the extracted function), found ${occurrences}`,
			).toBe(1);
			expect(
				RECONCILE_SOURCE.indexOf(marker),
				`\`${marker}\` is still inline in the orchestrator — the extraction is not wired`,
			).toBeLessThan(orchestratorAt);
		});
	}

	test('the orchestrator no longer calls the kernel/registry/DB directly — only the IO', () => {
		const orchestrator = RECONCILE_SOURCE.slice(orchestratorAt);
		expect(orchestrator).toContain('io.recompute(');
		expect(orchestrator).toContain('io.candidateIds(');
		expect(orchestrator).toContain('io.matrixTableFor(');
		expect(orchestrator).not.toContain('recomputeExternalRelation(');
		expect(orchestrator).not.toContain('getMatrixTableFromTipo(');
		expect(orchestrator).not.toContain('sql.unsafe(');
	});

	test('the injected IO defaults to the real one — callers stay unchanged', () => {
		expect(RECONCILE_SOURCE).toContain('io: ReconcileIO = defaultReconcileIO');
		// Both production callers still pass options only.
		const cli = readFileSync(join(REPO_ROOT, 'scripts/observer_reconcile.ts'), 'utf-8');
		expect(cli).toContain('reconcileObserverMirrors({');
		const updater = readFileSync(join(REPO_ROOT, 'src/core/update/engine.ts'), 'utf-8');
		expect(updater).toContain('reconcileObserverMirrors({');
	});
});
