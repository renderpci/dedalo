/**
 * PARSERS INDEX
 * Parser registry and dispatcher.
 * Maps PHP-format function strings (e.g., "parser_text::text_format")
 * to their JS implementations.
 */

import { default_join, text_format, map_value } from './parser_text';
import { string_date }                          from './parser_date';
import { get_section_id, get_first }            from './parser_locator';
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
	'parser_date::string_date':     string_date,
	'parser_locator::get_section_id': get_section_id,
	'parser_locator::get_first':    get_first,
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
export { string_date }                          from './parser_date';
export { get_section_id, get_first }            from './parser_locator';
export { replace as replace_pattern }           from './pattern_replacer';
