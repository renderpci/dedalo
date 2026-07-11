/**
 * COMPONENT_RELATION_PARENT (PHP core/component_relation_parent/…) — the upward
 * (parent) link machinery of a Dédalo hierarchy, plus its ancestor-walk and
 * sibling-order maintenance. NOT ported anywhere before this file.
 *
 * A child record holds its parent link(s) as locators in its
 * component_relation_parent (relation column). Sibling ORDER is a component_number
 * dataframe on the CHILD, paired by id_key to that parent-link locator's item id —
 * so a multi-parent node carries an independent order per parent (the unified
 * dataframe contract, shared with relations/dataframe.ts).
 *
 * This module has two halves:
 *  - READ half (no transaction): getParentsRecursive (diamond-DAG safe ancestor
 *    walk — memo BY REF, visited path-local BY VALUE), isAncestor.
 *  - MUTATION half (ambient tx via postgres.ts primitives): addParent, removeParent,
 *    setChildOrder, recalculateSiblingOrders, getChildrenOfType, sortChildren.
 *
 * All mutations write through updateMatrixKeyData / the dataframe id_key helpers;
 * none populate read caches. PHP anchors: add_parent (:123), remove_parent (:223),
 * is_ancestor (:460), fetch_ancestors_recursive (:519), set_child_order (:829),
 * remove_child_order (:917), recalculate_sibling_orders_static (:1053),
 * component_relation_children sort_children (:1057), get_children_of_type (:664).
 */

import { readMatrixRecord } from '../db/matrix.ts';
import { updateMatrixKeyData } from '../db/matrix_write.ts';
import { allocateComponentItemId } from '../db/matrix_write.ts';
import { RELATION_TYPE_PARENT } from '../ontology/ontology_tipos.ts';
import { getMatrixTableFromTipo } from '../ontology/resolver.ts';
import {
	getChildrenOfType as getChildrenOfTypeLocators,
	getComponentOrderTipo,
	getParentTipo,
	resolveParentLinkIdKey,
} from './children.ts';
import {
	getInlineValueByIdKey,
	removeInlineByIdKey,
	updateInlineValueByIdKey,
} from './dataframe.ts';

/** A parent locator (as stored in the child's relation column). */
export interface ParentLocator {
	section_tipo: string;
	section_id: number | string;
	from_component_tipo?: string;
	type?: string;
	id?: number | string;
	[extra: string]: unknown;
}

/** Accumulated recursion errors (PHP component_relation_parent::$errors). */
export interface RecursionError {
	type: string;
	msg: string;
	info: { section_tipo: string; section_id: number | string };
}

// ===========================================================================
// READ HALF.
// ===========================================================================

/** The direct parent locators of a record (PHP get_parents). */
export async function getParents(
	sectionId: number | string,
	sectionTipo: string,
	fromComponentTipo?: string | null,
): Promise<ParentLocator[]> {
	const componentTipo = fromComponentTipo ?? (await getParentTipo(sectionTipo));
	if (componentTipo === null) return [];
	const table = await getMatrixTableFromTipo(sectionTipo);
	if (table === null) return [];
	const record = await readMatrixRecord(table, sectionTipo, Number(sectionId));
	const items =
		((record?.columns.relation as Record<string, ParentLocator[]> | null)?.[componentTipo] as
			| ParentLocator[]
			| undefined) ?? [];
	return items;
}

/**
 * Every unique ancestor of a record (PHP get_parents_recursive / fetch_ancestors_
 * recursive). `unique_ancestors` is the memo (by ref); `visited` is path-local (by
 * value) so a diamond DAG re-visits a shared ancestor via a different path but a
 * true cycle on one path is detected and recorded (not thrown). Returns the
 * ancestors plus the accumulated errors.
 */
export async function getParentsRecursive(
	sectionId: number | string,
	sectionTipo: string,
	componentTipo?: string | null,
): Promise<{ ancestors: ParentLocator[]; errors: RecursionError[] }> {
	const uniqueAncestors = new Map<string, ParentLocator>();
	const errors: RecursionError[] = [];

	const walk = async (
		id: number | string,
		tipo: string,
		visited: Record<string, boolean>,
	): Promise<void> => {
		const currentKey = `${tipo}_${id}`;
		if (visited[currentKey] === true) {
			errors.push({
				type: 'get_parents_recursive',
				msg: 'Loop detected',
				info: { section_tipo: tipo, section_id: id },
			});
			return;
		}
		const nextVisited = { ...visited, [currentKey]: true };

		const directParents = await getParents(id, tipo, componentTipo);
		for (const parent of directParents) {
			if (parent === null || typeof parent !== 'object') continue;
			if (parent.section_id === undefined || parent.section_tipo === undefined) continue;
			const parentKey = `${parent.section_tipo}_${parent.section_id}`;
			if (!uniqueAncestors.has(parentKey)) {
				uniqueAncestors.set(parentKey, parent);
				await walk(parent.section_id, parent.section_tipo, nextVisited);
			}
		}
	};

	await walk(sectionId, sectionTipo, {});
	return { ancestors: [...uniqueAncestors.values()], errors };
}

