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
import { sql, withTransaction } from './postgres.ts';

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
 * CREATE the declared tables (matrix_search_values etc.). The recorded `drop`
 * is the deliberate-teardown DEFINITION and is NOT executed here (see
 * applyIdempotentEntries): these are derived stores whose wipe would silently
 * lose backfilled data on every recreate run; their `add` is IF NOT EXISTS so
 * re-runs are no-ops. Runs BEFORE functions/triggers so the trigger bodies
 * have their target relation.
 */
export function rebuildTables(): Promise<AssetResponse> {
	return applyIdempotentEntries(definitions.ar_table as AssetEntry[]);
}

/**
 * Shared applier for entries whose `add` is IDEMPOTENT (CREATE OR REPLACE /
 * IF NOT EXISTS): runs `add` only. The `drop` DDL stays RECORDED in the entry
 * — it is the definition an operator (or a deliberate migration) executes by
 * hand — but a routine rebuild must never run it: DROP … CASCADE destroys
 * dependents (2026-07-19 incident: a standalone rebuild_db_functions
 * cascade-dropped all 96 data_relations_flat_* functional GIN indexes + the
 * ontology trigram index; inverse-relation lookups seq-scanned at ~8s and
 * record edit views took 18s until they were rebuilt). Entries with an EMPTY
 * `add` are pure cleanups (retired objects) — for those the drop IS the
 * action and does run.
 */
