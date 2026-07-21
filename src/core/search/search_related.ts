/**
 * search_related — the inverse-relation engine (SQO mode 'related'; PHP
 * class.search_related). Answers "which records link TO these targets?" —
 * the back-link machinery behind relation_list panels, inverse-reference
 * checks, and delete propagation.
 *
 * ONE ROW-SET ENGINE (2026-07-20): matrix_relation_index is THE relation
 * search. Finds/counts run as ONE btree query over the typed per-locator
 * index — measured 7-19× faster than the retired flat GIN, with honest
 * planner statistics. Locator narrowing dispatch (locatorIndexClause) mirrors
 * the v6-era switch exactly:
 *   1. no section_id + type    → (type, target_section_tipo)
 *   2. from_component_tipo     → (fct, target st, target si)
 *   3. type + section_id       → (type, target st, target si)
 *   4. default                 → (target st, target si)
 *
 * The v6-era pre-flattening functions (data_relations_flat_*) and their SQL
 * paths were REMOVED outright with their GIN indexes — v7 ships no legacy
 * engine. Coverage (triggers + backfill, requireRelationIndex) is therefore a
 * REQUIREMENT: an uncovered instance fails loudly with the maintenance
 * remediation instead of degrading (never silently narrow scope).
 *
 * Tables: the ontology-enumerated relation-capable matrix tables (dd627
 * children with properties.inverse_relations === true; matrix_test joins in
 * dev, matching this install's PHP).
 *
 * COUNT (countInverseReferences): the relation_list paginator total —
 * COUNT of DISTINCT owners on the index, optionally grouped by section_tipo
 * (the only grouping any caller uses; identifier-regex-validated, PHP SEC rule).
 *
 * BREAKDOWN (findInverseReferenceLocators): cross-join with
 * jsonb_path_query(relation, '$.*[*]') so each individual locator entry is
 * its own row, narrowed by locator_data field equalities — the exact-locator
 * recovery used by delete propagation and reference rewrites.
 *
 * filter_by_locators_op: OR (default) and AND are both modeled — AND
 * returns only records whose relation column matches EVERY locator.
 */

import { assertMatrixTable } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import { VALID_DATA_COLUMNS, assertValidTipo } from './identifier_gate.ts';
import { requireRelationIndex } from './search_store.ts';

/** One inverse-reference hit: the record that HOLDS the pointing locator. */
export interface InverseReferenceHit {
	section_tipo: string;
	section_id: number;
	table: string;
}

export interface RelatedLocatorFilter {
	section_tipo: string;
	section_id?: string | number;
	from_component_tipo?: string;
	type?: string;
}

/** Cached relation-capable table list (ontology dd627 walk). */
let relationTablesCache: string[] | null = null;

export function clearRelatedTablesCache(): void {
	relationTablesCache = null;
}
registerOntologyCacheClearer(clearRelatedTablesCache);

/**
 * The matrix tables that participate in inverse-relation searches (PHP
 * common::get_matrix_tables_with_relations): dd627 children of model
 * matrix_table with properties.inverse_relations === true, plus matrix_test
 * (this server always runs in the development posture PHP gates it behind).
 */
export async function getRelationTables(): Promise<string[]> {
	if (relationTablesCache !== null) return relationTablesCache;
	const rows = (await sql`
		SELECT term->>'lg-spa' AS table_name, properties
		FROM dd_ontology
		WHERE parent = 'dd627' AND model = 'matrix_table'
	`) as { table_name: string | null; properties: { inverse_relations?: boolean } | null }[];
	const tables: string[] = [];
	for (const row of rows) {
		if (row.table_name === null) continue;
		const include = row.properties?.inverse_relations === true || row.table_name === 'matrix_test';
		if (!include) continue;
		// The name is interpolated into FROM/JOIN downstream; assert it against the
		// allowlist (L2) so a poisoned ontology term can never reach SQL verbatim.
		assertMatrixTable(row.table_name);
		tables.push(row.table_name);
	}
	if (tables.length === 0) {
		// PHP fallback for pre-2018 ontologies — deny loudly instead (a silent
		// default list could hide an ontology-read failure).
		throw new Error('search_related: no relation-capable tables resolved from the ontology');
	}
	relationTablesCache = tables;
	return tables;
}

