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
 * Shape decision: a custom ORDER on a single-section, no-join query FLATTENS
 * (ORDER BY + LIMIT inline, no DISTINCT ON — section_id is unique there, and
 * PHP's windowed wrapper forced a full-table materialization before LIMIT);
 * a custom ORDER with joins or multi-section keeps the PHP
 * `SELECT * FROM (…) main_select` wrapper with the outer ORDER BY / LIMIT /
 * OFFSET; otherwise LIMIT/OFFSET sit inline on the DISTINCT-ON query.
 *
 * SCOPE NOTES (header re-dated 2026-07-07, S2-45 — the old UNCOVERED list
 * was stale; coverage-state lists live in rewrite/LEDGER.md, never here): the
 * projects-filter ACL IS built here (buildProjectsFilter +
 * buildMultiSectionProjectsFilter below — row-set parity with PHP but the
 * GIN-indexable v6 `@>` SQL shape, NOT the frozen-PHP EXISTS scan;
 * multi-section per-section predicates per WC-011, replacing the Phase
 * 5c fail-closed throw 2026-07-09; principal-scoped, skippable only via the
 * server-only sqo flag); multi-hop ORDER paths ride the conform join chain;
 * group_by/related counting live in search_related.ts (their own PHP-parity
 * engine). Anything this assembler cannot shape throws loudly with a named
 * reason.
 */

import { config } from '../../config/config.ts';
import { readString } from '../../config/readers.ts';
import type { Sqo } from '../concepts/sqo.ts';
import { getSectionTipos } from '../concepts/sqo.ts';
import { assertMatrixTable } from '../db/matrix.ts';
import { policyForTable } from '../db/matrix_index_policy.ts';
import { sql } from '../db/postgres.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { createDataCache } from '../ontology/cache_factory.ts';
import {
	getColumnNameByModel,
	getComponentFilterTipo,
	getMatrixTableFromTipo,
	getModelByTipo,
	getTranslatableByTipo,
} from '../ontology/resolver.ts';
import { getUserFilterRecords } from '../security/filter_records.ts';
import {
	getUserProjects,
	PROFILES_SECTION,
	type Principal,
	FILTER_MASTER_COMPONENT as USERS_FILTER_MASTER_COMPONENT,
} from '../security/permissions.ts';
import { bareBrowseCount } from './bare_count.ts';
import type { BuilderResult } from './builders/types.ts';
import type { ConformedFilter } from './conform.ts';
import { conformFilter } from './conform.ts';
import { composeContains, relationProbeGroups } from './containment.ts';
import {
	assertValidDataColumn,
	assertValidLang,
	assertValidTipo,
	assertValidTipoOrColumn,
} from './identifier_gate.ts';
import { ParamsCollector } from './params.ts';

const DEFAULT_DATA_LANG = readString('DATA_LANG');

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
		return resolveBuilderResult(node.fragment, params);
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
		// `{mode:'locator_position'}` (2026-07-22, semantic-search rank order):
		// preserve the filter_by_locators LIST POSITION — the pins arrive
		// best-first from dd_rag_api semantic_search and the rank must survive
		// pagination/count/export. Emitted as a selectExtra ALIAS (the component-
		// sort pattern below) — NEVER a raw expression carrying `alias.`: the
		// windowed wrapper strips only a LEADING alias prefix (stripAliasPrefix),
		// so a raw array_position(..., alias.section_id) clause would reference an
		// out-of-scope table there ("missing FROM-clause entry"). Ids are inlined
		// as Number.isSafeInteger-validated literals — NEVER a registered bind:
		// the count path reuses this sqo but emits no ORDER BY, so an order-time
		// bind would arrive with no $N in the SQL text and 500 every paginator
		// count (documented deviation from bind-everything; only validated
		// integers are interpolated).
		if ((orderEntry as { mode?: unknown }).mode === 'locator_position') {
			const pins = (sqo as { filter_by_locators?: unknown }).filter_by_locators;
			if (!Array.isArray(pins) || pins.length === 0) {
				continue; // silent no-op: session-merged leftover order without pins
			}
			const tipos = new Set<string>();
			const ids: number[] = [];
			for (const pin of pins as { section_tipo?: unknown; section_id?: unknown }[]) {
				if (typeof pin?.section_tipo === 'string') tipos.add(pin.section_tipo);
				const id = Number(pin?.section_id);
				if (!Number.isSafeInteger(id)) {
					throw new DedaloError('search.invalid_sqo', {
						message: `search assembler: locator_position order refuses non-integer pin section_id ${JSON.stringify(pin?.section_id)}`,
						publicMessage: 'A locator_position order pin needs an integer section_id',
					});
				}
				ids.push(id);
			}
			if (tipos.size > 1) {
				throw new DedaloError('engine.uncovered_scope', {
					message: 'search assembler: locator_position order supports a single-tipo pin list (v1)',
				});
			}
			selectExtra.push(
				`array_position(ARRAY[${ids.join(',')}]::int[], ${alias}.section_id) AS locator_position_order`,
			);
			orderClauses.push('locator_position_order ASC');
			continue;
		}

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
			throw new DedaloError('request.invalid_tipo', {
				message: `search assembler: cannot order by unknown tipo '${componentTipo}'`,
				coordinates: { tipo: componentTipo },
			});
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
		// A structural sort key (section_id / id) is NON-NULL (id is NOT NULL;
		// section_id is sequence-backed — every matrix row carries one). PHP's
		// blanket `NULLS LAST` is a no-op on it, but it defeats the DESC index
		// (which is NULLS FIRST): on the 33 M-row matrix_activity the dd542 list
		// then Parallel-Seq-Scans + Sorts the WHOLE table for every page (>60 s
		// even at offset 0). Emit it index-aligned — no NULLS LAST — and drop the
		// tiebreaker (it is already a unique total order). Wire-identical (no
		// nulls to reorder) and matches the section_id ASC default's shape.
		// jsonb COMPONENT values ARE nullable (a missing component) → keep NULLS
		// LAST for those. (WC-046.)
		if (/^(?:section_id|id) (?:asc|desc)$/i.test(flat)) {
			return [flat];
		}
		const withNulls = `${flat} NULLS LAST`;
		return [flat.includes('section_id') ? withNulls : `${withNulls}, section_id ASC`];
	}
	return orderClauses;
}

