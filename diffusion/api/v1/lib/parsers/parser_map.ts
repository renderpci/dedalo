/**
 * PARSER_MAP
 * Resolves diffusion data items against a custom map template.
 *
 * Provides:
 *   - `custom`: Builds a JSON array of objects by grouping data_items by
 *     (section_id, section_tipo) and interpolating ${id} placeholders in a
 *     map template. Designed for relation_list diffusion output.
 */

import type { data_item, parser_options } from '../types';



/**
 * CUSTOM
 * Applies a custom object map template to resolved data items.
 *
 * Real input shape: each data_item has `id` (letter), `value`, and the
 * metadata properties `section_id` and `section_tipo` injected by the PHP
 * chain processor directly on the item object.
 *
 * Algorithm:
 *   1. Group all data_items by their (section_id, section_tipo) pair.
 *   2. For each group, build an id→value lookup.
 *   3. Find the matching map template row for the group's section_tipo.
 *   4. Interpolate all ${id} placeholders in the template using the lookup.
 *   5. Always inject section_id and section_tipo into the resolved object.
 *   6. Return a single data_item whose value is the array of all resolved objects.
 *
 * The executor stores the result as a JSON array (output_format: "json").
 *
 * @param data    - data_item[] where each item has id, value, section_id, section_tipo
 * @param options - { map: Record<string,string>[] }
 * @returns Single data_item with value = resolved objects array, or null
 *
 * @example
 *   data = [
 *     { id: 'a', value: 'bbb',   section_id: '1', section_tipo: 'rsc205', tipo: 'rsc140', lang: 'lg-nolan' },
 *     { id: 'b', value: 'jo jo', section_id: '1', section_tipo: 'rsc205', tipo: 'rsc86',  lang: 'lg-nolan' },
 *     { id: 'c', value: 'la 11', section_id: '1', section_tipo: 'rsc205', tipo: 'rsc85',  lang: 'lg-nolan' },
 *   ]
 *   options.map = [{
 *     table: 'publications',
 *     title: '${a}',
 *     author: '${b}, ${c}',
 *     section_tipo: '${section_tipo}',
 *   }]
 *   // → [{ value: [
 *   //       { section_id:'1', section_tipo:'rsc205', table:'publications',
 *   //         title:'bbb', author:'jo jo, la 11' }
 *   //     ] }]
 */
export function custom(data: data_item[] | null, options: parser_options): any {

	if (!data || data.length === 0) return null;

	const map_templates = options.map as Record<string, string>[] | undefined;
	if (!map_templates || !Array.isArray(map_templates) || map_templates.length === 0) return null;

	// ── 1. Group items by (section_id, section_tipo) ─────────────────────────
	// Each group represents one related record. Within each group, items are
	// keyed by their `id` letter (e.g. 'a', 'b', 'c').
	type group_key = string; // `${section_id}__${section_tipo}`
	const groups = new Map<group_key, { section_id: string; section_tipo: string; id_map: Map<string, string[]> }>();

	for (const item of data) {
		if (item.id === null || item.id === undefined) continue;

		const section_id   = String(item.section_id   ?? '');
		const section_tipo = String(item.section_tipo ?? '');
		const key: group_key = `${section_id}__${section_tipo}`;

		if (!groups.has(key)) {
			groups.set(key, { section_id, section_tipo, id_map: new Map() });
		}

		const group = groups.get(key)!;
		const raw   = item.value;
		// v6 resolves these values via get_locator_value which applies strip_tags(trim($value)),
		// so titles/authors with stray leading/trailing whitespace or HTML are normalized
		// (e.g. publication title " Las guerras..." → "Las guerras...").
		const str   = (raw !== null && raw !== undefined)
			? String(raw).replace(/<[^>]*>/g, '').trim()
			: '';
		// Collect each occurrence of an id as a SEPARATE list element so a template field
		// (e.g. author "${b}, ${c}") can be applied PER-INDEX (per author), pairing the
		// i-th surname with the i-th name — v6 emits "Gomez, Élian, Ugolini, Daniela", not
		// the concatenation "GomezUgolini, ÉlianDaniela".
		if (group.id_map.has(item.id)) {
			group.id_map.get(item.id)!.push(str);
		} else {
			group.id_map.set(item.id, [str]);
		}
	}

	if (groups.size === 0) return null;

	// ── 2. Interpolate helper ─────────────────────────────────────────────────
	// Per-index application: a template field is interpolated once per repetition index
	// (max list length among the ids it references); single-value ids repeat across indices,
	// multi-value ids advance by index. Index results are joined by ", " (v6 multi-author).
	const interpolate = (tmpl_value: string, id_map: Map<string, string[]>): string | null => {
		const ids_used = [...tmpl_value.matchAll(/\$\{([a-zA-Z0-9_]+)\}/g)].map(m => m[1]);
		// Literal template (no placeholders, e.g. table:"publications") → keep verbatim.
		if (ids_used.length === 0) return tmpl_value;
		let count = 1;
		for (const idn of ids_used) {
			const arr = id_map.get(idn);
			if (arr && arr.length > count) count = arr.length;
		}
		const parts: string[] = [];
		let any_value = false; // did ANY placeholder resolve to a non-empty value?
		for (let i = 0; i < count; i++) {
			parts.push(tmpl_value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, id_name: string) => {
				const arr = id_map.get(id_name);
				if (!arr || arr.length === 0) return '';
				const v = arr.length === 1 ? arr[0] : (arr[i] ?? '');
				if (v !== '') any_value = true;
				return v;
			}));
		}
		// All placeholders empty → the only chars left are template literals (e.g. ", ").
		// v6 emits null for such a field (a publication with no author), not ", ".
		if (!any_value) return null;
		return parts.join(', ');
	};

	// ── 3. Resolve each group against the map template ────────────────────────
	const resolved_rows: Record<string, string>[] = [];

	for (const { section_id, section_tipo, id_map } of groups.values()) {

		// Inject built-in ids so templates can reference them via ${section_id} etc.
		id_map.set('section_id',   [section_id]);
		id_map.set('section_tipo', [section_tipo]);

		// Find matching template: compare literal section_tipo or accept wildcard
		const template = map_templates.find(tmpl => {
			const t = tmpl['section_tipo'];
			if (!t || t === '${section_tipo}') return true; // wildcard or missing
			return t === section_tipo;
		});

		if (!template) continue;

		// Always start with section_tipo and section_id (v6 byte-order: section_tipo first)
		const resolved: Record<string, string | null> = { section_tipo, section_id };

		for (const [key, tmpl_value] of Object.entries(template)) {
			if (key === 'section_id' || key === 'section_tipo') continue; // already injected
			if (typeof tmpl_value !== 'string') {
				resolved[key] = String(tmpl_value);
				continue;
			}
			// null when no placeholder resolved to a value — v6 emits null for an empty
			// template field (e.g. a publication with no author), key present.
			resolved[key] = interpolate(tmpl_value, id_map);
		}

		resolved_rows.push(resolved);
	}

	if (resolved_rows.length === 0) return null;

	// ── 4. Emit a single data_item whose value is the full resolved array ─────
	return [{
		id:   null,
		value: resolved_rows,
		tipo: data[0].tipo,
		lang: data[0].lang ?? null,
	}];
}
