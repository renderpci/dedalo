/**
 * PARSERS INDEX
 * Parser registry and dispatcher.
 * Maps PHP-format function strings (e.g., "parser_text::text_format")
 * to their JS implementations.
 */

import { default_join, text_format, map_value, v5_html } from './parser_text';
import { select_properties, select_keys, format_string_date, string_date, unix_timestamp } from './parser_date';
import date_default from './parser_date';
import { get_section_id, get_section_tipo, get_term_id, truncate_by_term_id, truncate_by_model, filter_by_section_tipo, filter_parents_by_term_id, slice_chain, parents } from './parser_locator';
import { get_first, count, merge } from './parser_helper';
import { widget } from './parser_info';
import info_default from './parser_info';
import { flat } from './parser_iri';
import { geojson } from './parser_geo';
import { merge_columns, publication_unix_timestamp } from './parser_global';
import type { parser_options } from '../types';



/**
 * Parser function signature.
 * Matches the PHP convention: fn(data, options) → string|null|data_item[]
 * Can return intermediate data structures (like arrays) or final strings.
 */
type parser_fn = (data: any[] | null, options: parser_options) => any;



/**
 * Registry mapping "class::method" strings to JS functions.
 */
const parser_registry: Record<string, parser_fn> = {
	'parser_helper::get_first':						get_first,
	'parser_helper::count':							count,
	'parser_helper::merge':							merge,
	'parser_text::default_join':					default_join,
	'parser_text::text_format':						text_format,
	'parser_text::map_value':						map_value,
	'parser_text::v5_html':							v5_html,
	'parser_locator::get_section_id':				get_section_id,
	'parser_locator::get_section_tipo':				get_section_tipo,
	'parser_locator::get_term_id':					get_term_id,
	'parser_locator::filter_parents_by_term_id':	filter_parents_by_term_id,
	'parser_locator::parents':						parents,
	'parser_locator::truncate_by_term_id':			truncate_by_term_id,
	'parser_locator::truncate_by_model':			truncate_by_model,
	'parser_locator::filter_by_section_tipo':		filter_by_section_tipo,
	'parser_locator::slice_chain':					slice_chain,
	'parser_date::select_properties':				select_properties,
	'parser_date::select_keys':						select_keys,
	'parser_date::format_string_date':				format_string_date,
	'parser_date::string_date':						string_date,
	'parser_date::unix_timestamp':					unix_timestamp,
	'parser_date::default':							date_default,
	'parser_info::widget':							widget,
	'parser_info::default':							info_default,
	'parser_iri::flat':								flat,
	'parser_geo::geojson':							geojson,
	'parser_global::merge_columns':					merge_columns,
	'parser_global::publication_unix_timestamp':	publication_unix_timestamp,
};



/**
 * RESOLVE_PARSER
 * Returns the JS function for a PHP-format parser string.
 *
 * @param fn_string - e.g., "parser_text::text_format"
 * @returns The corresponding JS function or null if not found
 */
export function resolve_parser(fn_string: string): parser_fn | null {
	return parser_registry[fn_string] ?? null;
}



/**
 * APPLY_PARSER
 * Resolves and calls a parser function.
 *
 * @param fn_string - e.g., "parser_text::text_format"
 * @param data      - Data items array
 * @param options   - Parser options
 * @returns Parsed string or intermediate data or null
 */
export function apply_parser(fn_string: string, data: any[] | null, options: parser_options): any {

	const fn = resolve_parser(fn_string);
	if (!fn) {
		console.warn(`[parsers] Unknown parser function: ${fn_string}, falling back to default_join`);
		return default_join(data, options);
	}

	return fn(data, options);
}



// Re-export individual parsers for direct use
export { default_join, join_items_to_string, text_format, map_value, v5_html } from './parser_text';
export { get_section_id, get_section_tipo, get_term_id, truncate_by_term_id, truncate_by_model, filter_by_section_tipo, filter_parents_by_term_id, slice_chain } from './parser_locator';
export { get_first, count, merge } from './parser_helper';
export { default as date_default, select_properties, select_keys, format_string_date, string_date, unix_timestamp } from './parser_date';
export { default as info_default, widget } from './parser_info';
export { flat } from './parser_iri';
export { geojson } from './parser_geo';
export { replace as replace_pattern } from './pattern_replacer';
