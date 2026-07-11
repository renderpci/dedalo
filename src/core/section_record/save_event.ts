/**
 * save_event — post-write fan-out for section records (PHP
 * section_record::save_event, class.section_record.php:281).
 *
 * After ANY persistent write to a matrix record, caches that depend on that
 * record's content must be invalidated. PHP switches on the section tipo; the
 * TS twins of those caches are:
 *
 *   dd1324 (tools registry) / dd996 (install config) / dd234 (profiles)
 *     → tools/cache.ts invalidateAllToolCaches()
 *   ontology35 (Ontology section)
 *     → ontology/cache_invalidation.ts clearOntologyDerivedCaches()
 *   dd1244 (request-config presets)
 *     → relations/request_config/presets.ts activePresetsCache, dropped BY
 *       CONSTRUCTION via the section-data listener below (createDataCache) —
 *       PHP request_config_presets::clean_cache. No explicit case needed.
 *
 * The invalidation targets are imported DYNAMICALLY: this module is called
 * from the write chokepoint (record_write.ts) which low-level writers import,
 * so static imports here could create cycles with the tools/ontology modules
 * that will themselves adopt the chokepoint. Dynamic import is the established
 * in-repo pattern for exactly this (see save_component.ts).
 *
 * RAG SEAM (header re-dated 2026-07-07, S2-45 — the old "TS RAG subsystem is
 * unported / events are dropped" claim was false): PHP save() / delete()
 * enqueue best-effort RAG index/delete jobs (gated on DEDALO_RAG_ENABLED).
 * The TS RAG subsystem IS ported (src/ai/rag/) and registers its enqueue
 * handler here at boot (ai/rag/bootstrap.ts); with RAG disabled or before
 * boot registration, events are dropped by design. Hook failures NEVER fail
 * the write (PHP try/catch posture).
 *
 * SECTION-DATA LISTENERS (S1-11): caches derived from RECORD DATA (datalist
 * option lists, authorized projects, hierarchy target sections, …) register a
 * listener here at module load — preferably BY CONSTRUCTION via
 * ontology/cache_factory.ts createDataCache (WS-B); fireSaveEvent fans the
 * section tipo out to all of them on every persistent write AND record delete,
 * and each listener drops whatever entries derive from that section. Listeners
 * must be synchronous and cheap (cache eviction only). Inside a transaction the fan-out is deferred to
 * COMMIT/ROLLBACK (the S1-14 posture — clearing mid-tx invites repopulation
 * with about-to-be-stale or uncommitted state).
 */

import { deferPostTransaction } from '../db/postgres.ts';
import {
	PROFILE_SECTION_TIPO,
	TOOLS_CONFIG_SECTION_TIPO,
	TOOLS_REGISTER_SECTION_TIPO,
} from '../tools/ontology_map.ts';

/** The Ontology section (PHP DEDALO_ONTOLOGY_SECTION_TIPO, dd_tipos.php:128). */
const ONTOLOGY_SECTION_TIPO = 'ontology35';

/** A RAG lifecycle event for one record (PHP rag_queue enqueue_index/enqueue_delete). */
export interface RagRecordEvent {
	kind: 'index' | 'delete';
	sectionTipo: string;
	sectionId: number;
}

type RagRecordHook = (event: RagRecordEvent) => Promise<void>;

let ragRecordHook: RagRecordHook | null = null;

/** Register the RAG enqueue handler (ai/rag/bootstrap.ts calls this at boot). */
export function registerRagRecordHook(hook: RagRecordHook | null): void {
	ragRecordHook = hook;
}

/**
 * Fire the RAG seam for a record write/delete. Best-effort: a hook failure is
 * logged and swallowed — it must never fail the triggering write (PHP posture).
 */
export async function fireRagRecordEvent(event: RagRecordEvent): Promise<void> {
	if (ragRecordHook === null) return;
	try {
		await ragRecordHook(event);
	} catch (error) {
		console.error(
			`save_event: RAG ${event.kind} hook failed for ${event.sectionTipo}/${event.sectionId}:`,
			error,
		);
	}
}

type SectionDataListener = (sectionTipo: string) => void;

const sectionDataListeners = new Set<SectionDataListener>();

/**
 * Register a data-derived cache's eviction listener (see module header).
 * Idempotent (Set-backed); call once at module load.
 */
export function registerSectionDataListener(listener: SectionDataListener): void {
	sectionDataListeners.add(listener);
}

function notifySectionDataListeners(sectionTipo: string): void {
	for (const listener of sectionDataListeners) {
		try {
			listener(sectionTipo);
		} catch (error) {
			console.error(`save_event: section-data listener failed for ${sectionTipo}:`, error);
		}
	}
}

/**
 * Invalidate the caches that depend on this section's content. Call after
 * every persistent write and after every record delete (the write chokepoint
 * and delete_record do this automatically). Sections without a dependent TS
 * cache or listener are a no-op — including dd1244 (request-config presets,
 * ledgered above) and the Activity log.
 */
export async function fireSaveEvent(sectionTipo: string): Promise<void> {
	// Data-derived caches (S1-11): per-section-tipo fan-out, deferred when
	// inside a transaction (see module header).
	if (!deferPostTransaction(() => notifySectionDataListeners(sectionTipo))) {
		notifySectionDataListeners(sectionTipo);
	}
	switch (sectionTipo) {
		case TOOLS_REGISTER_SECTION_TIPO:
		case TOOLS_CONFIG_SECTION_TIPO:
		case PROFILE_SECTION_TIPO: {
			const { invalidateAllToolCaches } = await import('../tools/cache.ts');
			invalidateAllToolCaches();
			break;
		}
		case ONTOLOGY_SECTION_TIPO: {
			const { clearOntologyDerivedCaches } = await import('../ontology/cache_invalidation.ts');
			await clearOntologyDerivedCaches();
			break;
		}
		default:
			// No dependent TS cache in this switch — the Activity log has none;
			// dd1244 (request-config presets) IS invalidated, but by the
			// section-data listener fan-out above (createDataCache), not here.
			break;
	}
}
