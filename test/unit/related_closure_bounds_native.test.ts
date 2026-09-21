/**
 * THE RELATION CLOSURE IS CHEAP AND BOUNDED (audit PERF-04).
 *
 * `relations/related.ts getReferencesRecursive` walks the equivalence class of
 * a `component_relation_related` node. Its QUERIES were already linear (the
 * `expanded` memo), but two things were not:
 *
 *  1. CPU. `visited` was a string[] scanned with `.includes` on every candidate
 *     — O((V+E)²) on the REQUEST THREAD, inside the caller's FOR UPDATE lock.
 *     The audit measured 17.8 s for a 70,000-node closure against ~55 ms with
 *     a Set. It is a Set now.
 *  2. BOUNDS. Nothing stopped the walk at all. A degenerate class expanded
 *     until it had walked the section. There are now two walls (depth, nodes),
 *     and they REFUSE — `engine.uncovered_scope` — rather than truncate: a
 *     silently narrowed closure is a wrong answer that nothing would notice
 *     (the observer equivalence seed would mirror a partial class; the
 *     Referencias grid would drop real references).
 *
 * HERMETIC BY CONSTRUCTION. Every leg drives the walk through its own
 * `RelatedGraphIO` seam — the in-memory graph the traversal law is already
 * gated with — so the shapes that matter (a 20,000-node hub, a 2,100-deep
 * chain, a 60,000-node class) exist without a single database row. The
 * generated graph IS the corpus, and every leg asserts its size.
 *
 * HONEST LIMIT on the CPU leg: it is a wall-clock ceiling, the one kind of
 * assertion that can go red for reasons of its own. It is set two orders of
 * magnitude above the measured Set-based time and is only reachable by the
 * quadratic scan it replaced (20,000² ≈ 4×10⁸ string comparisons), so a
 * machine being slow does not fail it and the regression does.
 */

import { expect, test } from 'bun:test';
import {
	getReferencesRecursive,
	RELATED_CLOSURE_BOUNDS,
	RELATED_MULTIDIRECTIONAL,
	type RelatedGraphIO,
	type RelatedReference,
	relatedClosureStats,
	resetRelatedClosureStats,
} from '../../src/core/relations/related.ts';

// TLD OWNED BY THIS FILE ALONE (scratch_tld_uniqueness_tripwire): nothing is
// written to the database here — the graph is synthetic — but the tipos still
// name a scratch TLD, and 'zzrc' already has an owner.
const SECTION = 'zzclos1';
const COMPONENT = 'zzclos2';

function reference(id: number): RelatedReference {
	return { section_tipo: SECTION, section_id: id, from_component_tipo: COMPONENT };
}

/** A HUB: node 0 is pointed at by `size` nodes, which point at nothing. */
function starGraph(size: number): RelatedGraphIO {
	const spokes = Array.from({ length: size }, (_, i) => reference(i + 1));
	return {
		getInverse: async (_tipo, _sectionTipo, sectionId) => (Number(sectionId) === 0 ? spokes : []),
		readStored: async () => [],
	};
}

/** A CHAIN: 0 → 1 → 2 → … via STORED links (this is what grows the stack). */
function chainGraph(length: number): RelatedGraphIO {
	return {
		getInverse: async () => [],
		readStored: async (_tipo, _sectionTipo, sectionId) => {
			const next = Number(sectionId) + 1;
			return next <= length
				? [{ section_tipo: SECTION, section_id: next, from_component_tipo: COMPONENT }]
				: [];
		},
	};
}

async function walk(io: RelatedGraphIO): Promise<RelatedReference[]> {
	return getReferencesRecursive(
		COMPONENT,
		{ section_tipo: SECTION, section_id: 0, from_component_tipo: COMPONENT },
		RELATED_MULTIDIRECTIONAL,
		false,
		'lg-nolan',
		new Set(),
		io,
	);
}

