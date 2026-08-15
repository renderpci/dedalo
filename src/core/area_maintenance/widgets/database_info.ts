/**
 * database_info widget — PostgreSQL catalog snapshot + maintenance mutations
 * (PHP widgets/database_info wrapping db_tasks). get_value is deliberately
 * ABSENT from apiActions: PHP's per-widget API_ACTIONS allowlist does not
 * include it (the panel loads through the get_widget_value action instead) —
 * widget_request DENIES it on both engines. The rebuild_db_* actions replay
 * install SQL asset files through db_assets.ts.
 *
 * (!) ONE DELIBERATE BEHAVIOUR CHANGE, 2026-08-08 (defect D14). The
 * consolidate_tables renumber used to issue its `UPDATE … row_number()` and its
 * `setval(<table>_id_seq, max(id))` as TWO independent statements: a crash, a
 * statement timeout or a connection drop between them left the table renumbered
 * with a sequence still pointing past the old high-water id (or, worse on a
 * retry, below it) — a silent duplicate-key generator on the next insert. Both
 * statements now run inside ONE `withTransaction` (see `consolidateOneTable`),
 * so the renumber and its sequence reset commit or roll back together. Nothing
 * else about the action's wire response, ordering or skip rules changed.
 */

import { runWithoutStatementTimeout, sql, withTransaction } from '../../db/postgres.ts';
import { DedaloError } from '../../errors/dedalo_error.ts';
import {
	failAction,
	fromOutcome,
	refuseAction,
	type WidgetModule,
	type WidgetResponse,
} from './support.ts';

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

	return { data: { info, tables, indexes, statistics } };
}

/**
 * database_info.analyze_db — VACUUM ANALYZE the whole database (PHP
 * db_tasks::analyze_db). result serializes as {} on success (PHP json-encodes
 * the PgSql\Result object); execution_time in seconds.
 */
/*
 * COVERAGE-EXEMPT (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): a PARAMETERLESS operator action whose
 * entire body is one unbounded `VACUUM ANALYZE` against the shared database, with
 * the statement timeout DELIBERATELY removed (WC-055). There is no input to vary
 * and no scratch surface to confine it to; its only branch is the try/catch
 * envelope.
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
	return {
		data: errors.length > 0 ? false : {},
		...(errors.length === 0 ? {} : { msg: 'Warning. Request done with errors', errors }),
		extend: { execution_time: (performance.now() - start) / 1000 },
	};
}

/**
 * Build the scoped `ANALYZE` statement for a list of table names, and report
 * the names that were REJECTED.
 *
 * The names come from `pg_class`, but they are still INTERPOLATED into SQL, so
 * provenance is not treated as a licence: every name must be a bare SQL
 * identifier (`[A-Za-z_][A-Za-z0-9_]*`) before it is quoted. A name that is not
 * — a quote-carrying name, a leading digit, anything a `CREATE TABLE "…"` could
 * legally hold — is dropped from the statement and returned in `rejected` for
 * the caller to warn about. `statement` is `null` when nothing survives (an
 * empty input included), which the caller reads as "issue no SQL at all".
 */
export function buildAnalyzeStatement(tables: string[]): {
	statement: string | null;
	rejected: string[];
} {
	const safe = tables.filter((table) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(table));
	const rejected = tables.filter((table) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table));
	if (safe.length === 0) return { statement: null, rejected };
	return { statement: `ANALYZE ${safe.map((table) => `"${table}"`).join(', ')}`, rejected };
}

/**
 * The analyze_statistics `msg` ladder, in the order the action reads it:
 * errors first (they outrank a successful partial run), then the empty-set
 * success ("nothing to do" is a success, not an error), then the count.
 */
