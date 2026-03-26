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
	const groups = new Map<group_key, { section_id: string; section_tipo: string; id_map: Map<string, string> }>();

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
		const str   = (raw !== null && raw !== undefined) ? String(raw) : '';
		// Concatenate if the same id appears multiple times within a group
		if (group.id_map.has(item.id)) {
			group.id_map.set(item.id, group.id_map.get(item.id)! + str);
		} else {
			group.id_map.set(item.id, str);
		}
	}

	if (groups.size === 0) return null;

	// ── 2. Interpolate helper ─────────────────────────────────────────────────
	const interpolate = (tmpl_value: string, id_map: Map<string, string>): string =>
		tmpl_value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, id_name: string) =>
			id_map.get(id_name) ?? ''
		);

	// ── 3. Resolve each group against the map template ────────────────────────
	const resolved_rows: Record<string, string>[] = [];

	for (const { section_id, section_tipo, id_map } of groups.values()) {

		// Inject built-in ids so templates can reference them via ${section_id} etc.
		id_map.set('section_id',   section_id);
		id_map.set('section_tipo', section_tipo);

		// Find matching template: compare literal section_tipo or accept wildcard
		const template = map_templates.find(tmpl => {
			const t = tmpl['section_tipo'];
			if (!t || t === '${section_tipo}') return true; // wildcard or missing
			return t === section_tipo;
		});

		if (!template) continue;

		// Always start with section_id and section_tipo
		const resolved: Record<string, string> = { section_id, section_tipo };

		for (const [key, tmpl_value] of Object.entries(template)) {
			if (key === 'section_id' || key === 'section_tipo') continue; // already injected
			if (typeof tmpl_value !== 'string') {
				resolved[key] = String(tmpl_value);
				continue;
			}
			const interpolated = interpolate(tmpl_value, id_map);
			if (interpolated !== '') resolved[key] = interpolated;
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
