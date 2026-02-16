/**
 * DIFFUSION_PROCESSOR
 * Core processing pipeline that transforms the PHP dd_diffusion_api
 * agnostic response into SQL-ready data using parser configuration.
 *
 * Pipeline:
 *   PHP response (datum + context) → apply pre_parsers → apply parsers → processed_table[]
 *
 * Language expansion rules (per column, per section_id):
 *   1. Current lang match          → use it
 *   2. Nolan (null / "lg-nolan")   → duplicate across all lang records
 *   3. main_lang fallback          → use main_lang data
 *   4. Any-lang fallback           → use first available lang (best-effort)
 *   5. null                        → no data exists at all
 */

import { apply_parser, default_join, join_items_to_string } from './parsers/index';
import type {
	php_api_response,
	datum_group,
	context_field,
	datum_record,
	entry_value,
	processed_table,
	processed_record,
	main_node,
	parser_definition,
} from './types';



/**
 * PROCESS_RESPONSE
 * Main entry point. Takes the full PHP response and returns
 * an array of processed_table objects ready for SQL insertion.
 *
 * @param response - The PHP dd_diffusion_api response
 * @returns Array of processed tables with records
 */
export function process_response(response: php_api_response): processed_table[] {

	if (!response.result || !response.datum || !response.main) {
		return [];
	}

	// Resolve database name from main hierarchy
	const database_name = resolve_database_name(response.main);

	// All available languages from the response (keys of the langs object)
	const all_langs = response.langs ? Object.keys(response.langs) : [];
	const main_lang = response.main_lang ?? null;

	const tables: processed_table[] = [];

	for (const datum of response.datum) {
		const table = process_datum_group(datum, database_name, all_langs, main_lang);
		if (table) {
			tables.push(table);
		}
	}

	return tables;
}



/**
 * RESOLVE_DATABASE_NAME
 * Extracts the database name from the main hierarchy.
 * Looks for the node with model: "database".
 *
 * @param main - Array of hierarchy nodes
 * @returns Database name string
 */
function resolve_database_name(main: main_node[]): string {

	// Look for database definition in the hierarchy (model: "database")
	for (const node of main) {
		if (node.model === 'database' && node.term) {
			return node.term;
		}
	}

	return process.env.DB_NAME || 'web_dedalo';
}



/**
 * RESOLVE_TABLE_NAME
 * Extracts the table name from the main hierarchy.
 * Looks for the node with model: "table".
 *
 * @param datum - A datum group from the PHP response
 * @returns Table name string
 */
function resolve_table_name(datum: datum_group): string {
	// The table name is defined in the datum object itself
	return datum.term || datum.diffusion_tipo;
}



/**
 * PROCESS_DATUM_GROUP
 * Processes a single datum group (one table).
 * Each datum group maps to one database table.
 * Iterates each record, applies parsers per context field, and produces
 * processed_record objects — one per (section_id, lang).
 *
 * @param datum         - The datum group
 * @param database_name - Target database name
 * @param all_langs     - All available languages from the response
 * @param main_lang     - The main/default language for fallback
 * @returns A processed_table or null if no data
 */
function process_datum_group(
	datum:         datum_group,
	database_name: string,
	all_langs:     string[],
	main_lang:     string | null
): processed_table | null {

	if (!datum.data || datum.data.length === 0) {
		return null;
	}

	const table_name = resolve_table_name(datum);
	const records:    processed_record[] = [];
	const deletions:  (string | number)[] = [];

	// Map context fields by sanitized name for SQL generator metadata
	const columns_context: Record<string, context_field> = {};
	for (const ctx of datum.context) {
		const col_name = sanitize_column_name(ctx.term);
		columns_context[col_name] = ctx;
	}

	for (const record of datum.data) {
		// Records marked for deletion by PHP (unpublishable)
		if (record.entries === 'delete') {
			deletions.push(record.section_id);
			continue;
		}
		const processed = process_record(record, datum.context, all_langs, main_lang);
		records.push(...processed);
	}

	// Return null only if there's nothing to do at all
	if (records.length === 0 && deletions.length === 0) {
		return null;
	}

	return {
		database_name,
		table_name,
		records,
		deletions,
		columns_context,
	};
}



