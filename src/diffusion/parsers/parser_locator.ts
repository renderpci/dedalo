/**
 * Runtime parsers — parser_locator SURVIVORS (the trivial locator projections).
 * Oracle: diffusion/api/v1/lib/parsers/parser_locator.ts (behavior parity).
 *
 * Only get_section_id / get_section_tipo / get_term_id / get_section_id_grouped
 * run at runtime. Everything else the oracle registered under parser_locator
 * (parents, truncate_*, filter_*, slice_chain, get_locator,
 * map_section_tipo_to_name) is a COMPILE-TIME REWRITER: chain transforms
 * become ResolveStep options, term extraction reads resolver-prefetched links,
 * locator re-synthesis is dead (the IR keeps typed chains). See registry.ts.
 *
 * Input contract here: relation values arrive as chain ValueIRs; item_bridge
 * projects each ResolvedLink to the oracle locator shape
 * ({section_tipo, section_id}), so the ported bodies below run unchanged.
 * None of these four projections needs the prefetched link terms.
 */

import type { ItemParserFn, ParserItem } from './types.ts';

/** The oracle locator shape produced by item_bridge from ResolvedLink. */
interface LocatorLike {
	section_tipo?: string | null;
	section_id?: string | number | null;
}

/**
 * Resolve the locator object(s) carried by an item (oracle parser_locator.ts:32-59).
 * Three coexisting contracts:
 *   1. item.value is a locator object or an array of them (bridged chains land here);
 *   2. a diffusion_data_object wrapper nests the locator under .value;
 *   3. the locator lives on the item's own section_id/section_tipo provenance
 *      (relation/portal items whose value is null).
 */
function itemLocators(item: ParserItem): LocatorLike[] {
	const val = item.value;
	const candidates = Array.isArray(val) ? val : [val];
	const unwrapped = candidates.map((c) =>
		c &&
		typeof c === 'object' &&
		(c as { value?: unknown }).value &&
		typeof (c as { value?: unknown }).value === 'object' &&
		('section_id' in (c as { value: object }).value ||
			'section_tipo' in (c as { value: object }).value)
			? (c as { value: object }).value
			: c,
	);
	const objs = unwrapped.filter(
		(l): l is LocatorLike =>
			typeof l === 'object' && l !== null && ('section_id' in l || 'section_tipo' in l),
	);
	if (objs.length > 0) return objs;

	const hasSid =
		item.section_id !== undefined && item.section_id !== null && item.section_id !== '';
	const hasStipo =
		item.section_tipo !== undefined && item.section_tipo !== null && item.section_tipo !== '';
	if (hasSid || hasStipo) {
		return [{ section_tipo: item.section_tipo, section_id: item.section_id }];
	}

	return [];
}

/** "{section_tipo}_{section_id}" or null when either half is missing/empty. */
function termIdFromLocator(locator: LocatorLike | null): string | null {
	if (!locator) return null;
	return locator.section_tipo && locator.section_id
		? `${locator.section_tipo}_${locator.section_id}`
		: null;
}

// ---------------------------------------------------------------------------
// get_section_id
// ---------------------------------------------------------------------------

/**
 * Projects each item's locators to their section_id.
 * split:false (default) → one item per input, value = section_id array;
 * split:true → one item PER section_id with a synthetic '__split__N'
 * section_id so a downstream merge(unique) dedupes individual values.
 */
export const getSectionId: ItemParserFn = (items, options) => {
	return projectLocatorField(items, options, (locator) =>
		locator.section_id !== undefined && locator.section_id !== null ? locator.section_id : null,
	);
};

// ---------------------------------------------------------------------------
// get_section_tipo
// ---------------------------------------------------------------------------

/** Same projection contract as get_section_id, for section_tipo. */
export const getSectionTipo: ItemParserFn = (items, options) => {
	return projectLocatorField(items, options, (locator) =>
		locator.section_tipo !== undefined && locator.section_tipo !== null
			? locator.section_tipo
			: null,
	);
};