/** Strip a leading 'alias.' prefix (outer ORDER BY references bare columns). */
function stripAliasPrefix(orderClause: string): string {
	return orderClause.replace(/^[a-z0-9_]+\./, '');
}

/**
 * A sort that is EXACTLY a unique structural key column — the `id` PK or
 * `section_id` (both a total order, no ties, under the single-tipo predicate) —
 * as {key, dir}, or null for any other sort. Gates the deep-page late lookup /
 * order flip in the flattened path: those rewrites are exact only on a unique
 * monotonic key (the matrix_activity twin of read_tm.ts queryTmRows, which owns
 * the matrix_time_machine `id`-PK path). The dd542 Activity list DEFAULTS to
 * `id DESC` (insertion order); a When-header sort maps to `section_id` — both
 * must flip.
 *
 * buildOrderClauses returns ONE combined clause: an `id`/`section_id` sort is
 * `<key> <dir>` (WC-046 emits it index-aligned, no NULLS LAST, no tiebreaker —
 * already unique), whereas a component sort carries a `, section_id ASC`
 * tiebreaker and is rejected here. The flip's index-aligned `<dir>` reproduces
 * the same rows (proven byte-exact by activity_deep_offset_flip.test.ts).
 */
function singleUniqueKeyOrder(
	orderClauses: string[],
): { key: 'id' | 'section_id'; dir: 'ASC' | 'DESC' } | null {
	const only = orderClauses.length === 1 ? orderClauses[0] : undefined;
	if (only === undefined) return null;
	const match = /^(id|section_id) (asc|desc)(?: nulls (?:last|first))?$/i.exec(
		stripAliasPrefix(only).trim(),
	);
	const key = match?.[1]?.toLowerCase();
	const dir = match?.[2]?.toUpperCase();
	if ((key === 'id' || key === 'section_id') && (dir === 'ASC' || dir === 'DESC')) {
		return { key, dir };
	}
	return null;
}

/**
 * Tables whose INSERTION ORDER is served by a `("timestamp", id)` index, and
 * whose structural-key sorts are therefore re-expressed on that index (WC-054).
 * matrix_activity only: matrix_time_machine has its own emitter (read_tm.ts)
 * and cannot flatten (no UNIQUE (section_id, section_tipo) key).
 */
const TIME_ORDERED_LOG_TABLES: ReadonlySet<string> = new Set(['matrix_activity']);

/**
 * WC-054 — re-express a dd542 structural-key sort as the `("timestamp", id)`
 * order the log's own index serves.
 *
 * THE TRAP. Every dd542 list sort is a unique monotonic key — `id DESC` (the
 * dd549 default: insertion order) or `section_id <dir>` (the When header, WC-044
 * maps When→section_id). Ordered alone they are index-perfect. Combined with a
 * When SEARCH they are ruinous: the filter lives on `timestamp`, which neither
 * the `id` PK nor `(section_tipo, section_id DESC)` carries, so with a wide date
 * predicate (a year-only or year+month value expands to the WHOLE period —
 * builder_date periodBounds) the planner abandons the ("timestamp", id) index
 * and walks the ORDER BY index backwards with the dates as a Filter, betting 30
 * matches turn up within ~30/selectivity rows. That bet assumes the qualifying
 * rows are spread along the key. On an APPEND-ONLY log they are one contiguous
 * block, so any range that does not touch "now" makes the scan walk every newer
 * row first — measured on the 32.9M-row mdcat log, `When = 2023-06` (3.2M
 * matching rows, ~11.4M newer rows to skip, each a heap fetch):
 *     ORDER BY id DESC                    >300 s (statement timeout, never ran out)
 *     ORDER BY "timestamp" DESC, id DESC     1.1 ms
 * A whole YEAR is 0.7 ms on the rewritten shape — O(LIMIT), independent of the
 * range width, because the sort key IS the filtered column and the index
 * delivers the order outright (backward index-ONLY scan, no sort node).
 *
 * EQUIVALENCE, not identity. `timestamp` order ≡ insertion order ≡ id order is
 * the same WC-044 invariant that made When→section_id legal, and it is why the
 * `id` tiebreaker matters: it keeps the pair a UNIQUE total order, so pagination
 * stays stable and the deep-page rewrites below stay exact. Measured on the real
 * log, ~7 rows per million are stamped microseconds out of id order (busiest
 * bulk day: 10 inversions in 1,412,451 rows, worst 224 µs), so two
 * sub-millisecond neighbours can swap. Ledgered as WC-054.
 *
 * DIRECTION. Both columns carry the SAME direction — a btree reads forwards or
 * backwards only, so the ASC index serves `DESC, DESC` reversed but never a
 * mixed pair (the DIRECTION note in db/matrix_index_policy.ts).
 *
 * THE IMPLICIT DEFAULT COUNTS TOO. An sqo that omits `order` (an API caller —
 * the client always sends dd549's) falls through to `orderDefault`
 * (`section_id ASC`, oldest-first), which is the SAME insertion order and the
 * same trap seen from the other end: under a date filter it walks the
 * (section_tipo, section_id DESC) index backwards from the OLDEST row (cost
 * 13.6 M for a one-month range). An empty clause list therefore resolves to the
 * ASC composite order rather than being left alone.
 *
 * Returns the rewritten clauses + the unique key the deep-page rewrites page on
 * (`id` — the join back stays 1:1), or null when the table or the sort is out of
 * scope (a jsonb component sort keeps its sort alias).
 */
