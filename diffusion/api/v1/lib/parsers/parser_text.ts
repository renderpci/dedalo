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
 * @returns Formatted string or null
 *
 * @example
 *   const data = [
 *     { id: 'firstName', value: 'John' },
 *     { id: 'lastName',  value: 'Doe' },
 *     { id: 'city',      value: 'London' }
 *   ];
 *   const options = { pattern: '${firstName} ${lastName} from ${city}' };
 *   text_format(data, options);
 *   // Returns: "John Doe from London"
 */
export function text_format(data: data_item[] | null, options: parser_options): string | null {

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

	const result = replace(pattern, values);

	return result || null;
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
