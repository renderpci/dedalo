/**
 * CHILDREN ENGINE (RELATIONS_SPEC.md §6.3) — component_relation_children has
 * NO stored data: the hierarchy chain is stored only UPWARD (each child's
 * component_relation_parent locators). Reading "the children of X" is the
 * inverse question "who declares X as parent?", answered through the
 * flat-GIN inverse machinery scoped to the parent's matrix table.
 *
 * SIBLING ORDER is itself an id_key dataframe: a per-child order value in a
 * dedicated component (section_map->thesaurus->order, typically a
 * component_number), paired by id_key to the CHILD's parent-link locator id
 * (the same child can hold different positions under different parents).
 * Ordering resolves per child (resolve_parent_link_id_key → the inline
 * get_value_by_id_key contract) and applies as a stable ascending sort;
 * children WITHOUT an order value sink last.
 *
 * PHP references: class.component_relation_children.php — get_children :528,
 * count_children :597, get_children_recursive :802 (visited-map cycle
 * guard), resolve_parent_link_id_key :739, build_children_sqo :1179 (mode
 * 'related', section_tipo ['all'], one-table scope, type dd47 parent
 * filter), compute_ordered_child_ids :1344.
 *
 * Perf note (ledgered): PHP pushes the precomputed order into SQL
 * (array_position) so LIMIT/OFFSET page in the database; this engine orders
 * in process and slices — identical results, full-child-list cost per read
 * on very large nodes.
 */

import { readMatrixRecord } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import {
	findFirstDescendantTipoByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
} from '../ontology/resolver.ts';
import { getSectionMap } from '../ontology/section_map.ts';
import {
	type RelatedLocatorFilter,
	countInverseReferences,
	findInverseReferences,
} from '../search/search_related.ts';
import { getInlineValueByIdKey } from './dataframe.ts';

/** PHP DEDALO_RELATION_TYPE_PARENT_TIPO — the upward hierarchy link type. */
export const PARENT_RELATION_TYPE = 'dd47';
/** PHP DEDALO_RELATION_TYPE_CHILDREN_TIPO — stamped on computed child locators. */
export const CHILDREN_RELATION_TYPE = 'dd48';

/** One computed child locator (PHP get_children output shape — STRING id). */
export interface ChildLocator {
	section_tipo: string;
	section_id: string;
	from_component_tipo: string;
	type: string;
}

const sectionComponentCache = createOntologyCache<string, string | null>();

/** Drop the ontology-derived section-component-by-model cache. */
export function clearSectionComponentCache(): void {
	sectionComponentCache.clear();
}
registerOntologyCacheClearer(clearSectionComponentCache);

/**
 * First component of a model inside a section's ontology subtree (recursive
 * parent-link walk, not crossing nested sections — PHP
 * get_ar_children_tipo_by_model_name_in_section search_exact). Virtual
 * sections resolve through their real section (relations[0].tipo).
 * Walk semantics live in the canonical T3 accessor (audit S2-19); the local
 * cache stays as this engine's hub-cleared memo.
 */
async function findSectionComponentByModel(
	sectionTipo: string,
	model: string,
): Promise<string | null> {
	const cacheKey = `${sectionTipo}|${model}`;
	const cached = sectionComponentCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const found = await findFirstDescendantTipoByModel(sectionTipo, model);
	sectionComponentCache.set(cacheKey, found);
	return found;
}

/** The section's component_relation_children tipo (PHP get_children_tipo :997). */
export async function getChildrenTipo(sectionTipo: string): Promise<string | null> {
	return findSectionComponentByModel(sectionTipo, 'component_relation_children');
}

/** The section's component_relation_parent tipo (PHP component_relation_parent::get_parent_tipo). */
export async function getParentTipo(sectionTipo: string): Promise<string | null> {
	return findSectionComponentByModel(sectionTipo, 'component_relation_parent');
}

