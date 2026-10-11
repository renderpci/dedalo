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
 * The order and parent-link arrays of a whole child set are read in ONE
 * statement per section_tipo group and resolved in process by the shared
 * pairing rule (`ts_object/node_repository.ts` pickOrderValueForParent, the
 * same rule the thesaurus tree uses — WC-2026-09-05-children-order-one-rule);
 * the result applies as a stable ascending sort, and children WITHOUT an order
 * value sink last.
 *
 * PHP references: class.component_relation_children.php — get_children :528,
 * count_children :597, get_children_recursive :802 (visited-map cycle
 * guard), resolve_parent_link_id_key :739, build_children_sqo :1179 (mode
 * 'related', section_tipo ['all'], one-table scope, type dd47 parent
 * filter), compute_ordered_child_ids :1344.
 *
 * SIBLING ORDER IS ONE RULE (orderSiblings): the one-level read and the
 * recursive walk sort a sibling set the same way — (section_id, section_tipo)
 * ascending first (a total order: siblings of a virtual section share ids with
 * the real one's, and the index's own order left their relative position to
 * the query plan), then a stable sort by the order value, unordered last.
 * WC-2026-10-11-children-recursive-one-statement.
 *
 * THE RECURSIVE WALK (PERF-6) fetches every edge of the subtree in ONE
 * recursive statement (descendant_walk.ts), reads the order values once per
 * (child section, order component) group, and replays the edges synchronously
 * — the replay is the walk, so the per-node shape (one search per node) cannot
 * come back without changing its signature. Output, order and refusals are the
 * per-node walk's (gate: test/unit/children_recursive_set_native.test.ts).
 *
 * Perf note (ledgered): PHP pushes the precomputed order into SQL
 * (array_position) so LIMIT/OFFSET page in the database; the one-level read
 * orders in process and slices — identical results, full-child-list cost per
 * read on very large nodes.
 */

import { isValidTipo } from '../concepts/ontology.ts';
import { assertMatrixTable } from '../db/matrix.ts';
import { sql } from '../db/postgres.ts';
import { memoizedReadMatrixRecord } from '../db/record_memo.ts';
import { DedaloError } from '../errors/dedalo_error.ts';
import { createOntologyCache } from '../ontology/cache_factory.ts';
import { registerOntologyCacheClearer } from '../ontology/cache_invalidation.ts';
import {
	findFirstDescendantTipoByModel,
	getMatrixTableFromTipo,
	getModelByTipo,
	getNode,
} from '../ontology/resolver.ts';
import { getSectionMap } from '../ontology/section_map.ts';
import { assertValidTipo } from '../search/identifier_gate.ts';
import {
	countInverseReferences,
	findInverseReferences,
	getRelationTables,
	type RelatedLocatorFilter,
} from '../search/search_related.ts';
import { requireRelationIndex } from '../search/search_store.ts';
import { pickOrderValueForParent } from '../ts_object/node_repository.ts';
import { fetchSubtreeEdges, type WalkEdge, type WalkSectionPlan } from './descendant_walk.ts';

/** PHP DEDALO_RELATION_TYPE_PARENT_TIPO — the upward hierarchy link type. */
export const PARENT_RELATION_TYPE = 'dd47';
/** PHP DEDALO_RELATION_TYPE_CHILDREN_TIPO — stamped on computed child locators. */
export const CHILDREN_RELATION_TYPE = 'dd48';

/**
 * One computed child locator. The id is INT-canonical
 * (WC-2026-08-10-section-id-int-canonical; the PHP cast-to-string law is
 * repealed): children are never wire input — they are computed from the
 * int-typed inverse relation index, so no non-int concept can reach here.
 */