/**
 * matrix_relation_index column predicate for one locator — the typed twin of
 * locatorClause (same narrowing dispatch, same validation), used when every
 * table in play is index-covered (relationIndexCovers). Values ride as bound
 * params via `push`.
 */
function locatorIndexClause(
	locator: RelatedLocatorFilter,
	push: (value: string) => string,
): string {
	const sectionTipo = assertValidTipo(locator.section_tipo, 'search_related.section_tipo');
	const sectionId =
		locator.section_id === undefined || locator.section_id === null
			? null
			: String(Number(locator.section_id));
	const parts: string[] = [`r.target_section_tipo = ${push(sectionTipo)}::text`];
	if (sectionId === null && typeof locator.type === 'string') {
		parts.push(`r.type = ${push(assertValidTipo(locator.type, 'search_related.type'))}::text`);
		return `(${parts.join(' AND ')})`;
	}
	if (sectionId === null) {
		throw new Error('search_related: a locator needs a section_id or a type');
	}
	parts.push(`r.target_section_id = ${push(sectionId)}::int`);
	if (typeof locator.from_component_tipo === 'string' && locator.from_component_tipo !== '') {
		parts.push(
			`r.from_component_tipo = ${push(assertValidTipo(locator.from_component_tipo, 'search_related.fct'))}::text`,
		);
	} else if (typeof locator.type === 'string' && locator.type !== '') {
		parts.push(`r.type = ${push(assertValidTipo(locator.type, 'search_related.type'))}::text`);
	}
	return `(${parts.join(' AND ')})`;
}

/**
 * The find engine: one query over matrix_relation_index. Semantics preserved
 * from the retired containment SQL exactly: GROUP BY (owner) dedups locator
 * multiplicity the way per-row `@>` containment did; op AND = HAVING bool_or
 * per clause; the `table` field is resolved from section_tipo (cached
 * resolver) and the 'table' ordering is reproduced IN SQL via a CASE over the
 * (small) set of owning tipos so LIMIT/OFFSET stay correct. Measured vs the
 * retired flat GIN: st_si 14→0.3ms, fct_st_si 6→0.2ms, ty_st 1014→54ms.
 */