/**
 * The hub size the CPU leg measures over: 40,000 — as big as it can be while
 * staying under the node bound, because the whole point is to be far enough up
 * the quadratic curve that the difference is not a matter of taste. MEASURED on
 * this machine, same graph, same process: Set 25 ms, string[] + `.includes`
 * 2,591 ms (at 20,000 it is 14 ms vs 567 ms — which is why the hub is not
 * smaller: a 5 s ceiling there would have passed with the defect in place, and
 * this gate proved exactly that before the number was raised).
 */
const HUB_SIZE = 40_000;
/** 800 ms: ~32x the measured Set time, ~3x BELOW the measured quadratic time. */
const HUB_MS_CEILING = 800;

test('a 40,000-node hub is walked completely, and fast (the Set, not the list)', async () => {
	expect(HUB_SIZE).toBeGreaterThan(30_000); // corpus floor: the shape must be big
	const started = performance.now();
	const references = await walk(starGraph(HUB_SIZE));
	const elapsed = performance.now() - started;

	// Completeness first — a fast walk that lost nodes is not the fix.
	expect(references.length).toBe(HUB_SIZE);
	expect(new Set(references.map((entry) => entry.section_id)).size).toBe(HUB_SIZE);
	expect(
		elapsed,
		`the closure walk took ${Math.round(elapsed)} ms over ${HUB_SIZE} nodes — a linear-scan membership test (the string[] this replaced) is what makes that number grow`,
	).toBeLessThan(HUB_MS_CEILING);
}, 60_000);

test('the result is UNCHANGED by the Set: a diamond closes exactly as before', async () => {
	// 0 ← 1, 0 ← 2, both 1 and 2 point at 3 (stored), 3 points nowhere. The walk
	// must report each node exactly once, in walk order.
	const io: RelatedGraphIO = {
		getInverse: async (_t, _st, id) => (Number(id) === 0 ? [reference(1), reference(2)] : []),
		readStored: async (_t, _st, id) =>
			Number(id) === 1 || Number(id) === 2
				? [{ section_tipo: SECTION, section_id: 3, from_component_tipo: COMPONENT }]
				: [],
	};
	const ids = (await walk(io)).map((entry) => Number(entry.section_id));
	expect(ids).toEqual([1, 2, 3]);
});

test('a class WIDER than the node bound is REFUSED, not truncated', async () => {
	resetRelatedClosureStats();
	const oversized = RELATED_CLOSURE_BOUNDS.maxNodes + 10_000;
	expect(oversized).toBeGreaterThan(RELATED_CLOSURE_BOUNDS.maxNodes);
	await expect(walk(starGraph(oversized))).rejects.toThrow(/too WIDE/);
	// The refusal is counted, and it is the gauge server.ts publishes.
	expect(relatedClosureStats().refusals).toBe(1);
}, 60_000);

test('a chain DEEPER than the depth bound is REFUSED, not truncated', async () => {
	resetRelatedClosureStats();
	const tooDeep = RELATED_CLOSURE_BOUNDS.maxDepth + 100;
	await expect(walk(chainGraph(tooDeep))).rejects.toThrow(/too DEEP/);
	expect(relatedClosureStats().refusals).toBe(1);
});

test('a chain just INSIDE the depth bound still resolves (the wall is not a ceiling on real work)', async () => {
	const deep = RELATED_CLOSURE_BOUNDS.maxDepth - 100;
	const references = await walk(chainGraph(deep));
	// deep - 1: the ROOT's own stored link is walked but never reported (PHP
	// :333-336 — the root's data is already the caller's data).
	expect(references.length).toBe(deep - 1);
});

test('the gauge publishes the biggest class this process walked', async () => {
	resetRelatedClosureStats();
	expect(relatedClosureStats().max_closure_nodes).toBe(0);
	await walk(starGraph(30));
	// 30 spokes + the root itself.
	expect(relatedClosureStats().max_closure_nodes).toBe(31);
	// A SMALLER walk afterwards must not lower the high-water mark.
	await walk(starGraph(5));
	expect(relatedClosureStats().max_closure_nodes).toBe(31);
	expect(relatedClosureStats().refusals).toBe(0);
});