export interface ChildLocator {
	section_tipo: string;
	section_id: number;
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
	// The node's own bytes are already in the resolver's nodeCache — a second
	// direct ontology-table read here is a per-call round-trip for a row the
	// cache holds (resolver.ts is the ONE dd_ontology reader; audit S2-19).
	const relations = (await getNode(childrenTipo))?.relations;
	for (const link of Array.isArray(relations) ? (relations as { tipo?: string }[]) : []) {
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
	const record = await memoizedReadMatrixRecord(table, childSectionTipo, Number(childSectionId));
	// KEPT UNION: this is the RAW stored jsonb of the child's parent-link
	// component — an unswept row still holds the legacy string form (and, on
	// external tipos, a non-convertible remote id). Read tolerance only; the
	// value is compared numerically below, never re-persisted from here.
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
 * :1344), read in ONE STATEMENT PER SECTION.
 *
 * WHAT IT USED TO COST. Per child it issued TWO full-row reads — one to
 * resolve the child's parent-link id_key, one to read the order component —
 * so a node with 440 children paid ~880 statements to sort a page of 20. The
 * question each pair answered is the same one the tree's `fetchNodeInfo`
 * already answers batched: give me, for this set of ids, the order array and
 * the parent-relation array. Both arrays live in the same row, so one
 * `= ANY($2::int[])` per section_tipo group returns everything, and the
 * per-parent value is then resolved IN PROCESS by the shared rule.
 *
 * ONE RULE, NOT TWO. The pairing chain is
 * pickOrderValueForParent (`ts_object/node_repository.ts`) — the same function
 * `fetchNodeInfo` uses. It keeps
 * the POSITIONAL fallback this engine documented (v6 reads the order
 * positionally, `component_relation_children::get_children :471-486`, and its
 * writer stores a flat single-value array, `sort_children :855-881`; a
 * POLYHIERARCHY child listed under a non-first parent has an id_key with no
 * matching entry — mht160/6). In the picker that fallback is step 3 (the entry
 * carrying no pairing key of any generation) and, failing that, the first
 * entry: the same value the old `paired ?? items[0]` produced, plus the legacy
 * section-coords step the tree already honoured.
 * WC-2026-09-05-children-order-one-rule.
 *
 * Children WITHOUT a resolvable order value sink last (stable within the
 * group, by the hits' incoming order).
 */
/** Refuse a tipo that may not be interpolated into a jsonb key (spec §7.6). */
function assertOrderTipo(tipo: string, role: string, sectionTipo: string): void {
	if (isValidTipo(tipo)) return;
	throw new DedaloError('ontology.invalid_node', {
		message: `order_child_hits: invalid ${role} tipo '${tipo}' for section '${sectionTipo}'`,
		coordinates: { section_tipo: sectionTipo, [`${role}_tipo`]: tipo },
	});
}

/**
 * ONE section group's raw order rows: `{section_id, order_arr, parent_arr}` for
 * the whole id set, in one statement. Returns [] when the section has no matrix
 * table (nothing to order by).
 */
async function readOrderRows(
	childSectionTipo: string,
	sectionIds: readonly number[],
	orderComponentTipo: string,
): Promise<Record<string, unknown>[]> {
	// THE identifier gate of the order tipo lives HERE, at the one place it is
	// interpolated: it comes from section_map properties (unvalidated ontology
	// JSON), and a guard each caller had to remember is a guard one caller
	// forgets (children_recursive_set_native: the malformed-order leg).
	assertOrderTipo(orderComponentTipo, 'order', childSectionTipo);
	const table = await getMatrixTableFromTipo(childSectionTipo);
	if (table === null || table === '') return [];
	assertMatrixTable(table);

	const parentRelationTipo = await getParentTipo(childSectionTipo);
	if (parentRelationTipo !== null) {
		assertOrderTipo(parentRelationTipo, 'parent', childSectionTipo);
	}
	const parentSelect =
		parentRelationTipo === null ? '' : `, relation->'${parentRelationTipo}' AS parent_arr`;

	return (await sql.unsafe(
		`SELECT section_id, "number"->'${orderComponentTipo}' AS order_arr${parentSelect}
		 FROM "${table}"
		 WHERE section_tipo = $1 AND section_id = ANY($2::int[])`,
		[childSectionTipo, `{${sectionIds.join(',')}}`],
	)) as Record<string, unknown>[];
}

/** The stored array under a raw row key, tolerant of a missing/!array value. */
function storedItems(value: unknown): Record<string, unknown>[] {
	// KEPT UNION: raw stored jsonb — an unswept row still holds legacy string
	// ids and legacy unkeyed order entries. The picker is the tolerance point;
	// nothing read here is re-persisted.
	return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

/** A sibling as the order rule sees it. */
interface SiblingHit {
	section_tipo: string;
	section_id: number;
}

/** The order-map key of a child under ONE parent (the value is per parent). */
function orderKey(childTipo: string, childId: number): string {
	return `${childTipo}_${childId}`;
}

/**
 * THE ONE SIBLING ORDER RULE — pure; the one-level read (getChildren,
 * getChildrenOfType) and the recursive replay both sort through it.
 *
 * 1. (section_id ASC, section_tipo ASC) — a TOTAL base order. The index search
 *    orders by section_id alone, so siblings from two sections sharing an id (a
 *    virtual section's record and the real one's) came back in whatever order
 *    the plan produced; the tipo tiebreak makes it deterministic.
 * 2. A STABLE sort by the per-parent order value (`orderValues`, keyed by
 *    orderKey); a sibling without one sinks last.
 */
export function orderSiblings<T extends SiblingHit>(
	hits: readonly T[],
	orderValues: ReadonlyMap<string, number>,
): T[] {
	const UNORDERED = Number.MAX_SAFE_INTEGER;
	const base = [...hits].sort(
		(a, b) =>
			a.section_id - b.section_id ||
			(a.section_tipo < b.section_tipo ? -1 : a.section_tipo > b.section_tipo ? 1 : 0),
	);
	const decorated = base.map((hit, index) => ({
		hit,
		order: orderValues.get(orderKey(hit.section_tipo, hit.section_id)) ?? UNORDERED,
		index,
	}));
	decorated.sort((a, b) => a.order - b.order || a.index - b.index);
	return decorated.map((entry) => entry.hit);
}

/** Ids per ORDER statement: a bounded `= ANY($2::int[])` list. */
const ORDER_READ_CHUNK = 10_000;

/**
 * The raw order rows of one child section for many ids — readOrderRows in
 * chunks of `chunk` ids (one statement per chunk; ORDER_READ_CHUNK in
 * production).
 *
 * @internal `chunk` is a TEST SEAM (named exemption, DEC-12), exported for the
 * gate only (children_recursive_set_native): no situation holds a group of
 * 10,000 children, so the gate reads a 440-id group in chunks of 100 and
 * proves every chunk is read. Production callers pass no chunk; a chunk that
 * is not an integer in [1, ORDER_READ_CHUNK] is refused.
 */
export async function readOrderRowsChunked(
	childSectionTipo: string,
	sectionIds: readonly number[],
	orderComponentTipo: string,
	chunk: number = ORDER_READ_CHUNK,
): Promise<Record<string, unknown>[]> {
	if (!Number.isInteger(chunk) || chunk < 1 || chunk > ORDER_READ_CHUNK) {
		throw new DedaloError('internal.invariant', {
			message: `readOrderRowsChunked: chunk must be an integer in [1, ${ORDER_READ_CHUNK}] (got ${chunk})`,
		});
	}
	const rows: Record<string, unknown>[] = [];
	for (let start = 0; start < sectionIds.length; start += chunk) {
		rows.push(
			...(await readOrderRows(
				childSectionTipo,
				sectionIds.slice(start, start + chunk),
				orderComponentTipo,
			)),
		);
	}
	return rows;
}

/** A stored order value as a number, or null (absent / empty / not numeric). */
function numericOrder(value: unknown): number | null {
	const order = value === null || value === undefined || value === '' ? Number.NaN : Number(value);
	return Number.isFinite(order) ? order : null;
}

async function orderChildHits<T extends SiblingHit>(
	hits: readonly T[],
	sectionId: number,
	sectionTipo: string,
	orderComponentTipo: string,
): Promise<T[]> {
	// A child set can SPAN SECTIONS (a virtual section's children, a portal of
	// mixed tipos), and each section has its own table and its own parent
	// component — so the batch is per section_tipo group.
	const groups = new Map<string, number[]>();
	for (const hit of hits) {
		const list = groups.get(hit.section_tipo) ?? [];
		list.push(hit.section_id);
		groups.set(hit.section_tipo, list);
	}

	const orderByKey = new Map<string, number>();
	for (const [childSectionTipo, sectionIds] of groups) {
		for (const row of await readOrderRowsChunked(
			childSectionTipo,
			sectionIds,
			orderComponentTipo,
		)) {
			const order = numericOrder(
				pickOrderValueForParent(
					storedItems(row.order_arr),
					storedItems(row.parent_arr),
					sectionTipo,
					sectionId,
				),
			);
			if (order === null) continue;
			orderByKey.set(orderKey(childSectionTipo, Math.trunc(Number(row.section_id))), order);
		}
	}
	return orderSiblings(hits, orderByKey);
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
	hits =
		typeof orderComponentTipo === 'string' && orderComponentTipo !== ''
			? await orderChildHits(hits, Number(sectionId), sectionTipo, orderComponentTipo)
			: orderSiblings(hits, new Map());
	const page = limit > 0 ? hits.slice(offset, offset + limit) : hits.slice(offset);
	return page.map((hit) => ({
		section_tipo: hit.section_tipo,
		// int-canonical wire shape (WC-2026-08-10-section-id-int-canonical; the
		// PHP cast-to-string law is repealed). Hits come from the int-typed
		// relation index — already the canonical form.
		section_id: hit.section_id,
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
	hits =
		typeof orderComponentTipo === 'string' && orderComponentTipo !== ''
			? await orderChildHits(hits, Number(sectionId), sectionTipo, orderComponentTipo)
			: orderSiblings(hits, new Map());
	const page = limit > 0 ? hits.slice(offset, offset + limit) : hits.slice(offset);
	return page.map((hit) => ({
		section_tipo: hit.section_tipo,
		// int-canonical wire shape (WC-2026-08-10-section-id-int-canonical).
		section_id: hit.section_id,
		from_component_tipo: childrenTipo,
		type: CHILDREN_RELATION_TYPE,
	}));
}

/**
 * THE SUBTREE WALK'S BOUNDS — fixed constants, stated arithmetic, no env knob.
 *
 * A bound that an installation can move is not a bound: the refusal below is
 * an INVARIANT of the read path, and a knob would make it un-gateable (the same
 * reasoning the museum-scale corpus states for having no resize parameter).
 *
 * DEPTH. A heritage thesaurus is a classification, not a linked list: the
 * deepest real hierarchies in the corpora this engine serves run to a dozen
 * levels or so. 64 is several times that, and small enough that a CYCLE the
 * visited set somehow failed to close (a poly-hierarchy lattice re-entering
 * through a section boundary) stops at 64 frames instead of exhausting the
 * stack.
 *
 * NODES. The scale corpus's whole tree is 1,199 descendants at depth 3; the
 * largest single thesaurus branch an install expands in one read is orders of
 * magnitude under 200,000. Past that this is no longer a subtree read, it is a
 * table scan issued one `getChildren` at a time, and answering it slowly is
 * worse than refusing it: the caller (a fixed_filter, a client SQO) has asked
 * the wrong question and must be told so.
 */
export const CHILDREN_RECURSIVE_MAX_DEPTH = 64;
export const CHILDREN_RECURSIVE_MAX_NODES = 200000;

/** Which bound a subtree walk breached, or null while it is within both. */
export type SubtreeBound = 'depth' | 'nodes';

/**
 * THE BOUND PREDICATE — pure, and the ONE place both caps are compared, so the
 * walk has a single guarded call site and neither cap can be enforced while the
 * other silently is not. `depth` is the depth of the node about to be emitted
 * (the root's own children are depth 1); `emitted` counts it.
 */
export function subtreeBoundExceeded(
	depth: number,
	emitted: number,
	maxNodes: number = CHILDREN_RECURSIVE_MAX_NODES,
): SubtreeBound | null {
	if (depth > CHILDREN_RECURSIVE_MAX_DEPTH) return 'depth';
	if (emitted > maxNodes) return 'nodes';
	return null;
}

/** The walk's live state: ONE visited set and ONE node budget per call. */
interface SubtreeWalkState {
	visited: Set<string>;
	emitted: number;
	root: { section_tipo: string; section_id: number };
	/** The node bound (CHILDREN_RECURSIVE_MAX_NODES, lower only through the gate seam). */
	maxNodes: number;
}

function refuseSubtree(state: SubtreeWalkState, limit: SubtreeBound): never {
	throw new DedaloError('relation.subtree_too_large', {
		message:
			limit === 'depth'
				? `children_recursive: the subtree below ${state.root.section_tipo}/${state.root.section_id} is deeper than ${CHILDREN_RECURSIVE_MAX_DEPTH} levels`
				: `children_recursive: the subtree below ${state.root.section_tipo}/${state.root.section_id} exceeds ${state.maxNodes} descendants`,
		coordinates: { section_tipo: state.root.section_tipo, section_id: state.root.section_id },
		details: {
			limit,
			cap: limit === 'depth' ? CHILDREN_RECURSIVE_MAX_DEPTH : state.maxNodes,
		},
	});
}

/** The adjacency the replay walks: parent key → its ordered child locators. */
type ChildrenOf = ReadonlyMap<string, readonly ChildLocator[]>;

/** A node's key in the visited set and in the adjacency. */
function nodeKey(sectionTipo: string, sectionId: number): string {
	return `${sectionTipo}_${sectionId}`;
}

/**
 * ONE root's descendants, marking the SHARED visited set as it walks — a
 * SYNCHRONOUS replay over the adjacency the walk fetched (PERF-6): it can read
 * no database, so a per-node query cannot creep back into the walk.
 *
 * EMISSION AND EXPANSION ARE THE SAME EVENT: a node is added to `visited` at
 * the moment it is emitted and is expanded exactly then, so every node appears
 * in the result AT MOST ONCE however many parents list it, and its subtree is
 * walked once. That is the contract {@link getChildrenRecursiveBatch} always
 * documented ("already deduplicated by locator") and did not keep — it pushed
 * the whole `direct` list before the recursion pruned, so a POLY-HIERARCHY node
 * came back once per parent.
 *
 * Level-first emission is preserved (a level's own children, then their
 * subtrees), so the flat order callers see is unchanged apart from the removed
 * duplicates.
 */
function collectDescendantsShared(
	sectionId: number,
	sectionTipo: string,
	childrenOf: ChildrenOf,
	state: SubtreeWalkState,
	depth: number,
): ChildLocator[] {
	const direct = childrenOf.get(nodeKey(sectionTipo, sectionId)) ?? [];
	const fresh: ChildLocator[] = [];
	for (const child of direct) {
		const key = nodeKey(child.section_tipo, child.section_id);
		if (state.visited.has(key)) continue;
		state.visited.add(key);
		state.emitted++;
		const breach = subtreeBoundExceeded(depth, state.emitted, state.maxNodes);
		if (breach !== null) refuseSubtree(state, breach);
		fresh.push(child);
	}
	const all: ChildLocator[] = [...fresh];
	for (const child of fresh) {
		all.push(
			...collectDescendantsShared(
				child.section_id,
				child.section_tipo,
				childrenOf,
				state,
				depth + 1,
			),
		);
	}
	return all;
}

/**
 * The walk's view of one section: everything a one-level getChildren resolves
 * before it searches, computed once per (section, explicit children component).
 */
interface SectionPlan extends WalkSectionPlan {
	/** The children component the computed locators carry (from_component_tipo). */
	childrenTipo: string | null;
	/** section_map thesaurus.order of this section (as a PARENT), or null. */
	orderTipo: string | null;
	/** Sections the children component declares its children live in. */
	declaredTargets: readonly string[];
}

const sectionPlanCache = createOntologyCache<string, SectionPlan>();

/**
 * Plan one section for the walk — exactly the tipos/table getChildren resolves
 * (children component, its related parent component, the section's table, the
 * relation-capable check of findInverseReferences, the order component).
 */
async function planSection(
	sectionTipo: string,
	componentTipo: string | null,
): Promise<SectionPlan> {
	const cacheKey = `${sectionTipo}|${componentTipo ?? ''}`;
	const cached = sectionPlanCache.get(cacheKey);
	if (cached !== undefined) return cached;
	const plan = await computeSectionPlan(sectionTipo, componentTipo);
	sectionPlanCache.set(cacheKey, plan);
	return plan;
}

/** planSection's uncached body. */
async function computeSectionPlan(
	sectionTipo: string,
	componentTipo: string | null,
): Promise<SectionPlan> {
	const childrenTipo = componentTipo ?? (await getChildrenTipo(sectionTipo));
	const parentTipo =
		childrenTipo === null ? null : await getRelatedParentTipo(childrenTipo, sectionTipo);
	if (parentTipo !== null) assertValidTipo(parentTipo, 'children_recursive.parent_tipo');
	const tbl = (await getMatrixTableFromTipo(sectionTipo)) ?? 'matrix';
	const expandable = await isExpandable(sectionTipo, childrenTipo, parentTipo, tbl);
	return {
		section_tipo: sectionTipo,
		// ONE representation of "its nodes have no children here": no parent tipo
		// (descendant_walk.ts matches index rows ON it, so a null walks nothing).
		parent_tipo: expandable ? parentTipo : null,
		tbl,
		childrenTipo,
		orderTipo: await getComponentOrderTipo(sectionTipo),
		declaredTargets: childrenTipo === null ? [] : await declaredChildSections(childrenTipo),
	};
}

/**
 * Whether a section's nodes have children at all: a children and a parent
 * component, on a relation-capable table (findInverseReferences answers [] —
 * with the same warning — for any other table).
 */
async function isExpandable(
	sectionTipo: string,
	childrenTipo: string | null,
	parentTipo: string | null,
	tbl: string,
): Promise<boolean> {
	if (childrenTipo === null || parentTipo === null) return false;
	if ((await getRelationTables()).includes(tbl)) return true;
	console.warn(
		`[children] section '${sectionTipo}' lives on '${tbl}', not a relation-capable table — its nodes have no children here`,
	);
	return false;
}

/** Whether a planned section's nodes are expanded at all (see WalkSectionPlan.parent_tipo). */
function isExpandablePlan(plan: WalkSectionPlan): boolean {
	return plan.parent_tipo !== null;
}

/** The sections a children component's ontology relations name (model `section`). */
async function declaredChildSections(childrenTipo: string): Promise<string[]> {
	const relations = (await getNode(childrenTipo))?.relations;
	const sections: string[] = [];
	for (const link of Array.isArray(relations) ? (relations as { tipo?: unknown }[]) : []) {
		if (typeof link.tipo !== 'string') continue;
		if ((await getModelByTipo(link.tipo)) === 'section') sections.push(link.tipo);
	}
	return sections;
}

/** Drop the walk's section plans (ontology-derived: hub-cleared). */
export function clearSectionPlanCache(): void {
	sectionPlanCache.clear();
}
registerOntologyCacheClearer(clearSectionPlanCache);

/**
 * The whole subtree's adjacency for `roots`, in a FIXED number of statements:
 *
 * 1. PLAN the roots' sections and the sections their children components
 *    declare (the usual cross-section case — a thesaurus's virtual sections —
 *    is then one round); ONE coverage check of the relation index.
 * 2. ROUNDS of fetchSubtreeEdges. An edge into a section the round did not
 *    plan is judged after it (plan it; keep the edge only on the parent's
 *    table); such a child, when its section is expandable, seeds the next
 *    round. Terminates: every round plans at least one new section. The
 *    statement walks only into PLANNED sections, so the nodes it counts are
 *    exactly nodes the walk keeps.
 * 3. ORDER: one read per (child section, parent's order component) group —
 *    ids chunked — and the per-parent value picked in process by the shared
 *    rule (pickOrderValueForParent), then orderSiblings per parent.
 *
 * `saturated` = some round walked `cap` nodes: the edge set may be cut, and
 * (every node a round counts being a kept descendant — see 2.) more than
 * `cap - roots` descendants are reachable: a refusal is the true answer.
 */
async function buildSubtreeAdjacency(
	roots: readonly WalkNode[],
	componentTipo: string | null,
	cap: number,
): Promise<{ childrenOf: ChildrenOf; saturated: boolean }> {
	const walk: WalkPlanning = { componentTipo, plans: new Map() };
	for (const root of roots) {
		const rootPlan = await planOf(walk, root.section_tipo);
		for (const target of rootPlan.declaredTargets) await planOf(walk, target);
	}
	if (![...walk.plans.values()].some(isExpandablePlan)) {
		return { childrenOf: new Map(), saturated: false };
	}
	await requireRelationIndex(await getRelationTables());
	const { kept, saturated } = await fetchAllEdges(walk, roots, cap);
	const orderRows = await readGroupOrderRows(walk.plans, kept);
	return { childrenOf: assembleChildrenOf(walk.plans, kept, orderRows), saturated };
}

/** A node address in the walk. */
interface WalkNode {
	section_tipo: string;
	section_id: number;
}

/** The sections a walk has planned so far, for one explicit children component (or none). */
interface WalkPlanning {
	componentTipo: string | null;
	plans: Map<string, SectionPlan>;
}

/** The section's plan, planning it on first sight. */
async function planOf(walk: WalkPlanning, sectionTipo: string): Promise<SectionPlan> {
	let known = walk.plans.get(sectionTipo);
	if (known === undefined) {
		known = await planSection(sectionTipo, walk.componentTipo);
		walk.plans.set(sectionTipo, known);
	}
	return known;
}

/** The edge rounds' shared bookkeeping. */
interface EdgeRounds {
	kept: WalkEdge[];
	edgeKeys: Set<string>;
	expanded: Set<string>;
}

/** Fetch rounds until no unplanned expandable section is left (or the cap is hit). */
async function fetchAllEdges(
	walk: WalkPlanning,
	roots: readonly WalkNode[],
	cap: number,
): Promise<{ kept: WalkEdge[]; saturated: boolean }> {
	const rounds: EdgeRounds = { kept: [], edgeKeys: new Set(), expanded: new Set() };
	let seeds = roots.filter((root) => {
		const plan = walk.plans.get(root.section_tipo);
		return plan !== undefined && isExpandablePlan(plan);
	});
	while (seeds.length > 0) {
		const known = new Set(walk.plans.keys());
		const round = await fetchSubtreeEdges(seeds, [...walk.plans.values()], cap);
		for (const seed of seeds) rounds.expanded.add(nodeKey(seed.section_tipo, seed.section_id));
		const next = await absorbRound(walk, rounds, round.edges, known);
		if (round.walked >= cap) return { kept: rounds.kept, saturated: true };
		seeds = next;
	}
	return { kept: rounds.kept, saturated: false };
}

/**
 * Judge one round's edges. An edge into a section planned BEFORE the round was
 * already filtered by table in SQL, and its child (when expandable) was expanded
 * by the same statement. An edge into a section the round did not know is
 * planned now and kept only on the parent's table; its child, when expandable,
 * seeds the next round. Returns those seeds.
 */
async function absorbRound(
	walk: WalkPlanning,
	rounds: EdgeRounds,
	edges: readonly WalkEdge[],
	known: ReadonlySet<string>,
): Promise<WalkNode[]> {
	const next: WalkNode[] = [];
	for (const edge of edges) {
		const seed = await absorbEdge(walk, rounds, edge, known);
		if (seed !== null) next.push(seed);
	}
	return next;
}

/** One edge of absorbRound: keep it or not; the next-round seed it yields, if any. */
async function absorbEdge(
	walk: WalkPlanning,
	rounds: EdgeRounds,
	edge: WalkEdge,
	known: ReadonlySet<string>,
): Promise<WalkNode | null> {
	const childKnown = known.has(edge.child_tipo);
	const childPlan = await planOf(walk, edge.child_tipo);
	const parentPlan = walk.plans.get(edge.parent_tipo) as SectionPlan;
	// A known child section was table-filtered in SQL; an unknown one is judged here.
	if (!onParentTable(childKnown, childPlan, parentPlan)) return null;
	const child = nodeKey(edge.child_tipo, edge.child_id);
	const key = `${nodeKey(edge.parent_tipo, edge.parent_id)}>${child}`;
	if (rounds.edgeKeys.has(key)) return null;
	rounds.edgeKeys.add(key);
	rounds.kept.push(edge);
	if (!isExpandablePlan(childPlan) || rounds.expanded.has(child)) return null;
	rounds.expanded.add(child);
	return childKnown ? null : { section_tipo: edge.child_tipo, section_id: edge.child_id };
}

/** The table rule for an edge whose child section the round may not have known. */
function onParentTable(
	childKnown: boolean,
	childPlan: SectionPlan,
	parentPlan: SectionPlan,
): boolean {
	return childKnown || childPlan.tbl === parentPlan.tbl;
}

/**
 * The order rows of every child that has an ordered parent — ONE read per
 * (child section, the parent section's order component) group, ids chunked.
 * Keyed `<child tipo>|<order tipo>|<child id>`.
 */
async function readGroupOrderRows(
	plans: ReadonlyMap<string, SectionPlan>,
	kept: readonly WalkEdge[],
): Promise<Map<string, Record<string, unknown>>> {
	const orderRows = new Map<string, Record<string, unknown>>();
	for (const [groupKey, group] of orderGroups(plans, kept)) {
		const ids = [...group.ids].sort((a, b) => a - b);
		for (const row of await readOrderRowsChunked(group.childTipo, ids, group.orderTipo)) {
			orderRows.set(`${groupKey}|${Math.trunc(Number(row.section_id))}`, row);
		}
	}
	return orderRows;
}

/** The (child section, parent order component) groups of the ordered edges. */
function orderGroups(
	plans: ReadonlyMap<string, SectionPlan>,
	kept: readonly WalkEdge[],
): Map<string, { childTipo: string; orderTipo: string; ids: Set<number> }> {
	const groups = new Map<string, { childTipo: string; orderTipo: string; ids: Set<number> }>();
	for (const edge of kept) {
		const orderTipo = (plans.get(edge.parent_tipo) as SectionPlan).orderTipo;
		if (orderTipo === null) continue;
		const groupKey = `${edge.child_tipo}|${orderTipo}`;
		const group = groups.get(groupKey) ?? { childTipo: edge.child_tipo, orderTipo, ids: new Set() };
		group.ids.add(edge.child_id);
		groups.set(groupKey, group);
	}
	return groups;
}

/** One parent's per-child order values, picked by the shared rule. */
function siblingOrderValues(
	parent: WalkNode,
	orderTipo: string | null,
	hits: readonly SiblingHit[],
	orderRows: ReadonlyMap<string, Record<string, unknown>>,
): Map<string, number> {
	const orderValues = new Map<string, number>();
	if (orderTipo === null) return orderValues;
	for (const hit of hits) {
		const row = orderRows.get(`${hit.section_tipo}|${orderTipo}|${hit.section_id}`);
		if (row === undefined) continue;
		const order = numericOrder(
			pickOrderValueForParent(
				storedItems(row.order_arr),
				storedItems(row.parent_arr),
				parent.section_tipo,
				parent.section_id,
			),
		);
		if (order !== null) orderValues.set(orderKey(hit.section_tipo, hit.section_id), order);
	}
	return orderValues;
}

/** Per parent: its child hits, ordered by the one rule, as the locators getChildren emits. */
function assembleChildrenOf(
	plans: ReadonlyMap<string, SectionPlan>,
	kept: readonly WalkEdge[],
	orderRows: ReadonlyMap<string, Record<string, unknown>>,
): Map<string, ChildLocator[]> {
	const hitsOf = new Map<string, { parent: WalkNode; hits: SiblingHit[] }>();
	for (const edge of kept) {
		const key = nodeKey(edge.parent_tipo, edge.parent_id);
		const entry = hitsOf.get(key) ?? {
			parent: { section_tipo: edge.parent_tipo, section_id: edge.parent_id },
			hits: [],
		};
		entry.hits.push({ section_tipo: edge.child_tipo, section_id: edge.child_id });
		hitsOf.set(key, entry);
	}
	const childrenOf = new Map<string, ChildLocator[]>();
	for (const [key, { parent, hits }] of hitsOf) {
		const parentPlan = plans.get(parent.section_tipo) as SectionPlan;
		const orderValues = siblingOrderValues(parent, parentPlan.orderTipo, hits, orderRows);
		childrenOf.set(
			key,
			orderSiblings(hits, orderValues).map((hit) => ({
				section_tipo: hit.section_tipo,
				section_id: hit.section_id,
				from_component_tipo: parentPlan.childrenTipo as string,
				type: CHILDREN_RELATION_TYPE,
			})),
		);
	}
	return childrenOf;
}

/**
 * Walk `roots` (one shared visited set, the batch semantics) over ONE fetched
 * adjacency. A SATURATED fetch (the edge set may be cut at `cap` nodes) is
 * replayed first — a depth / node refusal the replay reaches wins, with its own
 * coordinates. The replay DOES reach one: every node a round counts is a kept
 * descendant, and the statement's recursion emits level by level, so the first
 * `cap` nodes are all reachable through the fetched edges — `cap - roots`
 * (= maxNodes + 1) of them breach the node bound in the replay
 * (children_recursive_set_native: the 1,199-node subtree under a cap of 100).
 * The trailing 'nodes' refusal is the BACKSTOP for a cut adjacency that order
 * did not hold: saturation alone proves more than `maxNodes` reachable
 * descendants, so refusing is still the true answer — never a cut subtree
 * returned as whole.
 */
async function walkDescendants(
	roots: readonly { section_tipo: string; section_id: number }[],
	componentTipo: string | null,
	maxNodes: number = CHILDREN_RECURSIVE_MAX_NODES,
): Promise<ChildLocator[]> {
	if (roots.length === 0) return [];
	const cap = maxNodes + roots.length + 1;
	const { childrenOf, saturated } = await buildSubtreeAdjacency(roots, componentTipo, cap);
	return replaySubtree(roots, childrenOf, saturated, maxNodes);
}

/**
 * THE REPLAY (walkDescendants' synchronous half): `roots` over ONE fetched
 * adjacency, one shared visited set, the per-node walk's bounds and refusals —
 * then the SATURATION backstop: an adjacency the fetch reported cut
 * (`saturated`) is refused as 'nodes' even when the replay did not reach the
 * bound itself, never returned as a whole subtree.
 *
 * @internal Exported for the gate only (children_recursive_set_native): the
 * backstop is unreachable through a correct fetch (see walkDescendants), so the
 * gate drives it with a hand-built cut adjacency — tripwire, not dead code.
 */
export function replaySubtree(
	roots: readonly { section_tipo: string; section_id: number }[],
	childrenOf: ReadonlyMap<string, readonly ChildLocator[]>,
	saturated: boolean,
	maxNodes: number,
): ChildLocator[] {
	const [firstRoot] = roots;
	if (firstRoot === undefined) return [];
	const first = { section_tipo: firstRoot.section_tipo, section_id: firstRoot.section_id };
	const state: SubtreeWalkState = {
		visited: new Set<string>(),
		emitted: 0,
		root: first,
		maxNodes,
	};
	const all: ChildLocator[] = [];
	for (const root of roots) {
		const key = nodeKey(root.section_tipo, root.section_id);
		if (state.visited.has(key)) continue;
		state.visited.add(key);
		state.root = { section_tipo: root.section_tipo, section_id: root.section_id };
		all.push(...collectDescendantsShared(root.section_id, root.section_tipo, childrenOf, state, 1));
	}
	if (saturated) refuseSubtree({ ...state, root: first }, 'nodes');
	return all;
}

/**
 * ALL descendants at every depth, flat (PHP get_children_recursive :802).
 *
 * ONE SHARED visited set, and BOUNDED. PHP passed `visited` BY VALUE, which
 * prunes only along the path currently being walked: a node reachable from
 * several parents — a POLY-HIERARCHY, which Dédalo supports by design — was
 * expanded once per path (O(depth) copies per node, exponential on a diamond
 * lattice), and its subtree came back duplicated. Parity is not a bound, and
 * the shared set changes results ONLY where a subtree would have been
 * DUPLICATED. WC-2026-09-05-children-order-one-rule.
 *
 * The depth and node caps REFUSE loudly (`relation.subtree_too_large`) rather
 * than truncating: a silently narrowed subtree is a wrong answer that looks
 * like a right one.
 *
 * COST (PERF-6): a fixed number of statements whatever the subtree's size —
 * one recursive edge fetch (one more per section the walk had not planned),
 * one order read per (child section, order component) group.
 */
export async function getChildrenRecursive(
	sectionId: number | string,
	sectionTipo: string,
	componentTipo?: string | null,
): Promise<ChildLocator[]> {
	const rootId = Math.trunc(Number(sectionId));
	return walkDescendants(
		[{ section_tipo: sectionTipo, section_id: rootId }],
		componentTipo ?? null,
	);
}

/**
 * ALL descendants of MANY roots, flat, with ONE visited set shared across the
 * whole batch — the `&$visited` by-REFERENCE twin of {@link getChildrenRecursive}
 * (which now shares its own set too; what remains distinct here is that the set
 * spans the ROOTS, so a root contained in an earlier root's subtree costs
 * nothing and emits nothing twice).
 *
 * The descendant-expanding search (`sqo.children_recursive`) hands this an
 * unbounded root set straight from a client SQO, so the caps of the single-root
 * walk apply to the batch as a whole: `CHILDREN_RECURSIVE_MAX_NODES` counts
 * every node the batch emits, not every node per root. One edge fetch serves
 * every root.
 */
export async function getChildrenRecursiveBatch(
	// int by contract (WC-2026-08-10-section-id-int-canonical): roots come from
	// the search assembler's own section_id column.
	roots: readonly { section_id: number; section_tipo: string }[],
	componentTipo?: string | null,
): Promise<ChildLocator[]> {
	return walkDescendants(
		roots.map((root) => ({ section_tipo: root.section_tipo, section_id: root.section_id })),
		componentTipo ?? null,
	);
}

/**
 * @internal TEST SEAM (named exemption, DEC-12): the batch walk under a LOWER
 * node bound, so a gate drives the node refusal and a saturated edge fetch
 * through the real walk on a situation of a dozen nodes instead of 200,000
 * (children_recursive_set_native). Production callers use
 * getChildrenRecursive / getChildrenRecursiveBatch; a bound that is not a
 * positive integer below CHILDREN_RECURSIVE_MAX_NODES is refused.
 */
export async function getChildrenRecursiveUnderNodeCap(
	roots: readonly { section_id: number; section_tipo: string }[],
	maxNodes: number,
	componentTipo?: string | null,
): Promise<ChildLocator[]> {
	if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes >= CHILDREN_RECURSIVE_MAX_NODES) {
		throw new DedaloError('internal.invariant', {
			message: `getChildrenRecursiveUnderNodeCap: maxNodes must be an integer in [1, ${CHILDREN_RECURSIVE_MAX_NODES}) (got ${maxNodes})`,
		});
	}
	return walkDescendants(
		roots.map((root) => ({ section_tipo: root.section_tipo, section_id: root.section_id })),
		componentTipo ?? null,
		maxNodes,
	);
}
