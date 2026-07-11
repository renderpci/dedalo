/**
 * CACHE FACTORY — auto-registering constructors for module-level caches
 * (WS-B item 1, per DEC-11 option (a) and DEC-13 rule 1).
 *
 * The audit demonstrated that "modules remember to register with the hub" is
 * a nonviable convention (S1-09: ≥16 of ~20 caches unregistered). This factory
 * makes the failure mode structurally impossible: a cache created here is
 * invalidation-wired BY CONSTRUCTION — the module cannot forget, because the
 * registration happens inside the constructor before the Map is ever handed
 * out.
 *
 * Two lifecycle axes (a cache may need both — compose them):
 *
 *   createOntologyCache()  content derived from dd_ontology. The hub
 *                          (cache_invalidation.ts) clears it after EVERY
 *                          dd_ontology write (deferred to COMMIT inside a
 *                          transaction, S1-14).
 *   createDataCache(fn)    content derived from matrix RECORD DATA. The
 *                          save/delete event channel (save_event.ts, S1-11)
 *                          calls `fn(cache, sectionTipo)` after every
 *                          persistent write/delete; the callback decides what
 *                          to evict (full clear, key prefix, tipo filter, …).
 *
 * A cache that is BOTH (e.g. datalist option lists: shape from the ontology,
 * values from target-section records) is created through createOntologyCache
 * and additionally wires its own registerSectionDataListener over the returned
 * Map — see relations/datalist.ts.
 *
 * NAMED CLEARERS STAY: modules keep exporting and hub-registering their named
 * `clearXxxCache` functions. That is deliberate redundancy, not an accident —
 * the named clearer is the module's public invalidation API and the anchor the
 * completion gate (ontology_cache_hub_completion.test.ts) introspects; the
 * factory registration is the structural guarantee underneath it. Clearing an
 * already-cleared Map twice is free.
 *
 * ENFORCEMENT: module_state_tripwire.test.ts fails CI on any NEW module-level
 * mutable `new Map()`/`new Set()` declared outside this factory. Justified
 * non-factory state (frozen dispatch tables, ops registries, the two event
 * channels themselves) lives in that test's named allowlist, each entry with a
 * lifecycle justification (who clears it, and when — DEC-12 refinement).
 *
 * HOME: this file lives in ontology/ (not db/) because the invalidation hub it
 * registers into is ontology/cache_invalidation.ts and most factory clients
 * are ontology-derived; it imports ONLY the two event channels, so it stays a
 * near-leaf module any cache owner can import without cycles.
 *
 * SINGLE-WRITER SEMANTICS (2026-07-11 cutover, PHP engine retired): all
 * invalidation here is in-process, and this TS engine is the only writer —
 * every ontology/registry/record write flows through the two channels above,
 * so in-process invalidation is COMPLETE. A hypothetical out-of-band DB write
 * (manual psql surgery) still requires a restart, as on any single-process
 * cache. (The coexistence-era DEC-20 restart rule and the tools-registry TTL
 * are deleted; rewrite/COEXISTENCE.md history.)
 */

import { registerSectionDataListener } from '../section_record/save_event.ts';
import { registerOntologyCacheClearer } from './cache_invalidation.ts';

/**
 * A module-level cache whose content derives from dd_ontology. Registered with
 * the invalidation hub at construction: every dd_ontology write clears it.
 */
export function createOntologyCache<K, V>(): Map<K, V> {
	const cache = new Map<K, V>();
	registerOntologyCacheClearer(() => cache.clear());
	return cache;
}

/**
 * A module-level cache whose content derives from matrix record data.
 * Registered with the save/delete event channel at construction: after every
 * persistent record write or delete, `onSectionData` runs with the cache and
 * the written section tipo and evicts whatever derives from that section.
 * Listeners must be synchronous and cheap (eviction only, never rebuilds).
 */
export function createDataCache<K, V>(
	onSectionData: (cache: Map<K, V>, sectionTipo: string) => void,
): Map<K, V> {
	const cache = new Map<K, V>();
	registerSectionDataListener((sectionTipo) => onSectionData(cache, sectionTipo));
	return cache;
}