function timeOrderedLogOrder(
	orderClauses: string[],
	matrixTable: string,
): { clauses: string[]; key: 'id'; dir: 'ASC' | 'DESC' } | null {
	if (!TIME_ORDERED_LOG_TABLES.has(matrixTable)) return null;
	// No explicit sort → the implicit `section_id ASC` default's direction.
	const dir = orderClauses.length === 0 ? 'ASC' : singleUniqueKeyOrder(orderClauses)?.dir;
	if (dir === undefined) return null;
	return { clauses: [`"timestamp" ${dir}, id ${dir}`], key: 'id', dir };
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
	/**
	 * Selection-identity projection: SELECT only section_id + section_tipo
	 * (plus any sort aliases), skipping the ten wide jsonb data columns. For
	 * callers that materialize the whole selection but read only the identity
	 * (the export's record list). WHERE/ORDER/UNION logic is untouched.
	 */
	idsOnly?: boolean;
}

/**
 * Tables EXEMPT from the projects filter (PHP search::$ar_tables_skip_projects,
 * class.search.php:115 — set_up() auto-sets skip_projects_filter for them).
 * These hold shared vocabulary/infrastructure records (thesaurus, ontology
 * data, langs, tools, notes) that carry NO project locators — gating them
 * would blank the whole surface for every non-admin. This rule was LATENT in
 * TS until getComponentFilterTipo gained the virtual→real fallback
 * (2026-07-19): hierarchy sections then resolved a component_filter through
 * their real section and non-admin thesaurus searches returned EMPTY
 * (caught 2026-07-20 while chasing an autocomplete regression).
 */
const PROJECTS_FILTER_EXEMPT_TABLES: ReadonlySet<string> = new Set([
	'matrix_list',
	'matrix_dd',
	'matrix_hierarchy',
	'matrix_hierarchy_main',
	'matrix_langs',
	'matrix_tools',
	'matrix_stats',
	'matrix_notes',
]);

/**
 * ONE project-membership disjunction: `relation @> {"<filterTipo>":[{…}]}`
 * containments OR'd over the caller's projects. The SHARED shape behind both
 * the generic filter and the USERS filter, so the two can never drift.
 *
 * SQL shape: whole-column containment — the v6 idiom, served by the
 * `{table}_relation_gin_idx` (gin jsonb_path_ops) index. The frozen-PHP-beta
 * `EXISTS(jsonb_array_elements(…))` shape scanned every candidate row and made
 * every non-admin list/count seconds-slow; never reintroduce it. Each project
 * id is matched in BOTH typed section_id forms — `@>` containment is
 * type-strict where the old `::int` cast was not, and the stored form is a
 * string until the int sweep, an int after
 * (WC-2026-08-10-section-id-int-canonical). The dual-form assembly is
 * delegated to search/containment.ts so the idiom has exactly one home.
 *
 * Matched on section_id ALONE, never on the locator's `type`: PHP's own default
 * branch does the same (trait.where.php:895 `(item->>'section_id')::int IN …`),
 * and the live archive stores the SAME dd170 project under two different types
 * (dd675 ×52, dd151 ×2), so a type-strict predicate would deny real users.
 * Declared as WC-2026-08-09-users-section-record-scope, which is where PHP's
 * users branch DOES include the type.
 */
function projectContainmentDisjunction(
	filterTipo: string,
	alias: string,
	projects: readonly number[],
	params: ParamsCollector,
): string {
	// One dual-form containment per project, OR'd: the user sees a record when
	// it belongs to ANY of their projects.
	const bind = (payload: string) => params.getPlaceholder(payload);
	const clauses = projects.map((projectId) =>
		composeContains(
			`${alias}.relation`,
			relationProbeGroups(filterTipo, [{ section_id: projectId }]),
			bind,
		),
	);
	return `(${clauses.join(' OR ')})`;
}

