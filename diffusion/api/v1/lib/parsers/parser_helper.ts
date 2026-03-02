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
