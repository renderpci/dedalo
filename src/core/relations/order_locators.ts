/**
 * PORTAL COLUMN SORT (RELATIONS_SPEC.md §6.1) — v7-native, per-ddo model.
 *
 * The portal's sort directives live ON the column ddo (a
 * `properties.source.request_config[].show.ddo_map` entry), NOT on top-level
 * component properties (the PHP-inherited `properties.sort_by_column` /
 * `properties.order_by` are GONE — DEC/WC-048). Two independent per-ddo keys:
 *
 *   { "tipo": "rsc85", "sort_by_column": true, "order": "asc" }
 *
 * - `sort_by_column: true` → the user may click the column header to
 *   PERSISTENTLY reorder the portal by this column (a write; gated in
 *   `save.ts applySortByColumn`, surfaced to the client via
 *   `ui.allow_column_order`).
 * - `order: "asc" | "desc"` (or `true` = asc) → this column is part of the
 *   DEFAULT read order applied every read FOR DISPLAY (this module), without
 *   writing the stored array. Multiple ordered columns → priority follows their
 *   ddo_map declaration order.
 *
 * Both share ONE ranking engine (`rankLocatorsByColumns`): a target-section
 * search restricted to the linked `section_id`s ordered on the column(s), then a
 * rank-map re-order of the stored locators (unresolved locators fall to the END,
 * stable — PHP usort with rank map). The per-ddo keys ride the parsed
 * request_config passthrough (`request_config/explicit.ts` spreads `...rawDdo`),
 * so the server read/save paths and the client all see them without any
 * `ddoSchema` change. No PHP oracle; opt-in, so read-path parity is unchanged.
 */

import { sql } from '../db/postgres.ts';

/** One ORDER BY step: a column of a target section, ASC or DESC. */
export interface PortalOrderEntry {
	direction: 'ASC' | 'DESC';
	path: { section_tipo: string; component_tipo: string }[];
}

/** The resolved search order: the target sections to search + the order steps. */
export interface PortalOrderSpec {
	targets: string[];
	order: PortalOrderEntry[];
}

/** A resolved config column (a `show.ddo_map` entry), carrying the per-ddo keys. */
interface ConfigColumn {
	tipo?: unknown;
	section_tipo?: unknown;
	order?: unknown;
	sort_by_column?: unknown;
}

/** `"asc"`/`"desc"` (any case) or boolean `true` (= asc) → direction; else null. */
export function normalizeDirection(raw: unknown): 'ASC' | 'DESC' | null {
	if (raw === true) return 'ASC';
	if (typeof raw !== 'string') return null;
	const dir = raw.toUpperCase();
	return dir === 'ASC' || dir === 'DESC' ? dir : null;
}

/**
 * CHEAP gate (no DB, no config build): does the component's raw effective
 * properties declare a per-ddo `order` on any request_config column? Lets the
 * portal read hot-path skip the whole ordering machinery unless it is used.
 */
export function hasDeclaredColumnOrder(properties: unknown): boolean {
	const requestConfig = (properties as { source?: { request_config?: unknown } } | null)?.source
		?.request_config;
	if (!Array.isArray(requestConfig)) return false;
	for (const item of requestConfig) {
		const ddoMap = (item as { show?: { ddo_map?: unknown } })?.show?.ddo_map;
		if (
			Array.isArray(ddoMap) &&
			ddoMap.some((ddo) => normalizeDirection((ddo as ConfigColumn)?.order) !== null)
		) {
			return true;
		}
	}
	return false;
}

/**
 * PURE resolution of the resolved columns (a `show.ddo_map` array) into a search
 * order spec — the DB-free core, unit-tested directly. Each column carrying an
 * `order` directive becomes an ORDER step over its target section ('self' → the
 * host section), priority = declaration order. Returns null when no column
 * declares a valid `order`.
 */