/** Shared body of the two field projections (oracle duplicates it verbatim). */
function projectLocatorField(
	items: ParserItem[],
	options: Record<string, unknown>,
	extract: (locator: LocatorLike) => string | number | null,
): ParserItem[] | null {
	if (!items || items.length === 0) return null;

	const split = (options.split as boolean) ?? false;
	const result: ParserItem[] = [];

	if (split) {
		let splitIdx = 0;
		for (const item of items) {
			for (const locator of itemLocators(item)) {
				const extracted = extract(locator);
				if (extracted !== null) {
					result.push({ ...item, value: extracted, section_id: `__split__${splitIdx++}` });
				}
			}
		}
		return result.length > 0 ? result : null;
	}

	for (const item of items) {
		const extractedValues: (string | number)[] = [];
		for (const locator of itemLocators(item)) {
			const extracted = extract(locator);
			if (extracted !== null) extractedValues.push(extracted);
		}
		result.push({ ...item, value: extractedValues });
	}

	return result.length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// get_term_id
// ---------------------------------------------------------------------------

/**
 * Projects locators to "{section_tipo}_{section_id}" term ids. Supports the
 * same split contract as get_section_id. coerce_non_locator:true reproduces
 * v6 map_locator_to_terminoID, which applied the conversion to EVERY dato
 * entry — non-locator values (e.g. a color "#f78a1c") yield the "_" marker,
 * while an empty input under coerce emits nothing (v6: None, not "[]").
 */
export const getTermId: ItemParserFn = (items, options) => {
	if (!items || items.length === 0) return null;

	const split = (options.split as boolean) ?? false;
	const result: ParserItem[] = [];

	if (split) {
		let splitIdx = 0;
		for (const item of items) {
			for (const loc of itemLocators(item)) {
				if (!('section_tipo' in loc) || !('section_id' in loc)) continue;
				const tid = termIdFromLocator(loc);
				if (tid !== null) {
					result.push({ ...item, value: tid, section_id: `__split__${splitIdx++}` });
				}
			}
		}
		return result.length > 0 ? result : null;
	}

	const coerce = options.coerce_non_locator === true;

	for (const item of items) {
		const termIds: string[] = [];
		for (const loc of itemLocators(item)) {
			if (!('section_tipo' in loc) || !('section_id' in loc)) continue;
			const tid = termIdFromLocator(loc);
			if (tid !== null) termIds.push(tid);
		}
		if (coerce && termIds.length === 0) {
			const vals = Array.isArray(item.value)
				? item.value
				: item.value != null && item.value !== ''
					? [item.value]
					: [];
			for (const v of vals) {
				if (v != null && v !== '') termIds.push('_');
			}
			if (termIds.length === 0) continue;
		}
		result.push({ ...item, value: termIds });
	}

	return result.length > 0 ? result : null;
};

// ---------------------------------------------------------------------------
// get_section_id_grouped
// ---------------------------------------------------------------------------

/**
 * Reproduces v6 get_diffusion_dato grouping of dataframe-paired references:
 * each item carries a dataframe id (1..n within a reference, arriving here as
 * the item's source id) — a new group starts whenever that id resets to 1 or
 * decreases. Each group's section_ids emit as a JSON array; groups join with
 * records_separator, e.g. `["99927"] | ["128187","133934"]`.
 */
export const getSectionIdGrouped: ItemParserFn = (items, options) => {
	if (!items || items.length === 0) return null;

	const recordsSep = (options.records_separator as string) ?? ' | ';

	const groups: string[][] = [];
	let current: string[] | null = null;
	let prevId: number | null = null;

	for (const item of items) {
		const locators = itemLocators(item);
		if (locators.length === 0) continue;
		const sid = (locators[0] as LocatorLike).section_id;
		if (sid === undefined || sid === null) continue;

		const id = Number(item.id);
		const reset = current === null || (Number.isFinite(id) && prevId !== null && id <= prevId);
		if (reset) {
			current = [];
			groups.push(current);
		}
		(current as string[]).push(String(sid));
		prevId = Number.isFinite(id) ? id : prevId;
	}

	if (groups.length === 0) return null;

	const value = groups.map((g) => JSON.stringify(g)).join(recordsSep);
	return [{ ...(items[0] as ParserItem), value }];
};
