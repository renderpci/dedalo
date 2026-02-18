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
 * GET_SECTION_TIPO
 * Extracts the section_tipo from the data item value.
 * Assumes value is an object with a section_tipo property.
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @returns Array of data items with section_tipo as value
 */
export function get_section_tipo(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;
	const result: data_item[] = [];

	for (const item of data) {
		const val = item.value;
		const locators = Array.isArray(val) ? val : [val];

		const section_tipos: any[] = []; 
		for (const locator of locators) {
			if (typeof locator === 'object' && locator !== null && 'section_tipo' in locator) {
				const current_section_tipo = (locator as any).section_tipo;
				if (current_section_tipo !== undefined && current_section_tipo !== null) {
					section_tipos.push(current_section_tipo);
				}
			}
		}
        result.push({
            ...item,
            value: section_tipos
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

/**
 * ADD_PARENTS
 * format output string with term and its parents: "Term, Parent 1, Parent 2..."
 * Returns one data_item per language found in the term chain.
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @returns Array of data items with formatted string as value, keyed by lang
 */
export function add_parents(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const result: data_item[] = [];

	for (const item of data) {

		// item has value (array of objects) and parents (map)
		const parents_map 	= (item as any).parents;
		const val 			= item.value;
		const values 		= Array.isArray(val) ? val : [val];
		
		// Map to collect strings by language: { 'lg-spa': ['Barcelona, Cataluña, España'], 'lg-eng': ['Barcelona, Catalonia, Spain'] }
		const lang_values: Record<string, string[]> = {};
		
		for(const current_val of values) {
			
			// val is locator object
			if(!current_val || typeof current_val !== 'object') continue;
			
			const section_tipo 	= (current_val as any).section_tipo;
			const section_id 	= (current_val as any).section_id;

			if(!section_tipo || !section_id) continue;

			const key = section_tipo + '_' + section_id;
			
			// Get parent chain for this item
			if(parents_map && parents_map[key]) {
				const chain = parents_map[key]; // Array of hierarchy objects [child, parent, grandparent...]
				
				if(Array.isArray(chain) && chain.length > 0) {
					
					// Collect all unique languages across the entire chain
					const all_langs = new Set<string>();
					
					for(const node of chain) {
						if(Array.isArray(node.term)) {
							for(const t of node.term) {
								if(t.lang) all_langs.add(t.lang);
							}
						}
					}
					
					if (all_langs.size === 0) continue;

					// Generate string for each language
					for (const lang of all_langs) {
						
						let final_str_parts: string[] = [];
						
						for (const node of chain) {
							let term_str = '';
							
							// Try to find exact match
							if(Array.isArray(node.term)) {
								const term_obj = node.term.find((t:any) => t.lang === lang);
								if(term_obj) {
									term_str = term_obj.value;
								} else {
									// Fallback: use first available (usually original language)
									if(node.term.length > 0) {
										term_str = node.term[0].value;
									}
								}
							}
							
							if(term_str) {
								final_str_parts.push(term_str);
							}
						}
						
						if (final_str_parts.length > 0) {
							const final_str = final_str_parts.join(', ');
							
							if (!lang_values[lang]) lang_values[lang] = [];
							lang_values[lang].push(final_str);
						}
					}
				}
			}
		}
		
		// Create result items from map
		for (const [lang, strs] of Object.entries(lang_values)) {
			result.push({
				...item,
				lang: lang,
				value: strs.join('; ')
			});
		}
	}

	return result.length > 0 ? result : null;
}


/**
 * Helper: count total nodes across all chains in parents_map.
 */
function count_chain_nodes(data: data_item[] | null): number {
	if (!data) return 0;
	let count = 0;
	for (const item of data) {
		const parents_map = (item as any).parents;
		if (parents_map) {
			for (const chain of Object.values(parents_map)) {
				if (Array.isArray(chain)) count += chain.length;
			}
		}
	}
	return count;
}

