/**
 * PARSER_TEXT
 * Process diffusion object text values.
 * Port of PHP class.parser_text.php
 *
 * Provides text joining and pattern-based formatting for diffusion data.
 */

import { replace }           from './pattern_replacer';
import type { parser_options } from '../types';



/**
 * Data item as received from the PHP diffusion_api entries.
 * Each item may have an `id` (for pattern references) and a `value`.
 */
interface data_item {
	id?:    string | null;
	value:  unknown;
	tipo?:  string;
	lang?:  string | null;
}



/**
 * DEFAULT_JOIN
 * Creates a generic separator-concatenated string with all values.
 * Used as the default parser when no parser is configured in the ontology.
 *
 * @param data    - Array of data items from the PHP response entries
 * @param options - { records_separator?: string, fields_separator?: string }
 * @returns Concatenated string or null if no data
 */
/**
 * DEFAULT_JOIN
 * Creates a generic separator-concatenated string with all values.
 * Used as the default parser when no parser is configured in the ontology.
 *
 * @param data    - Array of data items from the PHP response entries
 * @param options - { records_separator?: string, fields_separator?: string }
 * @returns Concatenated string wrapped in a data_item
 */
export function default_join(data: data_item[] | null, options: parser_options): any {

	if (!data || data.length === 0) return null;

	const str = join_items_to_string(data, options);
	if (str === null) return null;

	return [{
		id:    null,
		value: str,
		tipo:  data[0].tipo,
		lang:  data[0].lang
	}];
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
 * Processes an array of structured data objects and formats them
 * according to a specified pattern template using ${id} placeholders.
 *
 * @param data    - Array of data items with `id` and `value`
 * @param options - { pattern: string }
 * @returns Formatted string wrapped in data_item or null
 *
 * @example
 *   const data = [
 *     { id: 'firstName', value: 'John' },
 *     { id: 'lastName',  value: 'Doe' },
 *     { id: 'city',      value: 'London' }
 *   ];
 *   const options = { pattern: '${firstName} ${lastName} from ${city}' };
 *   text_format(data, options);
 *   // Returns: [{ value: "John Doe from London", ... }]
 */
export function text_format(data: data_item[] | null, options: parser_options): any {

	if (!data || data.length === 0) return null;

	const pattern = options.pattern;
	if (!pattern) {
		// No pattern defined — fall back to default_join
		return default_join(data, options);
	}

	// Extract placeholder names from pattern to determine order
	const placeholder_regex = /\$\{([a-zA-Z0-9_]+)\}/g;
	const placeholder_names: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = placeholder_regex.exec(pattern)) !== null) {
		if (!placeholder_names.includes(match[1])) {
			placeholder_names.push(match[1]);
		}
	}

	// Build values array in placeholder order, supporting parallel loops (zipping arrays of equal/variadic length)
	const id_map = new Map<string, any[]>();
	let max_len = 1;
	let source_was_array = false;

	for (const item of data) {
		if (item.id) {
			const val = item.value;
			if (Array.isArray(val)) {
				source_was_array = true;
				max_len = Math.max(max_len, val.length);
				id_map.set(item.id, val.map(v => v !== null && v !== undefined ? stringify_value(v) : null));
			} else {
				id_map.set(item.id, [val !== null && val !== undefined ? stringify_value(val) : null]);
			}
		}
	}

	const zipped_results: string[] = [];

	for (let i = 0; i < max_len; i++) {
		const values = placeholder_names.map(name => {
			const mapped = id_map.get(name);
			if (!mapped) return null;
			// If array has only 1 element, repeat it; otherwise zip sequence
			return mapped.length === 1 ? mapped[0] : (mapped[i] ?? null);
		});

		const result_str = replace(pattern, values);
		if (result_str) {
			zipped_results.push(result_str);
		}
	}

	if (zipped_results.length === 0) return null;

	// Output primitive or object wrapper based on original data type
	return [{
		id:    null,
		value: source_was_array ? zipped_results : zipped_results[0],
		tipo:  data[0].tipo,
		lang:  data[0].lang
	}];
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

	const first = data[0];
	const raw   = first.value;

	if (raw === null || raw === undefined) return null;

	// 1. Decode HTML entities (mirrors PHP html_entity_decode)
	let value = decode_html_entities(String(raw));

	// 2. Empty guard
	if (!value || value.trim() === '') return null;

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

	if (!value) return null;

	return [{
		id:    null,
		value: value,
		tipo:  first.tipo,
		lang:  first.lang
	}];
}


/**
 * DECODE_HTML_ENTITIES
 * Converts common HTML entities to their character equivalents.
 * Mirrors PHP html_entity_decode behaviour for the subset used in diffusion text.
 */
function decode_html_entities(str: string): string {
	return str
		.replace(/&amp;/g,   '&')
		.replace(/&lt;/g,    '<')
		.replace(/&gt;/g,    '>')
		.replace(/&quot;/g,  '"')
		.replace(/&#039;/g,  "'")
		.replace(/&apos;/g,  "'")
		.replace(/&nbsp;/g,  '\u00a0');
}
