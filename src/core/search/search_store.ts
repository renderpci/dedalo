/**
 * Presence gate for the matrix_string_search PER-VALUE text-search store —
 * the backing of builder_string's accent/case-insensitive contains PRE-FILTER
 * (`sv.component_tipo = <tipo> AND sv.string LIKE '%<q>%'`, trigram-served; see the ar_table entry in
 * db_pg_definitions.json for the store contract).
 *
 * The gate is PER (store, table) — tableCoveredByStore: the SYNC TRIGGER's
 * existence on the searched table (a table with `{table}_string_search_sync`
 * has its rows maintained by every write path) AND the store actually holding
 * that table's rows (or the table having none to hold). A table without it
 * (e.g. matrix_time_machine, or an instance that has not yet run the
 * maintenance rebuild + backfill) keeps the classic exact-scan SQL,
 * byte-identical. Emitting the pre-filter against an unmaintained table would
 * EXCLUDE rows (no store rows = no candidates), so this gate is correctness,
 * not just perf.
 *
 * DDL presence changes only through the database_info maintenance widget
 * (recreate_db_assets / rebuild actions), which calls clearSearchStoreCache()
 * so a fresh enablement is picked up without a server restart. The cache is
 * factory-constructed (cache discipline); its data-event listener is a no-op
 * because record writes never change DDL.
 */

import { SEARCH_STORE_BACKFILLS } from '../db/db_assets.ts';
import { sql } from '../db/postgres.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
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
 * The ONE coverage predicate, PER (store, table) (DATA-32): the table carries
 * its sync trigger AND EITHER the store already holds a row for one of the
 * table's records OR the table's rows would produce none (a legitimately
 * absent table — nothing to index). A store-wide "is non-empty" probe is not
 * a coverage answer: a store populated for twenty tables said "covered" for
 * a twenty-first it had never seen, and the pre-filter emitted against it
 * EXCLUDED every record of that table from search. Both probes are the
 * backfill contract's own (db_assets.ts SEARCH_STORE_BACKFILLS), so the boot
 * self-heal and this gate cannot disagree on what "covered" means.
 *
 * A TRUE answer is cached per (store, table) — sticky until the maintenance
 * widget clears it; a FALSE answer is re-probed (a backfill completing after
 * this process started is then picked up without a restart).
 */
export async function tableCoveredByStore(store: string, table: string): Promise<boolean> {
	const contract = SEARCH_STORE_BACKFILLS.find((candidate) => candidate.store === store);
	if (contract === undefined) return false;
	const suffix = contract.triggerEntry.replace(/^all_matrix/, ''); // all_matrix_string_search_sync → _string_search_sync
	if (!(await tableHasSyncTrigger(table, suffix))) return false;
	const cacheKey = `covered|${store}|${table}`;
	if (triggerPresenceCache.get(cacheKey) === true) return true;
	// table names come from the assertMatrixTable-validated resolvers
	const held = (await sql.unsafe(contract.holdsRowsFor(table), [])) as unknown[];
	let covered = held.length > 0;
	if (!covered) {
		// Empty for this table is legitimate ONLY while the table holds nothing
		// the store would index (a fresh install before its first write): the
		// store answering "nothing" IS the truth there. With producible rows
		// present, absence means trigger-without-backfill.
		const producible = (await sql.unsafe(contract.probe(table), [])) as unknown[];
		covered = producible.length === 0;
	}
	if (covered) triggerPresenceCache.set(cacheKey, true);
	return covered;
}

/** True when `table` is covered by the matrix_string_search store (tableCoveredByStore). */
export async function searchStoreCovers(table: string): Promise<boolean> {
	return tableCoveredByStore('matrix_string_search', table);
}

/**
 * True when EVERY given table is covered by matrix_relation_index
 * (tableCoveredByStore, per table) — the gate for the index consumers
 * (search_related, the WC-012 leaf translation). Against an unmaintained
 * table the index would be missing that table's locators and an EXACT
 * predicate driven from it would wrongly exclude rows. Since the flat-function
 * retirement (2026-07-20) the index is the ONLY relation engine, so a failed
 * gate is an ERROR condition (requireRelationIndex), not a fallback trigger.
 */
export async function relationIndexCovers(tables: readonly string[]): Promise<boolean> {
	if (tables.length === 0) return false;
	for (const table of tables) {
		if (!(await tableCoveredByStore('matrix_relation_index', table))) return false;
	}
	return true;
}

/**
 * The single-engine guard: every relation search runs on matrix_relation_index
 * since the flat-function retirement (2026-07-20) — there is no classic SQL to
 * fall back to. An uncovered instance fails LOUDLY with the remediation
 * (never silently narrow scope, README Hard rules).
 */
export async function requireRelationIndex(tables: readonly string[]): Promise<void> {
	if (await relationIndexCovers(tables)) return;
	throw new DedaloError('search.index_unavailable', {
		message:
			'matrix_relation_index is not available: sync triggers are missing, or the store is empty ' +
			'while relation data exists. Relation searches run ONLY on the index (flat functions ' +
			'removed 2026-07-20). Remediation: Area Maintenance → Database info → ' +
			'"Recreate database assets", then "Backfill search stores"; retry afterwards.',
	});
}

/** Called by the database_info maintenance widget after asset rebuilds. */
export function clearSearchStoreCache(): void {
	triggerPresenceCache.clear();
}
