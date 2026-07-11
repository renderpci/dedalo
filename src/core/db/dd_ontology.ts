/**
 * dd_ontology write/read layer — the TS port of PHP
 * core/db/class.dd_ontology_db_manager.php.
 *
 * dd_ontology is the ACTIVE runtime table every engine resolves against (see
 * ontology/resolver.ts, which owns the cached READ registry). This module owns
 * the WRITE side plus the raw-row read and search primitives the ontology
 * pipeline needs — mirroring the PHP data-access class byte-for-byte:
 *
 *  - a fixed 13-column allowlist (no dynamic column injection);
 *  - jsonb columns (term / relations / properties) bound as `$n::text::jsonb`
 *    (the Bun double-encode gotcha — see db/matrix_write.ts header);
 *  - `order_number` is int, `propiedades` is TEXT (never jsonb — v6 legacy),
 *    is_model / is_translatable / is_main are booleans;
 *  - `upsertDdOntologyNode` = whole-row INSERT … ON CONFLICT(tipo) DO UPDATE
 *    writing EVERY column, so a cleared matrix component nulls its dd_ontology
 *    column on re-parse (parity with PHP create()'s full-shape upsert);
 *  - `updateDdOntologyColumns` = partial SET with INSERT fallback on 0 rows
 *    (PHP update()'s upsert fallback — the sync_order path);
 *  - the backup-table protocol (dd_ontology_bk) used by regenerate.
 *
 * HARD RULE: this file is the ONLY dd_ontology SQL. Every WRITE ends by fanning
 * out `clearOntologyDerivedCaches()` (the single invalidation chokepoint) so no
 * reader observes a stale node after a mutation.
 *
 * LEDGER / deferred (not needed by Workstream B, ledgered per no-silent-narrowing):
 *  - search_fuzzy_term / search_exact_term (dd_ontology_api term search) — the
 *    trigram/jsonpath fuzzy lookups are out of scope for the definition pipeline.
 *  - the per-request read cache: resolver.ts already caches node reads; this
 *    layer's readDdOntologyRow is an uncached raw-row probe for the parser.
 */

import { clearOntologyDerivedCaches } from '../ontology/cache_invalidation.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { safeTld } from '../ontology/tld.ts';
import { encodeForJsonb } from './json_codec.ts';
import { sql } from './postgres.ts';

/**
 * One dd_ontology node — the shape the parser produces and the writer persists.
 * Field names are the dd_ontology column names (PHP $columns keys).
 */
export interface DdOntologyNode {
	tipo: string;
	parent: string | null;
	/** jsonb object: {lang: label}. */
	term: Record<string, string> | null;
	model: string | null;
	order_number: number | null;
	/** jsonb array: [{tipo}]. */
	relations: { tipo: string }[] | null;
	tld: string | null;
	/** jsonb object (v7 config). */
	properties: Record<string, unknown> | null;
	model_tipo: string | null;
	is_model: boolean;
	is_translatable: boolean;
	is_main: boolean;
	/** TEXT column (v6 legacy JSON text — pretty-printed). */
	propiedades: string | null;
}

/**
 * The column allowlist in PHP declaration order (dd_ontology_db_manager::$columns).
 * Order matters: it fixes the INSERT column/placeholder sequence for parity.
 */
const COLUMNS = [
	'tipo',
	'parent',
	'term',
	'model',
	'order_number',
	'relations',
	'tld',
	'properties',
	'model_tipo',
	'is_model',
	'is_translatable',
	'is_main',
	'propiedades',
] as const;
type DdOntologyColumn = (typeof COLUMNS)[number];

/** Columns stored as JSONB (bound as text::jsonb; propiedades is deliberately excluded). */
const JSON_COLUMNS: ReadonlySet<string> = new Set(['term', 'relations', 'properties']);
/** Columns cast to int. */
const INT_COLUMNS: ReadonlySet<string> = new Set(['order_number']);
/** Boolean flag columns. */
const BOOLEAN_COLUMNS: ReadonlySet<string> = new Set(['is_model', 'is_translatable', 'is_main']);

