/**
 * database_info widget — PostgreSQL catalog snapshot + maintenance mutations
 * (PHP widgets/database_info wrapping db_tasks). get_value is deliberately
 * ABSENT from apiActions: PHP's per-widget API_ACTIONS allowlist does not
 * include it (the panel loads through the get_widget_value action instead) —
 * widget_request DENIES it on both engines. The rebuild_db_* actions replay
 * install SQL asset files through db_assets.ts.
 */

import { runWithoutStatementTimeout, sql } from '../../db/postgres.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

/**
 * A table above this size is one whose plans an operator actually cares about,
 * so a missing ANALYZE on it is worth shouting about. Below it, unanalyzed
 * tables are noise (a 50-row lookup table plans fine on defaults).
 */
const STATS_SIGNIFICANT_BYTES = 64 * 1024 * 1024;
/** Below this row count the live-tuple ratio is too noisy to read as a reset. */
const STATS_RESET_MIN_ROWS = 1000;

/** One row of the statistics-health catalog read. */
export interface TableStatsRow {
	table: string;
	/** Planner's row estimate (pg_class). -1 when never analyzed. */
	reltuples: number;
	/** Cumulative-stats live tuples — what autovacuum's triggers are built on. */
	n_live_tup: number;
	never_analyzed: boolean;
	bytes: number;
}

export interface StatisticsHealth {
	status: 'ok' | 'degraded';
	tables: number;
	never_analyzed: number;
	counters_reset: number;
	/** The biggest offenders, largest first — what to ANALYZE. */
	worst: string[];
	detail: string;
}

/**
 * The statistics-health verdict — PURE, so the thresholds are testable without
 * a database.
 *
 * WHY THIS EXISTS (2026-07-29). On dedalo7_mdcat, 38 of 43 tables had
 * `last_analyze` AND `last_autoanalyze` NULL while `autovacuum` was ON, and
 * `n_live_tup` was fiction: matrix_time_machine reported 91 live rows against
 * a real 50,993,786. `pg_stats` still held rows, so `pg_statistic` had survived
 * while the CUMULATIVE counters were wiped (a crash restart or a restore).
 *
 * That combination is silently self-perpetuating. autovacuum's arithmetic is
 * intact — only the numerator is zeroed: autoanalyze fires at
 * `n_mod_since_analyze >= 50 + 0.1 * reltuples`, and `reltuples` SURVIVED (it is
 * in pg_class, WAL-durable), so the threshold stays correctly sized while the
 * counter restarts from 0. Recovery is therefore churn-proportional: small hot
 * tables self-heal within hours, while a large low-churn table needs millions of
 * modifications first — 5.1 M for a 51 M-row table — which in practice means
 * never. It is not "never" by mechanism, and this comment must not claim it is.
 *
 * Found by accident while chasing an unrelated slow query. This readout makes
 * the next occurrence announce itself; `analyze_statistics` repairs it.
 */
export function summarizeStatisticsHealth(rows: TableStatsRow[]): StatisticsHealth {
	const neverAnalyzed = rows.filter((row) => row.never_analyzed);
	// The RESET signature: the planner believes in a big table while the
	// cumulative counters believe it is empty. Autovacuum trusts the latter.
	const countersReset = rows.filter(
		(row) => row.reltuples >= STATS_RESET_MIN_ROWS && row.n_live_tup * 100 < row.reltuples,
	);
	const significant = neverAnalyzed.filter((row) => row.bytes >= STATS_SIGNIFICANT_BYTES);
	const degraded = significant.length > 0 || countersReset.length > 0;

	const worst = [...new Set([...countersReset, ...significant])]
		.sort((a, b) => b.bytes - a.bytes)
		.slice(0, 8)
		.map(
			(row) =>
				`${row.table} (${Math.round(row.bytes / 1024 / 1024)} MB, n_live_tup=${row.n_live_tup}` +
				`, reltuples=${row.reltuples}${row.never_analyzed ? ', never analyzed' : ''})`,
		);

	return {
		status: degraded ? 'degraded' : 'ok',
		tables: rows.length,
		never_analyzed: neverAnalyzed.length,
		counters_reset: countersReset.length,
		worst,
		detail: degraded
			? `Table statistics are missing or reset on ${worst.length} significant table(s). Autovacuum and autoanalyze trigger on the cumulative counters, so while those read zero they will NOT fire, and the planner runs on stale or absent statistics. Run "Analyze database" below to restore a correct baseline.`
			: 'Table statistics are present and the cumulative counters agree with the planner.',
	};
}