/**
 * True when (nodeTipo,nodeId) is an ancestor of (ofTipo,ofId) (PHP is_ancestor).
 * Same node → false (auto-reference handled elsewhere). Loose int id compare.
 */
export async function isAncestor(
	nodeTipo: string,
	nodeId: number | string,
	ofTipo: string,
	ofId: number | string,
): Promise<boolean> {
	if (nodeTipo === ofTipo && Math.trunc(Number(nodeId)) === Math.trunc(Number(ofId))) {
		return false;
	}
	const nodeKey = `${nodeTipo}_${Math.trunc(Number(nodeId))}`;
	const { ancestors } = await getParentsRecursive(ofId, ofTipo);
	for (const ancestor of ancestors) {
		if (ancestor.section_tipo === undefined || ancestor.section_id === undefined) continue;
		if (`${ancestor.section_tipo}_${Math.trunc(Number(ancestor.section_id))}` === nodeKey) {
			return true;
		}
	}
	return false;
}

// ===========================================================================
// MUTATION HALF — all require an ambient transaction (postgres.ts primitives).
// ===========================================================================

/** The order component instance context (tipo + table for the child section). */
async function orderContext(
	childSectionTipo: string,
): Promise<{ orderTipo: string; table: string } | null> {
	const orderTipo = await getComponentOrderTipo(childSectionTipo);
	if (orderTipo === null) return null;
	const table = await getMatrixTableFromTipo(childSectionTipo);
	if (table === null) return null;
	return { orderTipo, table };
}

/** Read the child's order component items (number column). */
async function readOrderItems(
	table: string,
	childSectionTipo: string,
	childSectionId: number,
	orderTipo: string,
): Promise<{ id?: number | string; value?: unknown }[]> {
	const record = await readMatrixRecord(table, childSectionTipo, childSectionId);
	return (
		((
			record?.columns.number as Record<string, { id?: number | string; value?: unknown }[]> | null
		)?.[orderTipo] as { id?: number | string; value?: unknown }[] | undefined) ?? []
	);
}

/**
 * Assign the initial sibling order to a child under a newly added parent (PHP
 * set_child_order :829): next = descriptor-children count + 1, written into the
 * child's own order component paired by id_key to the parent-link item id. The
 * locator MUST carry its item id.
 */
export async function setChildOrder(
	childSectionTipo: string,
	childSectionId: number,
	parentLocator: ParentLocator,
): Promise<boolean> {
	const idKey = Math.trunc(Number(parentLocator.id ?? 0));
	if (idKey <= 0) return false;
	const context = await orderContext(childSectionTipo);
	if (context === null) return false;

	// descriptor-children count of the parent (dd64/1 filtered inverse count).
	const siblings = await getChildrenOfTypeLocators(
		parentLocator.section_id,
		parentLocator.section_tipo,
		'descriptor',
	);
	const nextOrder = siblings.length + 1;

	const items = await readOrderItems(
		context.table,
		childSectionTipo,
		childSectionId,
		context.orderTipo,
	);
	const updated = updateInlineValueByIdKey(items, nextOrder, idKey);
	await updateMatrixKeyData(
		context.table,
		childSectionTipo,
		childSectionId,
		'number',
		context.orderTipo,
		updated,
	);
	return true;
}

/**
 * Delete the child's order value for one parent context (PHP remove_child_order
 * :917). Unresolved id_key → true no-op (PHP masking behaviour). Removes the
 * paired inline value then persists.
 */
