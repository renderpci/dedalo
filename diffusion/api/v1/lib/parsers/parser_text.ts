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

	// Build a map of id → value
	// Extract placeholder names from pattern to determine order
	const placeholder_regex = /\$\{([a-zA-Z0-9_]+)\}/g;
	const placeholder_names: string[] = [];
	let match: RegExpExecArray | null;
	while ((match = placeholder_regex.exec(pattern)) !== null) {
		if (!placeholder_names.includes(match[1])) {
			placeholder_names.push(match[1]);
		}
	}

	// Build values array in placeholder order
	const id_map = new Map<string, string | null>();
	for (const item of data) {
		if (item.id) {
			const val = item.value;
			id_map.set(item.id, val !== null && val !== undefined ? stringify_value(val) : null);
		}
	}

	const values = placeholder_names.map(name => id_map.get(name) ?? null);

	const result_str = replace(pattern, values);

	if (!result_str) return null;

	return [{
		id:    null,
		value: result_str,
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
