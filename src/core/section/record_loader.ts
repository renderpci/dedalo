/**
 * Per-read record loader — dedups and batches the relation-cell target reads.
 *
 * The list-cell subdatum expansion (relation_core expandPortal /
 * emitDataframeItem) resolves each locator to its target record. Bare
 * readMatrixRecord there is the classic N+1: one awaited round-trip per
 * locator per row, recursing through nested portals — and targets repeat
 * heavily across a page (a measured numisdata4 page: 141 locators, 54
 * distinct targets). This loader collapses that to one read per DISTINCT
 * record per read, and lets the caller pre-seed a whole page's targets with
 * readMatrixRecordBatch (one ANY() query per section — pool-friendly: a batch
 * takes ONE pool slot where Promise.all fan-out would take N).
 *
 * Lifetime: the cache lives in EmissionContext.scratch under a module-local
 * symbol (the S2-29 per-read memory protocol — see component_data.ts), so it
 * is born and dies with the read. NEVER module-scoped: no cross-request
 * bleed, no invalidation wiring, no module_state_tripwire entry. Within one
 * read this also upgrades consistency — every cell referencing a record sees
 * the same snapshot. Mirrors the export run's recordCache
 * (diffusion/resolve/resolver.ts loadExportRecordFromTable), which proved the
 * pattern byte-identical.
 */

import { type MatrixRecord, readMatrixRecord, readMatrixRecordBatch } from '../db/matrix.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import type { EmissionContext } from '../resolve/component_data.ts';

/** Bound on cached records per read (same posture as the export's limit). */
const RECORD_CACHE_LIMIT = 8000;

const RECORD_LOADER = Symbol('record_loader.cache');

/** Cache values: the record, or null for a definitive miss (never re-query). */
type RecordCache = Map<string, MatrixRecord | null>;

function cacheOf(emission: EmissionContext): RecordCache {
	let cache = emission.scratch.get(RECORD_LOADER) as RecordCache | undefined;
	if (cache === undefined) {
		cache = new Map();
		emission.scratch.set(RECORD_LOADER, cache);
	}
	return cache;
}

/**
 * Read one record through the per-read cache. Drop-in for readMatrixRecord at
 * the relation-emission call sites: same signature after `emission`, same
 * null-for-missing contract. The caller resolves the table FIRST (and
 * early-returns on null table) exactly as before — the loader must never
 * resolve what the bare read couldn't (the relation_list.ts loadRecord parity
 * keystone).
 */
export async function loadRecordCached(
	emission: EmissionContext,
	tableName: string,
	sectionTipo: string,
	sectionId: number,
): Promise<MatrixRecord | null> {
	const cache = cacheOf(emission);
	const key = `${sectionTipo}/${sectionId}`;
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	const record = await readMatrixRecord(tableName, sectionTipo, sectionId);
	if (cache.size > RECORD_CACHE_LIMIT) cache.clear();
	cache.set(key, record); // null too: a miss must not re-query
	return record;
}

/**
 * Bulk-seed the cache with a set of locator targets — one readMatrixRecordBatch
 * per section tipo instead of one round-trip per locator. Requested ids that
 * come back absent are seeded as null so the lazy path never re-queries them.
 * Locators with a non-numeric section_id or an unresolvable table are skipped
 * (the lazy path keeps its exact bare-read behavior for them).
 */
export async function prefetchRecords(
	emission: EmissionContext,
	locators: readonly { section_tipo?: unknown; section_id?: unknown }[],
): Promise<void> {
	const cache = cacheOf(emission);
	const idsBySection = new Map<string, Set<number>>();
	for (const locator of locators) {
		const sectionTipo = locator.section_tipo;
		if (typeof sectionTipo !== 'string' || sectionTipo === '') continue;
		const sectionId = Number(locator.section_id);
		if (!Number.isInteger(sectionId)) continue;
		if (cache.has(`${sectionTipo}/${sectionId}`)) continue;
		let ids = idsBySection.get(sectionTipo);
		if (ids === undefined) {
			ids = new Set();
			idsBySection.set(sectionTipo, ids);
		}
		ids.add(sectionId);
	}
	for (const [sectionTipo, ids] of idsBySection) {
		const table = await getMatrixTableFromTipo(sectionTipo);
		if (table === null) continue;
		const records = await readMatrixRecordBatch(table, sectionTipo, [...ids]);
		if (cache.size > RECORD_CACHE_LIMIT) cache.clear();
		for (const id of ids) {
			cache.set(`${sectionTipo}/${id}`, records.get(id) ?? null);
		}
	}
}
