/**
 * PARSER_HELPER
 * Shared helper functions for parsers.
 */

import type { data_item, parser_options } from '../types';



/**
 * GET_FIRST
 * Returns the first data item from the list.
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @returns Array containing only the first data item
 */
export function get_first(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;
	const result: data_item[] = [];

	for (const item of data) {
		const val = item.value;
		const final_val = (Array.isArray(val) && val.length > 0) 
            ? val[0] 
            : val;
		result.push({
			...item,
			value: final_val
		});
	}

	return result.length > 0 ? result : null;
}

/**
 * COUNT
 * Count total values.
 * 
 * @param data    - Array of data items
 * @param options - Parser options
 * @returns Total count packaged as a data_item value within an array
 */
export function count(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;
	let  count_val = 0;

	for (const item of data) {
		const value = item.value;
		count_val += Array.isArray(value) ? value.length : 0;
	}

	return [{
		...data[0],
		value: count_val
	}];
}

/**
 * MERGE
 * Unifies the parent chains according to the options.merge style mapping.
 * 
 * @param data    - Array of data items
 * @param options - Parser options
 * @param options.merge - Strategy for flattening or structuring collections.
 * 	- undefined: 	["Madrid", "Spain", "Paris", "France"]
 * 	- string: 		"Madrid - Spain, Paris - France" // use the fields_separator to separate the values and the records_separator to separate the pipe
 * 	- nested: 		[["Madrid", "Spain"], ["Paris", "France"]]
 * 	- flat: 		["Madrid - Spain", "Paris - France"] // use the fields_separator to separate the values
 * 	- pipe: 		["Madrid", "Spain"] | ["Paris", "France"] // use the records_separator to separate the pipe
 *  - unique:		["Madrid", "Spain", "Paris", "France"] (with duplicates removed)
 * @returns Formatted array
 */
export function merge(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const merge_style      = options?.merge as string | undefined;
	const fields_separator = (options?.fields_separator as string) ?? ', ';
	const records_separator = (options?.records_separator as string) ?? ' | ';

	// Aggregate scalar values from all items, grouped by lang
	// This mirrors the approach in parser_locator::parents so that subsequent
	// merge strategies act on the full collection, not item-by-item.
	const lang_nodes: Record<string, { values: any[], ref_item: data_item }> = {};

	for (const item of data) {
		const lang_key = item.lang ?? '__nolan__';

		if (!lang_nodes[lang_key]) {
			lang_nodes[lang_key] = { values: [], ref_item: item };
		}

		const val = item.value;
		if (Array.isArray(val)) {
			// Push the array as a single unit (chain) so merge styles can operate on it.
			// default case uses flat(Infinity) to unpack when needed.
			lang_nodes[lang_key].values.push(val);
		} else if (val !== null && val !== undefined) {
			lang_nodes[lang_key].values.push(val);
		}
	}

	const result: data_item[] = [];

	for (const [lang_key, bucket] of Object.entries(lang_nodes)) {
		const collection = bucket.values;
		if (collection.length === 0) continue;

		let final_value: any;

		switch (merge_style) {
			case 'nested':
				// Return as-is nested structure
				final_value = collection.map(v => Array.isArray(v) ? v : [v]);
				break;

			case 'flat':
				// Each inner array joined by fields_separator, flat strings kept as-is
				final_value = collection.map(v => Array.isArray(v) ? v.join(fields_separator) : String(v));
				break;

			case 'pipe':
				// All items joined by records_separator
				final_value = collection.map(v => Array.isArray(v) ? JSON.stringify(v) : String(v)).join(records_separator);
				break;

			case 'string':
				// All items joined into a single string
				final_value = collection.map(v => Array.isArray(v) ? v.join(fields_separator) : String(v)).join(records_separator);
				break;

			case 'unique':
				// Deduplicate flat list
				final_value = [...new Set(collection.flat(Infinity))];
				break;

			default:
				// Default: flat array (same as undefined merge)
				final_value = collection.flat(Infinity);
				break;
		}

		result.push({
			...bucket.ref_item,
			lang: lang_key === '__nolan__' ? null : lang_key,
			value: final_value
		});
	}

	return result.length > 0 ? result : null;
}

