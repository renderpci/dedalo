/**
 * THE PER-PROCESS CONNECTION BUDGET — how many PHYSICAL backends one engine
 * process may hold on the matrix database at once. ONE formula, read by
 * everything that budgets connections (scripts/test_shard.ts, the ops prose in
 * engineering/PRODUCTION.md §4, the DB_MAINTENANCE_POOL_MAX catalog text) and
 * MEASURED against pg_stat_activity by statement_ceiling_scope_native ("the
 * connection budget is physical"). Pure: no config, no pool — a script may
 * import it without opening a database.
 *
 * WHY IT IS NOT `DB_POOL_MAX + DB_MAINTENANCE_POOL_MAX`. The acquire gates
 * bound connections IN USE; a Bun pool keeps an IDLE connection open until its
 * idleTimeout. The maintenance lane is TWO Bun pools (postgres.ts): the
 * transactional maintenance pool and its non-transactional twin
 * (runWithoutStatementTimeout's weak-lock class — the shutdown cancel must be able to tell them
 * apart, so they cannot share connections). They share ONE slot gate, but each
 * keeps up to DB_MAINTENANCE_POOL_MAX idle connections for 30 s, so one
 * optimize run (pooled reads, then REINDEX/VACUUM) leaves both populated.
 * On top: the short-lived DEDICATED connections (a cancel, a pg_xact_status
 * verdict) that deliberately take no pool slot — bounded by their own counter
 * (DEDICATED_CONNECTIONS_MAX, postgres.ts onDedicatedConnection).
 *
 * NOT COUNTED here: the vector store's pool (src/ai/rag, its own database and
 * its own key) and a diffusion MariaDB target (another server).
 */

/** Dedicated (cancel / transaction-status) connections one process may hold at once. */
export const DEDICATED_CONNECTIONS_MAX = 2;

/** Physical backends the maintenance lane may hold: BOTH of its pools. */
export function maintenanceConnectionsPerProcess(maintenancePoolMax: number): number {
	return 2 * Math.max(1, maintenancePoolMax);
}

/**
 * Physical matrix-database backends ONE process may hold: the request pool,
 * both maintenance pools, and the dedicated connections.
 */
export function connectionsPerProcess(poolMax: number, maintenancePoolMax: number): number {
	return poolMax + maintenanceConnectionsPerProcess(maintenancePoolMax) + DEDICATED_CONNECTIONS_MAX;
}
