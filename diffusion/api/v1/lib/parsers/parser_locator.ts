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

	// Options with defaults matching current behavior
	const resolve_value: boolean     = (options.resolve_value as boolean) ?? true;
	const records_separator: string  = (options.records_separator as string) ?? ', ';

	const result: data_item[] = [];

	for (const item of data) {

		// item has value (array of objects) and parents (map)
		const parents_map	= (item as any).parents;
		const val			= item.value;
		const values		= Array.isArray(val) ? val : [val];

		// Map to collect strings by language: { 'lg-spa': ['Barcelona, Cataluña, España'], 'lg-eng': ['Barcelona, Catalonia, Spain'] }
		const lang_values: Record<string, string[]> = {};

		for(const current_val of values) {

			// val is locator object
			if(!current_val || typeof current_val !== 'object') continue;

			const section_tipo	= (current_val as any).section_tipo;
			const section_id	= (current_val as any).section_id;

			if(!section_tipo || !section_id) continue;

			const key = section_tipo + '_' + section_id;

			// Get parent chain for this item
			if(parents_map && parents_map[key]) {
				const chain = parents_map[key]; // Array of hierarchy objects [child, parent, grandparent...]

				if(Array.isArray(chain) && chain.length > 0) {

					if (resolve_value) {
						// Use term values to build strings (default behavior)

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
							
							// Respect include_parents option. Default to true.
							const include_parents: boolean = (options.include_parents as boolean) ?? true;
							const chain_to_process = include_parents ? chain : [chain[0]];

							for (const node of chain_to_process) {
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
								const final_str = final_str_parts.join(records_separator);

								if (!lang_values[lang]) lang_values[lang] = [];
								lang_values[lang].push(final_str);
							}
						}

					} else {
						// resolve_value = false: use section_id instead of term
						const id_parts: string[] = [];

						for (const node of chain) {
							if (node.section_id !== undefined && node.section_id !== null) {
								id_parts.push(String(node.section_id));
							}
						}

						if (id_parts.length > 0) {
							const nolan_key = '__nolan__';
							if (!lang_values[nolan_key]) lang_values[nolan_key] = [];
							lang_values[nolan_key].push(id_parts.join(records_separator));
						}
					}
				}
			}
		}

		// Create result items from map
		for (const [lang, strs] of Object.entries(lang_values)) {
			result.push({
				...item,
				lang:  lang === '__nolan__' ? null : lang,
				value: strs.join(records_separator)
			});
		}
	}

	return result.length > 0 ? result : null;
}



/**

/**
 * Shared logic for filtering by term_id
 */
function filter_chain_by_term_id(chain: any[], options: parser_options): any[] {
	const target_term_id = options.parent_term_id;
	if (!target_term_id) return chain;

	const target_set = new Set(Array.isArray(target_term_id) ? target_term_id : [target_term_id as string]);
	return chain.filter(node => {
		const term_id = term_id_from_locator(node as locator);
		return term_id ? target_set.has(term_id) : false;
	});
}

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
			const term_id = term_id_from_locator(node as locator);
			if (term_id && end_set.has(term_id)) break;
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
 * @param options.parent_end_by_typology_term_id - Array of model strings, e.g. ["es2_8871"]
 * @param options.parent_end_by_typology_term_id - Alias for parent_end_by_typology_term_id
 */
export function truncate_by_model(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const end_models = options.parent_end_by_typology_term_id as string[];
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
 * @param options.parent_section_tipo - The section_tipo to keep, e.g. "cult1" or ["cult1", "cult2"]
 */
export function filter_by_section_tipo(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const target_tipo = options.parent_section_tipo;
	if (!target_tipo) return data;

	const target_set = new Set(Array.isArray(target_tipo) ? target_tipo : [target_tipo as string]);

	return map_chains(data, (chain) => {
		return chain.filter(node => target_set.has(node.section_tipo));
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
 * SLICE_CHAIN
 * Apply Array.slice() on the parent chain mimicking PHP array_slice.
 * Accepts 1 or 2 arguments matching the parents_slice format:
 *   [offset]         → mimics array_slice(chain, offset)
 *   [offset, length] → mimics array_slice(chain, offset, length)
 *
 * @param options.parents_slice - Array of 1-2 numbers, e.g. [0, -1] or [2]
 */
export function slice_chain(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const slice_args = options.parents_slice as number[];
	if (!slice_args || !Array.isArray(slice_args) || slice_args.length === 0) return data;

	return map_chains(data, (chain) => {
		const start_arg = slice_args[0];
		const length_arg = slice_args.length > 1 ? slice_args[1] : undefined;

		const s = start_arg < 0 ? Math.max(chain.length + start_arg, 0) : start_arg;
		let e = chain.length;
		if (length_arg !== undefined && length_arg !== null) {
			e = length_arg < 0 ? chain.length + length_arg : s + length_arg;
		}

		return chain.slice(s, Math.max(s, e));
	});
}


/**
 * Filter parents by term_id
 * filtered by parents_recursive_data. We want only terms with parent given (see propiedades of isad98)
 * This is useful when we want to discriminate thesaurus branch by top parent
 */
export function filter_parents_by_term_id(data: data_item[] | null, options: parser_options): data_item[] | null {
	
	if (!data || data.length === 0) return null;

	return map_chains(data, (chain) => filter_chain_by_term_id(chain, options));
}




/**
 * TERM_ID_FROM_LOCATOR
 * Auxiliar method to calculate the term_id from a locator or parent/node data.
 * from : {section_tipo:"oh1", section_id:"25"} to "oh1_25"
 * @param locator - locator object
 * @returns term_id - String or null
 */
function term_id_from_locator(locator: locator | null): string | null {

	if (!locator) return null;

	const term_id = (locator.section_tipo && locator.section_id)
		? locator.section_tipo + '_' + locator.section_id
		: null;

	return term_id;
}





/**
 * FLAT_PARENTS
 * Global convenience parser that chains all filtering operations and then
 * builds the final string via `parents`.
 *
 * Delegates to `parents`, which handles all filtering and string-building
 * internally (apply_chain_filters + multilingual term extraction).
 *
 * @param options - Combined options for all sub-parsers
 */
export function flat_parents(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	// Delegate fully to `parents` — it applies all filters and builds the output.
	return parents(data, options);
}