/**
 * The component_relation_parent tipo RELATED to a children component (PHP
 * get_ar_related_parent_tipo :917): the children node's ontology relation
 * whose model is component_relation_parent; fallback = the section walk.
 */
export async function getRelatedParentTipo(
	childrenTipo: string,
	sectionTipo: string,
): Promise<string | null> {
	const rows = (await sql.unsafe(
		`SELECT relations FROM dd_ontology WHERE tipo = $1 AND jsonb_typeof(relations) = 'array'`,
		[childrenTipo],
	)) as { relations: { tipo?: string }[] | null }[];
	for (const link of rows[0]?.relations ?? []) {
		if (typeof link.tipo !== 'string') continue;
		if ((await getModelByTipo(link.tipo)) === 'component_relation_parent') return link.tipo;
	}
	return getParentTipo(sectionTipo);
}

/**
 * The CHILD's parent-link locator id — the id_key its per-parent order value
 * pairs with (PHP resolve_parent_link_id_key :739): find in the child's
 * component_relation_parent data the locator pointing at the parent coords
 * and return its item `id` (0 when unresolvable).
 */
export async function resolveParentLinkIdKey(
	childSectionTipo: string,
	childSectionId: number | string,
	parentSectionTipo: string,
	parentSectionId: number,
): Promise<number> {
	const parentRelationTipo = await getParentTipo(childSectionTipo);
	if (parentRelationTipo === null) return 0;
	const table = await getMatrixTableFromTipo(childSectionTipo);
	if (table === null) return 0;
	const record = await readMatrixRecord(table, childSectionTipo, Number(childSectionId));
	const data =
		((record?.columns.relation as Record<string, unknown[]> | null)?.[parentRelationTipo] as
			| { id?: number | string; section_tipo?: string; section_id?: number | string }[]
			| undefined) ?? [];
	for (const locator of data) {
		if (
			locator !== null &&
			typeof locator === 'object' &&
			locator.id !== undefined &&
			locator.section_tipo === parentSectionTipo &&
			Number(locator.section_id) === parentSectionId
		) {
			return Number(locator.id);
		}
	}
	return 0;
}

/** The unordered direct-children hits of one parent record. */
async function findChildHits(
	sectionId: number | string,
	sectionTipo: string,
	parentTipo: string,
): Promise<{ section_tipo: string; section_id: number }[]> {
	const table = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';
	return findInverseReferences(
		[
			{
				section_tipo: sectionTipo,
				section_id: Number(sectionId),
				from_component_tipo: parentTipo,
				type: PARENT_RELATION_TYPE,
			},
		],
		{ limit: false, order: 'section_id', tables: [table] },
	);
}

/**
 * The sibling order values of a child set (PHP compute_ordered_child_ids
 * :1344): per child, resolve the parent-link id_key and read the order
 * component's paired inline value; missing values sort last (stable).
 */
async function orderChildHits(
	hits: { section_tipo: string; section_id: number }[],
	sectionId: number,
	sectionTipo: string,
	orderComponentTipo: string,
): Promise<{ section_tipo: string; section_id: number }[]> {
	const UNORDERED = Number.MAX_SAFE_INTEGER;
	const decorated: { hit: (typeof hits)[number]; order: number; index: number }[] = [];
	for (const [index, hit] of hits.entries()) {
		const idKey = await resolveParentLinkIdKey(
			hit.section_tipo,
			hit.section_id,
			sectionTipo,
			sectionId,
		);
		let order = UNORDERED;
		if (idKey > 0) {
			const table = await getMatrixTableFromTipo(hit.section_tipo);
			const record =
				table === null ? null : await readMatrixRecord(table, hit.section_tipo, hit.section_id);
			const orderModel = await getModelByTipo(orderComponentTipo);
			const column = orderModel === null ? null : 'number';
			const items =
				column === null
					? []
					: (((record?.columns.number as Record<string, unknown[]> | null)?.[
							orderComponentTipo
						] as { id?: number | string; value?: unknown }[]) ?? []);
			const value = getInlineValueByIdKey(items, idKey);
			if (value !== null && value !== '') order = Number(value);
		}
		decorated.push({ hit, order, index });
	}
	decorated.sort((a, b) => a.order - b.order || a.index - b.index);
	return decorated.map((entry) => entry.hit);
}