/** Search operator allowlist (PHP dd_ontology_db_manager::search $allowed_ops). */
const ALLOWED_OPS: ReadonlySet<string> = new Set([
	'=',
	'!=',
	'<',
	'>',
	'<=',
	'>=',
	'LIKE',
	'ILIKE',
	'@>',
]);

/**
 * Bind one column's value to the SQL parameter form the column type dictates.
 * jsonb → text (Postgres parses it), boolean → 't'/'f', int → the int (bound as
 * text — Postgres coerces), everything else → the value as-is (null stays null).
 */
function boundValueFor(column: string, value: unknown): string | number | null {
	if (JSON_COLUMNS.has(column)) {
		return value === null || value === undefined ? null : encodeForJsonb(value);
	}
	if (BOOLEAN_COLUMNS.has(column)) {
		// PHP create() coerces non-bool → 'f'; a real bool → 't'/'f'.
		return value === true ? 't' : 'f';
	}
	if (INT_COLUMNS.has(column)) {
		return value === null || value === undefined ? null : Math.trunc(Number(value));
	}
	// tipo / parent / model / tld / model_tipo / propiedades — plain text or null.
	return value === null || value === undefined ? null : String(value);
}

/** The SQL placeholder for a column (jsonb needs the ::text::jsonb cast; booleans ::boolean). */
function placeholderFor(column: string, index: number): string {
	if (JSON_COLUMNS.has(column)) return `$${index}::text::jsonb`;
	if (BOOLEAN_COLUMNS.has(column)) return `$${index}::boolean`;
	return `$${index}`;
}

/**
 * Read the value of one column off a node object. `is_*` columns default to
 * false when the node omits them (PHP boolean default); everything else defaults
 * to null.
 */
function nodeColumnValue(node: Partial<DdOntologyNode>, column: DdOntologyColumn): unknown {
	if (column === 'tipo') return node.tipo;
	const value = (node as Record<string, unknown>)[column];
	if (value === undefined) {
		return BOOLEAN_COLUMNS.has(column) ? false : null;
	}
	return value;
}

/**
 * UPSERT a whole ontology node (PHP dd_ontology_db_manager::create).
 * Writes EVERY allowlisted column with the supplied-or-default value, then
 * INSERT … ON CONFLICT(tipo) DO UPDATE SET <all columns except tipo> = EXCLUDED.
 * Whole-row semantics: an omitted/cleared field overwrites the existing column
 * with its default (null / false), so a re-parse never leaves stale data behind.
 * Returns the row id. Fans out cache invalidation on success.
 */
export async function upsertDdOntologyNode(
	node: Partial<DdOntologyNode> & { tipo: string },
): Promise<number> {
	const params: (string | number | null)[] = [];
	const columnIdents: string[] = [];
	const placeholders: string[] = [];
	COLUMNS.forEach((column, position) => {
		columnIdents.push(`"${column}"`);
		params.push(boundValueFor(column, nodeColumnValue(node, column)));
		placeholders.push(placeholderFor(column, position + 1));
	});
	const updateParts = COLUMNS.filter((column) => column !== 'tipo').map(
		(column) => `"${column}" = EXCLUDED."${column}"`,
	);
	const rows = (await sql.unsafe(
		`INSERT INTO dd_ontology (${columnIdents.join(', ')})
		 VALUES (${placeholders.join(', ')})
		 ON CONFLICT (tipo) DO UPDATE SET ${updateParts.join(', ')}
		 RETURNING id`,
		params,
	)) as { id: number }[];
	await clearOntologyDerivedCaches();
	return Number(rows[0]?.id);
}

