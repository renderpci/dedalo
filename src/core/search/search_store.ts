/**
 * Presence gate for the matrix_search_values PER-VALUE text-search store —
 * the backing of builder_string's accent/case-insensitive contains PRE-FILTER
 * (`sv.tv LIKE '<tipo>:%<q>%'`, trigram-served; see the ar_table entry in
 * db_pg_definitions.json for the store contract).
 *
 * The gate is the SYNC TRIGGER's existence on the searched table: a table
 * with `{table}_search_values_sync` has its rows maintained by every write
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

/** True when `table` carries its `_search_values_sync` trigger (cached). */
export async function searchStoreCovers(table: string): Promise<boolean> {
	const cached = triggerPresenceCache.get(table);
	if (cached !== undefined) return cached;
	const rows = (await sql`
		SELECT 1 AS present FROM pg_trigger t
		JOIN pg_class c ON c.oid = t.tgrelid
		WHERE c.relname = ${table}
		  AND t.tgname = ${`${table}_search_values_sync`}
		  AND NOT t.tgisinternal
		LIMIT 1
	`) as { present: number }[];
	const present = rows.length > 0;
	triggerPresenceCache.set(table, present);
	return present;
}

/** Called by the database_info maintenance widget after asset rebuilds. */
export function clearSearchStoreCache(): void {
	triggerPresenceCache.clear();
}
