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
 * Preserves column order and empty slots for missing tipos (no cleanup_formatting).
 *
 * @param data    - Array of data items
 * @param options - Parser options (columns is mandatory)
 * @param options.merge - Strategy for flattening or structuring collections:
 * 	- undefined (default): ["Madrid", "Spain", "Paris", "France"]
 * 	                    // flat array of all non-empty slot values across all sections,
 * 	                    // order-preserved, duplicates allowed
 * 	- string:           "Madrid - Spain, Paris - France"
 * 	                    // columns joined by fields_separator within each section,
 * 	                    // sections joined by records_separator
 * 	- nested:          	[["Madrid", "Spain"], ["Paris", "France"]]
 * 	                    // one sub-array of col-values per section_id
 * 	- flat:           	["Madrid - Spain", "Paris - France"]
 * 	                    // one string per section_id (columns joined by fields_separator)
 * 	- pipe:             '["Madrid","Spain"] - ["Paris","France"]'
 * 	                    // JSON.stringify(col_values) per section, joined by records_separator
 * 	- unique:           ["Madrid", "Spain", "Paris", "France"]
 * 	                    // deduplicated flat list of non-empty slot values across all sections
 *
 * Fallback priority per column slot (tipo × lang):
 *   1. Exact lang match
 *   2. Nolan ("lg-nolan" / null)
 *   3. main_lang (from options.main_lang, injected by diffusion_processor)
 *   4. Any other available lang (first found)
 *   5. "" (empty slot — adjacent separators preserved intentionally)
 *
 * @param data    - Array of data items with tipo, lang, value, section_id
 * @param options - Parser options
 * @returns Array of data_item[], one per rendering lang
 */
export function merge(data: data_item[] | null, options: parser_options): data_item[] | null {

	if (!data || data.length === 0) return null;

	// columns is mandatory for explicit parser calls (injected by diffusion_processor).
	// Internal auto-completion calls in apply_parser_chain omit columns — return null
	// so their `if (merged) result = merged` guard is a no-op and data flows through.
	const columns = options.columns as Array<{ tipo: string; model: string }> | undefined;
	if (!columns || columns.length === 0) return null;

	const merge_style = options?.merge    as string | undefined;
	const fields_sep  = (options?.fields_separator  as string) ?? ', ';
	const records_sep = (options?.records_separator as string) ?? ' | ';
	const main_lang    = (options?.main_lang as string | undefined) ?? null;
	const empty_columns = (options?.empty_columns as boolean) ?? true;

	// -----------------------------------------------------------------------
	// Phase 1: Build index  section_id → tipo → lang_key → value
	// Preserve section insertion order via seen_sections.
	// lang_key: raw lang string or "__nolan__" for null / "lg-nolan".
	// -----------------------------------------------------------------------
	type LangMap    = Map<string, any>;
	type TipoMap    = Map<string, LangMap>;
	type SectionMap = Map<string, TipoMap>;

	const section_data: SectionMap              = new Map();
	const seen_sections: string[]               = [];
	const lang_ref_items: Map<string, data_item> = new Map();

	for (const item of data) {
		const section_key = (item.section_id != null) ? String(item.section_id) : '__no_section__';
		const tipo_key    = item.tipo ?? '__unknown__';
		const lang_key    = (!item.lang || item.lang === 'lg-nolan') ? '__nolan__' : item.lang;

		if (!section_data.has(section_key)) {
			section_data.set(section_key, new Map());
			seen_sections.push(section_key);
		}
		const tipo_map = section_data.get(section_key)!;
		if (!tipo_map.has(tipo_key)) tipo_map.set(tipo_key, new Map());
		tipo_map.get(tipo_key)!.set(lang_key, item.value);

		// Store first ref_item per specific lang (skip nolan — not emitted standalone)
		if (lang_key !== '__nolan__' && !lang_ref_items.has(lang_key)) {
			lang_ref_items.set(lang_key, item);
		}
	}

	// -----------------------------------------------------------------------
	// Phase 2: Determine langs to render.
	// If only nolan items exist, emit one item with lang = null.
	// -----------------------------------------------------------------------
	const specific_langs  = [...lang_ref_items.keys()];
	const langs_to_render = specific_langs.length > 0 ? specific_langs : ['__nolan__'];

	if (specific_langs.length === 0) {
		lang_ref_items.set('__nolan__', data[0]);
	}

	// -----------------------------------------------------------------------
	// Phase 3: Build one output item per lang, respecting merge_style.
	// resolve_slot applies the 5-level fallback chain for a tipo × lang pair.
	// -----------------------------------------------------------------------
	const resolve_slot = (tipo_map: TipoMap, tipo: string, lang_key: string): string => {
		const lang_map = tipo_map.get(tipo);
		if (!lang_map || lang_map.size === 0) return '';

		let v: any;
		if      (lang_map.has(lang_key))                  v = lang_map.get(lang_key);      // 1. exact lang
		else if (lang_map.has('__nolan__'))               v = lang_map.get('__nolan__');   // 2. nolan
		else if (main_lang && lang_map.has(main_lang))    v = lang_map.get(main_lang);     // 3. main_lang
		else                                               v = lang_map.values().next().value; // 4. any-lang

		return (v !== null && v !== undefined) ? String(v) : '';                             // 5. empty
	};

	const result: data_item[] = [];

	for (const lang_key of langs_to_render) {

		// Build col_values per section (ordered, with "" for missing/empty slots)
		const sections_col_values: string[][] = seen_sections.map(section_key => {
			const tipo_map = section_data.get(section_key)!;
			return columns.map(col => resolve_slot(tipo_map, col.tipo, lang_key));
		});

		// When empty_columns is false, strip empty slots from every section before merging
		const effective_col_values = empty_columns
			? sections_col_values
			: sections_col_values.map(cv => cv.filter(v => v !== ''));

		let final_value: any;

		switch (merge_style) {

			case 'nested':
				// Each section_id → its col_values array; output is array-of-arrays
				final_value = effective_col_values;
				break;

			case 'flat':
				// Each section_id → one string (columns joined by fields_sep); output is array of strings
				final_value = effective_col_values.map(cv => cv.join(fields_sep));
				break;

			case 'pipe':
				// Each section_id → JSON.stringify(col_values); sections joined by records_sep
				final_value = effective_col_values
					.map(cv => JSON.stringify(cv))
					.join(records_sep);
				break;

			case 'unique':
				// Flatten all slot values, filter empty slots, deduplicate
				final_value = [...new Set(effective_col_values.flat().filter(v => v !== ''))];
				break;

			case 'string':
				// Columns joined by fields_sep within each section; sections joined by records_sep.
				// Empty slots produce adjacent separators — preserved intentionally.
				final_value = effective_col_values
					.map(cv => cv.join(fields_sep))
					.join(records_sep);
				break;

			default:
				// undefined — flat array of all non-empty slot values, order-preserved, duplicates allowed.
				// e.g. ["Madrid", "Spain", "Paris", "France"]
				final_value = effective_col_values.flat().filter(v => v !== '');
				break;
		}

		result.push({
			...lang_ref_items.get(lang_key)!,
			lang:  lang_key === '__nolan__' ? null : lang_key,
			value: final_value,
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
