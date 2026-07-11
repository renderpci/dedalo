/**
 * Process-global PublicationPlan cache, keyed by ontology REVISION
 * (DIFFUSION_SPEC §4.1 plan-cache invalidation).
 *
 * A plan is pure ontology interpretation, so it is valid exactly as long as
 * dd_ontology is unchanged. Instead of tracking fine-grained dependencies we
 * keep a monotonically increasing revision counter: ANY ontology write bumps
 * it and drops the WHOLE cache (over-invalidation is harmless — plans
 * recompile lazily in ~one tree walk).
 *
 * THE INVALIDATION HOOK: this module registers bumpOntologyRevision with the
 * ontology cache-invalidation hub (src/core/ontology/cache_invalidation.ts) at
 * load time. The dd_ontology WRITE layer already funnels every mutation
 * (setRecords / regenerate / delete / tld purge / restore — dd_ontology.ts
 * :174,:258,:265,:361,:422, ontology_delete.ts:78, save_event.ts:87) through
 * that hub's clearOntologyDerivedCaches(), so registering here IS hooking the
 * shared lowest-level write chokepoint — without src/core importing
 * src/diffusion (the D1 dependency-direction rule: core never depends on
 * diffusion). The diffusion_map.ts caches (section map / delete targets) are
 * a separate invalidation domain: they register their OWN clearers with the
 * same hub at their module load (src/core/diffusion_bridge/diffusion_map.ts).
 */

import { registerOntologyCacheClearer } from '../../core/ontology/cache_invalidation.ts';
import type { CompileOptions } from './compile.ts';
import type { PublicationPlan } from './types.ts';

/**
 * Monotonic ontology revision. Starts at 1 (any positive value works — plan
 * ids only need to CHANGE across writes, not to be dense or persistent).
 */
let ontologyRevision = 1;

/** Compiled plans of the CURRENT revision, keyed by element tipo. */
const planCache = new Map<string, Promise<PublicationPlan>>();

/** The revision compiled plan ids are stamped with (planId = `tipo:rN`). */
export function currentOntologyRevision(): number {
	return ontologyRevision;
}

/**
 * Invalidate every compiled plan: bump the revision and clear the cache.
 * Called by the ontology write layer through the cache-invalidation hub;
 * callable directly by tests/tools.
 */
export function bumpOntologyRevision(): void {
	ontologyRevision += 1;
	planCache.clear();
}

/**
 * Compile-through plan lookup: return the cached plan for the element, or
 * compile and cache it. Caches the PROMISE so concurrent first requests for
 * the same element share one compilation; a failed compile is evicted so the
 * next caller retries (an ontology fix must not require a server restart).
 *
 * Benign race: a revision bump DURING a compilation clears the cache map, so
 * the in-flight plan (stamped with the old revision) is returned to its
 * awaiters but never re-served afterwards.
 */
export async function getCompiledPlan(
	elementTipo: string,
	options: CompileOptions = {},
): Promise<PublicationPlan> {
	const cached = planCache.get(elementTipo);
	if (cached !== undefined) return cached;

	const pending = (async () => {
		// Lazy import breaks the static compile.ts ↔ cache.ts cycle (compile
		// stamps planIds with currentOntologyRevision from this module).
		const { compileElementPlan } = await import('./compile.ts');
		return compileElementPlan(elementTipo, options);
	})();
	planCache.set(elementTipo, pending);
	try {
		return await pending;
	} catch (error) {
		// Only evict OUR entry — a bump may already have replaced the map contents.
		if (planCache.get(elementTipo) === pending) planCache.delete(elementTipo);
		throw error;
	}
}

// Register with the ontology write chokepoint hub (see module doc above).
registerOntologyCacheClearer(bumpOntologyRevision);
