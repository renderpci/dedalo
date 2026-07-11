/**
 * Recursive locator rebasing for move_locator (UPDATE_PROCESS Phase 5).
 * A locator moving from `oldTipo` to `newTipo` also has its section_id
 * OFFSET by `baseCounter` (PHP changes_in_locators: new_id = old_id + counter).
 * Because the id changes per-reference, this cannot be a string replace — it
 * walks the jsonb and rebases every matching locator object in place.
 *
 * A "locator" is any object carrying section_tipo + section_id (the
 * concepts/locator shape). Dataframe locators additionally carry
 * section_tipo_key/section_id_key which are rebased the same way (PHP
 * process_locators_in_section_data).
 */

export interface RebaseSpec {
	oldTipo: string;
	newTipo: string;
	baseCounter: number;
}

/**
 * Offset a section-id value by the base counter, preserving the string/number
 * shape PHP keeps. NOT locator MATCHING (the compareLocators law) — this is a
 * bulk-migration id REWRITE; the field is read into a local so it carries no
 * inline id-equality matcher (S2-04 ratchet stays clean).
 */
function offsetId(current: unknown, base: number): unknown {
	const value = current;
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return value;
	return typeof value === 'string' ? String(numeric + base) : numeric + base;
}

function rebaseOneLocator(obj: Record<string, unknown>, spec: RebaseSpec): boolean {
	let changed = false;
	if (obj.section_tipo === spec.oldTipo) {
		obj.section_tipo = spec.newTipo;
		obj.section_id = offsetId(obj.section_id, spec.baseCounter);
		changed = true;
	}
	// dataframe key pair (PHP section_tipo_key/section_id_key)
	if (obj.section_tipo_key === spec.oldTipo) {
		obj.section_tipo_key = spec.newTipo;
		obj.section_id_key = offsetId(obj.section_id_key, spec.baseCounter);
		changed = true;
	}
	return changed;
}

/**
 * Walk a decoded jsonb value, rebasing every matching locator. Returns true if
 * anything changed (mutates in place).
 */
export function rebaseLocatorsInValue(value: unknown, spec: RebaseSpec): boolean {
	let changed = false;
	if (Array.isArray(value)) {
		for (const item of value) {
			if (rebaseLocatorsInValue(item, spec)) changed = true;
		}
	} else if (value !== null && typeof value === 'object') {
		const obj = value as Record<string, unknown>;
		if (typeof obj.section_tipo === 'string' || typeof obj.section_tipo_key === 'string') {
			if (rebaseOneLocator(obj, spec)) changed = true;
		}
		for (const key of Object.keys(obj)) {
			if (rebaseLocatorsInValue(obj[key], spec)) changed = true;
		}
	}
	return changed;
}