export async function removeChildOrder(
	childSectionTipo: string,
	childSectionId: number,
	parentLocator: ParentLocator,
): Promise<boolean> {
	const context = await orderContext(childSectionTipo);
	if (context === null) return false;

	let idKey =
		parentLocator.id !== undefined && parentLocator.id !== null && parentLocator.id !== ''
			? Math.trunc(Number(parentLocator.id))
			: 0;
	if (idKey <= 0) {
		idKey = await resolveParentLinkIdKey(
			childSectionTipo,
			childSectionId,
			parentLocator.section_tipo,
			Math.trunc(Number(parentLocator.section_id)),
		);
	}
	if (idKey <= 0) return true; // nothing paired → no-op

	const items = await readOrderItems(
		context.table,
		childSectionTipo,
		childSectionId,
		context.orderTipo,
	);
	const removed = removeInlineByIdKey(items, idKey);
	await updateMatrixKeyData(
		context.table,
		childSectionTipo,
		childSectionId,
		'number',
		context.orderTipo,
		removed.length === 0 ? null : removed,
	);
	return true;
}

/**
 * Add a parent locator to a child (PHP add_parent :123). Auto-reference guard
 * (loose ==), descendant-cycle guard (records error, returns false), default
 * from_component_tipo/type, pre-allocate the locator item id, set initial order,
 * dedup-append and persist. Requires the parent-relation tipo. Returns the
 * accumulated errors alongside the boolean so callers can surface 'cycle'.
 */
export async function addParent(
	childSectionTipo: string,
	childSectionId: number,
	parentRelationTipo: string,
	parentLocator: ParentLocator,
): Promise<{ ok: boolean; errors: RecursionError[] }> {
	const errors: RecursionError[] = [];

	// auto-reference (loose id compare).
	if (
		parentLocator.section_tipo === childSectionTipo &&
		Number(parentLocator.section_id) === Number(childSectionId)
	) {
		return { ok: false, errors };
	}
	// descendant cycle: reject if the prospective parent is a descendant of the child.
	if (
		await isAncestor(
			childSectionTipo,
			childSectionId,
			parentLocator.section_tipo,
			Math.trunc(Number(parentLocator.section_id)),
		)
	) {
		errors.push({
			type: 'add_parent',
			msg: 'cycle',
			info: { section_tipo: childSectionTipo, section_id: childSectionId },
		});
		return { ok: false, errors };
	}

	const table = await getMatrixTableFromTipo(childSectionTipo);
	if (table === null) return { ok: false, errors };

	// defaults.
	const locator: ParentLocator = { ...parentLocator };
	if (locator.from_component_tipo === undefined) locator.from_component_tipo = parentRelationTipo;
	if (locator.type === undefined) locator.type = RELATION_TYPE_PARENT;

	// pre-allocate the item id (the order dataframe pairing key).
	if (locator.id === undefined || locator.id === null || locator.id === '') {
		locator.id = await allocateComponentItemId(
			table,
			childSectionTipo,
			childSectionId,
			parentRelationTipo,
		);
	}

	// initial sibling order (paired by the just-allocated id).
	await setChildOrder(childSectionTipo, childSectionId, locator);

	// dedup-append (PHP add_locator_to_data equality: section_tipo/section_id/type/from_component_tipo).
	const record = await readMatrixRecord(table, childSectionTipo, childSectionId);
	const existing =
		((record?.columns.relation as Record<string, ParentLocator[]> | null)?.[parentRelationTipo] as
			| ParentLocator[]
			| undefined) ?? [];
	const isDuplicate = existing.some(
		(stored) =>
			stored.section_tipo === locator.section_tipo &&
			Number(stored.section_id) === Number(locator.section_id) &&
			stored.type === locator.type &&
			stored.from_component_tipo === locator.from_component_tipo,
	);
	if (isDuplicate) return { ok: false, errors };

	const merged = [...existing, locator];
	await updateMatrixKeyData(
		table,
		childSectionTipo,
		childSectionId,
		'relation',
		parentRelationTipo,
		merged,
	);
	return { ok: true, errors };
}

/**
 * Remove a parent locator from a child (PHP remove_parent :223). Removes the order
 * value first (unresolved id_key → no-op) then the locator. Returns false when the
 * locator was not found.
 */
export async function removeParent(
	childSectionTipo: string,
	childSectionId: number,
	parentRelationTipo: string,
	parentLocator: ParentLocator,
): Promise<boolean> {
	await removeChildOrder(childSectionTipo, childSectionId, parentLocator);

	const table = await getMatrixTableFromTipo(childSectionTipo);
	if (table === null) return false;
	const record = await readMatrixRecord(table, childSectionTipo, childSectionId);
	const existing =
		((record?.columns.relation as Record<string, ParentLocator[]> | null)?.[parentRelationTipo] as
			| ParentLocator[]
			| undefined) ?? [];
	const filtered = existing.filter(
		(stored) =>
			!(
				stored.section_tipo === parentLocator.section_tipo &&
				Number(stored.section_id) === Number(parentLocator.section_id) &&
				stored.type === parentLocator.type &&
				stored.from_component_tipo === parentLocator.from_component_tipo
			),
	);
	if (filtered.length === existing.length) return false; // not found

	await updateMatrixKeyData(
		table,
		childSectionTipo,
		childSectionId,
		'relation',
		parentRelationTipo,
		filtered.length === 0 ? null : filtered,
	);
	return true;
}