export function buildPortalOrderSpecs(
	columns: ConfigColumn[],
	sectionTipo: string,
): PortalOrderSpec | null {
	const order: PortalOrderEntry[] = [];
	const targetSet = new Set<string>();
	for (const column of columns) {
		const direction = normalizeDirection(column.order);
		if (direction === null) continue;
		const columnTipo = typeof column.tipo === 'string' ? column.tipo : '';
		if (columnTipo === '') continue;

		const rawTargets = Array.isArray(column.section_tipo)
			? column.section_tipo
			: [column.section_tipo];
		const resolved = rawTargets
			.map((target) => (target === 'self' ? sectionTipo : target))
			.filter((target): target is string => typeof target === 'string' && target !== '');
		const firstTarget = resolved[0];
		if (firstTarget === undefined) continue;
		for (const target of resolved) targetSet.add(target);

		order.push({ direction, path: [{ section_tipo: firstTarget, component_tipo: columnTipo }] });
	}

	if (order.length === 0) return null;
	return { targets: [...targetSet], order };
}

/**
 * The shared ranking engine (extracted from PHP sort_data_by_column): a
 * target-section search over the linked `section_id`s, ordered on the given
 * column(s); the stored locators are then re-ordered by that rank, unresolved
 * ones kept in relative order at the END (stable). `paginated_key` is stripped
 * so a persisted result never leaks the read-time page index.
 */
export async function rankLocatorsByColumns(
	items: unknown[],
	targets: string[],
	order: PortalOrderEntry[],
): Promise<unknown[]> {
	const locatorItems = items as { section_id?: unknown; section_tipo?: unknown }[];
	if (locatorItems.length < 2) return [...items];
	const firstTarget = targets[0];
	if (firstTarget === undefined || order.length === 0) return [...items];

	const ids = [...new Set(locatorItems.map((item) => Number(item?.section_id ?? 0)))];
	const { buildSearchSql } = await import('../search/sql_assembler.ts');
	const { sql: rankSql, params } = await buildSearchSql({
		section_tipo: targets,
		// 'all', NOT 0: the assembler renders `limit: 0` as a literal `LIMIT 0`
		// (zero rows) — only 'all'/null means unbounded. Every linked record must
		// be ranked, so the rank search is unbounded.
		limit: 'all',
		offset: 0,
		filter: {
			$or: [
				{
					q: ids.join(','),
					q_operator: null,
					path: [
						{
							section_tipo: firstTarget,
							component_tipo: 'section_id',
							model: 'component_section_id',
							name: 'Id',
						},
					],
				},
			],
		},
		order,
	} as never);
	const rows = (await sql.unsafe(rankSql, params as (string | number | null)[])) as {
		section_tipo: string;
		section_id: number;
	}[];
	const rank = new Map<string, number>();
	rows.forEach((row, index) => rank.set(`${row.section_tipo}_${row.section_id}`, index));

	const rankOf = (item: { section_id?: unknown; section_tipo?: unknown }): number =>
		rank.get(`${item?.section_tipo ?? ''}_${Number(item?.section_id ?? 0)}`) ??
		Number.MAX_SAFE_INTEGER;
	const sorted = [...locatorItems];
	// stable sort by rank (PHP usort with rank map; ties keep relative order)
	sorted
		.map((item, index) => ({ item, index }))
		.sort((a, b) => rankOf(a.item) - rankOf(b.item) || a.index - b.index)
		.forEach((entry, position) => {
			const clean = entry.item as Record<string, unknown>;
			// biome-ignore lint/performance/noDelete: paginated_key must be ABSENT in persisted data
			delete clean.paginated_key;
			sorted[position] = clean;
		});
	return sorted;
}

/**
 * READ-time entry point: order a portal's stored locators by the per-ddo `order`
 * directives on its columns. Builds the portal's effective edit config to
 * resolve the columns (and their target sections), then ranks. Returns null
 * (caller keeps stored order) when no column declares `order` or fewer than two
 * locators exist.
 */
export async function orderLocatorsByDeclaredColumns(
	items: unknown[],
	properties: unknown,
	componentTipo: string,
	sectionTipo: string,
): Promise<unknown[] | null> {
	if ((items as unknown[]).length < 2) return null;
	if (!hasDeclaredColumnOrder(properties)) return null;

	const { buildRequestConfigForElement } = await import('./request_config/build.ts');
	const config = await buildRequestConfigForElement(properties ?? null, {
		ownerTipo: componentTipo,
		ownerSectionTipo: sectionTipo,
		mode: 'edit',
		ownerIsSection: false,
	});
	const columns = (config[0]?.show?.ddo_map ?? []) as ConfigColumn[];

	const spec = buildPortalOrderSpecs(columns, sectionTipo);
	if (spec === null) return null;
	return rankLocatorsByColumns(items, spec.targets, spec.order);
}
