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

import { sectionIdAddressSqlPredicate } from '../concepts/section_id.ts';
import definitions from './db_pg_definitions.json';
import { classifyIndex, type LiveIndex, policyForTable } from './matrix_index_policy.ts';
import { runWithoutStatementTimeout, sql, withTransaction } from './postgres.ts';

export interface AssetEntry {
	tables?: string[];
	add: string;
	drop: string;
	name: string;
	info?: string;
}

interface AssetResponse {
	/** INTERNAL outcome discriminator (never a wire body). */
	ok: boolean;
	msg: string;
	errors: unknown[];
	success: number;
	[extra: string]: unknown;
}

function newResponse(): AssetResponse {
	return { ok: false, msg: 'Error. Request failed ', errors: [], success: 0 };
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

/**
 * execSql for a sentence that is SUPPOSED to run for minutes (REINDEX / VACUUM
 * [FULL] on a production-scale table): opts out of the pool-wide
 * statement_timeout ceiling (WC-055) so setting that ceiling for request
 * traffic cannot abort a maintenance run.
 */
async function execLongSql(sqlQuery: string, errors: unknown[]): Promise<boolean> {
	try {
		await runWithoutStatementTimeout(sqlQuery);
		return true;
	} catch (error) {
		errors.push((error as Error).message);
		return false;
	}
}

function finishResponse(response: AssetResponse): AssetResponse {
	response.ok = true;
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
	// Every ar_maintenance sentence is a REINDEX/VACUUM (incl. VACUUM FULL) — the
	// long-by-design class, so they run unbounded (WC-055).
	for (const sentence of definitions.ar_maintenance as string[]) {
		if (await execLongSql(cleanSql(sentence), response.errors)) response.success++;
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
	/** Per-step outcome map — a PAYLOAD, not a discriminator. */
	data: Record<string, unknown>;
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
		data: {
			extensions: extensions.ok,
			tables: tables.ok,
			constraints: constraints.ok,
			functions: functions.ok,
			triggers: triggers.ok,
			indexes: indexes.ok,
			maintenance: maintenance.ok,
		},
		msg: errors.length > 0 ? 'Warning. Request done with errors' : 'OK. Request done successfully',
		errors,
		success: errors.length > 0 ? 0 : 1,
	};
}

/**
 * The SQL side of the record-address law (concepts/section_id.ts): a locator
 * is indexed only when its section_id IS a record address the int4 column can
 * hold — strict numeric text, no leading zero, int4-bounded. The trigger body
 * in db_pg_definitions.json carries the SAME predicate text (pinned by
 * value_law_agreement_tripwire); a zero-padded external id ('001338683') is
 * the value and is never cast (DATA-26).
 */
export const RELATION_INDEX_ADDRESS_PREDICATE = sectionIdAddressSqlPredicate("e->>'section_id'");

/**
 * One derived search store's backfill contract: the trigger entry whose
 * `tables` list is the SINGLE source of truth for coverage, and the per-table
 * INSERT…SELECT whose row filter MUST mirror the sync trigger function's —
 * a backfilled store must be indistinguishable from a trigger-maintained one.
 *
 * COVERAGE IS PER (store, table) (DATA-32): a store already populated for
 * twenty tables says nothing about the twenty-first. `holdsRowsFor` asks
 * whether the store carries rows for THIS table's records, `deleteFor` clears
 * exactly those before a per-table refill — so a table newly added to the
 * sync list is backfilled at boot without touching its siblings' rows.
 */
export const SEARCH_STORE_BACKFILLS: {
	store: string;
	triggerEntry: string;
	insert: (table: string) => string;
	/** LIMIT-1 "would the backfill produce a row from this table?" probe —
	 * the SAME row filter as `insert` (and as the sync trigger function). */
	probe: (table: string) => string;
	/** LIMIT-1 "does the store hold a row for one of this table's records?"
	 * (both stores carry a (section_tipo, section_id) btree). */
	holdsRowsFor: (table: string) => string;
	/** The store rows of this table's records — the per-table refill's DELETE. */
	deleteFor: (table: string) => string;
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
		holdsRowsFor: (table) => `
			SELECT 1 AS one FROM "${table}" t
			WHERE EXISTS (SELECT 1 FROM matrix_string_search s
			              WHERE s.section_tipo = t.section_tipo AND s.section_id = t.section_id)
			LIMIT 1`,
		deleteFor: (table) => `
			DELETE FROM matrix_string_search s USING "${table}" t
			WHERE s.section_tipo = t.section_tipo AND s.section_id = t.section_id`,
	},
	{
		store: 'matrix_relation_index',
		triggerEntry: 'all_matrix_relation_index_sync',
		// twin of matrix_relation_index_sync() (ar_function; the record-address guard)
		insert: (table) => `
			INSERT INTO matrix_relation_index (section_tipo, section_id, from_component_tipo, type, target_section_tipo, target_section_id)
			SELECT m.section_tipo, m.section_id, kv.key, e->>'type', e->>'section_tipo', (e->>'section_id')::int
			FROM "${table}" m, jsonb_each(m.relation) AS kv, jsonb_array_elements(kv.value) AS e
			WHERE m.relation IS NOT NULL AND jsonb_typeof(kv.value) = 'array'
			  AND e->>'section_tipo' IS NOT NULL AND ${RELATION_INDEX_ADDRESS_PREDICATE}`,
		probe: (table) => `
			SELECT 1 AS one
			FROM "${table}" m, jsonb_each(m.relation) AS kv, jsonb_array_elements(kv.value) AS e
			WHERE m.relation IS NOT NULL AND jsonb_typeof(kv.value) = 'array'
			  AND e->>'section_tipo' IS NOT NULL AND ${RELATION_INDEX_ADDRESS_PREDICATE} LIMIT 1`,
		holdsRowsFor: (table) => `
			SELECT 1 AS one FROM "${table}" t
			WHERE EXISTS (SELECT 1 FROM matrix_relation_index s
			              WHERE s.section_tipo = t.section_tipo AND s.section_id = t.section_id)
			LIMIT 1`,
		deleteFor: (table) => `
			DELETE FROM matrix_relation_index s USING "${table}" t
			WHERE s.section_tipo = t.section_tipo AND s.section_id = t.section_id`,
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

/** One (store, table) pair — the unit of derived-store coverage (DATA-32). */
export interface SearchStoreTable {
	store: string;
	table: string;
}

/**
 * PER-TABLE refill (DATA-32): for each (store, table) DELETE the store rows of
 * that table's records and INSERT them afresh, in ONE transaction per pair —
 * the boot self-heal for a table newly added to a sync list on an install
 * whose store already holds other tables' rows (TRUNCATE there would wipe
 * millions of healthy rows to repair one table). Same INSERT as the full
 * rebuild, so the refilled rows are indistinguishable from trigger-maintained
 * ones. Callers clear the search-store cache afterwards.
 */
export async function backfillSearchStoreTables(
	targets: readonly SearchStoreTable[],
): Promise<AssetResponse> {
	const response = newResponse();
	for (const { store, table } of targets) {
		const contract = SEARCH_STORE_BACKFILLS.find((candidate) => candidate.store === store);
		if (contract === undefined) {
			response.errors.push(`No derived store '${store}'`);
			continue;
		}
		if (!(await tableExists(store))) {
			response.errors.push(`Store ${store} does not exist — run recreate_db_assets first`);
			continue;
		}
		if (!(await tableExists(table))) {
			response.errors.push(`Table ${table} does not exist. Ignored ${store} backfill`);
			continue;
		}
		try {
			await withTransaction(async () => {
				await sql.unsafe(cleanSql(contract.deleteFor(table)), []);
				await sql.unsafe(cleanSql(contract.insert(table)), []);
			});
		} catch (error) {
			// The raw text goes to the log; the wire gets a sentence (A6, SEC-18).
			console.error(`db_assets: ${store}/${table} per-table backfill failed:`, error);
			response.errors.push(`${store}/${table} backfill failed — see the server log`);
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
	/** Stores refilled by this run (per-table refills, DATA-32), with their final row counts. */
	backfilled: Record<string, number>;
	/** The (store, table) pairs this run refilled. */
	backfilledTables: SearchStoreTable[];
	errors: unknown[];
}

/**
 * The trigger identifiers the DDL probe expects to find, derived PURELY from
 * the definitions: `{table}{suffix}` per declared table that EXISTS on this
 * install, where the suffix is the entry name minus its `all_matrix` prefix
 * (`all_matrix_string_search_sync` → `_string_search_sync`). The prefix is
 * `all_matrix`, NOT `all_` — stripping only `all_` yields
 * `matrix_testmatrix_string_search_sync`, which matches no trigger and would
 * make every boot re-run the DDL pass. The derived name must equal the
 * identifier in the entry's own `CREATE TRIGGER {$table}_…` add (pinned by the
 * gate), which is why this is derivation and not a second source of truth.
 */
export function expectedTriggerNames(
	entries: AssetEntry[],
	present: ReadonlySet<string>,
): string[] {
	const expected: string[] = [];
	for (const entry of entries) {
		const suffix = entry.name.replace(/^all_matrix/, ''); // all_matrix_string_search_sync → _string_search_sync
		for (const table of entry.tables ?? []) {
			if (present.has(table)) expected.push(`${table}${suffix}`);
		}
	}
	return expected;
}

/** What the READ-ONLY search-store DDL probe observed. */
export interface SearchStoresInspection {
	/** Declared source tables + store tables that exist as public BASE TABLEs. */
	present: Set<string>;
	/** The store table names (matrix_string_search, matrix_relation_index). */
	storeTables: string[];
	/** Trigger identifiers expected on the EXISTING declared tables. */
	expectedTriggers: string[];
	/** How many of those exist as non-internal triggers. */
	presentTriggerCount: number;
	/**
	 * Sync trigger FUNCTIONS whose installed body differs from the declared one
	 * (db_pg_definitions.json is the single source of truth; CREATE OR REPLACE
	 * only lands when the DDL pass runs, so a changed row filter — the DATA-26
	 * record-address predicate — would otherwise stay stale on every existing
	 * install until an operator rebuilt functions by hand). Non-empty → DDL.
	 */
	staleFunctions: string[];
	/** True = a store table, a sync trigger or a sync function body is missing/stale → DDL pass needed. */
	ddlNeeded: boolean;
}

/**
 * The sync function each derived-store trigger entry executes, derived from
 * the entry's own `CREATE TRIGGER … EXECUTE FUNCTION <name>()` text (never a
 * second list), paired with the declared function body (the text between the
 * `$BODY$` delimiters of the matching ar_function `add`, whitespace-collapsed
 * — `cleanSql` turns tabs into spaces before it reaches Postgres, and
 * pg_proc.prosrc stores the body verbatim).
 */
export function declaredSyncFunctions(
	triggerEntries: readonly AssetEntry[],
): { name: string; body: string }[] {
	const out: { name: string; body: string }[] = [];
	for (const entry of triggerEntries) {
		const name = /EXECUTE FUNCTION ([a-z_][a-z0-9_]*)\(\)/.exec(entry.add)?.[1];
		if (name === undefined) continue;
		const fn = (definitions.ar_function as AssetEntry[]).find((f) => f.name === name);
		const body = fn === undefined ? null : /\$BODY\$([\s\S]*?)\$BODY\$/.exec(fn.add)?.[1];
		if (typeof body !== 'string') continue;
		out.push({ name, body: collapseWhitespace(body) });
	}
	return out;
}

function collapseWhitespace(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}

/**
 * READ-ONLY half of ensureSearchStores step 1: two catalog queries (existing
 * tables, then — only when both stores exist — the non-internal trigger count).
 * Nothing here writes; it is the operator-previewable probe and the gate seam.
 *
 * A missing store table short-circuits: the trigger query is NOT issued (its
 * expected list would be meaningless), so `expectedTriggers` is `[]` and
 * `presentTriggerCount` 0 in that case — the same two-vs-one query shape the
 * boot path has always had.
 */
export async function inspectSearchStores(): Promise<SearchStoresInspection> {
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

	if (storeTables.some((store) => !present.has(store))) {
		return {
			present,
			storeTables,
			expectedTriggers: [],
			presentTriggerCount: 0,
			staleFunctions: [],
			ddlNeeded: true,
		};
	}

	const expectedTriggers = expectedTriggerNames(triggerEntries, present);
	const triggerRows = (await sql.unsafe(
		`SELECT count(*)::int AS n FROM pg_trigger
		 WHERE NOT tgisinternal
		   AND tgname IN (SELECT jsonb_array_elements_text($1::text::jsonb))`,
		[JSON.stringify(expectedTriggers)],
	)) as { n: number }[];
	const presentTriggerCount = Number(triggerRows[0]?.n ?? 0);

	// Function-body drift: the installed prosrc of each sync function vs the
	// declared body (DATA-26 — a stale row filter is a silent mis-cast, not a
	// missing object, so presence alone cannot detect it).
	const staleFunctions: string[] = [];
	for (const { name, body } of declaredSyncFunctions(triggerEntries)) {
		const rows = (await sql.unsafe(
			`SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
			 WHERE n.nspname = 'public' AND p.proname = $1 LIMIT 1`,
			[name],
		)) as { prosrc: string }[];
		const installed = rows[0]?.prosrc;
		if (installed === undefined || collapseWhitespace(installed) !== body)
			staleFunctions.push(name);
	}

	return {
		present,
		storeTables,
		expectedTriggers,
		presentTriggerCount,
		staleFunctions,
		ddlNeeded: presentTriggerCount !== expectedTriggers.length || staleFunctions.length > 0,
	};
}

/** What the READ-ONLY backfill probe observed about ONE (store, table) pair. */
export interface SearchStoreObservation {
	/** Store table name (matrix_string_search | matrix_relation_index). */
	store: string;
	/** A PRESENT declared source table of that store. */
	table: string;
	/** The store table exists (false = the DDL pass above failed for it). */
	exists: boolean;
	/** The store holds at least one row for one of THIS table's records. */
	holdsRows: boolean;
	/**
	 * This table's rows would produce at least one store row (the trigger's
	 * own row filter, LIMIT 1). Probed only when `holdsRows` is false — a
	 * covered table needs no source probe.
	 */
	sourceProducesRows: boolean;
}

/** The compute half of ensureSearchStores: what must be DONE, given what was OBSERVED. */
export interface SearchStoresDecision {
	/** A store table, a sync trigger or a sync function body is missing/stale → run the DDL passes. */
	ddlNeeded: boolean;
	/** (store, table) pairs to refill: store exists, holds no row for the table, the table would produce some. */
	tablesNeedingBackfill: SearchStoreTable[];
	/** Nothing to do — derived from BOTH probes, never defaulted. */
	healthy: boolean;
}

/**
 * READ-ONLY second half of the ensureSearchStores probe, PER (store, table)
 * (DATA-32): for every declared store and every PRESENT declared source table,
 * does the store exist, does it hold rows for that table's records, and — only
 * when it does not — would the table produce any. Nothing here writes; the ACT
 * (per-table DELETE + INSERT) is decided by decideSearchStores and run by the
 * caller.
 *
 * `present` is the PRE-DDL table snapshot from inspectSearchStores — the
 * source tables are filtered with it. A store-wide emptiness probe is NOT the
 * gate any more: it answered "covered" for a table the store had never seen
 * as long as any other table had rows in it.
 */
export async function observeSearchStores(
	present: ReadonlySet<string>,
): Promise<SearchStoreObservation[]> {
	const observations: SearchStoreObservation[] = [];
	for (const { store, triggerEntry, probe, holdsRowsFor } of SEARCH_STORE_BACKFILLS) {
		const entry = (definitions.ar_trigger as AssetEntry[]).find(
			(candidate) => candidate.name === triggerEntry,
		);
		const tables = (entry?.tables ?? []).filter((table) => present.has(table));
		if (!(await tableExists(store))) {
			// DDL failed above — already in errors
			for (const table of tables) {
				observations.push({
					store,
					table,
					exists: false,
					holdsRows: false,
					sourceProducesRows: false,
				});
			}
			continue;
		}
		for (const table of tables) {
			const held = (await sql.unsafe(cleanSql(holdsRowsFor(table)), [])) as unknown[];
			if (held.length > 0) {
				observations.push({
					store,
					table,
					exists: true,
					holdsRows: true,
					sourceProducesRows: false,
				});
				continue;
			}
			const rows = (await sql.unsafe(cleanSql(probe(table)), [])) as unknown[];
			observations.push({
				store,
				table,
				exists: true,
				holdsRows: false,
				sourceProducesRows: rows.length > 0,
			});
		}
	}
	return observations;
}

/**
 * PURE fold: the boot decision, from the two read-only probes. Extracted from
 * ensureSearchStores (which consumes exactly this object) because BOTH failure
 * directions are expensive and silent — a false `ddlNeeded` re-runs the
 * extension/table/function/trigger/index passes on every restart, and a lost
 * `holdsRows`/`exists` guard rewrites a populated multi-million-row store on
 * boot.
 *
 * A (store, table) pair is refilled only when the store EXISTS, holds NO row
 * for that table's records, and the table would produce some. A table whose
 * records produce nothing is legitimately absent from the store — nothing to
 * do. Per-table, never per-store (DATA-32).
 */
export function decideSearchStores(
	inspection: Pick<SearchStoresInspection, 'ddlNeeded'>,
	observations: readonly SearchStoreObservation[],
): SearchStoresDecision {
	const tablesNeedingBackfill = observations
		.filter(
			(observation) =>
				observation.exists && !observation.holdsRows && observation.sourceProducesRows,
		)
		.map(({ store, table }) => ({ store, table }));
	return {
		ddlNeeded: inspection.ddlNeeded,
		tablesNeedingBackfill,
		healthy: !inspection.ddlNeeded && tablesNeedingBackfill.length === 0,
	};
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
 * - missing store table or sync trigger, or a sync function whose installed
 *   body drifted from the declared one → the targeted DDL pass (extensions,
 *   tables, functions — including the drop-only legacy cleanups — triggers,
 *   store indexes), all idempotent;
 * - a (store, table) pair where the store holds no row for the table's records
 *   while the table would produce some (the previous-beta signature, and a table
 *   newly added to a sync list; probe mirrors the trigger row filter) → per-table
 *   refill of THAT pair (DATA-32 — never a store-wide TRUNCATE at boot).
 * The one-time backfill blocks the boot for minutes on a large database —
 * deliberate: until it ran, relation searches would only fail loudly anyway
 * (requireRelationIndex). Failures are returned, not thrown; the caller logs
 * and serves (S1-15 fault-tolerant boot posture).
 *
 * COMPUTE-THEN-ACT: the probes (inspectSearchStores / observeSearchStores) and
 * the fold (decideSearchStores) hold the whole decision and are gated by
 * search_store_{ensure,decision}_native.test.ts; this shell only ACTS on it.
 * COVERAGE-EXEMPT / NAMED EXEMPTION (coverage plan §5.2; reason registered in
 * engineering/crap_coverage_exempt.json): the acted-upon passes themselves (createExtensions /
 * rebuildTables / rebuildFunctions / rebuildTriggers / rebuildConstraints /
 * rebuildIndexes / execMaintenance / backfillSearchStores) are never executed
 * by a gate — they rewrite the shared
 * schema and backfill multi-million-row stores — and that exemption is valid
 * ONLY while the decision above stays gated.
 */
export async function ensureSearchStores(): Promise<EnsureSearchStoresResult> {
	const result: EnsureSearchStoresResult = {
		healthy: true,
		ddlApplied: false,
		backfilled: {},
		backfilledTables: [],
		errors: [],
	};

	// 1. DDL probe (read-only): both store tables + every sync trigger on every
	// EXISTING declared table. `present` is deliberately the PRE-DDL snapshot —
	// step 2 filters its probe tables with it, exactly as before.
	const inspection = await inspectSearchStores();

	if (inspection.ddlNeeded) {
		result.ddlApplied = true;
		const passes = [
			await createExtensions(),
			await rebuildTables(),
			await rebuildFunctions(),
			await rebuildTriggers(),
			await rebuildIndexes(inspection.storeTables),
		];
		for (const pass of passes) result.errors.push(...pass.errors);
	}

	// 2. Backfill probe per store (read-only), then the DECISION both halves fold to.
	const observations = await observeSearchStores(inspection.present);
	const decision = decideSearchStores(inspection, observations);
	result.healthy = decision.healthy;

	if (decision.tablesNeedingBackfill.length > 0) {
		const backfill = await backfillSearchStoreTables(decision.tablesNeedingBackfill);
		result.errors.push(...backfill.errors);
		result.backfilledTables = decision.tablesNeedingBackfill;
		for (const { store } of decision.tablesNeedingBackfill) {
			result.backfilled[store] = Number(backfill[`${store}_rows`] ?? 0);
		}
	}

	return result;
}

/** One index dropped by pruneMatrixIndexes, for the widget report. */
interface PrunedIndex {
	name: string;
	size: string;
	reason: string;
}

/** pruneMatrixIndexes outcome for one governed table. */
export interface MatrixPruneReport {
	dropped: PrunedIndex[];
	reclaimed: string;
	kept: number;
	/** Reported, not dropped (bespoke, or a cold index left for a human). */
	review: string[];
}

function prettyBytes(bytes: number): string {
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value.toFixed(value < 10 && unit > 0 ? 1 : 0)} ${units[unit]}`;
}

/**
 * Prune the dead/redundant indexes of ONE append-only log table on the ACTIVE
 * database, per the reviewed policy (matrix_index_policy.ts). Run as the first
 * step of "Optimize tables" (database_info widget) for a policy-governed table:
 * the PHP-era logs (matrix_activity, matrix_time_machine) accreted indexes the
 * planner never picks for the shapes this engine emits (WC-046) — each is dead
 * weight on the hottest insert path. Conservative: never drops a constraint,
 * 'keep', or unclassified index, or a 'dead' one the DB proves is used; a
 * single-tipo redundancy downgrades to a report on a multi-tipo table. Uses
 * DROP INDEX CONCURRENTLY (no long lock — same posture as the REINDEX that
 * follows). `dryRun` classifies + reports WITHOUT dropping (operator preview /
 * gate). Returns null for a non-governed table.
 */
export async function pruneMatrixIndexes(
	table: string,
	options: { dryRun?: boolean } = {},
): Promise<MatrixPruneReport | null> {
	const policy = policyForTable(table);
	if (policy === undefined) return null;

	const rows = (await sql.unsafe(
		`SELECT i.relname AS name,
		        pg_get_indexdef(i.oid) AS def,
		        (c.conindid IS NOT NULL) AS is_constraint,
		        COALESCE(s.idx_scan, 0)::bigint AS idx_scan,
		        pg_relation_size(i.oid)::bigint AS size_bytes
		 FROM pg_class i
		 JOIN pg_index ix ON ix.indexrelid = i.oid
		 JOIN pg_class t ON t.oid = ix.indrelid
		 LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
		 LEFT JOIN pg_constraint c ON c.conindid = i.oid
		 WHERE t.relname = $1`,
		[table],
	)) as {
		name: string;
		def: string;
		is_constraint: boolean;
		idx_scan: number | string;
		size_bytes: number | string;
	}[];
	const indexes: LiveIndex[] = rows.map((row) => ({
		name: row.name,
		indexDef: row.def,
		isConstraint: row.is_constraint === true,
		idxScan: Number(row.idx_scan),
		sizeBytes: Number(row.size_bytes),
	}));

	// Single-tipo gate for the redundancy claims that depend on it: pg_stats'
	// estimate first (no scan), exact count only to settle the "== 1" boundary.
	const est = (await sql.unsafe(
		`SELECT n_distinct FROM pg_stats WHERE tablename = $1 AND attname = 'section_tipo'`,
		[table],
	)) as { n_distinct: number | string }[];
	let distinctTipo = est[0]?.n_distinct != null ? Number(est[0].n_distinct) : 0;
	if (!(distinctTipo > 1.5)) {
		const exact = (await sql.unsafe(
			`SELECT count(DISTINCT section_tipo)::int AS c FROM ${table}`,
			[],
		)) as { c: number }[];
		distinctTipo = Number(exact[0]?.c ?? 0);
	}
	const singleTipo = distinctTipo <= 1;

	const report: MatrixPruneReport = { dropped: [], reclaimed: '0 B', kept: 0, review: [] };
	let reclaimedBytes = 0;
	for (const index of indexes) {
		const verdict = classifyIndex(index, policy, { singleTipo, includeReview: false });
		if (verdict.action === 'drop') {
			// CONCURRENTLY: no ACCESS EXCLUSIVE lock on the (live) table.
			if (options.dryRun !== true) {
				// Unbounded: a CONCURRENTLY drop on a multi-GB index outlives any
				// request-traffic statement_timeout ceiling (WC-055).
				await runWithoutStatementTimeout(`DROP INDEX CONCURRENTLY IF EXISTS "${index.name}"`);
			}
			report.dropped.push({
				name: index.name,
				size: prettyBytes(index.sizeBytes),
				reason: verdict.reason,
			});
			reclaimedBytes += index.sizeBytes;
		} else if (verdict.action === 'keep') {
			report.kept++;
		} else {
			report.review.push(`${index.name} (${verdict.action}): ${verdict.reason}`);
		}
	}
	report.reclaimed = prettyBytes(reclaimedBytes);
	return report;
}

/**
 * PHP db_tasks::optimize_tables: per validated table, REINDEX TABLE
 * CONCURRENTLY then VACUUM ANALYZE (PHP shells out to psql because these
 * cannot run inside a transaction; the driver's simple-query path runs them
 * directly). TS ADDITION (WC-046): a policy-governed append-only log
 * (matrix_activity/matrix_time_machine) is PRUNED first — drop the dead/
 * redundant PHP-era indexes so REINDEX does not rebuild bloat we are removing.
 *
 * `dryRun` makes the whole run non-destructive: validation still reports, the
 * prune still CLASSIFIES (pruneMatrixIndexes' own dryRun) so the operator sees
 * what would be dropped, and the REINDEX/VACUUM sentences are neither executed
 * nor recorded — an empty `reindex`/`vacuum` map IS the "nothing was done"
 * signal. Default (`dryRun` absent/false) is the destructive path, unchanged.
 */
export async function optimizeTables(
	tables: string[],
	options: { dryRun?: boolean } = {},
): Promise<{
	ok: boolean;
	msg: string;
	errors: unknown[];
	reindex: Record<string, string>;
	vacuum: Record<string, string>;
	prune: Record<string, MatrixPruneReport>;
}> {
	const response = {
		ok: false,
		msg: 'Error. Request failed',
		errors: [] as unknown[],
		reindex: {} as Record<string, string>,
		vacuum: {} as Record<string, string>,
		prune: {} as Record<string, MatrixPruneReport>,
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
	// Prune dead/redundant indexes on the governed logs BEFORE reindexing, so
	// REINDEX does not waste work rebuilding indexes we are about to drop.
	const dryRun = options.dryRun === true;
	for (const table of validTables) {
		try {
			const pruned = await pruneMatrixIndexes(table, { dryRun });
			if (pruned !== null) response.prune[table] = pruned;
		} catch (error) {
			response.errors.push(`PRUNE failed for table ${table}: ${(error as Error).message}`);
		}
	}
	for (const table of dryRun ? [] : validTables) {
		try {
			await runWithoutStatementTimeout(`REINDEX TABLE CONCURRENTLY "${table}"`);
			response.reindex[table] = 'REINDEX\n'; // psql command-tag echo, PHP shape
		} catch (error) {
			response.reindex[table] = (error as Error).message;
			response.errors.push(`REINDEX failed for table: ${table}`);
		}
	}
	for (const table of dryRun ? [] : validTables) {
		try {
			await runWithoutStatementTimeout(`VACUUM ANALYZE "${table}"`);
			response.vacuum[table] = 'VACUUM\n'; // psql command-tag echo, PHP shape
		} catch (error) {
			response.vacuum[table] = (error as Error).message;
			response.errors.push(`VACUUM failed for table: ${table}`);
		}
	}
	response.ok = true;
	response.msg =
		response.errors.length > 0
			? 'Warning. Request done with errors'
			: `Successfully optimized ${validTables.length} table(s)`;
	return response;
}
