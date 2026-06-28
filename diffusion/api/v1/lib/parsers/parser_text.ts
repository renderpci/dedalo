/**
 * PARSER_TEXT
 * Process diffusion object text values.
 * Port of PHP class.parser_text.php
 *
 * Provides text joining and pattern-based formatting for diffusion data.
 */

import { merge, replace }      from './parser_helper';
import type { parser_options, data_item } from '../types';




/**
 * DEFAULT_JOIN
 * Alias for `parser_helper::merge` with merge:"string".
 * Collapses all data items into a single scalar string per lang.
 *
 * @param data    - Array of data items
 * @param options - { records_separator?: string, fields_separator?: string }
 * @returns Single data_item with joined string value, wrapped in array
 */
export function default_join(data: data_item[] | null, options: parser_options): any {
	return merge(data, { ...options, merge: 'string' });
}


/**
 * JOIN_ITEMS_TO_STRING
 * Helper to join data items into a single string.
 */
export function join_items_to_string(data: data_item[] | null, options: parser_options): string | null {
	if (!data || data.length === 0) return null;

	const records_separator = options.records_separator ?? ' | ';
	const fields_separator  = options.fields_separator  ?? ', ';

	const parts: string[] = [];

	for (const item of data) {
		const val = item.value;
		if (val === null || val === undefined) continue;

		if (Array.isArray(val)) {
			const joined = val
				.filter((v: unknown) => v !== null && v !== undefined && v !== '')
				.map((v: unknown) => stringify_value(v))
				.join(fields_separator);
			if (joined) parts.push(joined);
		} else {
			const str = stringify_value(val);
			if (str) parts.push(str);
		}
	}

	if (parts.length === 0) return null;

	return parts.join(records_separator);
}



/**
 * TEXT_FORMAT
 * Generic text pattern processor.
 *
 * Applies a pattern template (e.g. "${a}, ${b} / ${c}") to data items keyed by
 * their `id` property.  The processor works in three phases:
 *
 * 1. **Lang grouping** — Items are first grouped by their `lang` property so
 *    that each language receives its own independent formatting pass.  This
 *    preserves per-language values (e.g. lg-spa having four entries while
 *    lg-eng has only one) and prevents cross-language contamination.
 *
 * 2. **Value zipping** — Within each lang group, values are collected into an
 *    `id_map` keyed by the item `id`.  When multiple items share the same id
 *    they are appended to the same array.  The processor then iterates over
 *    the longest array (max_len) and builds one result per zip-row:
 *    - Single-element arrays are repeated across all rows (broadcast).
 *    - Multi-element arrays are consumed positionally (row 0 gets index 0, etc.).
 *
 * 3. **Pattern replacement** — For each zip-row the placeholder names from the
 *    pattern are resolved to their positional values and passed to the
 *    `replace()` helper, which handles empty/null cleanup.
 *
 * ---
 *
 * **Standard mode** (default, `group_by_section_id` absent or false):
 * All items within a lang group are zipped together regardless of their
 * `section_id`.  This produces one output data_item per zip-row.  Downstream
 * merge steps (explicit or the executor's auto-completion) are responsible
 * for joining multiple rows into a final string.
 *
 * **Section-grouped mode** (`group_by_section_id: true`):
 * After lang grouping, items are further sub-grouped by `section_id`.  The
 * value zipping and pattern replacement happen independently within each
 * section.  Section-level results are then joined using `fields_separator`
 * (between multiple zip-rows of the same section) and `records_separator`
 * (between different sections).  This produces exactly one output data_item
 * per lang with all section content already collapsed into a single string.
 *
 * This mode is useful when a single field references multiple ontology
 * records (e.g. iconography with several section_ids) and you need each
 * record's values formatted as a coherent group rather than a flat list.
 *
 * ---
 *
 * @param data    - Array of data items with `id` and `value`
 * @param options - Configuration object:
 *   - pattern: string — Template with ${id} placeholders (required).
 *   - group_by_section_id: boolean — When true, sub-group by section_id
 *     before zipping.  Section results are joined with records_separator.
 *   - fields_separator: string — Separator between multiple zip-rows within
 *     the same section (default: ", ").  Only used with group_by_section_id.
 *   - records_separator: string — Separator between different sections
 *     (default: " | ").  Only used with group_by_section_id.
 * @returns data_item[] where each value is string[], or null
 *
 * @example
 *   // Standard mode — multi-field zip
 *   text_format(
 *     [{id:'a',value:['Ana','Ger']},{id:'b',value:['Hero','Del']}],
 *     {pattern:'${a} ${b}'}
 *   )
 *   // → [{value:['Ana Hero']}, {value:['Ger Del']}]
 *
 *   // Standard mode — single-field with literal prefix
 *   text_format([{id:'a',value:'spa'}], {pattern:'lg-${a}'})
 *   // → [{value:['lg-spa']}]
 *
 *   // Section-grouped mode — two sections with one field
 *   text_format(
 *     [
 *       {id:'a',value:'Cabeza', section_id:'1'},
 *       {id:'a',value:'izquierda', section_id:'1'},
 *       {id:'a',value:'Diadema', section_id:'1125'}
 *     ],
 *     {pattern:'${a}', group_by_section_id:true, fields_separator:', ', records_separator:' | '}
 *   )
 *   // → [{value:['Cabeza, izquierda | Diadema']}]
 */
