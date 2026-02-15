/**
 * PARSER_LOCATOR
 * Locate and extract specific data from diffusion objects.
 */

import type { parser_options } from '../types';

/**
 * Data item as received from the PHP diffusion_api entries.
 */
interface data_item {
	id?:    string | null;
	value:  unknown;
	tipo?:  string;
	lang?:  string | null;
}

/**
 * GET_SECTION_ID
 * Extracts the section_id from the data item value.
 * Assumes value is an object with a section_id property.
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @returns Array of data items with section_id as value
 */
export function get_section_id(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;
	const result: data_item[] = [];

	for (const item of data) {
		const val = item.value;
		const locators = Array.isArray(val) ? val : [val];

		const section_ids: any[] = []; 
		for (const locator of locators) {
			if (typeof locator === 'object' && locator !== null && 'section_id' in locator) {
				const current_section_id = (locator as any).section_id;
				if (current_section_id !== undefined && current_section_id !== null) {
					section_ids.push(current_section_id);
				}
			}
		}
        result.push({
            ...item,
            value: section_ids
        });
	}

	return result.length > 0 ? result : null;
}

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