/** A raw dd_ontology row (columns hydrated to JS types, mirroring PHP read()). */
export interface DdOntologyRow {
	tipo: string;
	parent: string | null;
	term: Record<string, string> | null;
	model: string | null;
	order_number: number | null;
	relations: { tipo: string }[] | null;
	tld: string | null;
	properties: Record<string, unknown> | null;
	model_tipo: string | null;
	is_model: boolean;
	is_translatable: boolean;
	is_main: boolean;
	propiedades: string | null;
}

/**
 * Read one raw dd_ontology row (PHP read()). Returns null when the tipo does not
 * exist. Uncached — the parser/pipeline needs the current on-disk state; the
 * cached read registry lives in resolver.ts.
 */
export async function readDdOntologyRow(tipo: string): Promise<DdOntologyRow | null> {
	const rows = (await sql`
		SELECT tipo, parent, term, model, order_number, relations, tld,
		       properties, model_tipo, is_model, is_translatable, is_main, propiedades
		FROM dd_ontology WHERE tipo = ${tipo} LIMIT 1
	`) as DdOntologyRow[];
	const row = rows[0];
	if (row === undefined) return null;
	// PHP read() casts int_columns to (int) — the driver may hand order_number
	// back as a numeric string; normalize so callers get a number (or null).
	row.order_number =
		row.order_number === null || row.order_number === undefined
			? null
			: Math.trunc(Number(row.order_number));
	return row;
}

/**
 * Partial column update (PHP dd_ontology_db_manager::update). Only the given
 * columns are written; when the UPDATE matches no row it falls back to an INSERT
 * (with tipo first, then the given columns) — the exact upsert fallback PHP uses,
 * relied on by the sync_order path. Unknown columns are rejected (allowlist).
 */
export async function updateDdOntologyColumns(
	tipo: string,
	values: Partial<Record<DdOntologyColumn, unknown>>,
): Promise<boolean> {
	const columns = Object.keys(values) as DdOntologyColumn[];
	const validColumns = columns.filter((column) => COLUMNS.includes(column));
	if (validColumns.length === 0) {
		return false;
	}

	// UPDATE: $1 = tipo (WHERE), then each column.
	const updateParams: (string | number | null)[] = [tipo];
	const setClauses: string[] = [];
	validColumns.forEach((column, index) => {
		updateParams.push(boundValueFor(column, values[column]));
		setClauses.push(`"${column}" = ${placeholderFor(column, index + 2)}`);
	});
	const updated = (await sql.unsafe(
		`UPDATE dd_ontology SET ${setClauses.join(', ')} WHERE tipo = $1 RETURNING id`,
		updateParams,
	)) as { id: number }[];

	if (updated.length === 0) {
		// Upsert fallback: INSERT (tipo, ...columns). $1 = tipo becomes the tipo
		// column value; the same param order as the UPDATE (tipo first).
		const insertColumns = ['"tipo"', ...validColumns.map((column) => `"${column}"`)];
		const insertPlaceholders = [
			'$1',
			...validColumns.map((column, index) => placeholderFor(column, index + 2)),
		];
		await sql.unsafe(
			`INSERT INTO dd_ontology (${insertColumns.join(', ')}) VALUES (${insertPlaceholders.join(', ')})`,
			updateParams,
		);
	}
	await clearOntologyDerivedCaches();
	return true;
}

/** Delete one node by tipo (PHP delete()). Fans out cache invalidation. */
export async function deleteDdOntologyNode(tipo: string): Promise<void> {
	await sql`DELETE FROM dd_ontology WHERE tipo = ${tipo}`;
	await clearOntologyDerivedCaches();
}

/** A search filter entry: scalar (→ '=') or {operator, value}. */
export type DdOntologySearchFilter = Record<string, unknown | { operator: string; value: unknown }>;

/**
 * Search tipos by column filters (PHP dd_ontology_db_manager::search). Each
 * filter value is a scalar (equality) or {operator, value} (op-allowlisted).
 * Returns the matching tipo strings, ordered by order_number when order=true.
 * Throws on an invalid column or operator (PHP returns false — we surface it).
 */