export function analyzeStatisticsMessage(tableCount: number, errors: unknown[]): string {
	return errors.length > 0
		? 'Warning. Request done with errors'
		: tableCount === 0
			? 'OK. Table statistics were already healthy — nothing to analyze'
			: `OK. ANALYZE done on ${tableCount} table(s)`;
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
			const { statement, rejected } = buildAnalyzeStatement(tables);
			if (rejected.length > 0) {
				errors.push('Warning. Some table names were rejected as non-identifiers and skipped');
			}
			if (statement !== null) {
				// Opts out of the pool-wide statement_timeout ceiling (WC-055):
				// ANALYZE on a multi-million-row table can exceed it.
				await runWithoutStatementTimeout(statement);
			}
		}
	} catch (error) {
		errors.push(` Error Processing sql query Request: ${(error as Error).message}`);
	}
	return {
		data: errors.length > 0 ? false : { analyzed: tables },
		msg: analyzeStatisticsMessage(tables.length, errors),
		...(errors.length === 0 ? {} : { errors }),
		extend: { execution_time: (performance.now() - start) / 1000 },
	};
}

/** The only tables consolidate_tables may touch (PHP allowlist). */
export const CONSOLIDATE_TABLES: readonly string[] = [
	'dd_ontology',
	'matrix_ontology',
	'matrix_ontology_main',
	'matrix_dd',
];

/**
 * The ORDER BY a renumber may use — a CLOSED SET, never a caller string.
 *
 * `consolidateOneTable` interpolates this fragment directly into SQL (an ORDER
 * BY list cannot be a bind parameter), so the type is the whole defence: widen
 * it to `string` and the refactor hands the renumber an injection surface the
 * inline original never had.
 */
export type ConsolidateOrder = 'tld, id' | 'section_tipo, section_id';

/**
 * Decide what `consolidate_tables` must do with one table, from its lowest id
 * and its row count. PURE — the arithmetic is the whole decision.
 *
 * - no first id at all (`null`/`undefined`, i.e. the table is empty or the
 *   probe returned nothing) → `'error'`: the action aborts the WHOLE run, not
 *   just this table (PHP's behaviour, preserved).
 * - `firstId <= rowCount` → `'noop'`: the ids already start inside the range a
 *   compact numbering would occupy, so there is nothing to reclaim.
 * - otherwise → `'consolidate'`.
 *
 * quirk: pinned, not fixed — the comparison is `Number(firstId) <= rowCount`,
 * so a numeric-string first id compares as a number, and `firstId === 0`
 * survives the null check (0 is a legal id here) while reading as `'noop'`.
 */
export function planConsolidation(
	firstId: number | null | undefined,
	rowCount: number,
): 'error' | 'noop' | 'consolidate' {
	if (firstId === null || firstId === undefined) return 'error';
	if (Number(firstId) <= rowCount) return 'noop';
	return 'consolidate';
}

/**
 * The renumber ORDER for one consolidated table — pure, so the one table that
 * does not share the matrix shape is pinnable.
 *
 * `dd_ontology` has no `section_tipo`/`section_id` columns: applying the
 * matrix ordering to it makes the renumber's window `ORDER BY` reference
 * columns the table lacks, and the action THROWS mid-transaction —
 * on the one table that most needs compacting, after the operator already
 * confirmed a destructive renumber.
 */
export function consolidateOrderFor(table: string): ConsolidateOrder {
	return table === 'dd_ontology' ? 'tld, id' : 'section_tipo, section_id';
}

/**
 * Renumber one table's surrogate `id` PK to a gapless 1..n in `orderBy` order
 * and reset its `<table>_id_seq` to the new maximum.
 *
 * TRANSACTED (2026-08-08, defect D14 — see the file header): the UPDATE and the
 * `setval` used to be two independent statements, so a failure between them
 * left the sequence disagreeing with the data. They now commit together.
 *
 * The table name is interpolated (an identifier cannot be a bind parameter);
 * the caller is expected to have matched it against `CONSOLIDATE_TABLES`, and
 * the identifier shape is re-checked here so the interpolation is safe on its
 * own terms rather than on the caller's promise.
 */
