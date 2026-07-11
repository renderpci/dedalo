/**
 * SQL assembler (Phase B of the search pipeline) — turns a conformed SQO into
 * the final SQL string + bound params.
 *
 * PHP reference: core/search/class.search.php parse_sql_default (:1204),
 * parse_sql_full_count (:1312), parse_sql_filter_by_locators (:1382),
 * build_union_query (:998), trait.from/select/where/order.
 *
 * Load-bearing build order (normative comment at class.search.php:1174):
 *   FROM → SELECT → ORDER (may add sort-select aliases) → WHERE
 * The `use_window` branch is the key shape decision: a custom ORDER (or join)
 * forces the `SELECT * FROM (…) main_select` wrapper with the outer ORDER BY /
 * LIMIT / OFFSET; otherwise LIMIT/OFFSET sit inline on the DISTINCT-ON query.
 *
 * SCOPE NOTES (header re-dated 2026-07-07, S2-45 — the old UNCOVERED list
 * was stale; coverage-state lists live in rewrite/LEDGER.md, never here): the
 * projects-filter ACL IS built here (buildProjectsFilter +
 * buildMultiSectionProjectsFilter below — single-section byte-parity with
 * PHP, multi-section per-section predicates per WC-011, replacing the Phase
 * 5c fail-closed throw 2026-07-09; principal-scoped, skippable only via the
 * server-only sqo flag); multi-hop ORDER paths ride the conform join chain;
 * group_by/related counting live in search_related.ts (their own PHP-parity
 * engine). Anything this assembler cannot shape throws loudly with a named
 * reason.
 */

