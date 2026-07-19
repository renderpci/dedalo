/**
 * PostgreSQL asset rebuilds (PHP core/db/class.db_tasks.php over
 * db_pg_definitions.php) — the declared extensions / functions / constraints
 * / indexes / maintenance sentences of the Dédalo schema, VENDORED into this
 * tree as db_pg_definitions.json (converted 1:1 from the PHP array; both
 * engines share the database, so the assets are the same product code).
 *
 * Semantics mirror db_tasks: each entry runs drop-then-add; `{$table}`
 * templates expand per declared table (skipping tables absent on this
 * install); a failed statement records the error and continues; `success`
 * counts completed ENTRIES (not statements).
 *
 * (!) These are heavyweight admin operations over the SHARED database —
 * constraints/indexes take long locks on the 9 GB matrix tables. The gates
 * run the cheap ones live (functions, optimize on matrix_test) and verify
 * the rest structurally; executing them is an admin decision.
 */

import definitions from './db_pg_definitions.json';
import { sql } from './postgres.ts';

interface AssetEntry {
	tables?: string[];
	add: string;
	drop: string;
	name: string;
	info?: string;
}

interface AssetResponse {
	result: boolean;
	msg: string;
	errors: unknown[];
	success: number;
	[extra: string]: unknown;
}

function newResponse(): AssetResponse {
	return { result: false, msg: 'Error. Request failed ', errors: [], success: 0 };
}

/** PHP clean_sql_sentence: tabs → spaces, trimmed. */
function cleanSql(sqlQuery: string): string {
	return sqlQuery.replaceAll('\t', ' ').trim();
}

/**
 * True for a real, optimizable table (INJ-01 scope bound): PUBLIC schema + BASE
 * TABLE only — never a system catalog, view, or foreign table. `optimize_tables`
 * is already admin-gated at the maintenance dispatch and injection-safe (name
 * regex + `"${…}"`); this restricts the REINDEX/VACUUM blast radius to the app's
 * own base tables so an admin cannot drive them at a view/system relation.
 */
async function tableExists(table: string): Promise<boolean> {
	const rows = (await sql.unsafe(
		`SELECT 1 FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name = $1`,
		[table],
	)) as unknown[];
	return rows.length > 0;
}

async function execSql(sqlQuery: string, errors: unknown[]): Promise<boolean> {
	try {
		await sql.unsafe(sqlQuery, []);
		return true;
	} catch (error) {
		errors.push((error as Error).message);
		return false;
	}
}

function finishResponse(response: AssetResponse): AssetResponse {
	response.result = true;
	response.msg =
		response.errors.length > 0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';
	return response;
}

/** CREATE EXTENSION sentences (must precede trgm/unaccent-backed indexes). */
export async function createExtensions(): Promise<AssetResponse> {
	const response = newResponse();
	for (const sentence of definitions.ar_extensions as string[]) {
		if (await execSql(cleanSql(sentence), response.errors)) response.success++;
	}
	return finishResponse(response);
}

/**
 * CREATE the declared tables (matrix_search_values etc.). ADD-ONLY by design:
 * table entries carry an empty `drop` — these are derived stores whose wipe
 * would silently lose backfilled data on every recreate run; their `add` is
 * IF NOT EXISTS so re-runs are no-ops. Runs BEFORE functions/triggers so the
 * trigger bodies have their target relation.
 */
export async function rebuildTables(): Promise<AssetResponse> {
	const response = newResponse();
	const entries = definitions.ar_table as AssetEntry[];
	for (const entry of entries) {
		const drop = cleanSql(entry.drop);
		if (drop !== '' && !(await execSql(drop, response.errors))) continue;
		const add = cleanSql(entry.add);
		if (add !== '' && !(await execSql(add, response.errors))) continue;
		response.success++;
	}
	return finishResponse(response);
}

/**
 * Drop + recreate the declared per-table triggers (the matrix_search_values
 * sync). Runs AFTER functions: the function rebuild's DROP … CASCADE removes
 * dependent triggers, so this pass restores them.
 */
export function rebuildTriggers(): Promise<AssetResponse> {
	return rebuildTemplated(definitions.ar_trigger as AssetEntry[]);
}

/** Drop + recreate the declared SQL functions (f_unaccent etc.). */
export async function rebuildFunctions(): Promise<AssetResponse> {
	const response = newResponse();
	const entries = definitions.ar_function as AssetEntry[];
	for (const entry of entries) {
		const drop = cleanSql(entry.drop);
		if (drop !== '' && !(await execSql(drop, response.errors))) continue;
		const add = cleanSql(entry.add);
		if (add !== '' && !(await execSql(add, response.errors))) continue;
		response.success++;
	}
	finishResponse(response);
	response.n_queries = entries.length;
	response.n_errors = response.errors.length;
	return response;
}