/**
 * THE USERS-SECTION (dd128) VISIBILITY RULE — the ENUMERATION half of the oh1
 * beta audit's finding 3, and the ONLY statement of that rule in the engine:
 *
 *   section_id > 0 AND ( it IS my record
 *                        OR I created it   (data.created_by_user_id = me)
 *                        OR it shares one of MY projects (dd170) )
 *
 * dd128 carries NO `component_filter` child, so the GENERIC branch below
 * resolves `getComponentFilterTipo('dd128') === null` and emitted NOTHING: any
 * non-admin holding a dd128 read grant listed/searched every user record in the
 * install. This branch is the door the audit finding is about — a per-record
 * helper cannot close an enumeration. Conversely, the rule lives HERE and not
 * in security/record_scope.ts so that the list, the count, every UNION branch
 * and the per-record existence probe inherit one predicate; see that module's
 * header for why a second copy is forbidden.
 *
 * Divergences from `case USERS` (trait.where.php:775-836), all declared in
 * WC-2026-08-09-users-section-record-scope:
 *
 * - THE OWN-RECORD ARM. PHP states it one layer up, per record
 *   (security::user_can_access_record:1038-1041), and NOT in this filter — so a
 *   projects-less user whose account someone else created cannot list, and
 *   therefore cannot READ, their own row. Every door that reads a record runs a
 *   principal-scoped search, so omitting it here would lock such a user out of
 *   the self-service profile editor. It leaks nothing: the caller knows their
 *   own id by definition.
 * - THE KEY IS `created_by_user_id`. PHP's filter literal says
 *   `created_by_userID` (trait.where.php:791) but PHP's OWN metadata writer
 *   stamps `created_by_user_id` (class.section_record.php:1688) and every live
 *   row carries that spelling — the oracle's clause is dead code that matches
 *   no row in any install. Reading the real key makes this predicate LIVE where
 *   PHP's is inert.
 * - A PROJECTS-LESS CALLER degrades to the own-record/created_by clauses
 *   instead of PHP's `throw new Exception("Invalid filter master data")`
 *   (:812): they see themselves and the accounts they created — never a 500.
 *
 * `section_id > 0` is repeated here even though buildSearchSql already pushes
 * it for a users MAIN section: this predicate also rides the multi-section
 * UNION branches, where that guard is not applied.
 */
async function buildUsersProjectsFilter(
	alias: string,
	principal: Principal,
	params: ParamsCollector,
): Promise<string> {
	const access = [
		`${alias}.section_id = ${params.getPlaceholder(principal.userId)}`,
		`${alias}.data @> ${params.getPlaceholder(`{"created_by_user_id":${principal.userId}}`)}::text::jsonb`,
		`${alias}.data @> ${params.getPlaceholder(`{"created_by_user_id":"${principal.userId}"}`)}::text::jsonb`,
	];
	// The SAME reader every other ACL door uses (cached, invalidation-registered).
	const projects = await getUserProjects(principal.userId);
	if (projects.length > 0) {
		access.push(
			projectContainmentDisjunction(USERS_FILTER_MASTER_COMPONENT, alias, projects, params),
		);
	}
	return `(${alias}.section_id > 0 AND (${access.join(' OR ')}))`;
}

/**
 * Projects filter (PHP build_sql_projects_filter) for one section: restrict to
 * records whose component_filter relation references one of the user's
 * projects. Returns '' when the section is not project-gated. A gated section
 * with a projects-less user yields an impossible clause (empty result).
 *
 * The switch is PHP's, arm for arm: PROFILES and PROJECTS are UNGATED for
 * everyone (`case DEDALO_SECTION_PROFILES_TIPO` / `case
 * DEDALO_FILTER_SECTION_TIPO_DEFAULT`, no filter since 2018-03-31 — a user must
 * be able to read the profile that grants them anything, and projects are
 * globally visible); USERS takes {@link buildUsersProjectsFilter}; everything
 * else takes the component_filter lookup. Both exemptions are currently
 * IMPLIED by their sections having no component_filter child, but they are
 * stated because PHP states them: adding one to dd234 must not silently start
 * gating the profiles section.
 */
