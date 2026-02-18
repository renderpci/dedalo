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

// =====================================================================
// Chain-filtering parsers (operate on parents_map before string building)
// =====================================================================

/**
 * Helper: iterate all chain entries in parents_map and apply a transform function.
 * Returns a new data array with modified parents_map.
 */
function map_chains(data: data_item[], transform: (chain: any[]) => any[]): data_item[] {

	return data.map(item => {

		const parents_map = (item as any).parents;
		if (!parents_map) return item;

		const new_map: Record<string, any[]> = {};
		for (const [key, chain] of Object.entries(parents_map)) {
			if (Array.isArray(chain)) {
				new_map[key] = transform(chain);
			} else {
				new_map[key] = chain as any[];
			}
		}

		return { ...item, parents: new_map };
	});
}



/**
 * TRUNCATE_BY_TERM_ID
 * Cut the parent chain before any node whose term_id (section_tipo_section_id)
 * matches one of the specified values.
 *
 * @param options.parent_end_by_term_id - Array of term_id strings, e.g. ["on1_2705", "on1_2748"]
 */
export function truncate_by_term_id(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const end_ids = options.parent_end_by_term_id as string[];
	if (!end_ids || !Array.isArray(end_ids) || end_ids.length === 0) return data;

	const end_set = new Set(end_ids);

	return map_chains(data, (chain) => {
		const result: any[] = [];
		for (const node of chain) {
			const term_id = node.section_tipo + '_' + node.section_id;
			if (end_set.has(term_id)) break;
			result.push(node);
		}
		return result;
	});
}



/**
 * TRUNCATE_BY_MODEL
 * Cut the parent chain before any node whose typology model
 * (typology_section_tipo_typology_section_id) matches one of the specified values.
 *
 * @param options.parent_end_by_model - Array of model strings, e.g. ["es2_8871"]
 */
export function truncate_by_model(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const end_models = options.parent_end_by_model as string[];
	if (!end_models || !Array.isArray(end_models) || end_models.length === 0) return data;

	const end_set = new Set(end_models);

	return map_chains(data, (chain) => {
		const result: any[] = [];
		for (const node of chain) {
			if (node.typology_section_tipo && node.typology_section_id) {
				const model_id = node.typology_section_tipo + '_' + node.typology_section_id;
				if (end_set.has(model_id)) break;
			}
			result.push(node);
		}
		return result;
	});
}



/**
 * FILTER_BY_SECTION_TIPO
 * Keep only nodes in the chain whose section_tipo matches the specified value.
 *
 * @param options.parent_section_tipo - The section_tipo to keep, e.g. "cult1"
 */
export function filter_by_section_tipo(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const target_tipo = options.parent_section_tipo as string;
	if (!target_tipo) return data;

	return map_chains(data, (chain) => {
		return chain.filter(node => node.section_tipo === target_tipo);
	});
}



/**
 * SPLICE_CHAIN
 * Apply Array.splice() on the parent chain.
 * Accepts 1 or 2 arguments matching the legacy parents_splice format:
 *   [start]         → chain.splice(start)
 *   [start, count]  → chain.splice(start, count)
 *
 * @param options.parents_splice - Array of 1-2 numbers, e.g. [0, -1] or [2]
 */
export function splice_chain(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const splice_args = options.parents_splice as number[];
	if (!splice_args || !Array.isArray(splice_args) || splice_args.length === 0) return data;

	return map_chains(data, (chain) => {
		const copy = [...chain];

		if (splice_args.length === 1) {
			// splice(start) — remove from index to end
			copy.splice(splice_args[0]);
		} else {
			// splice(start, deleteCount)
			copy.splice(splice_args[0], splice_args[1]);
		}

		return copy;
	});
}



/**
 * FLAT_PARENTS
 * Global convenience parser that chains all filtering operations and then
 * builds the final string via add_parents.
 *
 * Processing order (matches legacy PHP behavior):
 * 1. truncate_by_term_id  (if parent_end_by_term_id present)
 * 2. truncate_by_model    (if parent_end_by_model present)
 * 3. filter_by_section_tipo (if parent_section_tipo present)
 * 4. splice_chain          (if parents_splice present AND no truncation matched)
 * 5. add_parents           (with resolve_value and records_separator)
 *
 * Per legacy behavior: "the parents_splice don't act if the previous
 * truncation criteria are matched"
 *
 * @param options - Combined options for all sub-parsers
 */
export function flat_parents(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	let result: data_item[] | null = data;

	// Track whether truncation was applied
	let truncation_applied = false;

	// 1. truncate_by_term_id
	if (options.parent_end_by_term_id) {
		const before_count = count_chain_nodes(result);
		result = truncate_by_term_id(result, options);
		if (!result) return null;
		const after_count = count_chain_nodes(result);
		if (after_count < before_count) truncation_applied = true;
	}

	// 2. truncate_by_model
	if (options.parent_end_by_model) {
		const before_count = count_chain_nodes(result);
		result = truncate_by_model(result, options);
		if (!result) return null;
		const after_count = count_chain_nodes(result);
		if (after_count < before_count) truncation_applied = true;
	}

	// 3. filter_by_section_tipo
	if (options.parent_section_tipo) {
		result = filter_by_section_tipo(result, options);
		if (!result) return null;
	}

	// 4. splice_chain — only if no truncation was applied
	if (options.parents_splice && !truncation_applied) {
		result = splice_chain(result, options);
		if (!result) return null;
	}

	// 5. add_parents (string building with resolve_value and records_separator)
	result = add_parents(result, options);

	return result;
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