async function findInverseReferencesViaIndex(
	locators: RelatedLocatorFilter[],
	options: NonNullable<Parameters<typeof findInverseReferences>[1]>,
): Promise<InverseReferenceHit[]> {
	const params: string[] = [];
	const push = (value: string): string => {
		params.push(value);
		return `$${params.length}`;
	};
	const clauses = locators.map((locator) => locatorIndexClause(locator, push));
	const where: string[] = [`(${clauses.join(' OR ')})`];
	if (options.sectionTipos !== undefined && options.sectionTipos !== 'all') {
		const validated = options.sectionTipos.map((tipo) =>
			assertValidTipo(tipo, 'search_related.target_section'),
		);
		where.push(
			`r.section_tipo IN (SELECT jsonb_array_elements_text(${push(JSON.stringify(validated))}::text::jsonb))`,
		);
	}
	const having =
		options.op === 'AND' && clauses.length > 1
			? ` HAVING ${clauses.map((clause) => `bool_or(${clause})`).join(' AND ')}`
			: '';

	// 'table' ordering: table = f(section_tipo); materialize the mapping for
	// the owning tipos actually present so the ORDER BY runs in SQL and
	// LIMIT/OFFSET stay exact.
	let orderSql = 'r.section_id ASC';
	const tableByTipo = new Map<string, string>();
	if (options.order !== 'section_id') {
		const tipoRows = (await sql.unsafe(
			`SELECT DISTINCT r.section_tipo FROM matrix_relation_index r WHERE ${where.join(' AND ')}`,
			params,
		)) as { section_tipo: string }[];
		for (const { section_tipo } of tipoRows) {
			tableByTipo.set(section_tipo, (await getMatrixTableFromTipo(section_tipo)) ?? 'matrix');
		}
		if (tableByTipo.size > 0) {
			const cases = [...tableByTipo.entries()]
				.map(([tipo, table]) => `WHEN ${push(tipo)}::text THEN ${push(table)}::text`)
				.join(' ');
			orderSql = `CASE r.section_tipo ${cases} END, r.section_tipo, r.section_id`;
		}
	}

	// options.tables narrowing (children engine): table = f(section_tipo),
	// which the SQL cannot see, so it is applied AFTER the fetch. With a
	// finite limit that combination must window after filtering (a SQL LIMIT
	// would drop rows) — the query runs unwindowed and slices in JS. No
	// caller pairs tables+limit today; correctness over an optimization
	// nobody hits.
	const hasFiniteLimit = options.limit !== false && options.limit !== undefined;
	const windowInJs = options.tables !== undefined && hasFiniteLimit;
	const limitSql =
		hasFiniteLimit && !windowInJs
			? ` LIMIT ${Math.max(1, Math.floor(options.limit as number))}`
			: '';
	const offsetSql =
		!windowInJs && options.offset !== undefined && options.offset > 0
			? ` OFFSET ${Math.floor(options.offset)}`
			: '';

	const rows = (await sql.unsafe(
		`SELECT r.section_tipo, r.section_id FROM matrix_relation_index r
		 WHERE ${where.join(' AND ')}
		 GROUP BY r.section_tipo, r.section_id${having}
		 ORDER BY ${orderSql}${limitSql}${offsetSql}`,
		params,
	)) as { section_tipo: string; section_id: number }[];

	const hits: InverseReferenceHit[] = [];
	for (const row of rows) {
		let table = tableByTipo.get(row.section_tipo);
		if (table === undefined) {
			table = (await getMatrixTableFromTipo(row.section_tipo)) ?? 'matrix';
			tableByTipo.set(row.section_tipo, table);
		}
		hits.push({ section_tipo: row.section_tipo, section_id: Number(row.section_id), table });
	}
	if (options.tables !== undefined) {
		const allowed = new Set(options.tables);
		const filtered = hits.filter((hit) => allowed.has(hit.table));
		if (windowInJs) {
			const start =
				options.offset !== undefined && options.offset > 0 ? Math.floor(options.offset) : 0;
			return filtered.slice(start, start + Math.max(1, Math.floor(options.limit as number)));
		}
		return filtered;
	}
	return hits;
}

/**
 * Find every record holding a locator that points at any of the target
 * locators. `sectionTipos` narrows the OWNING sections ('all' = no narrowing).
 * Ordered by (table, section_tipo, section_id) for a deterministic result.
 */
export async function findInverseReferences(
	locators: RelatedLocatorFilter[],
	options: {
		sectionTipos?: string[] | 'all';
		limit?: number | false;
		offset?: number;
		/** 'section_id' = PHP related-search default order. */
		order?: 'table' | 'section_id';
		/**
		 * Restrict the scan to specific matrix tables (PHP sqo set_tables — the
		 * children engine searches only the parent section's table). Each name
		 * is validated against the ontology-enumerated relation-table list.
		 */
		tables?: string[];
		/** Locator-clause join (PHP filter_by_locators_op; default OR). */
		op?: 'OR' | 'AND';
	} = {},
): Promise<InverseReferenceHit[]> {
	if (locators.length === 0) {
		throw new Error('search_related: filter_by_locators is required');
	}
	const tables = await getRelationTables();
	if (options.tables !== undefined) {
		const allowed = new Set(tables);
		if (options.tables.filter((table) => allowed.has(table)).length === 0) {
			// PHP parity (search_related::parse_sql_query): when the caller's
			// requested tables don't intersect the relation-capable set, the query
			// degrades to `SELECT NULL WHERE false;` — an empty result, not a fault.
			// This is the normal shape for a section whose own matrix table isn't
			// inverse-relations-enabled (e.g. matrix_projects, inverse_relations=false):
			// its children search simply finds nothing rather than killing the request.
			console.warn(
				`[search_related] no relation-capable table in requested [${options.tables.join(', ')}] — returning empty`,
			);
			return [];
		}
	}
	// Coverage over ALL relation-capable tables (the index spans them all;
	// options.tables only narrows the RESULT) — uncovered fails loudly.
	await requireRelationIndex(tables);
	return findInverseReferencesViaIndex(locators, options);
}