export function text_format(data: data_item[] | null, options: parser_options): any {

	// Early return for empty input
	if (!data || data.length === 0) return null;

	// Extract pattern; fall back to default_join when no pattern is defined
	const pattern = options.pattern;
	if (!pattern) {
		return default_join(data, options);
	}

	// Section-grouping mode: when true, items are sub-grouped by section_id
	// before the zip pass so each section produces an independent formatted
	// string.  Sections are then joined with records_separator.
	const group_by_section_id = options.group_by_section_id === true;

	// Separators used only in section-grouped mode:
	//   fields_separator  — joins multiple zip-rows within the same section
	//   records_separator — joins different sections together
	const fields_separator  = (options.fields_separator as string)  ?? ', ';
	const records_separator = (options.records_separator as string) ?? ' | ';

	// Extract unique placeholder names from the pattern in order of appearance.
	// These names correspond to the `id` property of data items and determine
	// which values are collected and in what order they are substituted.
	const placeholder_regex = /\$\{([a-zA-Z0-9_]+)\}/g;
	const placeholder_names: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = placeholder_regex.exec(pattern)) !== null) {
		if (!placeholder_names.includes(match[1])) {
			placeholder_names.push(match[1]);
		}
	}

	// Phase 1: Group items by lang so each language gets its own zip pass.
	// Items without a lang are placed in the '__nolan__' bucket (language-agnostic).
	const lang_groups = new Map<string, data_item[]>();
	for (const item of data) {
		const lang_key = item.lang ?? '__nolan__';
		if (!lang_groups.has(lang_key)) lang_groups.set(lang_key, []);
		lang_groups.get(lang_key)!.push(item);
	}

	const all_results: any[] = [];

	// Phase 2 & 3: Process each language group independently
	for (const [lang_key, lang_items] of lang_groups) {

		if (group_by_section_id) {
			// Sub-group items by section_id, preserving insertion order.
			// This ensures that when a field references multiple ontology records
			// (each with a distinct section_id), each record is formatted as a
			// coherent group rather than being mixed with other records.
			const section_groups = new Map<string, data_item[]>();
			const section_order: string[] = [];
			for (const item of lang_items) {
				const skey = (item.section_id != null) ? String(item.section_id) : '__no_section__';
				if (!section_groups.has(skey)) {
					section_groups.set(skey, []);
					section_order.push(skey);
				}
				section_groups.get(skey)!.push(item);
			}

			// Process each section independently and collect its formatted string
			const section_strings: string[] = [];
			for (const skey of section_order) {
				const section_items = section_groups.get(skey)!;

				// Build id_map: collect all values per placeholder id within this section
				const id_map = new Map<string, any[]>();
				let max_len = 1;
				for (const item of section_items) {
					if (item.id) {
						const val = item.value;
						// Normalize values to string arrays for consistent zip behavior
						const new_vals = Array.isArray(val)
							? val.map(v => v !== null && v !== undefined ? stringify_value(v) : null)
							: [val !== null && val !== undefined ? stringify_value(val) : null];

						if (id_map.has(item.id)) {
							id_map.get(item.id)!.push(...new_vals);
						} else {
							id_map.set(item.id, new_vals);
						}
						max_len = Math.max(max_len, id_map.get(item.id)!.length);
					}
				}

				// Zip pass: build one formatted string per row, then join with fields_separator
				const section_parts: string[] = [];
				for (let i = 0; i < max_len; i++) {
					const values = placeholder_names.map(name => {
						const mapped = id_map.get(name);
						if (!mapped) return null;
						// Single-element values are broadcast across all rows;
						// multi-element values are consumed positionally
						return mapped.length === 1 ? mapped[0] : (mapped[i] ?? null);
					});

					const result_str = replace(pattern, values);
					if (result_str) section_parts.push(result_str);
				}

				// Join all zip-rows of this section with fields_separator
				if (section_parts.length > 0) {
					section_strings.push(section_parts.join(fields_separator));
				}
			}

			// Join all sections with records_separator → one output item per lang
			if (section_strings.length > 0) {
				all_results.push({
					id:    null,
					value: [section_strings.join(records_separator)],
					tipo:  lang_items[0].tipo,
					lang:  lang_key === '__nolan__' ? null : lang_key,
					section_id:   lang_items[0].section_id,
					section_tipo: lang_items[0].section_tipo,
				});
			}

		} else {
			// Standard mode: all items in the lang group are zipped together
			// regardless of section_id.  Produces one output per zip-row.

			// Build id_map: collect all values per placeholder id across the entire lang group
			const id_map = new Map<string, any[]>();
			let max_len = 1;

			for (const item of lang_items) {
				if (item.id) {
					const val = item.value;
					let new_vals: any[] = [];

					if (Array.isArray(val)) {
						new_vals = val.map(v => v !== null && v !== undefined ? stringify_value(v) : null);
					} else {
						new_vals = [val !== null && val !== undefined ? stringify_value(val) : null];
					}

					if (id_map.has(item.id)) {
						id_map.get(item.id)!.push(...new_vals);
					} else {
						id_map.set(item.id, new_vals);
					}
					max_len = Math.max(max_len, id_map.get(item.id)!.length);
				}
			}

			// One result per zip row. Always apply pattern replacement and wrap the
			// result string in a single-element array so the shape is uniform regardless
			// of placeholder count. Downstream merge (explicit or auto) handles joining.
			for (let i = 0; i < max_len; i++) {
				const values = placeholder_names.map(name => {
					const mapped = id_map.get(name);
					if (!mapped) return null;
					// Single-element values are broadcast across all rows;
					// multi-element values are consumed positionally
					return mapped.length === 1 ? mapped[0] : (mapped[i] ?? null);
				});

				const result_str = replace(pattern, values);
				if (result_str) {
					all_results.push({
						id:    null,
						value: [result_str],
						tipo:  lang_items[0].tipo,
						lang:  lang_key === '__nolan__' ? null : lang_key,
						section_id:   lang_items[0].section_id,
						section_tipo: lang_items[0].section_tipo,
					});
				}
			}
		}
	}

	return all_results.length > 0 ? all_results : null;
}