/**
 * Direct children of a record as locators (PHP get_children :528): inverse
 * dd47 search scoped to the parent's table, sibling-ordered when the
 * section_map declares an order component, paged by limit/offset (0 = all).
 */
export async function getChildren(
	sectionId: number | string,
	sectionTipo: string,
	componentTipo?: string | null,
	limit = 0,
	offset = 0,
): Promise<ChildLocator[]> {
	const childrenTipo = componentTipo ?? (await getChildrenTipo(sectionTipo));
	if (childrenTipo === null) return [];
	const parentTipo = await getRelatedParentTipo(childrenTipo, sectionTipo);
	if (parentTipo === null) return [];

	let hits = await findChildHits(sectionId, sectionTipo, parentTipo);
	if (hits.length === 0) return [];

	const sectionMap = await getSectionMap(sectionTipo);
	const orderComponentTipo = (sectionMap?.thesaurus as { order?: string } | undefined)?.order;
	if (typeof orderComponentTipo === 'string' && orderComponentTipo !== '') {
		hits = await orderChildHits(hits, Number(sectionId), sectionTipo, orderComponentTipo);
	}
	const page = limit > 0 ? hits.slice(offset, offset + limit) : hits.slice(offset);
	return page.map((hit) => ({
		section_tipo: hit.section_tipo,
		// PHP locator::set_section_id casts to string (the wire shape).
		section_id: String(hit.section_id),
		from_component_tipo: childrenTipo,
		type: CHILDREN_RELATION_TYPE,
	}));
}

/** Direct-children total without loading rows (PHP count_children :597). */
export async function countChildren(
	sectionId: number | string,
	sectionTipo: string,
	componentTipo?: string | null,
): Promise<number> {
	const childrenTipo = componentTipo ?? (await getChildrenTipo(sectionTipo));
	if (childrenTipo === null) return 0;
	const parentTipo = await getRelatedParentTipo(childrenTipo, sectionTipo);
	if (parentTipo === null) return 0;
	const counted = await countInverseReferences([
		{
			section_tipo: sectionTipo,
			section_id: Number(sectionId),
			from_component_tipo: parentTipo,
			type: PARENT_RELATION_TYPE,
		},
	]);
	return counted.total;
}

/**
 * Direct-children total, or NULL when the children/parent tipos are unresolvable
 * (PHP count_children :597 — null ≠ 0 contract). The tree's getChildrenData
 * relies on this distinction: null triggers the load-and-count fallback, whereas
 * 0 is an authoritative empty. (countChildren above collapses both to 0 for
 * callers that do not need the distinction.)
 */
export async function countChildrenOrNull(
	sectionId: number | string,
	sectionTipo: string,
	componentTipo?: string | null,
): Promise<number | null> {
	const childrenTipo = componentTipo ?? (await getChildrenTipo(sectionTipo));
	if (childrenTipo === null) return null;
	const parentTipo = await getRelatedParentTipo(childrenTipo, sectionTipo);
	if (parentTipo === null) return null;
	const counted = await countInverseReferences([
		{
			section_tipo: sectionTipo,
			section_id: Number(sectionId),
			from_component_tipo: parentTipo,
			type: PARENT_RELATION_TYPE,
		},
	]);
	return counted.total;
}

/**
 * The section's order component tipo (PHP ts_object::get_component_order_tipo →
 * section_map thesaurus.order). Null when the section declares no order component.
 */
export async function getComponentOrderTipo(sectionTipo: string): Promise<string | null> {
	const sectionMap = await getSectionMap(sectionTipo);
	const order = (sectionMap?.thesaurus as { order?: unknown } | undefined)?.order;
	return typeof order === 'string' && order !== '' ? order : null;
}