export async function searchDdOntology(
	values: DdOntologySearchFilter,
	order = false,
	limit: number | null = null,
): Promise<string[]> {
	const entries = Object.entries(values);
	if (entries.length === 0) {
		return [];
	}
	const params: (string | number | boolean | null)[] = [];
	const whereClauses: string[] = [];
	let paramIndex = 1;
	for (const [column, raw] of entries) {
		if (!COLUMNS.includes(column as DdOntologyColumn)) {
			throw new Error(`searchDdOntology: invalid column '${column}'`);
		}
		if (raw !== null && typeof raw === 'object' && 'operator' in (raw as object)) {
			const opValue = raw as { operator: string; value: unknown };
			if (!ALLOWED_OPS.has(opValue.operator)) {
				throw new Error(`searchDdOntology: invalid operator '${opValue.operator}'`);
			}
			let paramValue = opValue.value;
			if (BOOLEAN_COLUMNS.has(column) && typeof paramValue === 'boolean') {
				paramValue = paramValue ? 'true' : 'false';
			}
			params.push(paramValue as string | number | null);
			whereClauses.push(`"${column}" ${opValue.operator} $${paramIndex}`);
		} else {
			let scalar: unknown = raw;
			if (BOOLEAN_COLUMNS.has(column)) {
				scalar = scalar === true ? 'true' : 'false';
			}
			params.push(scalar as string | number | null);
			whereClauses.push(`"${column}" = $${paramIndex}`);
		}
		paramIndex++;
	}
	const orderClause = order ? ' ORDER BY order_number ASC' : '';
	const limitClause = limit && limit > 0 ? ` LIMIT ${Math.trunc(limit)}` : '';
	const rows = (await sql.unsafe(
		`SELECT tipo FROM dd_ontology WHERE ${whereClauses.join(' AND ')}${orderClause}${limitClause}`,
		params,
	)) as { tipo: string }[];
	return rows.map((row) => row.tipo);
}

// --- Active-TLD set (PHP ontology_utils::get_active_tlds / check_active_tld) --

/**
 * The set of TLDs that HAVE dd_ontology rows. PHP's `check_active_tld` means
 * "this TLD is installed in dd_ontology" (SELECT tld … GROUP BY tld) — NOT the
 * hierarchy4 active flag. Module-cached (ontology content carries no request
 * identity) and cleared by the invalidation hub after any write.
 */
let activeTldsCache: string[] | null = null;

export async function getActiveTlds(): Promise<string[]> {
	if (activeTldsCache !== null) {
		return activeTldsCache;
	}
	const rows = (await sql`SELECT tld FROM dd_ontology GROUP BY tld`) as { tld: string | null }[];
	activeTldsCache = rows
		.map((row) => row.tld)
		.filter((tld): tld is string => tld !== null && tld !== '');
	return activeTldsCache;
}

/** Register the active-TLD cache with the invalidation hub (dropped on any write). */
registerOntologyCacheClearer(() => {
	activeTldsCache = null;
});

/**
 * Delete every dd_ontology row for one TLD (PHP ontology_utils::delete_tld_nodes).
 * The TLD MUST pass safeTld (`/^[a-z]{2,}$/`) — a mismatch refuses the delete
 * (leaves the table untouched), byte-identical to PHP's `safe_tld !== tld` gate.
 * Returns true on success. Fans out cache invalidation.
 */
export async function deleteTldNodes(tld: string): Promise<boolean> {
	const safe = safeTld(tld);
	if (safe === null || safe !== tld) {
		return false;
	}
	await sql`DELETE FROM dd_ontology WHERE tld = ${safe}`;
	await clearOntologyDerivedCaches();
	return true;
}

// --- Backup table protocol (PHP ontology_utils create/restore/delete_bk_table) -

