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
 * Perf note (ledgered): PHP pushes the precomputed order into SQL
 * (array_position) so LIMIT/OFFSET page in the database; this engine orders
 * in process and slices — identical results, full-child-list cost per read
 * on very large nodes.
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
import {
	countInverseReferences,
	findInverseReferences,
	type RelatedLocatorFilter,
} from '../search/search_related.ts';
import { pickOrderValueForParent } from '../ts_object/node_repository.ts';

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

async function orderChildHits(
	hits: { section_tipo: string; section_id: number }[],
	sectionId: number,
	sectionTipo: string,
	orderComponentTipo: string,
): Promise<{ section_tipo: string; section_id: number }[]> {
	const UNORDERED = Number.MAX_SAFE_INTEGER;
	assertOrderTipo(orderComponentTipo, 'order', sectionTipo);

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
		for (const row of await readOrderRows(childSectionTipo, sectionIds, orderComponentTipo)) {
			const value = pickOrderValueForParent(
				storedItems(row.order_arr),
				storedItems(row.parent_arr),
				sectionTipo,
				sectionId,
			);
			const order =
				value === null || value === undefined || value === '' ? Number.NaN : Number(value);
			if (!Number.isFinite(order)) continue;
			orderByKey.set(`${childSectionTipo}_${Math.trunc(Number(row.section_id))}`, order);
		}
	}

	const decorated = hits.map((hit, index) => ({
		hit,
		order: orderByKey.get(`${hit.section_tipo}_${hit.section_id}`) ?? UNORDERED,
		index,
	}));
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
	if (typeof orderComponentTipo === 'string' && orderComponentTipo !== '') {
		hits = await orderChildHits(hits, Number(sectionId), sectionTipo, orderComponentTipo);
	}
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
export function subtreeBoundExceeded(depth: number, emitted: number): SubtreeBound | null {
	if (depth > CHILDREN_RECURSIVE_MAX_DEPTH) return 'depth';
	if (emitted > CHILDREN_RECURSIVE_MAX_NODES) return 'nodes';
	return null;
}

/** The walk's live state: ONE visited set and ONE node budget per call. */
interface SubtreeWalkState {
	visited: Set<string>;
	emitted: number;
	root: { section_tipo: string; section_id: number };
}

function refuseSubtree(state: SubtreeWalkState, limit: SubtreeBound): never {
	throw new DedaloError('relation.subtree_too_large', {
		message:
			limit === 'depth'
				? `children_recursive: the subtree below ${state.root.section_tipo}/${state.root.section_id} is deeper than ${CHILDREN_RECURSIVE_MAX_DEPTH} levels`
				: `children_recursive: the subtree below ${state.root.section_tipo}/${state.root.section_id} exceeds ${CHILDREN_RECURSIVE_MAX_NODES} descendants`,
		coordinates: { section_tipo: state.root.section_tipo, section_id: state.root.section_id },
		details: {
			limit,
			cap: limit === 'depth' ? CHILDREN_RECURSIVE_MAX_DEPTH : CHILDREN_RECURSIVE_MAX_NODES,
		},
	});
}

/**
 * ONE root's descendants, marking the SHARED visited set as it walks.
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
async function collectDescendantsShared(
	// int by contract: the ONE tolerated string id is normalised at the public
	// entry below (WC-2026-08-10-section-id-int-canonical).
	sectionId: number,
	sectionTipo: string,
	componentTipo: string | null | undefined,
	state: SubtreeWalkState,
	depth: number,
): Promise<ChildLocator[]> {
	const direct = await getChildren(sectionId, sectionTipo, componentTipo);
	const fresh: ChildLocator[] = [];
	for (const child of direct) {
		const key = `${child.section_tipo}_${child.section_id}`;
		if (state.visited.has(key)) continue;
		state.visited.add(key);
		state.emitted++;
		const breach = subtreeBoundExceeded(depth, state.emitted);
		if (breach !== null) refuseSubtree(state, breach);
		fresh.push(child);
	}
	const all: ChildLocator[] = [...fresh];
	for (const child of fresh) {
		all.push(
			...(await collectDescendantsShared(
				child.section_id,
				child.section_tipo,
				componentTipo,
				state,
				depth + 1,
			)),
		);
	}
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
 */
export async function getChildrenRecursive(
	sectionId: number | string,
	sectionTipo: string,
	componentTipo?: string | null,
): Promise<ChildLocator[]> {
	const rootId = Math.trunc(Number(sectionId));
	const state: SubtreeWalkState = {
		visited: new Set([`${sectionTipo}_${rootId}`]),
		emitted: 0,
		root: { section_tipo: sectionTipo, section_id: rootId },
	};
	return collectDescendantsShared(rootId, sectionTipo, componentTipo, state, 1);
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
 * every node the batch emits, not every node per root.
 */
export async function getChildrenRecursiveBatch(
	// int by contract (WC-2026-08-10-section-id-int-canonical): roots come from
	// the search assembler's own section_id column.
	roots: readonly { section_id: number; section_tipo: string }[],
	componentTipo?: string | null,
): Promise<ChildLocator[]> {
	const all: ChildLocator[] = [];
	const state: SubtreeWalkState = {
		visited: new Set<string>(),
		emitted: 0,
		root: { section_tipo: roots[0]?.section_tipo ?? '', section_id: roots[0]?.section_id ?? 0 },
	};
	for (const root of roots) {
		const key = `${root.section_tipo}_${root.section_id}`;
		if (state.visited.has(key)) continue;
		state.visited.add(key);
		state.root = { section_tipo: root.section_tipo, section_id: root.section_id };
		all.push(
			...(await collectDescendantsShared(
				root.section_id,
				root.section_tipo,
				componentTipo,
				state,
				1,
			)),
		);
	}
	return all;
}