/**
 * STRINGIFY_VALUE
 * Converts any value to a string representation.
 */
function stringify_value(val: unknown): string {
	if (typeof val === 'string') return val;
	if (typeof val === 'number') return String(val);
	if (typeof val === 'boolean') return val ? 'true' : 'false';
	if (Array.isArray(val)) {
		return val.map(v => stringify_value(v)).join(', ');
	}
	if (typeof val === 'object' && val !== null) {
		return JSON.stringify(val);
	}
	return '';
}



/**
 * MAP_VALUE
 * Maps values based on a provided dictionary.
 *
 * @param data    - Array of data items
 * @param options - { map: [{ [id]: { [key]: value } }] }
 * @returns Mapped data item values or null
 */
export function map_value(data: data_item[] | null, options: parser_options): any {

	if (!data || data.length === 0) return null;

	const map_options = options.map as Record<string, Record<string, string>>[] | undefined;
	
	if (!map_options || !Array.isArray(map_options)) {
		return default_join(data, options);
	}
	
	// Flatten the map array into a single lookup object for easier access
	// The structure in options is usually: "map": [{"a": {"1": "yes", "2": "no"}}]
	
	const result: data_item[] = [];

	for (const item of data) {
		const original_val = stringify_value(item.value);
		let mapped_val: string | null = null;

		// Try to find a map that applies
		for (const m of map_options) {
			// Check if map set key matches item.id (if item.id is present)
			if (item.id && m[item.id]) {
				const mapping = m[item.id];
				if (mapping[original_val] !== undefined) {
					mapped_val = mapping[original_val];
					break;
				}
			}
			
			// Just use the first map found if generic or item.id is missing/unmatched
			for (const map_key in m) {
				const mapping = m[map_key];
				if (mapping[original_val] !== undefined) {
					mapped_val = mapping[original_val];
					break;
				}
			}
			if (mapped_val !== null) break;
		}

		result.push({
			...item,
			value: mapped_val !== null ? mapped_val : original_val
		});
	}

	return result.length > 0 ? result : null;
}



