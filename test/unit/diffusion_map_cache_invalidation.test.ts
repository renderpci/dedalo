/**
 * S1-10 gate: the diffusion_map caches (section map + delete targets) are
 * registered with the ontology cache-invalidation hub — the exact function
 * every dd_ontology write path fires. Asserted via OBJECT IDENTITY across a
 * hub fire (the Wave-2 probe technique, mirroring the plan-cache gate in
 * diffusion_plan_compile.test.ts): a cache hit returns the same reference; a
 * hub fire forces a rebuild, so the reference must change while the content
 * (unchanged ontology) stays equal. Read-only against the live diffusion
 * ontology.
 */

import { describe, expect, test } from 'bun:test';
import {
	getSectionDiffusionMap,
	getSectionDiffusionTargets,
} from '../../src/core/diffusion_bridge/diffusion_map.ts';
import type { DiffusionSqlTarget } from '../../src/core/diffusion_bridge/diffusion_map.ts';
import { clearOntologyDerivedCaches } from '../../src/core/ontology/cache_invalidation.ts';

describe('diffusion_map caches invalidate through the ontology hub (S1-10)', () => {
	test('mapCache: hub fire → rebuilt Set (new object identity, same content)', async () => {
		const first = await getSectionDiffusionMap();
		expect(await getSectionDiffusionMap()).toBe(first); // cache hit: same reference

		await clearOntologyDerivedCaches(); // what every dd_ontology write fires

		const rebuilt = await getSectionDiffusionMap();
		expect(rebuilt).not.toBe(first); // dropped and rebuilt
		expect([...rebuilt].sort()).toEqual([...first].sort()); // ontology unchanged
	});

	test('targetsCache: hub fire → rebuilt target lists (new object identity, same content)', async () => {
		const map = await getSectionDiffusionMap();
		// A section that actually has targets makes the rebuild observable
		// (the map keys are exactly the sections with diffusion).
		let probeSection: string | null = null;
		let first: DiffusionSqlTarget[] = [];
		for (const sectionTipo of map) {
			const targets = await getSectionDiffusionTargets(sectionTipo);
			if (targets.length > 0) {
				probeSection = sectionTipo;
				first = targets;
				break;
			}
		}
		if (probeSection === null) {
			// Unconfigured install: nothing to observe here; the mapCache gate
			// above still covers both registrations firing without error.
			expect(map.size).toBe(0);
			return;
		}

		expect(await getSectionDiffusionTargets(probeSection)).toBe(first); // cache hit

		await clearOntologyDerivedCaches();

		const rebuilt = await getSectionDiffusionTargets(probeSection);
		expect(rebuilt).not.toBe(first); // dropped and rebuilt
		expect(rebuilt).toEqual(first); // ontology unchanged
	});
});