async function buildProjectsFilter(
	sectionTipo: string,
	alias: string,
	principal: Principal,
	params: ParamsCollector,
): Promise<string> {
	// PHP `case DEDALO_SECTION_PROFILES_TIPO` / `case DEDALO_FILTER_SECTION_TIPO_DEFAULT`.
	if (sectionTipo === PROFILES_SECTION || sectionTipo === config.features.filterSectionTipo) {
		return '';
	}
	// PHP `case DEDALO_SECTION_USERS_TIPO`.
	if (sectionTipo === config.usersSectionTipo) {
		return buildUsersProjectsFilter(alias, principal, params);
	}
	const filterTipo = await getComponentFilterTipo(sectionTipo);
	if (filterTipo === null) return ''; // not project-gated
	const projects = await getUserProjects(principal.userId);
	if (projects.length === 0) {
		// PHP: impossible clause — a user with no projects sees no gated records.
		return `${alias}.relation ? 'IMPOSSIBLE VALUE (User without projects)'`;
	}
	return projectContainmentDisjunction(filterTipo, alias, projects, params);
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
	gateableSections: string[],
	alias: string,
	principal: Principal,
	params: ParamsCollector,
): Promise<string> {
	const gateable = new Set(gateableSections);
	const disjuncts: string[] = [];
	let anyGated = false;
	for (const sectionTipo of [...new Set(sectionTipos)]) {
		// PHP $ar_tables_skip_projects sections (thesaurus/vocabulary tables)
		// pass with a bare guard — they are never project-gated.
		const sectionPredicate = gateable.has(sectionTipo)
			? await buildProjectsFilter(sectionTipo, alias, principal, params)
			: '';
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
 * Append a WHERE fragment, skipping the empty one. `whereParts.length` is READ
 * as a decision (the bare-browse and pure-ACL fast paths below), so an empty
 * string may never be pushed as a placeholder.
 */
function pushFragment(parts: string[], fragment: string): void {
	if (fragment !== '') parts.push(fragment);
}

/**
 * ROW-LEVEL ACL BY RECORD ID (PHP trait.where::build_filter_by_user_records):
 * when the caller's component_filter_records datum (dd478) names a searched
 * section, only the listed section_ids pass. Returns '' when the user has no
 * entry for ANY searched section — the overwhelmingly common case, and the
 * query then stays byte-identical to the no-filter one.
 *
 * The ids are INT-VALIDATED at the reader (security/filter_records.ts) and
 * interpolated as integer literals rather than bound: PHP does the same
 * (SEARCH-04) to avoid an N-placeholder explosion on a large allow-list, and a
 * validated integer has no injection surface. The section_tipo guards ARE
 * bound, like every other tipo in this assembler.
 *
 * Multi-section: one guarded disjunct per section — a section the user has no
 * entry for passes with a bare guard, so an allow-list on ONE branch of a UNION
 * cannot silently drop the others (the buildMultiSectionProjectsFilter shape,
 * and NOT PHP's first-section-only clause).
 */
async function buildUserRecordsFilter(
	sectionTipos: string[],
	alias: string,
	principal: Principal | undefined,
	params: ParamsCollector,
	multiSection: boolean,
): Promise<string> {
	if (principal === undefined) return ''; // internal search — never gated
	const allowed = await getUserFilterRecords(principal.userId);
	if (allowed.size === 0) return '';
	if (multiSection) return multiSectionUserRecordsFilter(sectionTipos, alias, allowed, params);
	const ids = allowed.get(sectionTipos[0] as string);
	return ids === undefined ? '' : `(${allowedIdsIn(alias, ids)})`;
}

/** The allow-list as an id predicate — validated ints, so literals (see above). */
function allowedIdsIn(alias: string, ids: number[]): string {
	return `${alias}.section_id IN (${ids.join(',')})`;
}

/** The per-branch shape of {@link buildUserRecordsFilter} for a UNION search. */
function multiSectionUserRecordsFilter(
	sectionTipos: string[],
	alias: string,
	allowed: Map<string, number[]>,
	params: ParamsCollector,
): string {
	const disjuncts: string[] = [];
	let anyFiltered = false;
	for (const sectionTipo of [...new Set(sectionTipos)]) {
		const guard = `${alias}.section_tipo = ${params.getPlaceholder(sectionTipo)}::text`;
		const ids = allowed.get(sectionTipo);
		if (ids === undefined) {
			disjuncts.push(`(${guard})`);
			continue;
		}
		anyFiltered = true;
		disjuncts.push(`(${guard} AND ${allowedIdsIn(alias, ids)})`);
	}
	return anyFiltered ? `(${disjuncts.join(' OR ')})` : '';
}

/**
 * PROJECTS-FILTER PAGE-SHAPE probe (2026-07-19). With the ACL containment in
 * the WHERE, the planner serves `ORDER BY section_id LIMIT n` from the
 * (section_tipo, section_id) index and applies the filter PER ROW — assuming
 * matches are uniform over the id range. Project membership correlates with
 * record age, so a user's matches cluster (measured: render's numisdata4
 * matches start at id 4,926 of 181k → 155k rows discarded for one page,
 * ~630ms). The GIN bitmap path costs ~selectivity instead, so the right shape
 * DEPENDS on match density:
 *   sparse  → materialize the matching ids via the GIN bitmap, sort, page
 *             (~70ms at 5k matches) — the ordered walk would be seconds;
 *   dense   → keep the ordered index walk (sub-ms) — materializing 171k
 *             matches would cost ~700ms.
 * The probe counts matches capped at PROJECTS_DENSE_CAP through the same
 * WHERE (bitmap, early-stop: 23-42ms measured) and the verdict is cached per
 * (user, section): evicted on that section's writes (density change) and on
 * users-section writes (project membership change), the getUserProjects
 * posture.
 */
/**
 * DENSE means "the user's matches are a large FRACTION of the section" — an
 * absolute cap misclassifies (5k matches is 2.8% of numisdata4: bitmap
 * territory). The cap is therefore PROJECTS_DENSE_FRACTION of the section's
 * cached total: a probe that saturates it proves density ≥ the fraction →
 * keep the ordered walk; below it the bitmap materialization is bounded by
 * fraction × total ids. Probe cost ∝ the cap (bitmap early-stop) and both
 * verdict and section total are event-evicted caches, so it is paid once per
 * (user, section) between writes.
 */
const PROJECTS_DENSE_FRACTION = 0.05;
const PROJECTS_PROBE_FLOOR = 2000;
const projectsDensityCache = createDataCache<string, boolean>((cache, sectionTipo) => {
	if (sectionTipo === config.usersSectionTipo) {
		cache.clear();
		return;
	}
	for (const key of [...cache.keys()]) {
		if (key.endsWith(`|${sectionTipo}`)) cache.delete(key);
	}
});
const sectionTotalCache = createDataCache<string, number>((cache, sectionTipo) => {
	cache.delete(sectionTipo);
});
// Schema property (data events never change an index definition) — keep entries.
const uniqueSectionKeyCache = createDataCache<string, boolean>(() => {});

/**
 * TRUE when the table carries a full (non-partial) UNIQUE index on exactly
 * (section_id, section_tipo) — the precondition that makes DISTINCT ON
 * (section_id) a no-op under a single-tipo predicate (the flattenOrder /
 * plainCount reasoning). Ordinary matrix tables have it; the versioned/derived
 * ones (matrix_time_machine, matrix_structurations, …) do NOT and must keep
 * the windowed shape. Probed once per table per process (schema is
 * boot-stable; an assets rebuild recreates the same keys).
 */
export async function tableHasUniqueSectionKey(table: string): Promise<boolean> {
	const cached = uniqueSectionKeyCache.get(table);
	if (cached !== undefined) return cached;
	const rows = (await sql.unsafe(
		`SELECT EXISTS (
			SELECT 1 FROM pg_index i
			JOIN pg_class t ON t.oid = i.indrelid
			WHERE t.relname = $1
			  AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
			  AND i.indnkeyatts = 2
			  AND ARRAY(
			    SELECT a.attname::text FROM pg_attribute a
			    WHERE a.attrelid = t.oid AND a.attnum = ANY (i.indkey::int2[])
			  ) @> ARRAY['section_id','section_tipo']
		) AS ok`,
		[table],
	)) as { ok: boolean }[];
	const ok = rows[0]?.ok === true;
	uniqueSectionKeyCache.set(table, ok);
	return ok;
}

/** Cheap per-section row total (index-only count, cached, event-evicted). */
async function sectionRowTotal(
	fromClause: string,
	alias: string,
	sectionTipo: string,
): Promise<number> {
	const cached = sectionTotalCache.get(sectionTipo);
	if (cached !== undefined) return cached;
	const rows = (await sql.unsafe(
		`SELECT count(*) AS n FROM ${fromClause} WHERE ${alias}.section_tipo = $1::text`,
		[sectionTipo],
	)) as { n: number | string }[];
	const total = Number(rows[0]?.n ?? 0);
	sectionTotalCache.set(sectionTipo, total);
	return total;
}

async function projectsFilterIsSparse(
	userId: number,
	sectionTipo: string,
	alias: string,
	fromClause: string,
	whereSql: string,
	boundParams: unknown[],
): Promise<boolean> {
	const cacheKey = `${userId}|${sectionTipo}`;
	const cached = projectsDensityCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const total = await sectionRowTotal(fromClause, alias, sectionTipo);
	const cap = Math.max(PROJECTS_PROBE_FLOOR, Math.ceil(total * PROJECTS_DENSE_FRACTION));
	const probeSql =
		`SELECT count(*) AS n FROM (SELECT 1 FROM ${fromClause}\nWHERE ${whereSql}\n` +
		`LIMIT ${cap}) density_probe`;
	const rows = (await sql.unsafe(probeSql, boundParams as (string | number | null)[])) as {
		n: number | string;
	}[];
	const sparse = Number(rows[0]?.n ?? 0) < cap;
	projectsDensityCache.set(cacheKey, sparse);
	return sparse;
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
		throw new DedaloError('request.invalid_tipo', {
			message: 'search assembler: no resolvable matrix table for the SQO section_tipo',
		});
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
	let projectsFilterActive = false;
	if (principal !== undefined && !principal.isGlobalAdmin && sqo.skip_projects_filter !== true) {
		// PHP auto-exemption (search::$ar_tables_skip_projects): shared
		// vocabulary/infrastructure tables never carry project locators. Applies
		// per SECTION so a mixed UNION only gates the gateable branches.
		const gateableSections: string[] = [];
		for (const sectionTipo of sectionTipos) {
			const sectionTable = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';
			if (!PROJECTS_FILTER_EXEMPT_TABLES.has(sectionTable)) gateableSections.push(sectionTipo);
		}
		if (gateableSections.length > 0) {
			const projectsFilter = multiSection
				? await buildMultiSectionProjectsFilter(
						sectionTipos,
						gateableSections,
						alias,
						principal,
						params,
					)
				: await buildProjectsFilter(mainSectionTipo, alias, principal, params);
			if (projectsFilter !== '') {
				whereParts.push(projectsFilter);
				projectsFilterActive = true;
			}
		}
	}

	// --- filter_records (row-level ACL by id, PHP build_filter_by_user_records)
	// The caller's own component_filter_records datum (dd478), ANDed on top of
	// everything above: the projects filter says which records the user's
	// projects reach, this one names the individual records inside a section.
	// Applies to global admins too — PHP's clause has no admin arm, and an
	// admin with no allow-list (the normal case) is unaffected either way.
	// Skipped for internal searches (no principal), like the projects filter.
	pushFragment(
		whereParts,
		await buildUserRecordsFilter(sectionTipos, alias, principal, params, multiSection),
	);

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
	let orderClauses = await buildOrderClauses(sqo, alias, selectExtra, joinFragments);
	const orderDefault = [`${alias}.section_id ASC`];

	// Flatten the explicit-order shape when DISTINCT ON is provably a no-op:
	// single-section + no join fragments + the table's UNIQUE (section_id,
	// section_tipo) key (probed — matrix_time_machine/matrix_structurations
	// lack it and keep the windowed shape) + the single section_tipo predicate
	// make section_id unique across the scanned rows. The PHP windowed wrapper
	// `SELECT * FROM (DISTINCT ON … ORDER BY section_id) ORDER BY <sort> LIMIT n`
	// then only forces Postgres to materialize EVERY row before the LIMIT can
	// apply (measured on a 33M-row matrix_activity: ~10 s for a section_id sort
	// vs 1 ms flattened; minutes for a jsonb component sort). Same rows, same
	// order, same columns — ORDER BY + LIMIT are applied inline instead.
	// (A multi-hop ORDER path adds its join chain to joinFragments, so it is
	// excluded here automatically.)
	const flattenable =
		!multiSection && joinFragments.size === 0 && (await tableHasUniqueSectionKey(matrixTable));

	// WC-054: re-express the append-only log's insertion order on the
	// ("timestamp", id) index — the only shape that is not catastrophic under a
	// When date filter (see timeOrderedLogOrder). Gated on `flattenable`, not on
	// flattenOrder, for two reasons: it also supplies the IMPLICIT default order
	// (which turns an unordered sqo into a flattened one), and the windowed
	// wrapper's outer ORDER BY can only reference the inner SELECT's projection,
	// which `timestamp` is not part of. Flattening is guaranteed for
	// matrix_activity (it carries the UNIQUE key), so the guard costs nothing and
	// keeps the rewrite from ever emitting an out-of-scope column reference.
	const timeOrder = flattenable ? timeOrderedLogOrder(orderClauses, matrixTable) : null;
	if (timeOrder !== null) orderClauses = timeOrder.clauses;

	const flattenOrder = orderClauses.length > 0 && flattenable;

	// --- SELECT ----------------------------------------------------------------
	const select: string[] = [];
	if (sqo.full_count === true) {
		// UNIQUE (section_id, section_tipo) + a single section_tipo predicate
		// (section_id NOT NULL as a unique-key member) means section_id is unique
		// across the scanned rows unless a multi-hop join chain multiplies them —
		// DISTINCT is only needed then, and for multi-section, where PHP's
		// cross-tipo collapse semantics must be preserved. count(*) unlocks a
		// parallel index-only scan on the big tables.
		const plainCount = !multiSection && joinFragments.size === 0;
		select.push(
			plainCount ? 'count(*) as full_count' : `count(DISTINCT ${alias}.section_id) as full_count`,
		);
	} else {
		select.push(
			removeDistinct || flattenOrder
				? `${alias}.section_id`
				: `DISTINCT ON (${alias}.section_id) ${alias}.section_id`,
		);
		select.push(`${alias}.section_tipo`);
		if (options.idsOnly !== true) {
			for (const column of DEFAULT_SELECT_COLUMNS) {
				select.push(`${alias}.${column}`);
			}
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
		// Cached bare-browse total for the big append-only logs. whereParts empty
		// ⇒ the count is exactly `count(*) WHERE section_tipo = $` — no filter, no
		// projects-ACL predicate (a non-admin's filter lands in whereParts) — so
		// the save-event-wired bareBrowseCount is the exact value, served as a
		// literal instead of a ~2.5 s parallel scan on every list paint. Scoped to
		// policy-governed tables (matrix_activity/…); other sections keep the
		// live count. This is the SAME bare-browse determination the flip uses.
		if (
			joinFragments.size === 0 &&
			whereParts.length === 0 &&
			policyForTable(matrixTable) !== undefined
		) {
			const total = await bareBrowseCount(matrixTable, mainSectionTipo);
			return { sql: `SELECT ${Number(total)}::int AS full_count;`, params: [] };
		}
		return { sql: `${queryInside};`, params: params.toArray() };
	}

	// --- inner ORDER BY (always, PHP :1250; flattened → the explicit sort) ---------
	const innerOrder = (flattenOrder ? orderClauses : orderDefault)
		.map((clause) => (multiSection ? stripAliasPrefix(clause) : clause))
		.join(', ');
	queryInside += `\nORDER BY ${innerOrder}`;

	// --- window vs inline limit ------------------------------------------------------
	// null-safe: the client may send explicit nulls (treated as unset).
	const limitSql = sqo.limit != null && sqo.limit !== 'all' ? `\nLIMIT ${Number(sqo.limit)}` : '';
	const offsetSql = sqo.offset != null && sqo.offset > 0 ? ` OFFSET ${Number(sqo.offset)}` : '';

	if (flattenOrder) {
		// Deep-page acquisition for a flattened browse ordered by a unique
		// structural key — `id` (the dd542 Activity list DEFAULT: insertion order)
		// or `section_id` (a When-header sort). A plain OFFSET on this shape is an
		// Index Scan that heap-fetches EVERY skipped row's wide jsonb (measured
		// ≈5 s at offset 32 M on the 33 M-row matrix_activity). The key is unique
		// (no ties), so two exact rewrites apply (identical rows and order — the
		// outer ORDER BY restores the requested order over the ≤LIMIT joined rows):
		//   1. LATE ROW LOOKUP — page the KEY on a narrow index scan, then join
		//      back for the wide data columns; never reads a skipped row's jsonb.
		//   2. ORDER FLIP — a far-half page is the SAME rows fetched from the
		//      OTHER end with a small offset (last page → OFFSET 0, ≈ms). Needs the
		//      row total; applied ONLY to the unfiltered browse, where the bare
		//      count is exact and cached (bareBrowseCount). The matrix_activity
		//      twin of read_tm.ts queryTmRows (matrix_time_machine cannot flatten).
		const lateThreshold = config.ops.searchLateRowLookupOffset;
		const offsetNum = sqo.offset != null ? Number(sqo.offset) : 0;
		// WC-054: after the timestamp rewrite the ORDER BY is a two-column clause
		// that singleUniqueKeyOrder rejects by design — take the key/direction it
		// already resolved, or the rewrite would silently drop these pages back to
		// a plain deep OFFSET (measured 8.1 s at offset 16 M on the composite
		// order). ("timestamp", id) is still a UNIQUE total order (`id` alone is),
		// so both rewrites stay exact: the page is acquired by `id` — a 1:1 join
		// back — and the flip mirrors BOTH columns.
		const keyOrder = timeOrder ?? singleUniqueKeyOrder(orderClauses);
		if (lateThreshold >= 0 && limitSql !== '' && offsetNum >= lateThreshold && keyOrder !== null) {
			const { key, dir: requestedDir } = keyOrder;
			/** The full sort key, alias-qualified, in the given direction. */
			const orderBy = (dir: 'ASC' | 'DESC'): string =>
				timeOrder !== null
					? `${alias}."timestamp" ${dir}, ${alias}.id ${dir}`
					: `${alias}.${key} ${dir}`;
			const limitNum = Number(sqo.limit);
			let innerDir: 'ASC' | 'DESC' = requestedDir;
			let effOffset = offsetNum;
			let effLimit = limitNum;
			// Flip only the UNFILTERED browse: the bare count is exact + cached,
			// and a filtered set is far too small to reach the far half anyway.
			if (whereParts.length === 0) {
				const total = await bareBrowseCount(matrixTable, mainSectionTipo);
				const oppositeOffset = total - offsetNum - limitNum;
				if (total > offsetNum && oppositeOffset < offsetNum) {
					innerDir = requestedDir === 'ASC' ? 'DESC' : 'ASC';
					effOffset = Math.max(0, oppositeOffset); // last partial page skips 0 from the end
					effLimit = Math.min(limitNum, total - offsetNum); // last partial page: < LIMIT rows
				}
			}
			const pageWhere = whereAll.length > 0 ? `\nWHERE ${whereAll.join('\n AND ')}` : '';
			const pageQuery =
				`SELECT ${alias}.${key}\nFROM ${fromClause}${pageWhere}\n` +
				`ORDER BY ${orderBy(innerDir)}\nLIMIT ${effLimit} OFFSET ${effOffset}`;
			// Outer ORDER BY: the REQUESTED direction, alias-qualified (the JOIN
			// makes a bare column ambiguous) — restores order after a flip.
			const flatSql =
				`SELECT ${select.join(',\n')}\nFROM ${fromClause}\n` +
				`JOIN (\n${pageQuery}\n) page ON page.${key} = ${alias}.${key}\n` +
				// mainWhere re-pins section_tipo (same $n — ParamsCollector dedups):
				// another tipo in the same table may reuse a section_id (the `id` PK
				// is globally unique, so the re-pin is a harmless no-op there).
				`WHERE ${mainWhere.join('\n AND ')}\n` +
				`ORDER BY ${orderBy(requestedDir)};`;
			return { sql: flatSql, params: params.toArray() };
		}
		// The sort aliases in selectExtra are projected by this same SELECT, so
		// the ORDER BY references resolve without the wrapper.
		return { sql: `${queryInside}${limitSql}${offsetSql};`, params: params.toArray() };
	}

	const useWindow = orderClauses.length > 0;
	if (!useWindow) {
		// SPARSE projects-filter page (see projectsFilterIsSparse above): scoped
		// to the pure ACL browse — whereParts is EXACTLY the projects filter (a
		// client filter would change the density the cached verdict measured).
		// The MATERIALIZED CTE pins the GIN bitmap: matching ids only (ints, tiny
		// regardless of idsOnly), then the page joins back 1:1 on
		// (section_tipo, section_id) — identical rows/order/columns, deep offsets
		// included (the ordered walk degrades the same way there).
		if (
			projectsFilterActive &&
			whereParts.length === 1 &&
			!multiSection &&
			joinFragments.size === 0 &&
			limitSql !== '' &&
			principal !== undefined &&
			(await projectsFilterIsSparse(
				principal.userId,
				mainSectionTipo,
				alias,
				fromClause,
				whereAll.join('\n AND '),
				params.toArray(),
			))
		) {
			const sparseSql =
				`WITH filtered_ids AS MATERIALIZED (\nSELECT ${alias}.section_id\nFROM ${fromClause}\nWHERE ${whereAll.join('\n AND ')}\n)\n` +
				`SELECT ${select.join(',\n')}\nFROM ${fromClause}\n` +
				`JOIN (\nSELECT section_id FROM filtered_ids ORDER BY section_id ASC${limitSql}${offsetSql}\n) page ON page.section_id = ${alias}.section_id\n` +
				// mainWhere re-pins section_tipo (same $n — ParamsCollector dedups):
				// other tipos in the same table may reuse a section_id.
				`WHERE ${mainWhere.join('\n AND ')}\n` +
				`ORDER BY ${innerOrder};`;
			return { sql: sparseSql, params: params.toArray() };
		}
		// Late row lookup for DEEP pages: a plain OFFSET makes Postgres read and
		// discard every skipped row's wide jsonb columns. From the configured
		// offset on, find the wanted page of section_ids on an index-only scan
		// first ((section_tipo, section_id) composite), then join back for the
		// data columns. Identical rows/order/columns — guarded to the
		// single-section, no-join, default-order shape where section_id is
		// unique, so the join back on (section_tipo, section_id) is 1:1.
		const lateThreshold = config.ops.searchLateRowLookupOffset;
		const lateLookup =
			lateThreshold >= 0 &&
			!multiSection &&
			joinFragments.size === 0 &&
			limitSql !== '' &&
			offsetSql !== '' &&
			Number(sqo.offset) >= lateThreshold;
		if (lateLookup) {
			const pageWhere = whereAll.length > 0 ? `\nWHERE ${whereAll.join('\n AND ')}` : '';
			const pageQuery = `SELECT ${alias}.section_id\nFROM ${fromClause}${pageWhere}\nORDER BY ${innerOrder}${limitSql}${offsetSql}`;
			const lateSql =
				`SELECT ${select.join(',\n')}\nFROM ${fromClause}\n` +
				`JOIN (\n${pageQuery}\n) page ON page.section_id = ${alias}.section_id\n` +
				// mainWhere re-pins section_tipo (same $n — ParamsCollector dedups):
				// other tipos in the same table may reuse a section_id.
				`WHERE ${mainWhere.join('\n AND ')}\n` +
				`ORDER BY ${innerOrder};`;
			return { sql: lateSql, params: params.toArray() };
		}
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