export async function consolidateOneTable(table: string, orderBy: ConsolidateOrder): Promise<void> {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
		throw new Error(`consolidateOneTable: refusing non-identifier table name: ${table}`);
	}
	await withTransaction(async () => {
		await sql.unsafe(
			`UPDATE "${table}" t
			 SET id = t1.new_id
			 FROM (SELECT id, row_number() OVER (ORDER BY ${orderBy}) AS new_id FROM "${table}") t1
			 WHERE t.id = t1.id`,
			[],
		);
		await sql.unsafe(`SELECT setval('${table}_id_seq', max(id)) FROM "${table}"`, []);
	});
}

/**
 * database_info.consolidate_tables — compact the surrogate `id` PK of the
 * shared ontology tables and reset their sequence (PHP
 * db_tasks::consolidate_table). Non-allowlisted tables are silently skipped
 * (PHP logs and continues — the response still reports success); a table
 * whose first id ≤ row count needs no consolidation and is a no-op.
 */
/*
 * COVERAGE-EXEMPT for EXECUTION (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): running it RENUMBERS the surrogate
 * primary keys of `dd_ontology`/`matrix_*` and setvals their sequences, which no
 * scratch surface can contain. Its PURE decisions — `planConsolidation` and
 * `consolidateOrderFor` — are gated individually
 * (test/unit/consolidate_order_native.test.ts).
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
		const plan = planConsolidation(firstId, rowCount);
		if (plan === 'error') {
			failAction(`It is not possible to consolidate the table: ${table}`, {
				coordinates: { table },
			});
		}
		if (plan === 'noop') continue; // already compact
		const order: ConsolidateOrder = consolidateOrderFor(table);
		await consolidateOneTable(table, order);
	}
	return {
		data: true,
		...(errors.length === 0 ? {} : { msg: 'Warning. Request done with errors', errors }),
		extend: { success: 0 },
	};
}

/**
 * database_info.rebuild_user_stats — per user: DELETE the dd1521 aggregates
 * and recompute every day from matrix_activity (PHP widget rebuild_user_stats
 * → diffusion_section_stats delete + update). (!) Intentionally lossy when
 * the activity log is shorter than the stats history — an admin decision.
 */
export type UserStatsDeps = Pick<
	typeof import('../user_stats.ts'),
	'deleteUserActivityStats' | 'updateUserActivityStats'
>;

/**
 * Resolve the aggregate writer pair — the injected one in a gate, the real
 * module in production. A named helper, not an inline `??`, so the seam costs
 * the already-branchy handler no cyclomatic complexity (the crap ratchet caps
 * that file's max at its frozen 13).
 */
async function resolveUserStatsDeps(deps?: UserStatsDeps): Promise<UserStatsDeps> {
	return deps ?? (await import('../user_stats.ts'));
}

export async function databaseInfoRebuildUserStats(
	options: Record<string, unknown>,
	_principal?: unknown,
	deps?: UserStatsDeps,
): Promise<WidgetResponse> {
	const users = Array.isArray(options.users) ? (options.users as unknown[]) : null;
	const errors: string[] = [];
	const updatedDays: unknown[] = [];
	if (users === null || users.length === 0) {
		refuseAction('Error. Request failed [rebuild_user_stats]. Empty users value');
	}
	// SEAM (test injection only): the guard above returns BEFORE this line, so a
	// gate can prove the dd1521 aggregate DELETE was never reached.
	const { deleteUserActivityStats, updateUserActivityStats } = await resolveUserStatsDeps(deps);
	for (const rawUserId of users) {
		const userId = Number(rawUserId);
		const deleted = await deleteUserActivityStats(userId);
		if (!deleted) {
			errors.push(`failed delete user stats. User: ${userId}`);
			continue;
		}
		const update = await updateUserActivityStats(userId);
		// A run that did not complete is the aggregate writer's own refusal — it
		// used to be returned VERBATIM as the widget body (`update.result===false`);
		// now it throws with the writer's sentence, which is the same information
		// on the wire under the coded shape.
		if (!update.ok) {
			failAction(update.msg, { coordinates: { user_id: userId } });
		}
		errors.push(...update.errors);
		updatedDays.push(update.value);
	}
	return {
		data: errors.length === 0,
		msg: errors.length === 0 ? 'OK. Request done.' : 'Warning! Request done with errors',
		...(errors.length === 0 ? {} : { errors }),
		extend: { updated_days: updatedDays },
	};
}