/**
 * The RAW rows behind the verdict. Split out so the repair action can re-derive
 * its own table list server-side instead of trusting a list that came back
 * through the client.
 */
async function readTableStatsRows(): Promise<TableStatsRow[]> {
	const rows = (await sql.unsafe(
		`SELECT c.relname AS table_name,
		        c.reltuples::bigint AS reltuples,
		        s.n_live_tup::bigint AS n_live_tup,
		        (s.last_analyze IS NULL AND s.last_autoanalyze IS NULL) AS never_analyzed,
		        pg_total_relation_size(c.oid)::bigint AS bytes
		 FROM pg_stat_user_tables s
		 JOIN pg_class c ON c.oid = s.relid`,
		[],
	)) as Record<string, unknown>[];

	return rows.map((row) => ({
		table: String(row.table_name),
		reltuples: Number(row.reltuples),
		n_live_tup: Number(row.n_live_tup),
		never_analyzed: row.never_analyzed === true,
		bytes: Number(row.bytes),
	}));
}

/** Read the per-table statistics state and reduce it to the verdict. */
export async function readStatisticsHealth(): Promise<StatisticsHealth> {
	return summarizeStatisticsHealth(await readTableStatsRows());
}

/**
 * The tables `analyze_statistics` will ANALYZE: exactly the ones the verdict
 * counts as offenders. PURE, so the scoping rule is testable — and so it can
 * never disagree with what the panel showed the operator.
 */
export function degradedTableNames(rows: TableStatsRow[]): string[] {
	const health = summarizeStatisticsHealth(rows);
	if (health.status === 'ok') return [];
	return rows
		.filter(
			(row) =>
				(row.never_analyzed && row.bytes >= STATS_SIGNIFICANT_BYTES) ||
				(row.reltuples >= STATS_RESET_MIN_ROWS && row.n_live_tup * 100 < row.reltuples),
		)
		.sort((a, b) => b.bytes - a.bytes)
		.map((row) => row.table);
}

/**
 * database_info.get_value — PostgreSQL catalog snapshot (PHP db_tasks):
 * public-schema table names + per-table indexes (name, pretty size, indexdef,
 * size-DESC order). Both engines read the SHARED database, so 'tables' and
 * 'indexes' are byte-parity; 'info' is ENGINE-NATIVE by design (PHP reports
 * its libpq client/protocol versions — TS reports the server version string
 * and its own configured host).
 */
