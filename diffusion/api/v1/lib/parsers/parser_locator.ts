/**
 * PARSER_LOCATOR
 * Locate and extract specific data from diffusion objects.
 */

import type { parser_options, data_item } from '../types';
import { langs_config } from '../diffusion_processor';
import { merge as apply_merge } from './parser_helper';


interface locator {
	section_tipo: string;
	section_id: string | number;
}




/**
 * GET_SECTION_ID
 * Extracts the section_id from the data item value.
 * Assumes value is an object with a section_id property.
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @param options.split - When true, emits one data_item per extracted section_id
 *                        with a unique synthetic section_id, enabling downstream
 *                        merge(unique) to deduplicate individual values instead of
 *                        comma-joined arrays.
 * @returns Array of data items with section_id as value
 */
export function get_section_id(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;
	const result: data_item[] = [];

	const split = (options?.split as boolean) ?? false;

	if (split) {
		let split_idx = 0;
		for (const item of data) {
			const val = item.value;
			const locators = Array.isArray(val) ? val : [val];
			for (const locator of locators) {
				if (typeof locator === 'object' && locator !== null && 'section_id' in locator) {
					const current_section_id = (locator as any).section_id;
					if (current_section_id !== undefined && current_section_id !== null) {
						result.push({
							...item,
							value: current_section_id,
							// @ts-ignore
							section_id: '__split__' + split_idx++
						});
					}
				}
			}
		}
		return result.length > 0 ? result : null;
	}

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
 * @param options.split - When true, emits one data_item per extracted section_tipo
 *                        with a unique synthetic section_id, enabling downstream
 *                        merge(unique) to deduplicate individual values.
 * @returns Array of data items with section_tipo as value
 */
export function get_section_tipo(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;
	const result: data_item[] = [];

	const split = (options?.split as boolean) ?? false;

	if (split) {
		let split_idx = 0;
		for (const item of data) {
			const val = item.value;
			const locators = Array.isArray(val) ? val : [val];
			for (const locator of locators) {
				if (typeof locator === 'object' && locator !== null && 'section_tipo' in locator) {
					const current_section_tipo = (locator as any).section_tipo;
					if (current_section_tipo !== undefined && current_section_tipo !== null) {
						result.push({
							...item,
							value: current_section_tipo,
							// @ts-ignore
							section_id: '__split__' + split_idx++
						});
					}
				}
			}
		}
		return result.length > 0 ? result : null;
	}

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
 * MAP_SECTION_TIPO_TO_NAME
 * Maps section_tipo values to configured target names.
 * Each locator's section_tipo is looked up in options.map.
 * Unmapped section_tipos result in empty values (not null, to preserve chain flow).
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @param options.map - Dictionary of section_tipo -> target name, e.g. {"dc1": "ts_period", "ts1": "ts_thematic"}
 * @returns Array of data items with mapped names as value
 */
export function map_section_tipo_to_name(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	const map = options.map as Record<string, string> | undefined;
	if (!map || typeof map !== 'object') return null;

	const result: data_item[] = [];

	for (const item of data) {
		const val = item.value;
		const locators = Array.isArray(val) ? val : [val];

		const mapped_values: string[] = [];
		for (const locator of locators) {
			if (typeof locator === 'object' && locator !== null && 'section_tipo' in locator) {
				const section_tipo = (locator as any).section_tipo as string;
				if (section_tipo && section_tipo in map) {
					mapped_values.push(map[section_tipo]);
				}
			}
		}
		result.push({
			...item,
			value: mapped_values
		});
	}

	return result.length > 0 ? result : null;
}



/**
 * GET_TERM_ID
 * Extracts the term_id(s) from the data item value.
 * Each locator object becomes one term_id string: "{section_tipo}_{section_id}".
 * Supports single locators and arrays of locators.
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @param options.split - When true, emits one data_item per extracted term_id
 *                        with a unique synthetic section_id, enabling downstream
 *                        merge(unique) to deduplicate individual values.
 * @returns Array of data items with term_id(s) as value (array of strings)
 */
export function get_term_id(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;
	const result: data_item[] = [];

	const split = (options?.split as boolean) ?? false;

	if (split) {
		let split_idx = 0;
		for (const item of data) {
			const val = item.value;
			const locators = Array.isArray(val) ? val : [val];
			for (const loc of locators) {
				if (typeof loc === 'object' && loc !== null && 'section_tipo' in loc && 'section_id' in loc) {
					const tid = term_id_from_locator(loc as locator);
					if (tid !== null) {
						result.push({
							...item,
							value: tid,
							// @ts-ignore
							section_id: '__split__' + split_idx++
						});
					}
				}
			}
		}
		return result.length > 0 ? result : null;
	}

	for (const item of data) {
		const val = item.value;
		const locators = Array.isArray(val) ? val : [val];

		const term_ids: string[] = [];
		for (const loc of locators) {
			if (typeof loc === 'object' && loc !== null && 'section_tipo' in loc && 'section_id' in loc) {
				const tid = term_id_from_locator(loc as locator);
				if (tid !== null) term_ids.push(tid);
			}
		}
		result.push({
			...item,
			value: term_ids
		});
	}

	return result.length > 0 ? result : null;
}




/**
 * PARENTS
 * Unified parser to process parent information.
 * Supports extracting terms, term_ids, section_ids, and typologies.
 *
 * Emits one data_item per chain node using a positional synthetic tipo
 * (__parent_0__, __parent_1__, …) and a composite section_id
 * (section_tipo + '_' + section_id) to guarantee uniqueness across different
 * section types that share the same numeric section_id (e.g. es1_1 vs fr1_1).
 * merge() then groups by section_id and fills column slots in depth order,
 * producing "" for any missing depth level.
 *
 * @param data    - Array of data items
 * @param options - Parser options
 * @param options.value - What to extract: "term" (default), "term_id", "section_id", "typology", "typology_section_id".
 * @param options.include_parents - If true, include all parents in the chain. Default: true.
 * @param options.include_self - If true, include the item itself (index 0). Default: true.
 * @param options.records_separator - Separator between different parent chains. Default: " - ". Set to false for array output.
 * @param options.fields_separator - Separator between values in the same chain. Default: ", ".
 * @param options.parents_splice - Array of two integers [start, deleteCount] to splice the parent chain. Default: []
 * @param options.parents_slice - Array of two integers [start, deleteCount] to slice the parent chain. Default: []
 * @param options.parent_end_by_term_id - Array of term_ids to truncate the parent chain at. Default: []
 * @param options.parent_section_tipo - Array section_tipo to keep. Default: undefined.
 * @param options.parent_term_id - Array term_id to keep. Default: undefined.
 * @param options.parent_typology_term_id - Array get the parent with the typology term_id. Default: undefined.
 * @param options.parent_end_by_typology_term_id - Array.
 * @param options.merge - Define the way to merge the parents:
 *  - undefined (default): 	["Madrid", "Spain", "Paris", "France"]
 *  - string: 			"Madrid, Spain - Paris, France"
 * 	                    // fields_separator within chain, records_separator between chains
 *  - nested:           [["Madrid", "Spain"], ["Paris", "France"]]
 * 	                    // one sub-array per locator, preserving depth position
 *  - flat:             ["Madrid, Spain", "Paris, France"]
 * 	                    // one string per locator (fields_separator within)
 *  - pipe:             '["Madrid","Spain"] - ["Paris","France"]'
 * 	                    // JSON.stringify per locator, joined by records_separator
 *  - unique:           ["Madrid", "Spain", "Paris", "France"]
 * 	                    // deduplicated flat list of non-empty depth-level values
 * @returns Array of data items with formatted value
 */
export function parents(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	// Extract options with defaults
	const value_to_extract: string        = (options.value as string) ?? 'term';
	const include_parents: boolean        = (options.include_parents as boolean) ?? true;
	const include_self: boolean           = (options.include_self as boolean)    ?? true;
	const fields_separator: string        = (options.fields_separator as string)  ?? ', ';
	const records_separator: string       = (options.records_separator as string) ?? ' - ';
	const merge_style: string | undefined = (options.merge as string | undefined) ?? (value_to_extract === 'term' ? 'string' : undefined);

	// langs
	const main_lang = langs_config.main_lang;
	const langs     = langs_config.langs;

	const result: data_item[] = [];
	let   max_depth = 0;

	for (const item of data) {
		const parents_map = (item as any).meta;
		const val         = item.value;
		const values      = Array.isArray(val) ? val : [val];

		// Map to collect extracted values by language.
		// Each entry carries the ordered chain values AND the composite key of the originating locator.
		// Composite key = section_tipo + '_' + section_id — guarantees uniqueness even when
		// two different section types share the same numeric section_id (e.g. es1_1 vs fr1_1).
		const lang_nodes: Record<string, { chain: string[], section_composite: string }[]> = {};

		for (const current_val of values) {
			if (!current_val || typeof current_val !== 'object') continue;

			const section_tipo = (current_val as any).section_tipo;
			const section_id   = (current_val as any).section_id;
			if (!section_tipo || !section_id) continue;

			const section_composite = `${section_tipo}_${section_id}`;

			const key = term_id_from_locator(current_val as locator);
			if (!key || !parents_map || !parents_map[key]) continue;

			const original_chain = parents_map[key]; // [self, parent, grandparent, ...]
			if (!Array.isArray(original_chain) || original_chain.length === 0) continue;

			// 1. Atomize: Apply filters and truncation logic
			const filtered_chain = apply_chain_filters(original_chain, options);
			if (filtered_chain.length === 0) continue;

			// 2. Apply include_self and include_parents slicing
			const start_idx = include_self ? 0 : 1;
			const end_idx   = include_parents ? filtered_chain.length : (include_self ? 1 : 0);

			if (start_idx >= filtered_chain.length || (end_idx <= start_idx && include_parents)) continue;

			const chain_to_process = filtered_chain.slice(start_idx, end_idx === 0 && !include_parents ? 1 : end_idx);
			if (chain_to_process.length === 0) continue;

			if (value_to_extract === 'term') {
				// Multilingual terms: one chain entry per lang
				for (const lang of langs) {
					const chain_values: string[] = [];
					for (const node of chain_to_process) {
						let term_str = '';
						if (Array.isArray(node.term) && node.term.length > 0) {
							// 1. exact lang
							const term_obj = node.term.find((t: any) => t.lang === lang);
							if (term_obj) {
								term_str = term_obj.value;
							} else {
								// 2. main_lang fallback
								const main_term_obj = main_lang ? node.term.find((t: any) => t.lang === main_lang) : null;
								if (main_term_obj) {
									term_str = main_term_obj.value;
								} else {
									// 3. first available
									term_str = node.term[0].value;
								}
							}
						}
						if (term_str) chain_values.push(term_str);
					}
					if (chain_values.length > 0) {
						if (!lang_nodes[lang]) lang_nodes[lang] = [];
						lang_nodes[lang].push({ chain: chain_values, section_composite });
					}
				}
			} else {
				// Single-value extraction (term_id, section_id, typology, etc.) — language-independent
				const nolan_key = '__nolan__';
				const chain_values: string[] = [];

				for (const node of chain_to_process) {
					let extracted: string | null = null;
					switch (value_to_extract) {
						case 'term_id':
							extracted = term_id_from_locator(node as locator);
							break;
						case 'section_id':
							extracted = String(node.section_id);
							break;
						case 'typology':
							extracted = node.typology;
							break;
						case 'typology_section_id':
							extracted = node.typology_section_id;
							break;
						case 'typology_term_id':
							extracted = node.typology_section_tipo + '_' + node.typology_section_id;
							break;
					}
					if (extracted) chain_values.push(extracted);
				}

				if (chain_values.length > 0) {
					if (!lang_nodes[nolan_key]) lang_nodes[nolan_key] = [];
					lang_nodes[nolan_key].push({ chain: chain_values, section_composite });
				}
			}
		}

		// Emit one data_item per chain node, with:
		//   tipo       = '__parent_N__' (positional depth-level column)
		//   section_id = composite key (groups all depth-level nodes of the same locator)
		//   value      = the extracted string at this depth level
		// merge() will group by section_id and fill column slots by tipo, producing
		// "" for any missing depth level and preserving position order.
		for (const [lang, chain_entries] of Object.entries(lang_nodes)) {
			for (const { chain, section_composite } of chain_entries) {
				for (let i = 0; i < chain.length; i++) {
					result.push({
						...item,
						tipo:       `__parent_${i}__`,
						lang:       lang === '__nolan__' ? null : lang,
						value:      chain[i],
						section_id: section_composite,
					});
				}
				max_depth = Math.max(max_depth, chain.length);
			}
		}
	}

	if (result.length === 0) return null;

	// Synthesize positional columns from the maximum chain depth observed.
	// '__parent_0__' = self/first node, '__parent_1__' = first parent, etc.
	const columns = Array.from({ length: max_depth }, (_, i) => ({ tipo: `__parent_${i}__`, model: '' }));

	// Delegate merge to parser_helper::merge with synthesized columns.
	return apply_merge(result, { merge: merge_style, fields_separator, records_separator, columns });
}



/**
 * APPLY_CHAIN_FILTERS (Atomized helper)
 * Applies truncation, filtering and splicing to a single parent chain.
 * Logic order follows legacy PHP behavior.
 */
function apply_chain_filters(chain: any[], options: parser_options): any[] {
	let processed = [...chain];
	let truncation_applied = false;

	// 1. Truncate by term_id (section_tipo_section_id)
	const end_ids = options.parent_end_by_term_id as string[];
	if (end_ids && Array.isArray(end_ids) && end_ids.length > 0) {
		const end_set = new Set(end_ids);
		const result: any[] = [];
		for (const node of processed) {
			const term_id = term_id_from_locator(node as locator);
			if (term_id && end_set.has(term_id)) {
				truncation_applied = true;
				break;
			}
			result.push(node);
		}
		processed = result;
	}

	// 2. Truncate by typology_term_id
	const end_models = options.parent_end_by_typology_term_id as string[];
	if (end_models && Array.isArray(end_models) && end_models.length > 0) {
		const end_set = new Set(end_models);
		const result: any[] = [];
		for (const node of processed) {
			if (node.typology_section_tipo && node.typology_section_id) {
				const model_id = node.typology_section_tipo + '_' + node.typology_section_id;
				if (end_set.has(model_id)) {
					truncation_applied = true;
					break;
				}
			}
			result.push(node);
		}
		processed = result;
	}

	// 3. Filter by section_tipo (supports array)
	const target_tipo = options.parent_section_tipo;
	if (target_tipo) {
		const target_set = new Set(Array.isArray(target_tipo) ? target_tipo : [target_tipo as string]);
		processed = processed.filter(node => target_set.has(node.section_tipo));
	}

	// 3a. Filter by parent_term_id (supports array)
	processed = filter_chain_by_term_id(processed, options);

	// 4. Splice chain (only if NO truncation matched)
	// Mirrors PHP: splice applied only on parents (chain[1..]), self (chain[0]) is preserved.
	const splice_args = options.parents_splice as number[];
	if (!truncation_applied && splice_args && Array.isArray(splice_args) && splice_args.length > 0) {
		processed = splice_chain(processed, splice_args);
	}

	// 5. Slice chain (only if NO truncation matched)
	const slice_args = options.parents_slice as number[];
	if (!truncation_applied && slice_args && Array.isArray(slice_args) && slice_args.length > 0) {
		processed = slice_array(processed, slice_args);
	}

	return processed;
}

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
 * Helper: iterate all chain entries in meta(with the parents data) map and apply a transform function.
 * Returns a new data array with modified meta map.
 */
function map_chains(data: data_item[], transform: (chain: any[]) => any[]): data_item[] {

	return data.map(item => {

		const parents_map = (item as any).meta;
		if (!parents_map) return item;

		const new_map: Record<string, any[]> = {};
		for (const [key, chain] of Object.entries(parents_map)) {
			if (Array.isArray(chain)) {
				new_map[key] = transform(chain);
			} else {
				new_map[key] = chain as any[];
			}
		}

		return { ...item, meta: new_map };
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
 * Mirrors legacy PHP behavior where `array_splice` is applied only to the
 * parents sub-array (i.e. the chain WITHOUT the first/self node at index 0),
 * and the self-term is then re-prepended to the result.
 *
 * e.g. chain=[1,2,3,4,5,6], splice=[1,-1]:
 *   parents=[2,3,4,5,6] → splice(1,-1) → [2,6] → prepend self → [1,2,6]
 *
 * @param chain      - The full chain including the self node at index 0
 * @param splice_args - Array of 1–2 numbers matching PHP parents_splice format
 */
function splice_chain(chain: any[], splice_args: number[]): any[] {

	if (chain.length === 0) return chain;

	const self_node = chain[0];
	const parents   = chain.slice(1);

	const start = splice_args[0];

	if (splice_args.length === 1) {
		// PHP array_splice($a, start) — remove from start to end
		parents.splice(start);
	} else {
		let delete_count = splice_args[1];
		// PHP semantics: negative deleteCount means "leave that many at the tail"
		// e.g. array_splice([2,3,4,5,6], 1, -1) → removes [3,4,5] → [2,6]
		// JS splice ignores negative deleteCount (treats as 0), so we translate:
		if (delete_count < 0) {
			delete_count = Math.max(0, parents.length - start + delete_count);
		}
		parents.splice(start, delete_count);
	}

	return [self_node, ...parents];
}



/**
 * SLICE_ARRAY
 * PHP-compatible array_slice on a plain array.
 * @param chain      - Source array
 * @param slice_args - [offset] or [offset, length] matching PHP array_slice semantics
 */
function slice_array(chain: any[], slice_args: number[]): any[] {

	const start_arg  = slice_args[0];
	const length_arg = slice_args.length > 1 ? slice_args[1] : undefined;

	const s = start_arg < 0 ? Math.max(chain.length + start_arg, 0) : start_arg;
	let e = chain.length;
	if (length_arg !== undefined && length_arg !== null) {
		e = length_arg < 0 ? chain.length + length_arg : s + length_arg;
	}

	return chain.slice(s, Math.max(s, e));
}


/**
 * SLICE_CHAIN
 * Apply PHP array_slice() on the parent chain.
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

	return map_chains(data, (chain) => slice_array(chain, slice_args));
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