/** One breakdown hit: the exact locator entry that matched, plus its owner. */
export interface InverseReferenceLocatorHit {
	section_tipo: string;
	section_id: number;
	table: string;
	/** The individual locator object from the owner's relation column. */
	locator_data: Record<string, unknown>;
}

/**
 * BREAKDOWN mode (PHP sqo->breakdown): cross-join each owning row with
 * jsonb_path_query(relation, '$.*[*]') so every individual locator entry
 * becomes its own result row, narrowed to the entries that satisfy the
 * filter — get_referenced_locators() uses this to recover the EXACT matching
 * locator objects (delete propagation, reference rewrites).
 */
export async function findInverseReferenceLocators(
	locators: RelatedLocatorFilter[],
	options: {
		sectionTipos?: string[] | 'all';
		limit?: number | false;
		offset?: number;
		/** 'section_id' = PHP related-search default order (relation_index page). */
		order?: 'table' | 'section_id';
	} = {},
): Promise<InverseReferenceLocatorHit[]> {
	if (locators.length === 0) {
		throw new Error('search_related: filter_by_locators is required');
	}
	const tables = await getRelationTables();
	await requireRelationIndex(tables);

	const params: string[] = [];
	const push = (value: string): string => {
		params.push(value);
		return `$${params.length}`;
	};

	// BREAKDOWN keeps the per-table UNION + jsonb cross-join (the result
	// contract needs the EXACT locator payload, which only the jsonb has).
	// The row-NARROWING side is a tuple-IN over matrix_relation_index
	// (uncorrelated → hashed semi-join; exact, not a superset, because the
	// tuple carries the owner's section_tipo).

	// Per-locator: the row narrowing (index-backed) PLUS the locator_data
	// field equalities (entry narrowing after the cross join).
	const perLocator = locators.map((locator) => {
		const rowNarrow = `(section_tipo, section_id) IN (SELECT r.section_tipo, r.section_id FROM matrix_relation_index r WHERE ${locatorIndexClause(locator, push)})`;
		const parts = [rowNarrow];
		if (typeof locator.from_component_tipo === 'string' && locator.from_component_tipo !== '') {
			parts.push(
				`locator_data->>'from_component_tipo' = ${push(locator.from_component_tipo)}::text`,
			);
		} else if (typeof locator.type === 'string' && locator.type !== '') {
			parts.push(`locator_data->>'type' = ${push(locator.type)}::text`);
		}
		parts.push(`locator_data->>'section_tipo' = ${push(locator.section_tipo)}::text`);
		if (locator.section_id !== undefined && locator.section_id !== null) {
			parts.push(`locator_data->>'section_id' = ${push(String(locator.section_id))}::text`);
		}
		return `(${parts.join(' AND ')})`;
	});
	const wherePerTable = perLocator.join(' OR ');

	let sectionNarrow = '';
	if (options.sectionTipos !== undefined && options.sectionTipos !== 'all') {
		const validated = options.sectionTipos.map((tipo) =>
			assertValidTipo(tipo, 'search_related.target_section'),
		);
		sectionNarrow = ` AND section_tipo IN (SELECT jsonb_array_elements_text(${push(JSON.stringify(validated))}::text::jsonb))`;
	}

	const union = tables
		.map(
			(table) =>
				`SELECT section_tipo, section_id, '${table}' AS "table", locator_data
				 FROM "${table}"
				 CROSS JOIN jsonb_path_query(relation, '$.*[*]') AS locator_data
				 WHERE (${wherePerTable})${sectionNarrow}`,
		)
		.join(' UNION ALL ');

	const limitSql =
		options.limit === false || options.limit === undefined
			? ''
			: ` LIMIT ${Math.max(1, Math.floor(options.limit))}`;
	const offsetSql =
		options.offset !== undefined && options.offset > 0
			? ` OFFSET ${Math.floor(options.offset)}`
			: '';

	const orderSql =
		options.order === 'section_id'
			? 'section_id ASC' // PHP build_sql_query_order_default (no tiebreak)
			: '"table", section_tipo, section_id';
	const rows = (await sql.unsafe(
		`${union} ORDER BY ${orderSql}${limitSql}${offsetSql}`,
		params,
	)) as InverseReferenceLocatorHit[];
	return rows.map((row) => ({ ...row, section_id: Number(row.section_id) }));
}