/**
 * Validate a list of TLDs for the backup protocol. Since safe TLDs are strictly
 * `[a-z]{2,}`, they can be inlined into DDL that cannot take bind parameters
 * (CREATE TABLE AS … WHERE …) with zero injection surface — the same reasoning
 * PHP uses (pg_escape_literal there; a validated allowlist here).
 */
function assertSafeTlds(tlds: readonly string[]): string[] {
	const safe = tlds.map((tld) => {
		const value = safeTld(tld);
		if (value === null) {
			throw new Error(`dd_ontology backup: refusing unsafe tld '${tld}'`);
		}
		return value;
	});
	if (safe.length === 0) {
		throw new Error('dd_ontology backup: empty tld list');
	}
	return safe;
}

/**
 * Snapshot the dd_ontology rows of the given TLDs into dd_ontology_bk
 * (PHP create_bk_table). Drops any prior backup first. Returns false on empty
 * input. The backup table IS the rollback for regenerate (not a transaction —
 * matches PHP and two-server coexistence).
 */
export async function createBackupTable(tlds: readonly string[]): Promise<boolean> {
	if (tlds.length === 0) {
		return false;
	}
	const safe = assertSafeTlds(tlds);
	const whereSql = safe.map((tld) => `tld = '${tld}'`).join(' OR ');
	await sql.unsafe('DROP TABLE IF EXISTS "dd_ontology_bk" CASCADE', []);
	await sql.unsafe(
		`CREATE TABLE dd_ontology_bk AS SELECT * FROM dd_ontology WHERE ${whereSql}`,
		[],
	);
	return true;
}

/**
 * Restore the given TLDs from dd_ontology_bk (PHP restore_from_bk_table): delete
 * the current (possibly partial) rows for each TLD, then re-insert the backed-up
 * rows. Does NOT drop the backup table (the caller does). Fans out invalidation.
 */
export async function restoreFromBackupTable(tlds: readonly string[]): Promise<boolean> {
	if (tlds.length === 0) {
		return false;
	}
	const safe = assertSafeTlds(tlds);
	for (const tld of safe) {
		await sql.unsafe('DELETE FROM dd_ontology WHERE tld = $1', [tld]);
	}
	const whereSql = safe.map((tld) => `"tld" = '${tld}'`).join(' OR ');
	await sql.unsafe(`INSERT INTO dd_ontology SELECT * FROM "dd_ontology_bk" WHERE ${whereSql}`, []);
	await clearOntologyDerivedCaches();
	return true;
}

/** Drop the dd_ontology_bk backup table (PHP delete_bk_table). Idempotent. */
export async function dropBackupTable(): Promise<boolean> {
	await sql.unsafe('DROP TABLE IF EXISTS "dd_ontology_bk" CASCADE', []);
	return true;
}

/**
 * Materialize the dd_ontology_recovery slice table (PHP
 * installer_ontology_manager::build_recovery_version_file SQL half): DROP +
 * CREATE LIKE + INSERT of the whitelisted TLDs. The caller dumps it with
 * pg_dump and then drops it (dropRecoverySlice).
 */
export async function createRecoverySlice(tlds: readonly string[]): Promise<boolean> {
	if (tlds.length === 0) return false;
	const safe = assertSafeTlds(tlds);
	const inList = safe.map((tld) => `'${tld}'`).join(',');
	await sql.unsafe('DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE', []);
	await sql.unsafe('CREATE TABLE "dd_ontology_recovery" ( LIKE "dd_ontology" INCLUDING ALL )', []);
	await sql.unsafe(
		`INSERT INTO "dd_ontology_recovery" SELECT * FROM dd_ontology WHERE tld IN (${inList})`,
		[],
	);
	return true;
}

/** Drop the dd_ontology_recovery slice table (always run after the dump). */
export async function dropRecoverySlice(): Promise<boolean> {
	await sql.unsafe('DROP TABLE IF EXISTS "dd_ontology_recovery" CASCADE', []);
	return true;
}
