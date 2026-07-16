/**
 * search_related — the inverse-relation engine (SQO mode 'related'; PHP
 * class.search_related). Answers "which records link TO these targets?" —
 * the back-link machinery behind relation_list panels, inverse-reference
 * checks, and delete propagation.
 *
 * Uses the SAME PostgreSQL pre-flattening stored functions + functional GIN
 * indexes the PHP engine installed (db_pg_definitions):
 *   data_relations_flat_st_si(relation)     → ["numisdata6_1", …]
 *   data_relations_flat_fct_st_si(relation) → ["oh25_oh1_3", …]
 *   data_relations_flat_ty_st_si(relation)  → ["dd151_oh1_3", …]
 *   data_relations_flat_ty_st(relation)     → ["dd151_oh1", …]
 * Per-locator dispatch picks the narrowest key (PHP parse_sql_query switch):
 *   1. no section_id + type    → ty_st       (relation_index case)
 *   2. from_component_tipo     → fct_st_si
 *   3. type + section_id       → ty_st_si
 *   4. default                 → st_si
 *
 * Tables: the ontology-enumerated relation-capable matrix tables (dd627
 * children with properties.inverse_relations === true; matrix_test joins in
 * dev, matching this install's PHP). The query is a UNION across them.
 *
 * COUNT (countInverseReferences): the relation_list paginator total —
 * COUNT(*) per table UNION-ed and summed, with optional group_by columns
 * (identifier-regex-validated, PHP SEC rule) collected as {key, value} rows.
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
import { VALID_DATA_COLUMNS, assertValidTipo } from './identifier_gate.ts';

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

/** The flat-key + function for one locator (PHP parse_sql_query switch). */
function locatorClause(locator: RelatedLocatorFilter): { fn: string; key: string } {
	const sectionTipo = assertValidTipo(locator.section_tipo, 'search_related.section_tipo');
	const sectionId =
		locator.section_id === undefined || locator.section_id === null
			? null
			: String(Number(locator.section_id));
	if (sectionId === null && typeof locator.type === 'string') {
		const type = assertValidTipo(locator.type, 'search_related.type');
		return { fn: 'data_relations_flat_ty_st', key: `${type}_${sectionTipo}` };
	}
	if (sectionId === null) {
		throw new Error('search_related: a locator needs a section_id or a type');
	}
	if (typeof locator.from_component_tipo === 'string' && locator.from_component_tipo !== '') {
		const fct = assertValidTipo(locator.from_component_tipo, 'search_related.fct');
		return { fn: 'data_relations_flat_fct_st_si', key: `${fct}_${sectionTipo}_${sectionId}` };
	}
	if (typeof locator.type === 'string' && locator.type !== '') {
		const type = assertValidTipo(locator.type, 'search_related.type');
		return { fn: 'data_relations_flat_ty_st_si', key: `${type}_${sectionTipo}_${sectionId}` };
	}
	return { fn: 'data_relations_flat_st_si', key: `${sectionTipo}_${sectionId}` };
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
	let tables = await getRelationTables();
	if (options.tables !== undefined) {
		const allowed = new Set(tables);
		tables = options.tables.filter((table) => allowed.has(table));
		if (tables.length === 0) {
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

	const clauses = locators.map(locatorClause);
	const params: string[] = [];
	// One containment test per locator, joined by filter_by_locators_op
	// (PHP default OR; AND = records matching EVERY locator). The key is a
	// bound parameter; the function name is from the fixed set above (never
	// user input).
	const wherePerTable = clauses
		.map((clause) => {
			params.push(JSON.stringify([clause.key]));
			return `${clause.fn}(relation) @> $${params.length}::text::jsonb`;
		})
		.join(options.op === 'AND' ? ' AND ' : ' OR ');

	// Optional owning-section narrowing.
	let sectionNarrow = '';
	if (options.sectionTipos !== undefined && options.sectionTipos !== 'all') {
		const validated = options.sectionTipos.map((tipo) =>
			assertValidTipo(tipo, 'search_related.target_section'),
		);
		params.push(JSON.stringify(validated));
		sectionNarrow = ` AND section_tipo IN (SELECT jsonb_array_elements_text($${params.length}::text::jsonb))`;
	}

	const union = tables
		.map(
			(table) =>
				`SELECT section_tipo, section_id, '${table}' AS "table" FROM "${table}" WHERE (${wherePerTable})${sectionNarrow}`,
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
	)) as InverseReferenceHit[];
	return rows.map((row) => ({ ...row, section_id: Number(row.section_id) }));
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

	const params: string[] = [];
	const push = (value: string): string => {
		params.push(value);
		return `$${params.length}`;
	};

	// Per-locator: the flat-GIN containment (row narrowing, index-backed) PLUS
	// the locator_data field equalities (entry narrowing after the cross join).
	const perLocator = locators.map((locator) => {
		const clause = locatorClause(locator);
		const parts = [`${clause.fn}(relation) @> ${push(JSON.stringify([clause.key]))}::text::jsonb`];
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
 * COUNT(*) per relation table UNION-ed and summed; with `groupBy`, per-group
 * rows are collected as {key: [group values], value} alongside the total.
 * Invalid group_by entries are dropped (PHP identifier regex).
 */
export async function countInverseReferences(
	locators: RelatedLocatorFilter[],
	options: { sectionTipos?: string[] | 'all'; groupBy?: string[] } = {},
): Promise<RelatedCountResult> {
	if (locators.length === 0) {
		throw new Error('search_related: filter_by_locators is required');
	}
	const tables = await getRelationTables();

	const groupBy = (options.groupBy ?? []).filter((column) => {
		if (typeof column !== 'string' || !GROUP_BY_IDENTIFIER.test(column)) return false;
		// INJ-04: beyond the shape regex, restrict to a KNOWN data/structural column
		// (not an arbitrary column of the relation matrix). Table-qualified `t.col`
		// is allowed; the bare column must be in the allowlist. Callers only ever
		// group by 'section_tipo' — this closes the wider-than-necessary surface.
		const bare = column.includes('.') ? column.slice(column.lastIndexOf('.') + 1) : column;
		return VALID_DATA_COLUMNS.includes(bare);
	});
	const grouped = groupBy.length > 0;
	const selectCols = grouped
		? `${groupBy.join(', ')}, COUNT(*) AS full_count`
		: 'COUNT(*) AS full_count';
	const groupSql = grouped ? ` GROUP BY ${groupBy.join(', ')}` : '';

	const clauses = locators.map(locatorClause);
	const params: string[] = [];
	const wherePerTable = clauses
		.map((clause) => {
			params.push(JSON.stringify([clause.key]));
			return `${clause.fn}(relation) @> $${params.length}::text::jsonb`;
		})
		.join(' OR ');

	let sectionNarrow = '';
	if (options.sectionTipos !== undefined && options.sectionTipos !== 'all') {
		const validated = options.sectionTipos.map((tipo) =>
			assertValidTipo(tipo, 'search_related.target_section'),
		);
		params.push(JSON.stringify(validated));
		sectionNarrow = ` AND section_tipo IN (SELECT jsonb_array_elements_text($${params.length}::text::jsonb))`;
	}

	const union = tables
		.map(
			(table) =>
				`SELECT ${selectCols} FROM "${table}" WHERE (${wherePerTable})${sectionNarrow}${groupSql}`,
		)
		.join(' UNION ALL ');

	const rows = (await sql.unsafe(union, params)) as Record<string, unknown>[];
	let total = 0;
	const totalsGroup: { key: string[]; value: number }[] = [];
	for (const row of rows) {
		const value = Number(row.full_count ?? 0);
		total += value;
		if (grouped && value > 0) {
			totalsGroup.push({ key: groupBy.map((column) => String(row[column])), value });
		}
	}
	return grouped ? { total, totals_group: totalsGroup } : { total };
}