/**
 * PROCESS_RECORD
 * Processes a single data record, applying pre_parsers and parsers
 * from the context configuration to produce column values.
 *
 * Produces one processed_record per lang in all_langs.
 * The composite key is (section_id, lang).
 *
 * Language resolution per column (in priority order):
 *   1. Current lang      → exact match
 *   2. Nolan             → lang-independent, duplicated to all records
 *   3. main_lang         → fallback to main language
 *   4. Any available lang → best-effort fallback
 *   5. null              → no data at all
 *
 * @param record    - The raw datum record
 * @param context   - Array of context field definitions (columns)
 * @param all_langs - All languages to produce records for
 * @param main_lang - Main/default language for fallback
 * @returns Array of processed records, one per lang
 */
function process_record(
	record:    datum_record,
	context:   context_field[],
	all_langs: string[],
	main_lang: string | null,
): processed_record[] {

	// ---------------------------------------------------------------
	// PHASE 1: Parse all entries per column, grouped by lang
	// ---------------------------------------------------------------
	// Structure: column_name → Map<lang | "nolan", parsed_value>
	const column_parsed_values = new Map<string, Map<string, string | null>>();

	for (const ctx of context) {

		const tipo    = ctx.tipo;
		const entries = (record.entries as Record<string, entry_value[]>)[tipo];
		const column_name = sanitize_column_name(ctx.term);

		// Initialize the lang→value map for this column
		const lang_values = new Map<string, string | null>();
		column_parsed_values.set(column_name, lang_values);

		if (!entries || entries.length === 0) {
			// No data for this field at all
			continue;
		}

		// Check parsers
		const parser     = ctx.parser as parser_definition;

		// Group entries by lang
		const entries_by_lang = group_entries_by_lang(entries);

		for (const [lang, lang_entries] of entries_by_lang) {

			// Build data items for the parser
			const data_items = lang_entries.map(e => ({
				id:    e.id,
				value: e.value,
				tipo:  e.tipo,
				lang:  e.lang,
			}));

			// Apply parser if defined
			let column_value: string | null = null;
			
			// Check if parser definition exists (object, array, etc)
			const has_parser = Array.isArray(parser) ? parser.length > 0 : (parser && Object.keys(parser).length > 0);

			if (has_parser) {
				const parser_result = apply_parser_chain(parser, data_items);

				if (parser_result !== null) {
					// Final result should be data_item[], but apply_parser_chain returns any
					// We convert the final result to a string for column value
					if (Array.isArray(parser_result)) {
						if (parser_result.length > 0) {
							// Use the first item's value
							const val = parser_result[0].value;
							// Stringify objects/arrays (JSON style as requested for arrays) or use string value
							if (typeof val === 'object' && val !== null) {
								column_value = JSON.stringify(val);
							} else {
								column_value = String(val);
							}
						} else {
							column_value = null;
						}
					} else {
						// Fallback if somehow a parser returns a primitive string (unlikely with standardized parsers)
						column_value = String(parser_result);
					}
				}
			} else {
				// No parser — use join_items_to_string (default behavior)
				column_value = join_items_to_string(data_items, {});
			}

			// Normalize lang key: null and "lg-nolan" → "nolan"
			const lang_key = (!lang || lang === 'lg-nolan') ? 'nolan' : lang;
			lang_values.set(lang_key, column_value);
		}
	}

	// ---------------------------------------------------------------
	// PHASE 2: Expand to one record per lang
	// ---------------------------------------------------------------
	// If no langs provided, emit a single record with null lang
	if (all_langs.length === 0) {
		const columns: Record<string, string | null> = {};
		for (const [column_name, lang_values] of column_parsed_values) {
			// Take nolan or first available
			columns[column_name] = lang_values.get('nolan')
				?? get_first_value(lang_values)
				?? null;
		}
		return [{
			section_id: record.section_id,
			lang:       null,
			columns,
		}];
	}

	const results: processed_record[] = [];

	for (const lang of all_langs) {

		const columns: Record<string, string | null> = {};

		for (const [column_name, lang_values] of column_parsed_values) {

			// Priority 1: exact lang match
			if (lang_values.has(lang)) {
				columns[column_name] = lang_values.get(lang)!;
				continue;
			}

			// Priority 2: nolan (language-independent)
			if (lang_values.has('nolan')) {
				columns[column_name] = lang_values.get('nolan')!;
				continue;
			}

			// Priority 3: main_lang fallback
			if (main_lang && lang_values.has(main_lang)) {
				columns[column_name] = lang_values.get(main_lang)!;
				continue;
			}

			// Priority 4: any other available lang (best-effort)
			const any_value = get_first_value(lang_values);
			if (any_value !== undefined) {
				columns[column_name] = any_value;
				continue;
			}

			// Priority 5: no data
			columns[column_name] = null;
		}

		results.push({
			section_id: record.section_id,
			lang,
			columns,
		});
	}

	return results;
}