/** Per-entry, per-declared-table drop + add (constraints / indexes). */
async function rebuildTemplated(
	entries: AssetEntry[],
	selectedTables: string[] = [],
): Promise<AssetResponse> {
	const response = newResponse();
	for (const entry of entries) {
		for (const table of entry.tables ?? []) {
			if (selectedTables.length > 0 && !selectedTables.includes(table)) continue;
			if (!(await tableExists(table))) {
				response.errors.push(`Table ${table} does not exist. Ignored ${entry.name}`);
				continue;
			}
			const drop = cleanSql(entry.drop.replaceAll('{$table}', table));
			if (drop !== '' && !(await execSql(drop, response.errors))) continue;
			const add = cleanSql(entry.add.replaceAll('{$table}', table));
			if (add !== '' && !(await execSql(add, response.errors))) continue;
		}
		response.success++;
	}
	return finishResponse(response);
}

export function rebuildConstraints(): Promise<AssetResponse> {
	return rebuildTemplated(definitions.ar_constraint as AssetEntry[]);
}

export function rebuildIndexes(selectedTables: string[] = []): Promise<AssetResponse> {
	return rebuildTemplated(definitions.ar_index as AssetEntry[], selectedTables);
}

/** The ar_maintenance sentences (REINDEX TABLE …; etc.). */
export async function execMaintenance(): Promise<AssetResponse> {
	const response = newResponse();
	for (const sentence of definitions.ar_maintenance as string[]) {
		if (await execSql(cleanSql(sentence), response.errors)) response.success++;
	}
	return finishResponse(response);
}

/**
 * PHP recreate_db_assets order, extended with the TS-side additions:
 * extensions → tables → constraints → functions → triggers → indexes →
 * maintenance. Tables precede functions (trigger bodies reference the store);
 * triggers follow functions (the function DROP CASCADE removed them).
 */
export async function recreateDbAssets(): Promise<{
	result: Record<string, unknown>;
	msg: string;
	errors: unknown[];
	success: number;
}> {
	const errors: unknown[] = [];
	const extensions = await createExtensions();
	errors.push(...extensions.errors);
	const tables = await rebuildTables();
	errors.push(...tables.errors);
	const constraints = await rebuildConstraints();
	errors.push(...constraints.errors);
	const functions = await rebuildFunctions();
	errors.push(...functions.errors);
	const triggers = await rebuildTriggers();
	errors.push(...triggers.errors);
	const indexes = await rebuildIndexes();
	errors.push(...indexes.errors);
	const maintenance = await execMaintenance();
	errors.push(...maintenance.errors);
	return {
		result: {
			extensions: extensions.result,
			tables: tables.result,
			constraints: constraints.result,
			functions: functions.result,
			triggers: triggers.result,
			indexes: indexes.result,
			maintenance: maintenance.result,
		},
		msg: errors.length > 0 ? 'Warning. Request done with errors' : 'OK. Request done successfully',
		errors,
		success: errors.length > 0 ? 0 : 1,
	};
}

/**
 * PHP db_tasks::optimize_tables: per validated table, REINDEX TABLE
 * CONCURRENTLY then VACUUM ANALYZE (PHP shells out to psql because these
 * cannot run inside a transaction; the driver's simple-query path runs them
 * directly).
 */
export async function optimizeTables(tables: string[]): Promise<{
	result: boolean;
	msg: string;
	errors: unknown[];
	reindex: Record<string, string>;
	vacuum: Record<string, string>;
}> {
	const response = {
		result: false,
		msg: 'Error. Request failed',
		errors: [] as unknown[],
		reindex: {} as Record<string, string>,
		vacuum: {} as Record<string, string>,
	};
	const validTables: string[] = [];
	for (const table of tables) {
		if (typeof table !== 'string' || table === '') {
			response.errors.push(`Invalid table name: ${String(table)}`);
			continue;
		}
		if (!/^[a-zA-Z0-9_.]+$/.test(table)) {
			response.errors.push(`Invalid table name format: ${table}`);
			continue;
		}
		if (!(await tableExists(table))) {
			response.errors.push(`Table does not exist: ${table}`);
			continue;
		}
		validTables.push(table);
	}
	if (validTables.length === 0) {
		response.errors.push('No valid tables to optimize');
		return response;
	}
	for (const table of validTables) {
		try {
			await sql.unsafe(`REINDEX TABLE CONCURRENTLY "${table}"`, []);
			response.reindex[table] = 'REINDEX\n'; // psql command-tag echo, PHP shape
		} catch (error) {
			response.reindex[table] = (error as Error).message;
			response.errors.push(`REINDEX failed for table: ${table}`);
		}
	}
	for (const table of validTables) {
		try {
			await sql.unsafe(`VACUUM ANALYZE "${table}"`, []);
			response.vacuum[table] = 'VACUUM\n'; // psql command-tag echo, PHP shape
		} catch (error) {
			response.vacuum[table] = (error as Error).message;
			response.errors.push(`VACUUM failed for table: ${table}`);
		}
	}
	response.result = true;
	response.msg =
		response.errors.length > 0
			? 'Warning. Request done with errors'
			: `Successfully optimized ${validTables.length} table(s)`;
	return response;
}