/**
 * V5_HTML
 * Cleans and normalises CKEditor/TinyMCE HTML for v5-compatible diffusion output.
 * Port of PHP component_text_area::get_diffusion_value (L1995-L2036).
 *
 * Processing pipeline (mirrors PHP logic exactly):
 *  1. Decode HTML entities on the raw string value.
 *  2. Return null when the result is empty.
 *  3. Remove empty paragraphs (`<p></p>` / `<p> </p>`).
 *  4. Convert `<p>` and `<p style="…">` opening tags → `<br>`.
 *  5. Strip all `</p>` closing tags.
 *  6. Remove a leading `<br />` or `<br>`.
 *  7. Remove a trailing `<br />` or `<br>`.
 *  8. Trim leading/trailing `&nbsp;` and whitespace.
 *
 * @param data    - Array of data items; only the first item's value is processed.
 * @param options - Standard parser options (unused but kept for interface consistency).
 * @returns Cleaned string wrapped in a data_item array, or null.
 */
export function v5_html(data: data_item[] | null, options: parser_options): any {

	if (!data || data.length === 0) return null;

	// Fan out over ALL items, preserving each item's lang. When this column also
	// carries `columns` metadata, the processor passes every language entry at once;
	// returning only data[0] would collapse every language to the first one's value
	// (e.g. lg-spa showing the Catalan text). One cleaned item per input item lets the
	// per-lang expansion pick the correct value for each language.
	const out: any[] = [];
	for (const item of data) {

		const raw = item.value;
		if (raw === null || raw === undefined) continue;

		// Entity decoding is NOT done here: the PHP side (component_text_area::get_diffusion_data
		// → html_entity_decode, the complete server-side decoder) already decoded every entity
		// before the dump. This parser is the OPT-IN v5 (legacy <br>) normalization layer.
		const value = clean_v5_html(String(raw));
		if (!value) continue;

		// Preserve item.id so v5_html can be CHAINED before another parser that references
		// the ddo id (e.g. [v5_html, text_format] with pattern "${a}" on the design columns).
		out.push({ id: item.id ?? null, value, tipo: item.tipo, lang: item.lang });
	}

	return out.length > 0 ? out : null;
}


/**
 * CLEAN_V5_HTML
 * The 8-step v5 HTML normalization applied to a single decoded string.
 * Entity decoding itself stays in PHP (component_text_area::get_diffusion_data uses
 * html_entity_decode — the complete server-side decoder); this only normalizes markup.
 */
function clean_v5_html(value: string): string {

	// 2. Empty guard
	if (!value || value.trim() === '') return '';

	// 3. Remove empty paragraphs
	if (value === '<p></p>' || value === '<p> </p>') {
		value = '';
	}

	// 4. Convert <p> / <p style="…"> → <br>
	value = value.replace(/<p( style="[^"]*")?>/gi, '<br>');

	// 5. Strip </p>
	value = value.replace(/<\/p>/gi, '');

	// 6. Remove leading <br /> or <br>
	if (value.startsWith('<br />')) {
		value = value.slice('<br />'.length);
	} else if (value.startsWith('<br>')) {
		value = value.slice('<br>'.length);
	}

	// 7. Remove trailing <br /> or <br>
	if (value.endsWith('<br />')) {
		value = value.slice(0, -'<br />'.length);
	} else if (value.endsWith('<br>')) {
		value = value.slice(0, -'<br>'.length);
	}

	// 8. Trim &nbsp; at boundaries and surrounding whitespace
	value = value.replace(/^&nbsp;|&nbsp;$/g, '').trim();

	return value;
}
