/**
 * ITEM VALUE IDENTITY — when a caller's component item "is" a stored one.
 *
 * The save door stamps every stored item with an `id` (a per-component
 * counter). A value that arrives from outside the engine — a CSV cell wrapped
 * as `[{value:'x'}]`, a propagated value — names no id, so comparing it with
 * its stored twin byte for byte always differs, and replacing the stored item
 * with it mints a FRESH id. Two consumers need the id-blind answer:
 *   - the propagate tool's pre-check (tool_propagate_component_data), so a
 *     repeated `replace` recognises the value it already wrote;
 *   - the save door's `set_data` replace (save_component.ts), which carries the
 *     stored id over to an id-less item equal to the stored item at the same
 *     position — so re-importing an unchanged CSV persists a byte-equal region,
 *     the undo log's no-op law writes nothing (WC-2026-09-27-bulk-revert-undo-log
 *     §2), and a dataframe frame paired to that item's id (id_key) stays paired.
 * One rule, one module: the two cannot drift into two notions of "the same".
 */

import { canonicalEquals } from './canonical_json.ts';
import { addTimeToDateItem } from './dd_date_time.ts';

type ItemObject = Record<string, unknown>;

function isItemObject(value: unknown): value is ItemObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Whether an item names no id — the same test as the save door's id safety net. */
export function namesNoItemId(item: ItemObject): boolean {
	return item.id === undefined || item.id === null || item.id === '';
}

/**
 * An item AS THE SAVE DOOR PERSISTS IT, minus its id: a copy whose DERIVED
 * keys are recomputed from the value. Today that is component_date's `time`
 * (start/end/period/root — dd_date_time.ts addTimeToDateItem, the same
 * override the save runs), which a stored date carries and an incoming one
 * (a CSV cell, a propagated value) does not; a shape with no date container is
 * returned as-is. Comparing persisted forms, not raw ones, is what makes an
 * unchanged date "the same" — else every re-import re-mints its id.
 */
function persistedValue(item: ItemObject): ItemObject {
	const { id: _id, ...rest } = item;
	const copy = structuredClone(rest);
	addTimeToDateItem(copy);
	return copy;
}

/**
 * Whether the STORED item carries the value of the CANDIDATE item. Structural
 * (key order never matters — jsonb reorders keys), compared as persisted
 * (derived keys recomputed on both sides, see persistedValue), and blind to
 * the stored item's `id` when the candidate names none.
 */
export function sameItemValue(stored: unknown, candidate: unknown): boolean {
	if (isItemObject(stored) && isItemObject(candidate) && namesNoItemId(candidate)) {
		return canonicalEquals(persistedValue(stored), persistedValue(candidate));
	}
	return canonicalEquals(stored, candidate);
}

/**
 * `incoming` with each id-less item that equals (id aside) the stored item at
 * the SAME position given that stored item's id — a copy, never the caller's
 * objects mutated. Position, not search: a replace that reorders is a change,
 * and a value repeated in the component must not steal its sibling's id. An id
 * another incoming item already names is never adopted twice.
 */
export function adoptStoredItemIds(
	incoming: readonly unknown[],
	storedRegion: readonly unknown[],
): unknown[] {
	const named = new Set(
		incoming.filter(isItemObject).flatMap((item) => (namesNoItemId(item) ? [] : [item.id])),
	);
	return incoming.map((item, index) => {
		const stored = storedRegion[index];
		if (!isAdoptable(item, stored, named)) return item;
		named.add(stored.id);
		return { ...(item as ItemObject), id: stored.id };
	});
}

/** Whether id-less `item` may take `stored`'s id (see adoptStoredItemIds). */
function isAdoptable(
	item: unknown,
	stored: unknown,
	named: ReadonlySet<unknown>,
): stored is ItemObject {
	if (!isItemObject(item) || !isItemObject(stored)) return false;
	if (!namesNoItemId(item) || namesNoItemId(stored)) return false;
	return !named.has(stored.id) && sameItemValue(stored, item);
}