/**
 * GET_FIRST_VALUE
 * Returns the first non-undefined value from a lang→value map.
 * Used for the "any available lang" fallback.
 */
function get_first_value(lang_values: Map<string, string | null>): string | null | undefined {
	for (const [, value] of lang_values) {
		return value;
	}
	return undefined;
}



/**
 * GROUP_ENTRIES_BY_LANG
 * Groups entry values by their lang property.
 * Entries with null/nolan lang are grouped under null.
 */
function group_entries_by_lang(entries: entry_value[]): Map<string | null, entry_value[]> {

	const grouped = new Map<string | null, entry_value[]>();

	for (const entry of entries) {
		const lang = entry.lang || null;
		if (!grouped.has(lang)) {
			grouped.set(lang, []);
		}
		grouped.get(lang)!.push(entry);
	}

	return grouped;
}



/**
 * SANITIZE_COLUMN_NAME
 * Converts a human-readable term to a safe SQL column name.
 * Lowercases, replaces spaces/special chars with underscores.
 */
function sanitize_column_name(term: string): string {
	return term
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.replace(/_+/g, '_')
		.replace(/^_|_$/g, '');
}



/**
 * APPLY_PARSER_CHAIN
 * Applies a sequence of parsers to the data.
 * The output of each parser becomes the input for the next.
 *
 * @param parsers - Single parser definition or array of definitions
 * @param data    - Initial data items
 * @returns Final result (array or primitive) or null
 */
function apply_parser_chain(
	parsers: parser_definition | parser_definition[] | Record<string, never>,
	data: any[]
): any {

	if (!parsers || (typeof parsers === 'object' && Object.keys(parsers).length === 0)) {
		return null;
	}

	// Normalize to array
	const chain = Array.isArray(parsers) ? parsers : [parsers as parser_definition];

	let current_data: any = data;

	for (const parser_def of chain) {
		if (!parser_def.fn) continue;

		// Ensure current_data is in a format suitable for apply_parser (array)
		// If previous parser returned a primitive, wrap it as a data item value
		let valid_data: any[] | null;

		if (Array.isArray(current_data)) {
			valid_data = current_data;
		} else if (current_data !== null && current_data !== undefined) {
			// Wrap primitive in a structure preserving metadata from original data if possible
			// We try to grab metadata from the initial data if available
			const meta = (Array.isArray(data) && data.length > 0) ? data[0] : {};
			valid_data = [{
				id:    null,
				value: current_data,
				tipo:  meta.tipo,
				lang:  meta.lang
			}];
		} else {
			// Current data is null/undefined
			valid_data = null;
		}

		// Apply the parser
		let result = apply_parser(parser_def.fn, valid_data, parser_def.options ?? {});

		// If a parser returns null explicitly, it usually breaks the chain
		if (result === null) return null;

		// If parser definition has an ID, assign it to the result items
		if (parser_def.id) {
			if (Array.isArray(result)) {
				// Assign ID to each item in the array
				for (const item of result) {
					if (typeof item === 'object' && item !== null) {
						item.id = parser_def.id;
					}
				}
			} else {
				// Wrap primitive result to attach ID
				// Metadata (tipo, lang) preserved from input if possible
				const meta = (Array.isArray(valid_data) && valid_data.length > 0) ? valid_data[0] : {};
				result = [{
					id:    parser_def.id,
					value: result,
					tipo:  meta.tipo,
					lang:  meta.lang
				}];
			}
		}
		current_data = result;
	}

	return current_data;
}
