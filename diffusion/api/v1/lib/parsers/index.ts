/**
 * PARSERS INDEX
 * Parser registry and dispatcher.
 * Maps PHP-format function strings (e.g., "parser_text::text_format")
 * to their JS implementations.
 */

import { default_join, text_format, map_value } from './parser_text';
import { select_properties, select_keys, format_string_date, string_date, unix_timestamp } from './parser_date';
import { get_section_id, get_first, add_parents, get_parent_term_id, truncate_by_term_id, truncate_by_model, filter_by_section_tipo, splice_chain, flat_parents } from './parser_locator';
import type { parser_options }                  from '../types';



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
	'parser_text::default_join':    default_join,
	'parser_text::text_format':     text_format,
	'parser_text::map_value':       map_value,
	'parser_locator::get_section_id': get_section_id,
	'parser_locator::get_first':    get_first,
	'parser_locator::add_parents':  add_parents,
	'parser_locator::get_parent_term_id': get_parent_term_id,
	'parser_locator::truncate_by_term_id': truncate_by_term_id,
	'parser_locator::truncate_by_model':   truncate_by_model,
	'parser_locator::filter_by_section_tipo': filter_by_section_tipo,
	'parser_locator::splice_chain':        splice_chain,
	'parser_locator::flat_parents':        flat_parents,
	'parser_date::select_properties':  select_properties,
	'parser_date::select_keys':        select_keys,
	'parser_date::format_string_date': format_string_date,
	'parser_date::string_date':        string_date,
	'parser_date::unix_timestamp':     unix_timestamp,
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
export { default_join, join_items_to_string, text_format, map_value } from './parser_text';
export { get_section_id, get_first, add_parents, get_parent_term_id, truncate_by_term_id, truncate_by_model, filter_by_section_tipo, splice_chain, flat_parents } from './parser_locator';
export { select_properties, select_keys, format_string_date, string_date, unix_timestamp } from './parser_date';
export { replace as replace_pattern }           from './pattern_replacer';
