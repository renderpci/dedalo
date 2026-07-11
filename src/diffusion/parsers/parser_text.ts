/**
 * Runtime parsers — parser_text family.
 * Oracle: diffusion/api/v1/lib/parsers/parser_text.ts (behavior parity).
 *
 * default_join / text_format / map_value / v5_html — the text shaping layer.
 * Note the oracle contract preserved throughout: parsers that format rows emit
 * items whose value is string[] (one wrapped string per zip-row); the FINAL
 * collapse to a single string is a downstream plan step (the old engine's
 * auto-completion merge), not the parser's job.
 */

import { stringifyValue } from './item_bridge.ts';
import { merge, replace } from './parser_helper.ts';
import type { ItemParserFn, ParserItem } from './types.ts';

// ---------------------------------------------------------------------------
// default_join — alias of merge(merge:'string')
// ---------------------------------------------------------------------------

/** Collapses all items into a single scalar string per lang (via merge). */
export const defaultJoin: ItemParserFn = (items, options, ctx) => {
	return merge(items, { ...options, merge: 'string' }, ctx);
};

// ---------------------------------------------------------------------------
// text_format — the ${placeholder} pattern processor
// ---------------------------------------------------------------------------

/**
 * Applies a pattern template ("${a}, ${b} / ${c}") to items keyed by their
 * source id. Three phases (oracle parser_text.ts:64-321):
 *
 * 1. LANG GROUPING — items are grouped by lang; each language gets its own
 *    independent formatting pass (per-lang zip, no cross-lang contamination).
 * 2. VALUE ZIPPING — within a lang group, values are collected per id; the
 *    longest id list drives the row count. Single-element lists broadcast
 *    across rows, multi-element lists are consumed positionally.
 * 3. PATTERN REPLACEMENT — each zip-row runs through replace(), which cleans
 *    up separators around empty values.
 *
 * group_by_section_id:true additionally sub-groups by originating section so
 * each related record formats as a coherent unit; sections are joined with
 * records_separator (one output item per lang). Without a pattern the parser
 * falls back to default_join.
 */
export const textFormat: ItemParserFn = (items, options, ctx) => {
	if (!items || items.length === 0) return null;

	const pattern = options.pattern as string | undefined;
	if (!pattern) {
		return defaultJoin(items, options, ctx);
	}

	const groupBySectionId = options.group_by_section_id === true;
	const fieldsSep = (options.fields_separator as string) ?? ', ';
	const recordsSep = (options.records_separator as string) ?? ' | ';

	// Unique placeholder names, in order of appearance in the pattern
	const placeholderNames: string[] = [];
	const phRegex = /\$\{([a-zA-Z0-9_]+)\}/g;
	let match: RegExpExecArray | null = phRegex.exec(pattern);
	while (match !== null) {
		const name = match[1] as string;
		if (!placeholderNames.includes(name)) placeholderNames.push(name);
		match = phRegex.exec(pattern);
	}

	// Phase 1: group by lang ('__nolan__' = language-agnostic)
	const langGroups = new Map<string, ParserItem[]>();
	for (const item of items) {
		const langKey = item.lang ?? '__nolan__';
		if (!langGroups.has(langKey)) langGroups.set(langKey, []);
		(langGroups.get(langKey) as ParserItem[]).push(item);
	}

	const allResults: ParserItem[] = [];

	for (const [langKey, langItems] of langGroups) {
		if (groupBySectionId) {
			// Sub-group by section_id preserving insertion order, format each
			// section independently, then join sections with records_separator.
			const sectionGroups = new Map<string, ParserItem[]>();
			const sectionOrder: string[] = [];
			for (const item of langItems) {
				const skey = item.section_id != null ? String(item.section_id) : '__no_section__';
				if (!sectionGroups.has(skey)) {
					sectionGroups.set(skey, []);
					sectionOrder.push(skey);
				}
				(sectionGroups.get(skey) as ParserItem[]).push(item);
			}

			const sectionStrings: string[] = [];
			for (const skey of sectionOrder) {
				const { idMap, maxLen } = buildIdMap(sectionGroups.get(skey) as ParserItem[]);

				const sectionParts: string[] = [];
				for (let i = 0; i < maxLen; i++) {
					const resultStr = replace(pattern, zipRowValues(placeholderNames, idMap, i));
					if (resultStr) sectionParts.push(resultStr);
				}
				if (sectionParts.length > 0) {
					sectionStrings.push(sectionParts.join(fieldsSep));
				}
			}

			if (sectionStrings.length > 0) {
				const firstLangItem = langItems[0] as ParserItem;
				allResults.push({
					id: null,
					value: [sectionStrings.join(recordsSep)],
					tipo: firstLangItem.tipo,
					lang: langKey === '__nolan__' ? null : langKey,
					section_id: firstLangItem.section_id,
					section_tipo: firstLangItem.section_tipo,
				});
			}
		} else {
			// Standard mode: zip the whole lang group; one output item per row.
			const firstLangItem = langItems[0] as ParserItem;
			const { idMap, maxLen } = buildIdMap(langItems);

			for (let i = 0; i < maxLen; i++) {
				const resultStr = replace(pattern, zipRowValues(placeholderNames, idMap, i));
				if (resultStr) {
					allResults.push({
						id: null,
						value: [resultStr],
						tipo: firstLangItem.tipo,
						lang: langKey === '__nolan__' ? null : langKey,
						section_id: firstLangItem.section_id,
						section_tipo: firstLangItem.section_tipo,
					});
				}
			}
		}
	}

	return allResults.length > 0 ? allResults : null;
};