export async function databaseInfoGetValue(): Promise<WidgetResponse> {
	const tableRows = (await sql.unsafe(
		`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
		[],
	)) as { tablename: string }[];
	const tables = tableRows.map((row) => row.tablename);

	const indexes: Record<string, unknown[]> = {};
	for (const table of tables) {
		let indexRows: Record<string, unknown>[] = [];
		try {
			indexRows = (await sql.unsafe(
				`SELECT schemaname, tablename, indexname,
				        pg_size_pretty(pg_relation_size(indexname::regclass)) AS index_size,
				        indexdef
				 FROM pg_indexes
				 WHERE tablename = $1
				 ORDER BY pg_relation_size(indexname::regclass) DESC`,
				[table],
			)) as Record<string, unknown>[];
		} catch {
			// PHP get_table_indexes returns [] when the query fails (e.g. an
			// index name ::regclass cannot resolve without quoting) — the table
			// is simply omitted from the report.
			indexRows = [];
		}
		if (indexRows.length > 0) indexes[table] = indexRows;
	}

	const versionRows = (await sql.unsafe('SELECT version() AS v', [])) as { v: string }[];
	const { config } = await import('../../../config/config.ts');
	const info = {
		server: versionRows[0]?.v ?? '',
		host: String((config.db as { host?: unknown } | undefined)?.host ?? 'localhost'),
	};

	// WC-073: engine-native, additive. Fail-soft — a statistics readout must
	// never take the whole catalog panel down with it.
	let statistics: StatisticsHealth | null = null;
	try {
		statistics = await readStatisticsHealth();
	} catch {
		statistics = null;
	}

	return {
		result: { info, tables, indexes, statistics },
		msg: 'OK. Request done successfully',
		errors: [],
	};
}

/**
 * database_info.analyze_db — VACUUM ANALYZE the whole database (PHP
 * db_tasks::analyze_db). result serializes as {} on success (PHP json-encodes
 * the PgSql\Result object); execution_time in seconds.
 */
async function databaseInfoAnalyzeDb(): Promise<WidgetResponse> {
	const start = performance.now();
	const errors: string[] = [];
	try {
		// Whole-database VACUUM: minutes on a production install, so it opts out
		// of the pool-wide statement_timeout ceiling explicitly (WC-055).
		await runWithoutStatementTimeout('VACUUM ANALYZE');
	} catch (error) {
		errors.push(` Error Processing sql query Request: ${(error as Error).message}`);
	}
	const response: WidgetResponse & { execution_time?: number } = {
		result: errors.length > 0 ? false : {},
		errors,
		msg: errors.length > 0 ? 'Warning. Request done with errors' : 'OK. Request done successfully',
	};
	response.execution_time = (performance.now() - start) / 1000;
	return response as WidgetResponse;
}

/**
 * database_info.analyze_statistics — the repair the `statistics` verdict points
 * at (WC-074). Plain `ANALYZE`, scoped to the tables the verdict named.
 *
 * (!) NOT `analyze_db`. That runs whole-database `VACUUM ANALYZE`, whose cost is
 * page-proportional — reclaiming space is a different job from refreshing
 * statistics, and pointing a stats warning at it prices the fix wrong. Plain
 * ANALYZE samples a bounded page count, so it is near-flat in table size
 * (measured 2026-07-30: ~60 s for a 141 GB database, 8 s for 912 MB, 4 s for
 * 68 MB — an order of magnitude, not a budget: at least one local install
 * carries manual `SET STATISTICS` tuning that inflates it).
 *
 * The table list is re-derived HERE from the catalog, never taken from options:
 * the operator authorises "repair what you told me is broken", and the set must
 * be the same set the verdict computed. An empty list means the verdict is 'ok'
 * and there is nothing to do — that is a success, not an error.
 */
async function databaseInfoAnalyzeStatistics(): Promise<WidgetResponse> {
	const start = performance.now();
	const errors: string[] = [];
	let tables: string[] = [];
	try {
		tables = degradedTableNames(await readTableStatsRows());
		if (tables.length > 0) {
			// Identifiers come from pg_class, but they are still INTERPOLATED, so
			// they are validated before quoting rather than trusted for provenance.
			const safe = tables.filter((table) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(table));
			if (safe.length !== tables.length) {
				errors.push('Warning. Some table names were rejected as non-identifiers and skipped');
			}
			if (safe.length > 0) {
				const list = safe.map((table) => `"${table}"`).join(', ');
				// Opts out of the pool-wide statement_timeout ceiling (WC-055):
				// ANALYZE on a multi-million-row table can exceed it.
				await runWithoutStatementTimeout(`ANALYZE ${list}`);
			}
		}
	} catch (error) {
		errors.push(` Error Processing sql query Request: ${(error as Error).message}`);
	}
	const response: WidgetResponse & { execution_time?: number } = {
		result: errors.length > 0 ? false : { analyzed: tables },
		errors,
		msg:
			errors.length > 0
				? 'Warning. Request done with errors'
				: tables.length === 0
					? 'OK. Table statistics were already healthy — nothing to analyze'
					: `OK. ANALYZE done on ${tables.length} table(s)`,
	};
	response.execution_time = (performance.now() - start) / 1000;
	return response as WidgetResponse;
}

/** The only tables consolidate_tables may touch (PHP allowlist). */
const CONSOLIDATE_TABLES = ['dd_ontology', 'matrix_ontology', 'matrix_ontology_main', 'matrix_dd'];

/**
 * database_info.consolidate_tables — compact the surrogate `id` PK of the
 * shared ontology tables and reset their sequence (PHP
 * db_tasks::consolidate_table). Non-allowlisted tables are silently skipped
 * (PHP logs and continues — the response still reports success); a table
 * whose first id ≤ row count needs no consolidation and is a no-op.
 */
async function databaseInfoConsolidateTables(
	options: Record<string, unknown>,
): Promise<WidgetResponse> {
	const errors: string[] = [];
	const tables = Array.isArray(options.tables) ? (options.tables as unknown[]) : [];
	for (const rawTable of tables) {
		const table = String(rawTable);
		if (!CONSOLIDATE_TABLES.includes(table)) continue; // PHP: log + skip
		if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) continue;
		const state = (await sql.unsafe(
			`SELECT (SELECT id FROM "${table}" ORDER BY id ASC LIMIT 1) AS first_id,
			        (SELECT COUNT(*) FROM "${table}") AS n`,
			[],
		)) as { first_id: number | null; n: number | string }[];
		const firstId = state[0]?.first_id;
		const rowCount = Number(state[0]?.n ?? 0);
		if (firstId === null || firstId === undefined) {
			errors.push(`It is not possible to consolidate the table: ${table}`);
			return {
				result: false,
				msg: 'Error. Request failed ',
				errors,
				...({ success: 0 } as Record<string, unknown>),
			} as WidgetResponse;
		}
		if (Number(firstId) <= rowCount) continue; // already compact — no-op
		const order = table === 'dd_ontology' ? 'tld, id' : 'section_tipo, section_id';
		await sql.unsafe(
			`UPDATE "${table}" t
			 SET id = t1.new_id
			 FROM (SELECT id, row_number() OVER (ORDER BY ${order}) AS new_id FROM "${table}") t1
			 WHERE t.id = t1.id`,
			[],
		);
		await sql.unsafe(`SELECT setval('${table}_id_seq', max(id)) FROM "${table}"`, []);
	}
	return {
		result: true,
		msg: errors.length > 0 ? 'Warning. Request done with errors' : 'OK. Request done successfully',
		errors,
		...({ success: 0 } as Record<string, unknown>),
	} as WidgetResponse;
}

/**
 * database_info.rebuild_user_stats — per user: DELETE the dd1521 aggregates
 * and recompute every day from matrix_activity (PHP widget rebuild_user_stats
 * → diffusion_section_stats delete + update). (!) Intentionally lossy when
 * the activity log is shorter than the stats history — an admin decision.
 */
async function databaseInfoRebuildUserStats(
	options: Record<string, unknown>,
): Promise<WidgetResponse> {
	const users = Array.isArray(options.users) ? (options.users as unknown[]) : null;
	const response: WidgetResponse & { updated_days?: unknown[] } = {
		result: false,
		msg: 'Error. Request failed [rebuild_user_stats]',
		errors: [],
		updated_days: [],
	};
	if (users === null || users.length === 0) {
		response.msg += ' Empty users value';
		response.errors.push('invalid users');
		return response as WidgetResponse;
	}
	const { deleteUserActivityStats, updateUserActivityStats } = await import('../user_stats.ts');
	for (const rawUserId of users) {
		const userId = Number(rawUserId);
		const deleted = await deleteUserActivityStats(userId);
		if (!deleted) {
			response.errors.push(`failed delete user stats. User: ${userId}`);
			continue;
		}
		const update = await updateUserActivityStats(userId);
		if (
			update.result === false ||
			update.result === 0 ||
			(Array.isArray(update.result) && update.errors.length > 0 && update.result.length === 0)
		) {
			if (update.result === false) return update as WidgetResponse;
		}
		response.errors.push(...update.errors);
		response.updated_days?.push(update.result);
	}
	response.result = response.errors.length === 0;
	response.msg =
		response.errors.length === 0 ? 'OK. Request done.' : 'Warning! Request done with errors';
	return response as WidgetResponse;
}

/**
 * database_info.optimize_tables — REINDEX CONCURRENTLY + VACUUM ANALYZE the
 * selected tables (PHP db_tasks::optimize_tables; long locks on big tables —
 * an admin decision; the gate exercises matrix_test).
 */
async function databaseInfoOptimizeTables(
	options: Record<string, unknown>,
): Promise<WidgetResponse> {
	const tables = options.tables;
	if (tables === undefined || (Array.isArray(tables) && tables.length === 0)) {
		return { result: false, msg: 'Error. Request failed ', errors: ['No tables selected'] };
	}
	if (!Array.isArray(tables)) {
		return { result: false, msg: 'Error. Request failed ', errors: ['Invalid tables parameter'] };
	}
	const { optimizeTables } = await import('../../db/db_assets.ts');
	return (await optimizeTables(tables as string[])) as unknown as WidgetResponse;
}

/**
 * database_info.relation_integrity_report — audit the matrix_relation_index
 * store (phase 1 of the locator-index plan, 2026-07-20): per-target-section
 * DANGLING locator counts (references whose target record no longer exists —
 * an anti-join per distinct target section against its resolved matrix table)
 * plus, per source table, the locators the sync trigger SKIPPED because their
 * section_id is not numeric (enumerated from the jsonb side; the index never
 * silently casts). Read-only; heavy-ish by design (an admin decision, like
 * the other maintenance actions here).
 */
async function databaseInfoRelationIntegrityReport(): Promise<WidgetResponse> {
	const errors: string[] = [];
	const { getMatrixTableFromTipo } = await import('../../ontology/resolver.ts');

	// store presence
	const present = (await sql.unsafe(
		`SELECT to_regclass('public.matrix_relation_index') IS NOT NULL AS ok`,
		[],
	)) as { ok: boolean }[];
	if (present[0]?.ok !== true) {
		return {
			result: false,
			msg: 'Error. matrix_relation_index does not exist — run recreate_db_assets, then backfill_search_stores',
			errors: ['store_missing'],
		};
	}

	const totals = (await sql.unsafe(
		`SELECT count(*)::bigint AS rows, count(DISTINCT target_section_tipo)::int AS target_sections
		 FROM matrix_relation_index`,
		[],
	)) as { rows: string; target_sections: number }[];

	// dangling per target section (anti-join against the target's own table)
	const targetTipos = (await sql.unsafe(
		'SELECT DISTINCT target_section_tipo AS tipo FROM matrix_relation_index ORDER BY 1',
		[],
	)) as { tipo: string }[];
	const dangling: Record<string, number> = {};
	let danglingTotal = 0;
	for (const { tipo } of targetTipos) {
		let table: string | null = null;
		try {
			table = await getMatrixTableFromTipo(tipo);
		} catch {
			table = null;
		}
		if (table === null) {
			errors.push(
				`target section '${tipo}' resolves to no matrix table — its references are unverifiable`,
			);
			continue;
		}
		const rows = (await sql.unsafe(
			`SELECT count(*)::bigint AS n FROM (
				SELECT DISTINCT r.target_section_id FROM matrix_relation_index r
				WHERE r.target_section_tipo = $1
				  AND NOT EXISTS (SELECT 1 FROM "${table}" t WHERE t.section_tipo = $1 AND t.section_id = r.target_section_id)
			) d`,
			[tipo],
		)) as { n: string }[];
		const n = Number(rows[0]?.n ?? 0);
		if (n > 0) {
			dangling[tipo] = n;
			danglingTotal += n;
		}
	}

	// non-numeric section_id locators per source table (skipped by the sync trigger)
	const nonNumeric: Record<string, number> = {};
	const sourceTables = (await sql.unsafe(
		`SELECT DISTINCT c.relname AS t FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
		 WHERE g.tgname LIKE '%_relation_index_sync' AND NOT g.tgisinternal ORDER BY 1`,
		[],
	)) as { t: string }[];
	for (const { t } of sourceTables) {
		const rows = (await sql.unsafe(
			`SELECT count(*)::bigint AS n FROM "${t}" m, jsonb_each(m.relation) kv, jsonb_array_elements(kv.value) e
			 WHERE jsonb_typeof(m.relation) = 'object' AND jsonb_typeof(kv.value) = 'array'
			   AND (e->>'section_id' IS NULL OR e->>'section_id' !~ '^-?[0-9]+$')`,
			[],
		)) as { n: string }[];
		const n = Number(rows[0]?.n ?? 0);
		if (n > 0) nonNumeric[t] = n;
	}

	return {
		result: {
			store_rows: Number(totals[0]?.rows ?? 0),
			target_sections: totals[0]?.target_sections ?? 0,
			dangling_targets_total: danglingTotal,
			dangling_by_target_section: dangling,
			non_numeric_locators_by_table: nonNumeric,
		},
		msg: errors.length > 0 ? 'Warning. Request done with errors' : 'OK. Request done successfully',
		errors,
	};
}

export const widget: WidgetModule = {
	spec: {
		id: 'database_info',
		category: 'system',
		label: { kind: 'literal', text: 'Database info' },
	},
	apiActions: {
		analyze_db: databaseInfoAnalyzeDb,
		analyze_statistics: databaseInfoAnalyzeStatistics,
		relation_integrity_report: databaseInfoRelationIntegrityReport,
		consolidate_tables: databaseInfoConsolidateTables,
		rebuild_user_stats: databaseInfoRebuildUserStats,
		optimize_tables: databaseInfoOptimizeTables,
		rebuild_db_functions: async () =>
			(await import('../../db/db_assets.ts')).rebuildFunctions() as Promise<WidgetResponse>,
		rebuild_db_constraints: async () =>
			(await import('../../db/db_assets.ts')).rebuildConstraints() as Promise<WidgetResponse>,
		rebuild_db_indexes: async (options) => {
			const { rebuildIndexes } = await import('../../db/db_assets.ts');
			const tables = Array.isArray(options.tables) ? (options.tables as string[]) : [];
			const response = await rebuildIndexes(tables);
			// A rebuilt search-store trigger set must be picked up by the search
			// builders without a server restart.
			const { clearSearchStoreCache } = await import('../../search/search_store.ts');
			clearSearchStoreCache();
			return response as WidgetResponse;
		},
		recreate_db_assets: async () => {
			const response = await (await import('../../db/db_assets.ts')).recreateDbAssets();
			const { clearSearchStoreCache } = await import('../../search/search_store.ts');
			clearSearchStoreCache();
			return response as unknown as WidgetResponse;
		},
		// The derived-store backfill (matrix_string_search + matrix_relation_index):
		// TRUNCATE + refill from the source tables. THE update path for an instance
		// whose stores are missing rows (a previous v7 beta, a restore that skipped
		// them): run recreate_db_assets first (DDL: tables, sync functions,
		// triggers, indexes — and the drop-only cleanups), then this.
		backfill_search_stores: async () => {
			const response = await (await import('../../db/db_assets.ts')).backfillSearchStores();
			const { clearSearchStoreCache } = await import('../../search/search_store.ts');
			clearSearchStoreCache();
			return response as unknown as WidgetResponse;
		},
	},
	getValue: databaseInfoGetValue,
	// WC-074: the catalog's inline value carries ONLY the statistics verdict, so
	// the FOLDED dashboard card can warn without anyone opening the panel — the
	// verdict is the one thing here that is actionable while collapsed. Kept to
	// that single key deliberately: eagerValue runs for every widget on every
	// area read, so it must stay cheap (this is one catalog query, ~3-5 ms), and
	// the heavy tables+indexes catalog stays on the panel-open path.
	// Fail-soft per the registry contract — a widget whose eager value cannot be
	// computed must never break the dashboard read (registry.ts: `?? null`).
	eagerValue: async () => {
		try {
			return { statistics: await readStatisticsHealth() };
		} catch {
			return null;
		}
	},
};