/** Descriptor/non-descriptor children of a parent (PHP get_children_of_type :664). */
export async function getChildrenOfType(
	parentSectionId: number | string,
	parentSectionTipo: string,
	type: 'descriptor' | 'non_descriptor' = 'descriptor',
): Promise<{ section_tipo: string; section_id: string }[]> {
	const locators = await getChildrenOfTypeLocators(parentSectionId, parentSectionTipo, type);
	return locators.map((locator) => ({
		section_tipo: locator.section_tipo,
		section_id: locator.section_id,
	}));
}

/**
 * Renumber the descriptor children of a parent densely 1..n (PHP
 * recalculate_sibling_orders_static :1053). Skips children whose stored order is
 * already correct and children with an unresolvable id_key. Returns false when no
 * order component is configured.
 */
export async function recalculateSiblingOrders(
	childSectionTipo: string,
	parentSectionTipo: string,
	parentSectionId: number,
): Promise<boolean> {
	const orderTipo = await getComponentOrderTipo(childSectionTipo);
	if (orderTipo === null) return false;

	const children = await getChildrenOfTypeLocators(
		parentSectionId,
		parentSectionTipo,
		'descriptor',
	);

	let order = 1;
	for (const child of children) {
		const table = await getMatrixTableFromTipo(child.section_tipo);
		if (table === null) {
			order++;
			continue;
		}
		const idKey = await resolveParentLinkIdKey(
			child.section_tipo,
			child.section_id,
			parentSectionTipo,
			parentSectionId,
		);
		if (idKey <= 0) {
			order++;
			continue;
		}
		const items = await readOrderItems(
			table,
			child.section_tipo,
			Number(child.section_id),
			orderTipo,
		);
		const currentValue = getInlineValueByIdKey(items, idKey);
		if (currentValue !== null && Math.trunc(Number(currentValue)) === order) {
			order++;
			continue;
		}
		const updated = updateInlineValueByIdKey(items, order, idKey);
		await updateMatrixKeyData(
			table,
			child.section_tipo,
			Number(child.section_id),
			'number',
			orderTipo,
			updated,
		);
		order++;
	}
	return true;
}

/** One changed order record (PHP sort_children return shape). */
export interface SortChange {
	value: number;
	locator: { section_tipo: string; section_id: number | string; [extra: string]: unknown };
}

/**
 * Persist a user-defined sibling ordering (PHP component_relation_children::
 * sort_children :1057). Positions are 1-based ascending. Per locator: resolve the
 * parent-link id_key (skip ≤0), skip if unchanged, else update + record. Returns
 * false when the section_map defines no order component.
 */
export async function sortChildren(
	childSectionTipo: string,
	locators: { section_tipo: string; section_id: number | string; [extra: string]: unknown }[],
	parentSectionTipo: string,
	parentSectionId: number,
): Promise<SortChange[] | false> {
	const orderTipo = await getComponentOrderTipo(childSectionTipo);
	if (orderTipo === null) return false;

	const changed: SortChange[] = [];
	let order = 0;
	for (const locator of locators) {
		order++;
		const table = await getMatrixTableFromTipo(locator.section_tipo);
		if (table === null) continue;
		const idKey = await resolveParentLinkIdKey(
			locator.section_tipo,
			locator.section_id,
			parentSectionTipo,
			parentSectionId,
		);
		if (idKey <= 0) continue;
		const items = await readOrderItems(
			table,
			locator.section_tipo,
			Number(locator.section_id),
			orderTipo,
		);
		const currentValue = getInlineValueByIdKey(items, idKey);
		if (currentValue !== null && Math.trunc(Number(currentValue)) === order) continue;
		const updated = updateInlineValueByIdKey(items, order, idKey);
		await updateMatrixKeyData(
			table,
			locator.section_tipo,
			Number(locator.section_id),
			'number',
			orderTipo,
			updated,
		);
		changed.push({ value: order, locator });
	}
	return changed;
}
