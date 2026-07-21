/**
 * Presence gate for the matrix_string_search PER-VALUE text-search store —
 * the backing of builder_string's accent/case-insensitive contains PRE-FILTER
 * (`sv.component_tipo = <tipo> AND sv.string LIKE '%<q>%'`, trigram-served; see the ar_table entry in
 * db_pg_definitions.json for the store contract).
 *
 * The gate is the SYNC TRIGGER's existence on the searched table: a table
 * with `{table}_string_search_sync` has its rows maintained by every write
 * path, so the store is authoritative for it; a table without it (e.g.
 * matrix_time_machine, or an instance that has not yet run the maintenance
 * rebuild + backfill) keeps the classic exact-scan SQL, byte-identical.
 * Emitting the pre-filter against an unmaintained table would EXCLUDE rows
 * (empty store = no candidates), so this gate is correctness, not just perf.
 *
 * DDL presence changes only through the database_info maintenance widget
 * (recreate_db_assets / rebuild actions), which calls clearSearchStoreCache()
 * so a fresh enablement is picked up without a server restart. The cache is
 * factory-constructed (cache discipline); its data-event listener is a no-op
 * because record writes never change DDL.
 */

import { sql } from '../db/postgres.ts';
import { createDataCache } from '../ontology/cache_factory.ts';

const triggerPresenceCache = createDataCache<string, boolean>(() => {
	// DDL presence is independent of record writes — eviction happens only via
	// clearSearchStoreCache() from the maintenance rebuild actions.
});

/** Shared probe: does `table` carry the given sync trigger? (cached per pair) */
async function tableHasSyncTrigger(table: string, suffix: string): Promise<boolean> {
	const cacheKey = `${table}|${suffix}`;
	const cached = triggerPresenceCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT 1 AS present FROM pg_trigger t
		JOIN pg_class c ON c.oid = t.tgrelid
		WHERE c.relname = ${table}
		  AND t.tgname = ${`${table}${suffix}`}
		  AND NOT t.tgisinternal
		LIMIT 1
	`) as { present: number }[];
	const present = rows.length > 0;
	triggerPresenceCache.set(cacheKey, present);
	return present;
}

/**
 * Backfill guard: triggers only cover writes AFTER they exist — an operator
 * who rebuilt assets but has not yet run the backfill would otherwise expose
 * an EMPTY store to exact/conjunctive predicates and silently lose results.
 * A store with zero rows is treated as NOT covering anything. (Residual
 * operator contract: adding a NEW table to an already-populated store still
 * requires its backfill — documented on the ar_table entries.)
 */
async function storeIsNonEmpty(storeTable: string): Promise<boolean> {
	const cacheKey = `nonempty|${storeTable}`;
	const cached = triggerPresenceCache.get(cacheKey);
	if (cached === true) return true; // sticky once seen non-empty (cleared by the widget)
	const rows = (await sql.unsafe(`SELECT 1 AS present FROM "${storeTable}" LIMIT 1`, [])) as {
		present: number;
	}[];
	const present = rows.length > 0;
	if (present) triggerPresenceCache.set(cacheKey, true);
	return present;
}

/** True when `table` carries its `_string_search_sync` trigger AND the store is backfilled. */
export async function searchStoreCovers(table: string): Promise<boolean> {
	return (
		(await tableHasSyncTrigger(table, '_string_search_sync')) &&
		(await storeIsNonEmpty('matrix_string_search'))
	);
}

/**
 * True when EVERY given table carries its `_relation_index_sync` trigger and
 * the index is backfilled — the gate for the matrix_relation_index consumers
 * (search_related, the WC-012 leaf translation). Against an unmaintained
 * table the index would be missing that table's locators and an EXACT
 * predicate driven from it would wrongly exclude rows. Since the flat-function
 * retirement (2026-07-20) the index is the ONLY relation engine, so a failed
 * gate is an ERROR condition (requireRelationIndex), not a fallback trigger.
 */
export async function relationIndexCovers(tables: readonly string[]): Promise<boolean> {
	if (tables.length === 0) return false;
	for (const table of tables) {
		if (!(await tableHasSyncTrigger(table, '_relation_index_sync'))) return false;
	}
	if (await storeIsNonEmpty('matrix_relation_index')) return true;
	// Empty store is legitimate ONLY while the source tables hold no
	// index-producible locators at all (a fresh install before its first
	// relation write): the index answering "nothing" IS the truth there.
	// With producible locators present, empty means triggers-without-backfill.
	return sourcesHoldNoIndexableLocators(tables);
}

/**
 * Would the relation-index backfill INSERT produce at least one row? Mirrors
 * matrix_relation_index_sync()'s row filter exactly (array-typed component
 * keys, non-null section_tipo, integer-shaped section_id) so a store that is
 * empty because there is nothing to index never blocks the gate. Runs only
 * when the store is empty (fresh installs — small tables); cached like the
 * other DDL probes, evicted by clearSearchStoreCache().
 */
async function sourcesHoldNoIndexableLocators(tables: readonly string[]): Promise<boolean> {
	const cacheKey = 'sources_empty|matrix_relation_index';
	const cached = triggerPresenceCache.get(cacheKey);
	if (cached !== undefined) return cached;
	let empty = true;
	for (const table of tables) {
		// table names come from getRelationTables (assertMatrixTable-validated)
		const rows = (await sql.unsafe(
			`SELECT 1 AS present FROM "${table}" t, jsonb_each(t.relation) AS kv, jsonb_array_elements(kv.value) AS e
			 WHERE jsonb_typeof(kv.value) = 'array' AND e->>'section_tipo' IS NOT NULL AND e->>'section_id' ~ '^-?[0-9]+$'
			 LIMIT 1`,
			[],
		)) as { present: number }[];
		if (rows.length > 0) {
			empty = false;
			break;
		}
	}
	triggerPresenceCache.set(cacheKey, empty);
	return empty;
}

/**
 * The single-engine guard: every relation search runs on matrix_relation_index
 * since the flat-function retirement (2026-07-20) — there is no classic SQL to
 * fall back to. An uncovered instance fails LOUDLY with the remediation
 * (never silently narrow scope, README Hard rules).
 */
export async function requireRelationIndex(tables: readonly string[]): Promise<void> {
	if (await relationIndexCovers(tables)) return;
	throw new Error(
		'matrix_relation_index is not available: sync triggers are missing, or the store is empty ' +
			'while relation data exists. Relation searches run ONLY on the index (flat functions ' +
			'removed 2026-07-20). Remediation: Area Maintenance → Database info → ' +
			'"Recreate database assets", then "Backfill search stores"; retry afterwards.',
	);
}

/** Called by the database_info maintenance widget after asset rebuilds. */
export function clearSearchStoreCache(): void {
	triggerPresenceCache.clear();
}