/**
 * database_info.optimize_tables — REINDEX CONCURRENTLY + VACUUM ANALYZE the
 * selected tables (PHP db_tasks::optimize_tables; long locks on big tables —
 * an admin decision; the gate exercises matrix_test).
 */
export type OptimizeTablesFn = typeof import('../../db/db_assets.ts').optimizeTables;

export async function databaseInfoOptimizeTables(
	options: Record<string, unknown>,
	_principal?: unknown,
	injectedOptimizeTables?: OptimizeTablesFn,
): Promise<WidgetResponse> {
	const tables = options.tables;
	if (tables === undefined || (Array.isArray(tables) && tables.length === 0)) {
		refuseAction('Error. Request failed. No tables selected');
	}
	if (!Array.isArray(tables)) {
		refuseAction('Error. Request failed. Invalid tables parameter');
	}
	// SEAM (test injection only): both guards above return BEFORE this line, so a
	// gate can prove REINDEX/VACUUM was never reached — notably for the bare-string
	// case, where a relaxed guard would iterate a string CHARACTER BY CHARACTER
	// into identifier positions.
	const optimizeTables =
		injectedOptimizeTables ?? (await import('../../db/db_assets.ts')).optimizeTables;
	// Opt-in preview: only an explicit boolean true is a dry run — anything else
	// (absent, 'false', 0) keeps the historical destructive behaviour.
	const dryRun = options.dry_run === true;
	return fromOutcome(await optimizeTables(tables as string[], { dryRun }));
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
		throw new DedaloError('maintenance.store_missing');
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
		data: {
			store_rows: Number(totals[0]?.rows ?? 0),
			target_sections: totals[0]?.target_sections ?? 0,
			dangling_targets_total: danglingTotal,
			dangling_by_target_section: dangling,
			non_numeric_locators_by_table: nonNumeric,
		},
		...(errors.length === 0 ? {} : { msg: 'Warning. Request done with errors', errors }),
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
			fromOutcome(await (await import('../../db/db_assets.ts')).rebuildFunctions()),
		rebuild_db_constraints: async () =>
			fromOutcome(await (await import('../../db/db_assets.ts')).rebuildConstraints()),
		rebuild_db_indexes: async (options) => {
			const { rebuildIndexes } = await import('../../db/db_assets.ts');
			const tables = Array.isArray(options.tables) ? (options.tables as string[]) : [];
			const response = await rebuildIndexes(tables);
			// A rebuilt search-store trigger set must be picked up by the search
			// builders without a server restart.
			const { clearSearchStoreCache } = await import('../../search/search_store.ts');
			clearSearchStoreCache();
			return fromOutcome(response);
		},
		// recreateDbAssets answers with a per-step PAYLOAD (no ok discriminator):
		// every step reports its own outcome inside `data`, so the action itself
		// only fails by throwing.
		recreate_db_assets: async () => {
			const response = await (await import('../../db/db_assets.ts')).recreateDbAssets();
			const { clearSearchStoreCache } = await import('../../search/search_store.ts');
			clearSearchStoreCache();
			return {
				data: response.data,
				msg: response.msg,
				...(response.errors.length === 0 ? {} : { errors: response.errors.map(String) }),
				extend: { success: response.success },
			};
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
			return fromOutcome(response);
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
