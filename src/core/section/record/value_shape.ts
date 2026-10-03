/**
 * THE VALUE-SHAPE LAW OF THE SAVE DOOR (2026-10-03 —
 * `engineering/wire_contract/WC-2026-10-03-save-refuses-malformed-value-shape.md`).
 *
 * Every stored data item of a component is an OBJECT — `{id, lang, value}` for
 * the string family, `{id, value}` for a number, `{id, start, end}` for a date,
 * `{id, lang, iri, title}` for an IRI, a locator for a relation. The write
 * engine used to store whatever the caller sent: measured on 2026-10-03,
 * `{action:'update', key:0, value:'Zzq data name'}` on a translatable
 * component_input_text answered ok:true and persisted the BARE STRING next to
 * the other languages' items; the next write dropped it (the lang-sliced
 * merge discards non-objects), so the second language's save silently
 * replaced the first's. `value: null` on an update stored a literal `null`
 * item; a number update `value: 55` stored `[55]`; `{value: '55'}` stored a
 * string a numeric search never matches; a non-array `set_data` emptied the
 * language slice and reported success.
 *
 * The law: the door REFUSES (`request.invalid_data`, the component named) a
 * value whose shape the component's model does not accept, before the
 * transaction opens — nothing written, no counter raised, no Time Machine row.
 * A door that legitimately holds a looser shape normalizes it THERE, into the
 * canonical item, never here (the CSV number conform casts a JSON cell's
 * numeric strings, tools/import_conform.ts conformNumber).
 *
 * WHAT IS CHECKED, per change — and only the value-carrying actions:
 *   - `insert` / `update`: `value` is ONE item;
 *   - `set_data`: `value` is an ARRAY of items, or null (the explicit empty a
 *     relation picker sends — check_box's tools view);
 *   - every other action (`remove`, `clear`, `sort_*`, `add_new_element`, whose
 *     value is a section tipo) carries no item and is not this law's business.
 * An item is a plain object (not null, not an array) for EVERY column but
 * `section_id` (component_section_id stores the bare record id `[1]`, by
 * definition). On top of that, the literal families type the fields the
 * engine reads (absent and null are always accepted — the client's empty slot
 * is `{value: null}`):
 *   - `string` (input_text, email, password, text_area): `value` is a string;
 *   - `number`: `value` is a finite number;
 *   - `date`: `start` / `end` / `period` are objects;
 *   - `iri`: `iri` / `title` are strings.
 * The relation family gets the item-ness check only: its locators are then
 * normalized by validateRelationInsert (relations/save.ts), which only ever
 * ran on an object — a bare scalar slipped past it raw.
 *
 * Pure: the answer depends only on the column and the incoming changes.
 */

/** The part of a changed_data item this law reads (save_component.ts ChangedDataItem). */
interface ShapedChange {
	action: string;
	value?: unknown;
	id?: unknown;
	key?: unknown;
}

/** The value-carrying actions — the only ones whose `value` is an item (or items). */
const ITEM_ACTIONS: ReadonlySet<string> = new Set(['insert', 'update']);

/** Fields the literal families read, and the type each must have when present (non-null). */
const TYPED_FIELDS: Readonly<Record<string, Readonly<Record<string, FieldType>>>> = {
	string: { value: 'string' },
	number: { value: 'number' },
	date: { start: 'object', end: 'object', period: 'object' },
	iri: { iri: 'string', title: 'string' },
};

type FieldType = 'string' | 'number' | 'object';

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** How a value reads in a refusal: its kind, never its content (it can be a password). */
function kindOf(value: unknown): string {
	if (value === null) return 'null';
	if (value === undefined) return 'nothing';
	if (Array.isArray(value)) return 'an array';
	if (typeof value === 'object') return 'an object';
	return `a bare ${typeof value}`;
}

function fieldMatches(value: unknown, type: FieldType): boolean {
	switch (type) {
		case 'string':
			return typeof value === 'string';
		case 'number':
			return typeof value === 'number' && Number.isFinite(value);
		case 'object':
			return isPlainObject(value);
	}
}

/** How a mistyped field reads in a refusal. */
function wantedOf(type: FieldType): string {
	if (type === 'number') return 'a finite number';
	return type === 'object' ? 'an object' : 'a string';
}

/** The refusal for ONE typed field of an item, or null (absent and null always pass). */
function fieldRefusal(
	column: string,
	field: string,
	value: unknown,
	type: FieldType,
): string | null {
	if (value === null || value === undefined || fieldMatches(value, type)) return null;
	const received = typeof value === 'number' ? 'a non-finite number' : kindOf(value);
	return `'${field}' must be ${wantedOf(type)} (${column} column), received ${received}`;
}

/** The refusal for ONE item, or null when the column accepts it. */
function itemRefusal(column: string, item: unknown): string | null {
	if (!isPlainObject(item)) {
		return `an item must be an object (${column} column), received ${kindOf(item)}`;
	}
	for (const [field, type] of Object.entries(TYPED_FIELDS[column] ?? {})) {
		const why = fieldRefusal(column, field, item[field], type);
		if (why !== null) return why;
	}
	return null;
}

/** A set_data value: an array of items, or the explicit empty (null / absent). */
function setDataRefusal(column: string, value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (!Array.isArray(value)) return `set_data takes an array of items, received ${kindOf(value)}`;
	for (const [position, item] of value.entries()) {
		const why = itemRefusal(column, item);
		if (why !== null) return `item ${position}: ${why}`;
	}
	return null;
}

/** The refusal for ONE change, or null — the non-item actions are never judged. */
function changeRefusal(column: string, change: ShapedChange): string | null {
	if (ITEM_ACTIONS.has(change.action)) return itemRefusal(column, change.value);
	if (change.action === 'set_data') return setDataRefusal(column, change.value);
	return null;
}

/**
 * The refusal message for the first malformed value in `changedData`, or null
 * when every value-carrying change has the shape the column stores. `column` is
 * the model's matrix column (getColumnNameByModel); null (no column — the door
 * downstream refuses that itself) and `section_id` are never checked.
 */
export function valueShapeRefusal(
	column: string | null,
	changedData: readonly ShapedChange[],
): string | null {
	if (column === null || column === 'section_id') return null;
	for (const [index, change] of changedData.entries()) {
		const why = changeRefusal(column, change);
		if (why !== null) return `changed_data[${index}] (${String(change.action)}): ${why}`;
	}
	return null;
}