/**
 * Direct children filtered by descriptor classification (PHP get_children_of_type
 * :664): builds the same inverse query as getChildren but adds an is_descriptor
 * locator (dd64/1 for 'descriptor', dd64/2 for 'non_descriptor', type dd151),
 * joined with AND. When the section_map declares no is_descriptor tipo the filter
 * is silently skipped (all children returned), matching PHP. Sibling-ordered like
 * getChildren.
 */
export async function getChildrenOfType(
	sectionId: number | string,
	sectionTipo: string,
	type: 'descriptor' | 'non_descriptor' = 'descriptor',
	componentTipo?: string | null,
	limit = 0,
	offset = 0,
): Promise<ChildLocator[]> {
	const childrenTipo = componentTipo ?? (await getChildrenTipo(sectionTipo));
	if (childrenTipo === null) return [];
	const parentTipo = await getRelatedParentTipo(childrenTipo, sectionTipo);
	if (parentTipo === null) return [];

	const filters: RelatedLocatorFilter[] = [
		{
			section_tipo: sectionTipo,
			section_id: Number(sectionId),
			from_component_tipo: parentTipo,
			type: PARENT_RELATION_TYPE,
		},
	];
	// descriptor filter (dd64 si/no; 1=yes/descriptor, 2=no/non-descriptor).
	const sectionMap = await getSectionMap(sectionTipo);
	const isDescriptorTipo = (sectionMap?.thesaurus as { is_descriptor?: unknown } | undefined)
		?.is_descriptor;
	let op: 'OR' | 'AND' | undefined;
	if (typeof isDescriptorTipo === 'string' && isDescriptorTipo !== '') {
		const targetSectionId = type === 'descriptor' ? 1 : 2;
		filters.push({
			section_tipo: 'dd64',
			section_id: targetSectionId,
			from_component_tipo: isDescriptorTipo,
			type: 'dd151',
		});
		op = 'AND';
	}

	const table = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';
	let hits: { section_tipo: string; section_id: number }[] = (
		await findInverseReferences(filters, {
			limit: false,
			order: 'section_id',
			tables: [table],
			op,
		})
	).map((hit) => ({ section_tipo: hit.section_tipo, section_id: hit.section_id }));
	if (hits.length === 0) return [];

	const orderComponentTipo = (sectionMap?.thesaurus as { order?: string } | undefined)?.order;
	if (typeof orderComponentTipo === 'string' && orderComponentTipo !== '') {
		hits = await orderChildHits(hits, Number(sectionId), sectionTipo, orderComponentTipo);
	}
	const page = limit > 0 ? hits.slice(offset, offset + limit) : hits.slice(offset);
	return page.map((hit) => ({
		section_tipo: hit.section_tipo,
		section_id: String(hit.section_id),
		from_component_tipo: childrenTipo,
		type: CHILDREN_RELATION_TYPE,
	}));
}

/**
 * ALL descendants at every depth, flat (PHP get_children_recursive :802):
 * direct children per level, then recursion per child. Cycle detection via
 * the visited map (keyed "tipo_id"); visited is passed BY VALUE, matching
 * PHP — independent subtrees do not share visit state.
 */
export async function getChildrenRecursive(
	sectionId: number | string,
	sectionTipo: string,
	componentTipo?: string | null,
	visited: Record<string, boolean> = {},
): Promise<ChildLocator[]> {
	const key = `${sectionTipo}_${sectionId}`;
	if (visited[key] === true) return [];
	const nextVisited = { ...visited, [key]: true };

	const direct = await getChildren(sectionId, sectionTipo, componentTipo);
	const all: ChildLocator[] = [...direct];
	for (const child of direct) {
		all.push(
			...(await getChildrenRecursive(child.section_id, child.section_tipo, null, nextVisited)),
		);
	}
	return all;
}