/**
 * PATTERN_REPLACER
 * Advanced pattern replacement with empty value handling.
 * Port of PHP class.pattern_replacer.php
 *
 * Replaces ${a}, ${b}, etc. placeholders in a pattern string with provided values.
 * Gracefully handles empty or null values by cleaning up surrounding punctuation.
 */

const EMPTY_MARKER = '\x00EMPTY\x00';



/**
 * REPLACE
 * Replaces placeholders in a pattern string with provided values.
 * Uses a two-phase approach:
 *   1. Replace all placeholders, marking empty values with a temporary marker
 *   2. Clean up formatting around removed content
 *
 * @param pattern - Pattern string with ${variable} placeholders
 * @param values  - Array of values to substitute (positional: a=0, b=1, ...)
 * @returns Processed string with proper formatting
 *
 * @example
 *   replace('${a}, ${b}, ${c} /${d}', ['Juan', 'Perez', null, '2025'])
 *   // Returns: 'Juan, Perez /2025'
 */
export function replace(pattern: string, values: (string | null | undefined)[]): string {

	if (!pattern) return '';

	// Phase 1: Replace all placeholders
	// Build a map: a→0, b→1, c→2, ...
	let result = pattern;
	const placeholder_regex = /\$\{([a-zA-Z0-9_]+)\}/g;

	// Collect all placeholder names in order
	const placeholder_names: string[] = [];
	let match: RegExpExecArray | null;
	const regex_copy = new RegExp(placeholder_regex.source, placeholder_regex.flags);
	while ((match = regex_copy.exec(pattern)) !== null) {
		if (!placeholder_names.includes(match[1])) {
			placeholder_names.push(match[1]);
		}
	}

	// Replace each placeholder with its value or the empty marker
	for (let i = 0; i < placeholder_names.length; i++) {
		const name     = placeholder_names[i];
		const value    = values[i];
		const is_empty = value === null || value === undefined || value === '';
		const safe_name = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const ph_regex = new RegExp(`\\$\\{${safe_name}\\}`, 'g');
		result = result.replace(ph_regex, is_empty ? EMPTY_MARKER : String(value));
	}

	// Phase 2: Cleanup formatting
	result = cleanup_formatting(result);

	return result;
}



/**
 * CLEANUP_FORMATTING
 * Cleans up text formatting by removing empty value markers and fixing punctuation/spacing.
 *
 * @param text - Text containing empty markers
 * @returns Cleaned text
 */
export function cleanup_formatting(text: string): string {

	let result = text;

	// Remove marker with surrounding comma/separator patterns
	// Pattern: ", EMPTY" or "EMPTY, "
	result = result.replace(new RegExp(`\\s*,\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*,\\s*`, 'g'), '');

	// Pattern: " - EMPTY" or "EMPTY - "
	result = result.replace(new RegExp(`\\s*-\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*-\\s*`, 'g'), '');

	// Pattern: " / EMPTY" or "EMPTY / "
	result = result.replace(new RegExp(`\\s*/\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*/\\s*`, 'g'), '');

	// Pattern: " / EMPTY" or "EMPTY / "
	result = result.replace(new RegExp(`\\s*\\/\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*\\/\\s*`, 'g'), '');

	// Pattern: " | EMPTY" or "EMPTY | "
	result = result.replace(new RegExp(`\\s*\\|\\s*${esc(EMPTY_MARKER)}`, 'g'), '');
	result = result.replace(new RegExp(`${esc(EMPTY_MARKER)}\\s*\\|\\s*`, 'g'), '');

	// Remove any remaining markers
	result = result.replace(new RegExp(esc(EMPTY_MARKER), 'g'), '');

	// Cleanup: multiple spaces → single space
	result = result.replace(/\s{2,}/g, ' ');

	// Cleanup: trailing/leading punctuation with spaces
	result = result.replace(/^\s*[,\-/|]\s*/, '');
	result = result.replace(/\s*[,\-/|]\s*$/, '');

	return result.trim();
}



/**
 * Escape a string for use in a RegExp
 */
function esc(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