/** PHP group_by identifier guard (simple, optionally table-qualified). */
const GROUP_BY_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/;

export interface RelatedCountResult {
	total: number;
	/** Present only when group_by was requested: one entry per result row. */
	totals_group?: { key: string[]; value: number }[];
}

/**
 * COUNT the inverse references (PHP trait.count with mode 'related'):
 * COUNT of DISTINCT owners over matrix_relation_index; with
 * groupBy ['section_tipo'], per-group rows are collected as
 * {key: [group values], value} alongside the total. Invalid group_by entries
 * are dropped (PHP identifier regex); other valid shapes throw (no caller).
 */
export async function countInverseReferences(
	locators: RelatedLocatorFilter[],
	options: { sectionTipos?: string[] | 'all'; groupBy?: string[] } = {},
): Promise<RelatedCountResult> {
	if (locators.length === 0) {
		throw new Error('search_related: filter_by_locators is required');
	}
	const tables = await getRelationTables();

	// Identifier filtering FIRST (invalid entries are dropped, PHP regex +
	// the INJ-04 VALID_DATA_COLUMNS allowlist) so the shape decision below
	// sees the EFFECTIVE grouping — an invalid group_by degrades to the plain
	// count, it never becomes an error.
	const groupByFiltered = (options.groupBy ?? []).filter((column) => {
		if (typeof column !== 'string' || !GROUP_BY_IDENTIFIER.test(column)) return false;
		const bare = column.includes('.') ? column.slice(column.lastIndexOf('.') + 1) : column;
		return VALID_DATA_COLUMNS.includes(bare);
	});

	// The only grouped shape any caller uses is ['section_tipo'] (S2-26).
	// The retired per-table containment scan could group by arbitrary matrix
	// columns; the index carries owner identity only — a novel grouping shape
	// is a loud error, not a silent degradation (add it to the index query if
	// a real caller ever appears).
	const groupByRaw = groupByFiltered;
	if (groupByRaw.length > 0 && !(groupByRaw.length === 1 && groupByRaw[0] === 'section_tipo')) {
		throw new Error(
			`search_related: group_by [${groupByRaw.join(', ')}] is not supported by the relation index (only 'section_tipo'; flat-function scan removed 2026-07-20)`,
		);
	}
	await requireRelationIndex(tables);
	{
		const params: string[] = [];
		const push = (value: string): string => {
			params.push(value);
			return `$${params.length}`;
		};
		const clauses = locators.map((locator) => locatorIndexClause(locator, push));
		const where: string[] = [`(${clauses.join(' OR ')})`];
		if (options.sectionTipos !== undefined && options.sectionTipos !== 'all') {
			const validated = options.sectionTipos.map((tipo) =>
				assertValidTipo(tipo, 'search_related.target_section'),
			);
			where.push(
				`r.section_tipo IN (SELECT jsonb_array_elements_text(${push(JSON.stringify(validated))}::text::jsonb))`,
			);
		}
		if (groupByRaw.length === 1) {
			const rows = (await sql.unsafe(
				`SELECT r.section_tipo, COUNT(DISTINCT r.section_id)::int AS full_count
				 FROM matrix_relation_index r WHERE ${where.join(' AND ')} GROUP BY r.section_tipo`,
				params,
			)) as { section_tipo: string; full_count: number }[];
			let total = 0;
			const totalsGroup: { key: string[]; value: number }[] = [];
			for (const row of rows) {
				const value = Number(row.full_count);
				total += value;
				if (value > 0) totalsGroup.push({ key: [row.section_tipo], value });
			}
			return { total, totals_group: totalsGroup };
		}
		const rows = (await sql.unsafe(
			`SELECT COUNT(*)::int AS full_count FROM (
				SELECT 1 FROM matrix_relation_index r WHERE ${where.join(' AND ')}
				GROUP BY r.section_tipo, r.section_id) owners`,
			params,
		)) as { full_count: number }[];
		return { total: Number(rows[0]?.full_count ?? 0) };
	}
}