async function applyIdempotentEntries(entries: AssetEntry[]): Promise<AssetResponse> {
	const response = newResponse();
	for (const entry of entries) {
		const add = cleanSql(entry.add);
		if (add === '') {
			// cleanup entry: the drop is the action
			const drop = cleanSql(entry.drop);
			if (drop !== '' && !(await execSql(drop, response.errors))) continue;
		} else if (!(await execSql(add, response.errors))) {
			continue;
		}
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

/**
 * Recreate the declared SQL functions (f_unaccent etc.) via their idempotent
 * `CREATE OR REPLACE` adds — the recorded `drop` definitions are NOT executed
 * on a routine rebuild (see applyIdempotentEntries: the DROP … CASCADE would
 * destroy the functional indexes built on them). A SIGNATURE change cannot
 * use OR REPLACE — that is a deliberate migration: this rebuild fails loudly,
 * then the operator runs the entry's recorded drop AND rebuilds the
 * dependents explicitly.
 */
export async function rebuildFunctions(): Promise<AssetResponse> {
	const entries = definitions.ar_function as AssetEntry[];
	const response = await applyIdempotentEntries(entries);
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
 * One derived search store's backfill contract: the trigger entry whose
 * `tables` list is the SINGLE source of truth for coverage, and the per-table
 * INSERT…SELECT whose row filter MUST mirror the sync trigger function's —
 * a backfilled store must be indistinguishable from a trigger-maintained one.
 */
const SEARCH_STORE_BACKFILLS: {
	store: string;
	triggerEntry: string;
	insert: (table: string) => string;
	/** LIMIT-1 "would the backfill produce a row from this table?" probe —
	 * the SAME row filter as `insert` (and as the sync trigger function). */
	probe: (table: string) => string;
}[] = [
	{
		store: 'matrix_string_search',
		triggerEntry: 'all_matrix_string_search_sync',
		// twin of matrix_string_search_sync() (ar_function)
		insert: (table) => `
			INSERT INTO matrix_string_search (section_tipo, section_id, component_tipo, string)
			SELECT m.section_tipo, m.section_id, kv.key, lower(f_unaccent(e->>'value'))
			FROM "${table}" m, jsonb_each(m.string) AS kv, jsonb_array_elements(kv.value) AS e
			WHERE m.string IS NOT NULL AND jsonb_typeof(kv.value) = 'array'
			  AND e->>'value' IS NOT NULL AND e->>'value' <> ''`,
		probe: (table) => `
			SELECT 1 AS one
			FROM "${table}" m, jsonb_each(m.string) AS kv, jsonb_array_elements(kv.value) AS e
			WHERE m.string IS NOT NULL AND jsonb_typeof(kv.value) = 'array'
			  AND e->>'value' IS NOT NULL AND e->>'value' <> '' LIMIT 1`,
	},
	{
		store: 'matrix_relation_index',
		triggerEntry: 'all_matrix_relation_index_sync',
		// twin of matrix_relation_index_sync() (ar_function; signed-int id guard)
		insert: (table) => `
			INSERT INTO matrix_relation_index (section_tipo, section_id, from_component_tipo, type, target_section_tipo, target_section_id)
			SELECT m.section_tipo, m.section_id, kv.key, e->>'type', e->>'section_tipo', (e->>'section_id')::int
			FROM "${table}" m, jsonb_each(m.relation) AS kv, jsonb_array_elements(kv.value) AS e
			WHERE m.relation IS NOT NULL AND jsonb_typeof(kv.value) = 'array'
			  AND e->>'section_tipo' IS NOT NULL AND e->>'section_id' ~ '^-?[0-9]+$'`,
		probe: (table) => `
			SELECT 1 AS one
			FROM "${table}" m, jsonb_each(m.relation) AS kv, jsonb_array_elements(kv.value) AS e
			WHERE m.relation IS NOT NULL AND jsonb_typeof(kv.value) = 'array'
			  AND e->>'section_tipo' IS NOT NULL AND e->>'section_id' ~ '^-?[0-9]+$' LIMIT 1`,
	},
];

/**
 * Backfill the derived search stores from their source tables — the
 * maintenance-panel arrival path (the other two are the install dump and the
 * v6→v7 update; a PREVIOUS-BETA v7 instance reaches the current schema with
 * recreate_db_assets followed by this). Per store: TRUNCATE + INSERT…SELECT
 * over the trigger entry's declared tables, in ONE transaction (readers block
 * on the store for the minutes the sweep takes, but never observe a partial
 * or empty store — an empty store with data present makes the coverage gates
 * refuse the store), then ANALYZE for planner statistics. Idempotent; later
 * writes stay in sync via the triggers. Callers must clear the search-store
 * cache afterwards (the widget action does). `onlyStores` narrows the run
 * (the boot ensure refills just the store that needs it); omitted = both.
 */
export async function backfillSearchStores(onlyStores?: string[]): Promise<AssetResponse> {
	const response = newResponse();
	const selected =
		onlyStores === undefined
			? SEARCH_STORE_BACKFILLS
			: SEARCH_STORE_BACKFILLS.filter(({ store }) => onlyStores.includes(store));
	for (const { store, triggerEntry, insert } of selected) {
		if (!(await tableExists(store))) {
			response.errors.push(`Store ${store} does not exist — run recreate_db_assets first`);
			continue;
		}
		const entry = (definitions.ar_trigger as AssetEntry[]).find(
			(candidate) => candidate.name === triggerEntry,
		);
		if (entry === undefined) {
			response.errors.push(`No trigger entry '${triggerEntry}' in db_pg_definitions`);
			continue;
		}
		try {
			await withTransaction(async () => {
				await sql.unsafe(`TRUNCATE "${store}"`, []);
				for (const table of entry.tables ?? []) {
					// absent on this install — the trigger pass skips it the same way
					if (!(await tableExists(table))) continue;
					await sql.unsafe(insert(table), []);
				}
			});
		} catch (error) {
			response.errors.push(`${store} backfill: ${(error as Error).message}`);
			continue;
		}
		await execSql(`ANALYZE "${store}"`, response.errors);
		const counted = (await sql.unsafe(`SELECT count(*)::bigint AS n FROM "${store}"`, [])) as {
			n: number | string;
		}[];
		response[`${store}_rows`] = Number(counted[0]?.n ?? 0);
		response.success++;
	}
	return finishResponse(response);
}

/** What ensureSearchStores found and did — logged by the boot caller. */
export interface EnsureSearchStoresResult {
	/** True = nothing to do (the fast path: a handful of catalog probes). */
	healthy: boolean;
	/** DDL pass ran (missing store table or sync trigger detected). */
	ddlApplied: boolean;
	/** Stores refilled by this run, with their final row counts. */
	backfilled: Record<string, number>;
	errors: unknown[];
}

/**
 * Boot-time self-provisioning of the derived search stores (owner directive
 * 2026-07-21: a database from a previous beta must heal on restart, not via a
 * runbook). Called by startServer AFTER runBootMigrations, BEFORE serving —
 * the same "a request never observes a half-migrated schema" placement. The
 * numbered-migrations runner is NOT the home for this: the store DDL lives in
 * db_pg_definitions.json (single source of truth — a migration file would be
 * a second drifting copy) and the backfill is conditional on data presence.
 *
 * Healthy installs pay ~4 cheap catalog probes. When something is missing:
 * - missing store table or sync trigger → the targeted DDL pass (extensions,
 *   tables, functions — including the drop-only legacy cleanups — triggers,
 *   store indexes), all idempotent;
 * - a store empty while its sources would produce rows (the previous-beta
 *   signature; probe mirrors the trigger row filter) → backfill of THAT store.
 * The one-time backfill blocks the boot for minutes on a large database —
 * deliberate: until it ran, relation searches would only fail loudly anyway
 * (requireRelationIndex). Failures are returned, not thrown; the caller logs
 * and serves (S1-15 fault-tolerant boot posture).
 */
export async function ensureSearchStores(): Promise<EnsureSearchStoresResult> {
	const result: EnsureSearchStoresResult = {
		healthy: true,
		ddlApplied: false,
		backfilled: {},
		errors: [],
	};

	// 1. DDL probe: both store tables + every sync trigger on every EXISTING
	// declared table (one catalog query for tables, one for triggers).
	const triggerEntries = (definitions.ar_trigger as AssetEntry[]).filter((entry) =>
		SEARCH_STORE_BACKFILLS.some(({ triggerEntry }) => triggerEntry === entry.name),
	);
	const declaredTables = [...new Set(triggerEntries.flatMap((entry) => entry.tables ?? []))];
	const storeTables = SEARCH_STORE_BACKFILLS.map(({ store }) => store);
	const presentRows = (await sql.unsafe(
		`SELECT table_name FROM information_schema.tables
		 WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		   AND table_name IN (SELECT jsonb_array_elements_text($1::text::jsonb))`,
		[JSON.stringify([...declaredTables, ...storeTables])],
	)) as { table_name: string }[];
	const present = new Set(presentRows.map((row) => row.table_name));

	let ddlNeeded = storeTables.some((store) => !present.has(store));
	if (!ddlNeeded) {
		// expected trigger names: {table}{suffix} per entry, existing tables only
		const expected: string[] = [];
		for (const entry of triggerEntries) {
			const suffix = entry.name.replace(/^all_matrix/, ''); // all_matrix_string_search_sync → _string_search_sync
			for (const table of entry.tables ?? []) {
				if (present.has(table)) expected.push(`${table}${suffix}`);
			}
		}
		const triggerRows = (await sql.unsafe(
			`SELECT count(*)::int AS n FROM pg_trigger
			 WHERE NOT tgisinternal
			   AND tgname IN (SELECT jsonb_array_elements_text($1::text::jsonb))`,
			[JSON.stringify(expected)],
		)) as { n: number }[];
		ddlNeeded = Number(triggerRows[0]?.n ?? 0) !== expected.length;
	}

	if (ddlNeeded) {
		result.healthy = false;
		result.ddlApplied = true;
		const passes = [
			await createExtensions(),
			await rebuildTables(),
			await rebuildFunctions(),
			await rebuildTriggers(),
			await rebuildIndexes(storeTables),
		];
		for (const pass of passes) result.errors.push(...pass.errors);
	}

	// 2. Backfill probe per store: empty + sources would produce rows.
	const needBackfill: string[] = [];
	for (const { store, triggerEntry, probe } of SEARCH_STORE_BACKFILLS) {
		if (!(await tableExists(store))) continue; // DDL failed above — already in errors
		const any = (await sql.unsafe(`SELECT 1 AS one FROM "${store}" LIMIT 1`, [])) as unknown[];
		if (any.length > 0) continue;
		const entry = (definitions.ar_trigger as AssetEntry[]).find(
			(candidate) => candidate.name === triggerEntry,
		);
		for (const table of entry?.tables ?? []) {
			if (!present.has(table)) continue;
			const rows = (await sql.unsafe(cleanSql(probe(table)), [])) as unknown[];
			if (rows.length > 0) {
				needBackfill.push(store);
				break;
			}
		}
	}

	if (needBackfill.length > 0) {
		result.healthy = false;
		const backfill = await backfillSearchStores(needBackfill);
		result.errors.push(...backfill.errors);
		for (const store of needBackfill) {
			result.backfilled[store] = Number(backfill[`${store}_rows`] ?? 0);
		}
	}

	return result;
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
