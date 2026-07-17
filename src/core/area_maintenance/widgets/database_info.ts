/**
 * database_info widget — PostgreSQL catalog snapshot + maintenance mutations
 * (PHP widgets/database_info wrapping db_tasks). get_value is deliberately
 * ABSENT from apiActions: PHP's per-widget API_ACTIONS allowlist does not
 * include it (the panel loads through the get_widget_value action instead) —
 * widget_request DENIES it on both engines. The rebuild_db_* actions replay
 * install SQL asset files through db_assets.ts.
 */

import { sql } from '../../db/postgres.ts';
import type { WidgetModule, WidgetResponse } from './support.ts';

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

	return {
		result: { info, tables, indexes },
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
		await sql.unsafe('VACUUM ANALYZE', []);
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

export const widget: WidgetModule = {
	spec: {
		id: 'database_info',
		category: 'system',
		label: { kind: 'literal', text: 'Database info' },
	},
	apiActions: {
		analyze_db: databaseInfoAnalyzeDb,
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
			return rebuildIndexes(tables) as Promise<WidgetResponse>;
		},
		recreate_db_assets: async () =>
			(await import('../../db/db_assets.ts')).recreateDbAssets() as unknown as WidgetResponse,
	},
	getValue: databaseInfoGetValue,
};