import { config } from '../../config/config.ts';
import { readEnv } from '../../config/env.ts';
import type { Sqo } from '../concepts/sqo.ts';
import { getSectionTipos } from '../concepts/sqo.ts';
import { assertMatrixTable } from '../db/matrix.ts';
import {
	getColumnNameByModel,
	getComponentFilterTipo,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { type Principal, getUserProjects } from '../security/permissions.ts';
import type { BuilderResult } from './builders/types.ts';
import type { ConformedFilter } from './conform.ts';
import { conformFilter } from './conform.ts';
import {
	assertValidDataColumn,
	assertValidLang,
	assertValidTipo,
	assertValidTipoOrColumn,
} from './identifier_gate.ts';
import { ParamsCollector } from './params.ts';

const DEFAULT_DATA_LANG = readEnv('DATA_LANG', 'lg-spa') as string;

/** Default SELECT data columns (PHP trait.select.php:122 — relation_search excluded). */
const DEFAULT_SELECT_COLUMNS = [
	'data',
	'relation',
	'string',
	'date',
	'iri',
	'geo',
	'number',
	'media',
	'misc',
	'meta',
] as const;

/** PHP trim_tipo: first 2 letters + full numeric suffix ('rsc453'→'rs453'). */
export function trimTipo(tipo: string): string | null {
	const match = /^([a-z]+)([0-9]+)$/.exec(tipo);
	if (match === null) return tipo === 'all' ? 'all' : null;
	return (match[1] as string).slice(0, 2) + (match[2] as string);
}

export interface BuiltQuery {
	sql: string;
	params: unknown[];
}

/** Resolve a BuilderResult into an SQL fragment string (or '' when empty). */
function resolveBuilderResult(result: BuilderResult, params: ParamsCollector): string {
	if (result === false) return '';
	if (result.kind === 'fragment') {
		return params.substitute(result.sentence, result.tokenValues);
	}
	// compound: recurse and join
	const parts = result.items
		.map((item) => resolveBuilderResult(item, params))
		.filter((part) => part !== '');
	if (parts.length === 0) return '';
	const joiner = result.op === '$and' ? '\n AND ' : '\n OR ';
	return parts.length === 1 ? (parts[0] as string) : `( ${parts.join(joiner)} )`;
}

/**
 * The recursive filter parser (PHP filter_parser, trait.where.php:281):
 * AND/OR join; NOT/NAND wrap in NOT(...AND...); NOR wraps NOT(...OR...).
 */
/** Gather every leaf's join fragments (dedup by alias, first wins). */
function collectJoins(node: ConformedFilter, sink: Map<string, string>): void {
	if (node.kind === 'leaf') {
		for (const join of node.joins ?? []) {
			if (!sink.has(join.alias)) sink.set(join.alias, join.sql);
		}
		return;
	}
	for (const item of node.items) collectJoins(item, sink);
}

/**
 * PUBLIC: render one conformed filter tree to a WHERE fragment, registering
 * its values on the given collector. Consumers with their OWN query shells
 * (the TM read) reuse the exact leaf/boolean rendering of the main pipeline.
 */
export function renderConformedFilter(node: ConformedFilter, params: ParamsCollector): string {
	return parseConformedFilter(node, params);
}

function parseConformedFilter(node: ConformedFilter, params: ParamsCollector): string {
	if (node.kind === 'leaf') {
		return resolveBuilderResult(node.result, params);
	}
	const fragments = node.items
		.map((item) => {
			const parsed = parseConformedFilter(item, params);
			// Nested groups get wrapped in parentheses (PHP :315-318).
			return item.kind === 'group' && parsed !== '' ? `( ${parsed} )` : parsed;
		})
		.filter((sqlFragment) => sqlFragment !== '');
	if (fragments.length === 0) return '';

	const operator = node.op.slice(1).toUpperCase(); // '$and' → 'AND'
	switch (operator) {
		case 'AND':
			return fragments.join('\n AND ');
		case 'OR':
			return fragments.join('\n OR ');
		case 'NOT':
		case 'NAND':
			return `NOT (${fragments.join('\n AND ')})`;
		case 'NOR':
			return `NOT (${fragments.join('\n OR ')})`;
		default:
			return '';
	}
}

/**
 * Emit an ORDER BY on an exact structural/flat matrix column (PHP
 * `search::$ar_direct_columns` + the `column` order convention). `section_id` /
 * `section_tipo` (and the jsonb data columns) are already projected by the inner
 * SELECT; the matrix PK `id` is NOT among DEFAULT_SELECT_COLUMNS, so surface
 * `<alias>.id AS id` once so the outer windowed query
 * (`SELECT * FROM (…) main_select ORDER BY id`) can see it.
 */
function pushDirectColumnOrder(
	column: string,
	orderAlias: string,
	direction: string,
	selectExtra: string[],
	orderClauses: string[],
): void {
	if (column === 'id') {
		const idSelect = `${orderAlias}.id AS id`;
		if (!selectExtra.includes(idSelect)) selectExtra.push(idSelect);
	}
	orderClauses.push(`${column} ${direction}`);
}

/** Per-order-clause resolution: direct columns or single-step component sort. */
async function buildOrderClauses(
	sqo: Parameters<typeof buildSearchSql>[0],
	alias: string,
	selectExtra: string[],
	joinSink: Map<string, string>,
): Promise<string[]> {
	const orderClauses: string[] = [];
	// PHP build_sql_query_order iterates sqo->order and tolerates a SINGLE order
	// object as well as an array (an ontology-configured default sort is often
	// authored as one `{path,direction}` object — e.g. dd542 Activity's dd549).
	// Normalize to a list so both shapes drive the same ORDER BY.
	const rawOrder = sqo.order as unknown;
	const orderList: { direction?: string; path?: { component_tipo?: string }[]; lang?: string }[] =
		Array.isArray(rawOrder)
			? (rawOrder as typeof orderList)
			: rawOrder !== null && typeof rawOrder === 'object'
				? [rawOrder as (typeof orderList)[number]]
				: [];
	if (orderList.length === 0) return orderClauses;

	for (const orderEntry of orderList) {
		const rawDirection = String(orderEntry.direction ?? 'ASC')
			.trim()
			.toUpperCase();
		const direction = rawDirection === 'DESC' ? 'DESC' : 'ASC';
		const path = orderEntry.path ?? [];
		const lastStep = path[path.length - 1];

		// Order-by convention: `component_tipo` (a component value) WINS over an
		// explicit `column` (an exact DB column). When `component_tipo` is absent,
		// honor `column` — order by that literal structural/flat column (id,
		// section_id, …). Neither present → skip.
		if (lastStep?.component_tipo === undefined) {
			const columnField = (lastStep as { column?: unknown })?.column;
			if (typeof columnField === 'string') {
				const column = assertValidDataColumn(columnField, 'order column');
				pushDirectColumnOrder(column, alias, direction, selectExtra, orderClauses);
			}
			continue;
		}

		// Multi-hop ORDER path: sort by a RELATED section's component — build
		// the same join chain the filter leaves use and extract the sort key
		// from the LAST join alias (PHP trait.order case d).
		let orderAlias = alias;
		if (path.length > 1) {
			const { buildJoinChain } = await import('./conform.ts');
			const chain = await buildJoinChain(
				path as { section_tipo?: string; component_tipo?: string }[],
				alias,
			);
			for (const join of chain.joins) {
				if (!joinSink.has(join.alias)) joinSink.set(join.alias, join.sql);
			}
			orderAlias = chain.lastAlias;
		}
		const componentTipo = assertValidTipoOrColumn(lastStep.component_tipo, 'order path');

		// Structural column named directly in `component_tipo` (PHP
		// search::$ar_direct_columns — the tolerated shortcut kept for back-compat
		// and PHP parity; the `column` field is the preferred, clearer form).
		if (
			componentTipo === 'section_id' ||
			componentTipo === 'section_tipo' ||
			componentTipo === 'id'
		) {
			pushDirectColumnOrder(componentTipo, orderAlias, direction, selectExtra, orderClauses);
			continue;
		}

		// Component data ordering: jsonb extraction as a sort-select alias.
		assertValidTipo(componentTipo, 'order path');
		const model = await getModelByTipo(componentTipo);
		const column = model !== null ? getColumnNameByModel(model) : null;
		if (model === null || column === null) {
			throw new Error(`search assembler: cannot order by unknown tipo '${componentTipo}'`);
		}
		const translatable = await getTranslatableByTipo(componentTipo);
		const langRaw = (orderEntry as { lang?: string }).lang;
		if (langRaw !== undefined) assertValidLang(langRaw, 'order lang');
		const lang = langRaw ?? (translatable ? DEFAULT_DATA_LANG : 'lg-nolan');
		// component_alias (WC-020): the sort value lives under the TARGET's key
		// (the emitted order path carries the alias tipo; execution hops here).
		const { resolveDataTipo } = await import('../ontology/alias.ts');
		const orderDataTipo = await resolveDataTipo(componentTipo);
		const sortAlias = `${orderDataTipo}_order`;

		// Per-family order-select (PHP $model::build_order_select).
		let selectExpression: string;
		if (column === 'date') {
			selectExpression = `(jsonb_path_query_first(${orderAlias}.${column}->'${orderDataTipo}', '$[*].start.time') #>> '{}')::bigint AS ${sortAlias}`;
		} else if (column === 'section_id') {
			selectExpression = `${orderAlias}.section_id AS ${sortAlias}`;
		} else {
			// string-family default (also acceptable for number/misc ordering by value)
			selectExpression = `(jsonb_path_query_first(${orderAlias}.${column}->'${orderDataTipo}', '$[*] ? (@.lang == $lang).value', '{"lang":"${lang}"}') #>> '{}') AS ${sortAlias}`;
		}
		selectExtra.push(selectExpression);
		orderClauses.push(`${sortAlias} ${direction}`);
	}

	if (orderClauses.length > 0) {
		// PHP post-processing (:274-292): NULLS LAST + section_id tie-breaker.
		const flat = orderClauses.join(', ');
		const withNulls = `${flat} NULLS LAST`;
		return [flat.includes('section_id') ? withNulls : `${withNulls}, section_id ASC`];
	}
	return orderClauses;
}

/** Strip a leading 'alias.' prefix (outer ORDER BY references bare columns). */
function stripAliasPrefix(orderClause: string): string {
	return orderClause.replace(/^[a-z0-9_]+\./, '');
}

/** Options that scope the search to a principal (for the per-record ACL). */
export interface SearchOptions {
	/**
	 * The requesting principal. When a NON-admin, the projects filter (§7.4
	 * per-record ACL) restricts results to the user's projects. Global admins
	 * and absent principals (internal/system searches) skip the filter — this
	 * matches PHP is_global_admin bypass, so trusted server code must pass a
	 * principal only when it intends user-scoped results.
	 */
	principal?: Principal;
}

/**
 * Projects filter (PHP build_sql_projects_filter) for one section: restrict to
 * records whose component_filter relation references one of the user's
 * projects. Returns '' when the section is not project-gated. A gated section
 * with a projects-less user yields an impossible clause (empty result).
 */
async function buildProjectsFilter(
	sectionTipo: string,
	alias: string,
	principal: Principal,
	params: ParamsCollector,
): Promise<string> {
	const filterTipo = await getComponentFilterTipo(sectionTipo);
	if (filterTipo === null) return ''; // not project-gated
	const projects = await getUserProjects(principal.userId);
	if (projects.length === 0) {
		// PHP: impossible clause — a user with no projects sees no gated records.
		return `${alias}.relation ? 'IMPOSSIBLE VALUE (User without projects)'`;
	}
	const placeholders = projects.map((projectId) => params.getPlaceholder(projectId));
	return (
		`EXISTS ( SELECT 1 FROM jsonb_array_elements(${alias}.relation::jsonb->'${filterTipo}') AS item ` +
		`WHERE (item->>'section_id')::int IN (${placeholders.join(',')}) )`
	);
}

/**
 * Multi-section projects filter (per-record ACL, §7.4) for a non-admin: each
 * searched section is scoped by its OWN component_filter tipo, gated on
 * section_tipo so the right predicate self-selects inside every UNION branch
 * (and per-row in the same-table `section_tipo IN (…)` query). Sections with
 * no component_filter child contribute a bare section_tipo guard (visible to
 * any authenticated user). Returns '' when NO searched section is gated —
 * the query stays byte-identical to the all-ungated case.
 *
 * DELIBERATE, STRICTLY-SAFER DIVERGENCE from PHP (WC-011): PHP builds ONE
 * clause from the FIRST section's filter tipo (trait.where.php:743-744) and
 * str_replace-copies it verbatim into every UNION branch
 * (class.search.php:1048-1065) — fail-OPEN when the first section is ungated
 * (gated non-first sections return unfiltered: cross-project enumeration) and
 * over-excluding when the sections' filter tipos differ. Never port that.
 */
async function buildMultiSectionProjectsFilter(
	sectionTipos: string[],
	alias: string,
	principal: Principal,
	params: ParamsCollector,
): Promise<string> {
	const disjuncts: string[] = [];
	let anyGated = false;
	for (const sectionTipo of [...new Set(sectionTipos)]) {
		const sectionPredicate = await buildProjectsFilter(sectionTipo, alias, principal, params);
		const guard = `${alias}.section_tipo = ${params.getPlaceholder(sectionTipo)}::text`;
		if (sectionPredicate === '') {
			disjuncts.push(`(${guard})`);
		} else {
			anyGated = true;
			disjuncts.push(`(${guard} AND ${sectionPredicate})`);
		}
	}
	if (!anyGated) return '';
	return `(${disjuncts.join(' OR ')})`;
}

/**
 * Build the complete SQL for a sanitized SQO.
 * Covers: default listing, full_count, filter_by_locators, multi-section UNION,
 * and the per-record projects filter for non-admin principals.
 */
export async function buildSearchSql(sqo: Sqo, options: SearchOptions = {}): Promise<BuiltQuery> {
	const sectionTipos = getSectionTipos(sqo).map((tipo) =>
		assertValidTipo(tipo, 'sqo.section_tipo'),
	);
	const multiSection = sectionTipos.length > 1;
	const mainSectionTipo = sectionTipos[0] as string;
	const alias = multiSection ? 'mix' : (trimTipo(mainSectionTipo) ?? mainSectionTipo);

	// Resolve matrix tables (first resolvable = main; all needed for UNION).
	// Each ontology-resolved table name is interpolated into FROM/JOIN below, so
	// re-assert it against the same allowlist the write layer uses (L2 —
	// defense-in-depth: identical discipline across read and write paths).
	const tables: string[] = [];
	for (const tipo of sectionTipos) {
		const table = await getMatrixTableFromTipo(tipo);
		if (table !== null && !tables.includes(table)) {
			assertMatrixTable(table);
			tables.push(table);
		}
	}
	const matrixTable = tables[0];
	if (matrixTable === undefined) {
		throw new Error('search assembler: no resolvable matrix table for the SQO section_tipo');
	}
	// Multi-section forces remove_distinct (PHP :397-401).
	const removeDistinct = sqo.remove_distinct === true || multiSection;

	const params = new ParamsCollector();

	// --- WHERE: main (section_tipo) ---------------------------------------
	const mainWhere: string[] = [];
	if (multiSection) {
		const placeholders = sectionTipos.map((tipo) => params.getPlaceholder(tipo));
		mainWhere.push(`(${alias}.section_tipo IN (${placeholders.join(',')}))`);
	} else {
		mainWhere.push(`(${alias}.section_tipo = ${params.getPlaceholder(mainSectionTipo)}::text)`);
	}

	// --- WHERE: hide the root user record (PHP search::build_main_where,
	// core/search/trait.where.php:100-103): when the MAIN section is Users,
	// exclude the root record (section_id -1) for EVERY caller incl. admins.
	// Covers rows, full_count, UNION branches, typeahead, filter_by_locators
	// pins and isRecordInScope — they all AND through whereAll. PHP's
	// include_negative escape hatch is server-only and unneeded here: the one
	// path that legitimately includes -1 (getDatalist) bypasses this assembler.
	if (mainSectionTipo === config.usersSectionTipo) {
		mainWhere.push(`${alias}.section_id > 0`);
	}

	// --- WHERE: user filter tree -------------------------------------------
	const whereParts: string[] = [];
	const joinFragments = new Map<string, string>();
	if (sqo.filter !== undefined && sqo.filter !== null) {
		const conformed = await conformFilter(
			sqo.filter as Record<string, unknown>,
			alias,
			matrixTable,
		);
		collectJoins(conformed, joinFragments);
		const filterSql = parseConformedFilter(conformed, params);
		if (filterSql !== '') whereParts.push(filterSql);
	}

	// --- projects filter (per-record ACL, §7.4) — non-admins only -----------
	// Skipped for global admins and internal searches (no principal), and when
	// server-only flag skip_projects_filter is set (already stripped from
	// client SQOs by sanitizeClientSqo, so only trusted code can set it).
	// Multi-section (covered 2026-07-09, replacing the Phase 5c fail-closed
	// throw): per-section predicates — see buildMultiSectionProjectsFilter.
	const principal = options.principal;
	if (principal !== undefined && !principal.isGlobalAdmin && sqo.skip_projects_filter !== true) {
		const projectsFilter = multiSection
			? await buildMultiSectionProjectsFilter(sectionTipos, alias, principal, params)
			: await buildProjectsFilter(mainSectionTipo, alias, principal, params);
		if (projectsFilter !== '') whereParts.push(projectsFilter);
	}

	// --- filter_by_locators (dedicated shape, PHP :1382) --------------------
	if (Array.isArray(sqo.filter_by_locators) && sqo.filter_by_locators.length > 0) {
		const locatorClauses = sqo.filter_by_locators.map((locator) => {
			const fields: string[] = [];
			fields.push(`${alias}.section_id=${params.getPlaceholder(Number(locator.section_id))}`);
			fields.push(
				`${alias}.section_tipo=${params.getPlaceholder(assertValidTipo(locator.section_tipo, 'filter_by_locators'))}`,
			);
			return `( ${fields.join(' AND ')} )`;
		});
		whereParts.push(`(${locatorClauses.join(' OR ')})`);
	}

	// --- ORDER ---------------------------------------------------------------
	const selectExtra: string[] = [];
	const orderClauses = await buildOrderClauses(sqo, alias, selectExtra, joinFragments);
	const orderDefault = [`${alias}.section_id ASC`];

	// --- SELECT ----------------------------------------------------------------
	const select: string[] = [];
	if (sqo.full_count === true) {
		select.push(`count(DISTINCT ${alias}.section_id) as full_count`);
	} else {
		select.push(
			removeDistinct
				? `${alias}.section_id`
				: `DISTINCT ON (${alias}.section_id) ${alias}.section_id`,
		);
		select.push(`${alias}.section_tipo`);
		for (const column of DEFAULT_SELECT_COLUMNS) {
			select.push(`${alias}.${column}`);
		}
		select.push(...selectExtra);
	}

	// --- assemble inner query ---------------------------------------------------
	// Multi-hop filter joins ride after the main FROM (dedup by alias — a
	// repeated path in another clause reuses the same joined rows, PHP rule).
	const joinsSql = joinFragments.size > 0 ? `\n${[...joinFragments.values()].join('\n')}` : '';
	const fromClause = `${matrixTable} AS ${alias}${joinsSql}`;
	const whereAll = [...mainWhere, ...whereParts].filter((part) => part !== '');
	let queryInside = `SELECT ${select.join(',\n')}\nFROM ${fromClause}${whereAll.length > 0 ? `\nWHERE ${whereAll.join('\n AND ')}` : ''}`;

	// --- multi-section UNION ALL (exact-substring FROM swap, PHP :1035) ---------
	if (multiSection && tables.length > 1) {
		const needle = `FROM ${matrixTable} AS ${alias}`;
		const branches = [queryInside];
		for (const table of tables.slice(1)) {
			branches.push(queryInside.replace(needle, `FROM ${table} AS ${alias}`));
		}
		queryInside = branches.join('\nUNION ALL\n');
	}

	// --- full_count wrapper -------------------------------------------------------
	if (sqo.full_count === true) {
		if (multiSection && tables.length > 1) {
			// Each branch yields its own count row; caller sums (PHP trait.count).
			return { sql: `${queryInside};`, params: params.toArray() };
		}
		return { sql: `${queryInside};`, params: params.toArray() };
	}

	// --- inner default ORDER BY (always, PHP :1250) --------------------------------
	const innerOrder = orderDefault
		.map((clause) => (multiSection ? stripAliasPrefix(clause) : clause))
		.join(', ');
	queryInside += `\nORDER BY ${innerOrder}`;

	// --- window vs inline limit ------------------------------------------------------
	// null-safe: the client may send explicit nulls (treated as unset).
	const limitSql = sqo.limit != null && sqo.limit !== 'all' ? `\nLIMIT ${Number(sqo.limit)}` : '';
	const offsetSql = sqo.offset != null && sqo.offset > 0 ? ` OFFSET ${Number(sqo.offset)}` : '';

	const useWindow = orderClauses.length > 0;
	if (!useWindow) {
		return { sql: `${queryInside}${limitSql}${offsetSql};`, params: params.toArray() };
	}

	const outerOrder = (orderClauses.length > 0 ? orderClauses : orderDefault)
		.map(stripAliasPrefix)
		.join(', ');
	const windowed =
		`SELECT * FROM (\n${queryInside}\n) main_select\n` +
		`ORDER BY ${outerOrder}${limitSql}${offsetSql};`;
	return { sql: windowed, params: params.toArray() };
}