/** Collect values per source id (normalized to string|null lists) + max row count. */
function buildIdMap(items: ParserItem[]): {
	idMap: Map<string, (string | null)[]>;
	maxLen: number;
} {
	const idMap = new Map<string, (string | null)[]>();
	let maxLen = 1;
	for (const item of items) {
		if (item.id === null || item.id === undefined) continue;
		const key = String(item.id);
		const val = item.value;
		const newVals = Array.isArray(val)
			? val.map((v) => (v !== null && v !== undefined ? stringifyValue(v) : null))
			: [val !== null && val !== undefined ? stringifyValue(val) : null];

		if (idMap.has(key)) {
			(idMap.get(key) as (string | null)[]).push(...newVals);
		} else {
			idMap.set(key, newVals);
		}
		maxLen = Math.max(maxLen, (idMap.get(key) as (string | null)[]).length);
	}
	return { idMap, maxLen };
}

/** Row i values in placeholder order: single-element lists broadcast, others positional. */
function zipRowValues(
	placeholderNames: string[],
	idMap: Map<string, (string | null)[]>,
	i: number,
): (string | null)[] {
	return placeholderNames.map((name) => {
		const mapped = idMap.get(name);
		if (!mapped) return null;
		return mapped.length === 1 ? (mapped[0] ?? null) : (mapped[i] ?? null);
	});
}

// ---------------------------------------------------------------------------
// map_value — dictionary substitution
// ---------------------------------------------------------------------------

/**
 * Maps each item's value through an options dictionary, shape
 * map: [{ [id]: { [rawValue]: mappedValue } }] — an id-scoped mapping wins,
 * otherwise the first mapping containing the raw value applies; unmapped
 * values pass through unchanged. Without a usable map → default_join.
 */
export const mapValue: ItemParserFn = (items, options, ctx) => {
	if (!items || items.length === 0) return null;

	const mapOptions = options.map as Record<string, Record<string, string>>[] | undefined;
	if (!mapOptions || !Array.isArray(mapOptions)) {
		return defaultJoin(items, options, ctx);
	}

	const result: ParserItem[] = [];

	for (const item of items) {
		const originalVal = stringifyValue(item.value);
		let mappedVal: string | null = null;

		for (const m of mapOptions) {
			// id-scoped mapping first (map key matches item.id)
			const idMapping = item.id !== null && item.id !== undefined ? m[String(item.id)] : undefined;
			if (idMapping && idMapping[originalVal] !== undefined) {
				mappedVal = idMapping[originalVal] as string;
				break;
			}
			// generic fallback: first mapping that knows the raw value
			for (const mapKey in m) {
				const mapping = m[mapKey];
				if (mapping && mapping[originalVal] !== undefined) {
					mappedVal = mapping[originalVal] as string;
					break;
				}
			}
			if (mappedVal !== null) break;
		}

		result.push({ ...item, value: mappedVal !== null ? mappedVal : originalVal });
	}

	return result.length > 0 ? result : null;
};

// ---------------------------------------------------------------------------
// v5_html — legacy <br> normalization for CKEditor/TinyMCE HTML
// ---------------------------------------------------------------------------

/**
 * Opt-in v5 normalization of already-entity-decoded editor HTML: empty
 * paragraphs removed, <p>…</p> converted to <br> flow, boundary <br> and
 * &nbsp; trimmed. Fans out over ALL items preserving each item's lang (a
 * multi-lang column must not collapse to the first language's value) and
 * keeps item.id so it can be chained before an id-referencing parser.
 */
export const v5Html: ItemParserFn = (items) => {
	if (!items || items.length === 0) return null;

	const out: ParserItem[] = [];
	for (const item of items) {
		const raw = item.value;
		if (raw === null || raw === undefined) continue;

		const value = cleanV5Html(String(raw));
		if (!value) continue;

		out.push({
			id: item.id ?? null,
			value,
			tipo: item.tipo,
			lang: item.lang,
			section_id: item.section_id,
			section_tipo: item.section_tipo,
		});
	}

	return out.length > 0 ? out : null;
};

/** The 8-step v5 HTML normalization (oracle parser_text.ts:460-494). */
function cleanV5Html(input: string): string {
	let value = input;

	if (!value || value.trim() === '') return '';

	// Remove empty paragraphs
	if (value === '<p></p>' || value === '<p> </p>') {
		value = '';
	}

	// <p> / <p style="…"> → <br>, strip </p>
	value = value.replace(/<p( style="[^"]*")?>/gi, '<br>');
	value = value.replace(/<\/p>/gi, '');

	// Remove one leading and one trailing <br /> / <br>
	if (value.startsWith('<br />')) value = value.slice('<br />'.length);
	else if (value.startsWith('<br>')) value = value.slice('<br>'.length);
	if (value.endsWith('<br />')) value = value.slice(0, -'<br />'.length);
	else if (value.endsWith('<br>')) value = value.slice(0, -'<br>'.length);

	// Trim boundary &nbsp; and whitespace
	return value.replace(/^&nbsp;|&nbsp;$/g, '').trim();
}
