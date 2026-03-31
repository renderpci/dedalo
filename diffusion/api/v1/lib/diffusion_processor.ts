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

import { apply_parser, default_join, join_items_to_string, merge } from './parsers/index';
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
	data_item
} from './types';


export interface LangsConfig {
	langs:     string[];
	main_lang: string | null;
}

export const langs_config: LangsConfig = {
	langs: [],
	main_lang: null
};


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

	langs_config.langs 		= all_langs;
	langs_config.main_lang 	= main_lang;

	const tables: processed_table[] = [];

	for (const datum of response.datum) {
		const table = process_datum_group(datum, database_name);
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
 * @returns A processed_table or null if no data
 */
function process_datum_group(
	datum:         datum_group,
	database_name: string
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
		const processed = process_record(record, datum.context);
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
 * @returns Array of processed records, one per lang
 */
function process_record(
	record:    datum_record,
	context:   context_field[],
): processed_record[] {

	// ---------------------------------------------------------------
	// PHASE 1: Parse all entries per column, grouped by lang
	// ---------------------------------------------------------------
	// Structure: column_name → Map<lang | "nolan", parsed_value>
	const column_parsed_values = new Map<string, Map<string, string | null>>();

	// Also track tipo → lang_values for the merge_columns post-pass
	const tipo_to_lang_values  = new Map<string, Map<string, string | null>>();

	// Contexts that use merge_columns are deferred to run AFTER all other columns
	const deferred_merge_ctx: context_field[] = [];

	for (const ctx of context) {

		const tipo    = ctx.tipo;
		const entries = (record.entries as Record<string, entry_value[]>)[tipo];
		const column_name = sanitize_column_name(ctx.term);

		// Initialize the lang→value map for this column
		const lang_values = new Map<string, string | null>();
		column_parsed_values.set(column_name, lang_values);
		tipo_to_lang_values.set(tipo, lang_values);

		// Check parsers
		const parser = ctx.parser as parser_definition;

		// Defer merge_columns until all other columns are resolved
		if (parser_uses_merge_columns(parser)) {
			deferred_merge_ctx.push(ctx);
			continue;
		}

		// Data-independent parsers (e.g. publication_unix_timestamp) generate their own
		// value without needing server data — run them even when entries is empty.
		if (parser_is_data_independent(parser)) {
			const effective_parser = ctx.columns?.length
				? inject_columns_into_parser(parser, ctx.columns, langs_config.main_lang)
				: parser;
			const result = apply_parser_chain(effective_parser, [], ctx.output_format);
			if (result !== null && result !== undefined) {
				lang_values.set('nolan', String(result));
			}
			continue;
		}

		if (!entries || entries.length === 0) {
			// No data for this field at all
			continue;
		}

		// ---------------------------------------------------------------
		// COLUMN-ORDER MODE: pass all entries at once so merge_with_columns
		// can do cross-lang grouping and fallback internally.
		// The per-lang loop below would give the parser only one lang slice
		// at a time, making nolan and cross-lang fallback impossible.
		// ---------------------------------------------------------------
		if (ctx.columns?.length) {
			const has_parser = Array.isArray(parser)
				? parser.length > 0
				: (parser && Object.keys(parser).length > 0);

			if (has_parser) {
				const all_data_items: data_item[] = entries.map((e: entry_value) => {
					const item: data_item = { id: e.id, value: e.value, tipo: e.tipo, lang: e.lang };
					if (e.parents)     item.parents      = e.parents;
					if (e.section_id   != null) item.section_id   = e.section_id;
					if (e.section_tipo != null) item.section_tipo = e.section_tipo;
					return item;
				});

				const effective_parser = inject_columns_into_parser(parser, ctx.columns, langs_config.main_lang);
				const parser_result    = apply_parser_chain(effective_parser, all_data_items, ctx.output_format, ctx.columns, langs_config.main_lang);

				if (Array.isArray(parser_result) && parser_result.length > 0) {
					for (const item of parser_result) {
						let val_str: string | null = null;
						if (item.value !== null && item.value !== undefined) {
							if (ctx.output_format === 'int') {
								val_str = String(parseInt(String(item.value), 10));
								if (val_str === 'NaN') val_str = '0';
							} else if (ctx.output_format === 'json') {
								val_str = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
							} else {
								val_str = typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value);
							}
						}
						const lang_key = (!item.lang || item.lang === 'lg-nolan') ? 'nolan' : item.lang;
						if (lang_key !== 'nolan' || val_str !== null) {
							lang_values.set(lang_key, val_str);
						}
					}
				}
			} else {
				// No explicit parser — auto-apply merge() with columns directly on raw entries.
				// Handles the common case of "parser": {} with columns defined.
				const all_data_items: data_item[] = entries.map((e: entry_value) => {
					const item: data_item = { id: e.id, value: e.value, tipo: e.tipo, lang: e.lang };
					if (e.section_id   != null) item.section_id   = e.section_id;
					if (e.section_tipo != null) item.section_tipo = e.section_tipo;
					return item;
				});

				if (ctx.output_format === 'json') {
					// JSON output: resolve_slot is string-only and would corrupt complex values
					// (e.g. locator arrays). Fan-out directly, JSON.stringify preserves structure.
					for (const item of all_data_items) {
						if (item.value === null || item.value === undefined) continue;
						const val_str  = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
						const lang_key = (!item.lang || item.lang === 'lg-nolan') ? 'nolan' : item.lang;
						lang_values.set(lang_key, val_str);
					}
				} else {
					// String/int output: merge() with columns for proper separator and fallback handling
					const auto_result = merge(all_data_items, {
						columns:   ctx.columns,
						merge:     'string',
						main_lang: langs_config.main_lang ?? undefined,
					});

					if (Array.isArray(auto_result) && auto_result.length > 0) {
						for (const item of auto_result) {
							let val_str: string | null = null;
							if (item.value !== null && item.value !== undefined) {
								if (ctx.output_format === 'int') {
									val_str = String(parseInt(String(item.value), 10));
									if (val_str === 'NaN') val_str = '0';
								} else {
									val_str = typeof item.value === 'object' ? JSON.stringify(item.value) : String(item.value);
								}
							}
							const lang_key = (!item.lang || item.lang === 'lg-nolan') ? 'nolan' : item.lang;
							if (lang_key !== 'nolan' || val_str !== null) {
								lang_values.set(lang_key, val_str);
							}
						}
					}
				}
			}
			continue; // Skip the standard per-lang loop below
		}

		// Group entries by lang
		const entries_by_lang = group_entries_by_lang(entries);

		for (const [lang, lang_entries] of entries_by_lang) {

			// Build data items for the parser
			const data_items = lang_entries.map((e: entry_value) => {
				const item: data_item = {
					id:    e.id,
					value: e.value,
					tipo:  e.tipo,
					lang:  e.lang,
				};
				if(e.parents){
					item.parents = e.parents;
				}
				if (e.section_id !== undefined && e.section_id !== null) {
					item.section_id = e.section_id;
				}
				if (e.section_tipo !== undefined && e.section_tipo !== null) {
					item.section_tipo = e.section_tipo;
				}
				return item;
			});
			let column_value: string | null = null;
			let handled_by_parser = false;
			
			// Check if parser definition exists (object, array, etc)
			const has_parser = Array.isArray(parser) ? parser.length > 0 : (parser && Object.keys(parser).length > 0);

			if (has_parser) {
				const effective_parser = ctx.columns?.length
					? inject_columns_into_parser(parser, ctx.columns, langs_config.main_lang)
					: parser;
				const parser_result = apply_parser_chain(effective_parser, data_items, ctx.output_format);

				if (parser_result !== null) {
					// Final result should be data_item[], but apply_parser_chain returns any
					// We convert the final result to a string for column value
					if (Array.isArray(parser_result)) {
						if (parser_result.length > 0) {
							
							for (const item of parser_result) {
								let val_str: string | null = null;
								
								if (item.value !== null) {
									// Apply requested output format if defined
									if (ctx.output_format === 'json') {
										// JSON stringify only if not already a plain string.
										// If the parser chain (e.g. map_value) already produced a string
										// value like "yes"/"no", leave it as-is to avoid double-encoding.
										if (typeof item.value === 'string') {
											val_str = item.value;
										} else {
											val_str = JSON.stringify(item.value);
										}
									} else if (ctx.output_format === 'int') {
										// Parse as integer
										val_str = String(parseInt(String(item.value), 10));
										if (val_str === 'NaN') val_str = '0';
									} else {
										// Default string format
										if (typeof item.value === 'object' && item.value !== null) {
											val_str = JSON.stringify(item.value);
										} else {
											val_str = String(item.value);
										}
									}
								}
								
								// Determine language key
								const item_lang = item.lang || lang;
								const key = (!item_lang || item_lang === 'lg-nolan') ? 'nolan' : item_lang;

								// Only store nolan entries when they have a real value.
								if (key !== 'nolan' || val_str !== null) {
									lang_values.set(key, val_str);
								}
							}
							handled_by_parser = true;
						} else {
							column_value = null;
						}
					} else {
						// Fallback if somehow a parser returns a primitive string (unlikely with standardized parsers)
						column_value = String(parser_result);
					}
				}
			} else {
				// No parser — use join_items_to_string (default behavior) or apply specific format to the whole set
				if (ctx.output_format === 'json') {
					// Just JSON encode the values
					const raw_values = data_items.flatMap(d => d.value);
					column_value = JSON.stringify(raw_values);

				} else if (ctx.output_format === 'int') {
					// Parse first value as int
					const first_val = data_items[0]?.value;
					column_value = String(parseInt(String(first_val), 10));
					if (column_value === 'NaN') column_value = '0';
				} else {
					column_value = join_items_to_string(data_items, {});
				}
			}

			if (!handled_by_parser) {
				// Normalize lang key: null and "lg-nolan" → "nolan"
				const lang_key = (!lang || lang === 'lg-nolan') ? 'nolan' : lang;
				// Only store nolan entries when they have a real value.
				// A nolan null entry would block the main_lang fallback in Phase 2.
				if (lang_key !== 'nolan' || column_value !== null) {
					lang_values.set(lang_key, column_value);
				}
			}
		}
	}

	// ---------------------------------------------------------------
	// PHASE 1b: Process deferred merge_columns using parsed strings
	// ---------------------------------------------------------------
	for (const ctx of deferred_merge_ctx) {
		const column_name = sanitize_column_name(ctx.term);
		const lang_values = column_parsed_values.get(column_name)!;
		const parser      = ctx.parser as parser_definition;

		// Build data_items from already-parsed column values (SQL-ready strings).
		// item.id = column_tipo so parser_global::merge_columns can filter by columns option.
		const merged_items: data_item[] = [];
		for (const [col_tipo, col_lang_values] of tipo_to_lang_values) {
			// Pick best available value (nolan → main_lang → first)
			const val = col_lang_values.get('nolan')
				?? (langs_config.main_lang ? col_lang_values.get(langs_config.main_lang) : undefined)
				?? get_first_value(col_lang_values)
				?? null;
			merged_items.push({
				id:    col_tipo,
				value: val,
				tipo:  col_tipo,
				lang:  null,
			});
		}

		const parser_result = apply_parser_chain(parser, merged_items, ctx.output_format);
		const merged_str = typeof parser_result === 'string' ? parser_result
			: (Array.isArray(parser_result) && parser_result.length > 0 ? String(parser_result[0]?.value ?? '') : null);

		if (merged_str !== null && merged_str !== '') {
			lang_values.set('nolan', merged_str);
		}
	}

	// ---------------------------------------------------------------
	// PHASE 2: Expand to one record per lang
	// ---------------------------------------------------------------
	// If no langs provided, emit a single record with null lang
	if (langs_config.langs.length === 0) {
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

	for (const lang of langs_config.langs) {

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
			if (langs_config.main_lang && lang_values.has(langs_config.main_lang)) {
				columns[column_name] = lang_values.get(langs_config.main_lang)!;
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
 * PARSER_USES_MERGE_COLUMNS
 * Returns true if any parser in the chain is parser_global::merge_columns.
 */
function parser_uses_merge_columns(parser: any): boolean {
	if (!parser) return false;
	const chain = Array.isArray(parser) ? parser : [parser];
	return chain.some((p: any) => p?.fn === 'parser_global::merge_columns');
}



/**
 * PARSER_IS_DATA_INDEPENDENT
 * Returns true for parsers that generate their own value without server data.
 * These are called even when the column has no entries (e.g. publication_unix_timestamp).
 */
function parser_is_data_independent(parser: any): boolean {
	if (!parser) return false;
	const chain = Array.isArray(parser) ? parser : [parser];
	return chain.some((p: any) => p?.fn === 'parser_global::publication_unix_timestamp');
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
 * INJECT_COLUMNS_INTO_PARSER
 * Clones the parser chain (or single definition) and merges
 * { columns, main_lang } into each step's options.
 * Never mutates the original parser objects.
 *
 * @param parser    - Original parser definition(s) from context
 * @param columns   - Column order array from context_field.columns
 * @param main_lang - Active main language from langs_config
 * @returns Cloned parser chain with injected options
 */
function inject_columns_into_parser(
	parser:    parser_definition | parser_definition[] | Record<string, never>,
	columns:   Array<{ tipo: string; model: string }>,
	main_lang: string | null
): parser_definition | parser_definition[] | Record<string, never> {

	const extra: Record<string, unknown> = { columns };
	if (main_lang) extra.main_lang = main_lang;

	if (Array.isArray(parser)) {
		return parser.map(p => ({ ...p, options: { ...p.options, ...extra } }));
	}

	const p = parser as parser_definition;
	return { ...p, options: { ...p.options, ...extra } };
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
	parsers:       parser_definition | parser_definition[] | Record<string, never>,
	data:          any[],
	output_format: string = 'string',
	columns?:      Array<{ tipo: string; model: string }> | null,
	main_lang?:    string | null
): any {

	if (!parsers || (typeof parsers === 'object' && Object.keys(parsers).length === 0)) {
		return null;
	}

	const chain = Array.isArray(parsers) ? parsers : [parsers as parser_definition];

	const state = new Map<string, any[]>();
	let last_unmapped_result: any = data;

	for (const parser_def of chain) {
		if (!parser_def.fn) continue;

		let input_data: any[];

		if (parser_def.id) {
			if (state.has(parser_def.id)) {
				input_data = state.get(parser_def.id)!;
			} else {
				// Filter original data to only the items matching this id
				input_data = Array.isArray(data) ? data.filter(d => d && d.id === parser_def.id) : data;
			}
		} else {
			if (state.size > 0) {
				// Combine all state variables into a single data_item array for formatters
				const combined: any[] = [];
				for (const [key, val] of state.entries()) {
					if (Array.isArray(val)) {
						for (const v_item of val) {
							if (typeof v_item === 'object' && v_item !== null) {
								combined.push({ ...v_item, id: key });
							} else {
								combined.push({ id: key, value: v_item });
							}
						}
					} else {
						combined.push({ id: key, value: val });
					}
				}
				
				// Re-integrate any original data items that were NOT mapped into state
				if (Array.isArray(data)) {
					for (const d_orig of data) {
						if (d_orig && d_orig.id !== null && !state.has(d_orig.id)) {
							combined.push(d_orig);
						} else if (d_orig && d_orig.id === null) {
							combined.push(d_orig);
						}
					}
				}
				
				input_data = combined;
				state.clear();
			} else {
				input_data = last_unmapped_result;
			}
		}

		let valid_data: any[] | null;
		if (Array.isArray(input_data)) {
			valid_data = input_data;
		} else if (input_data !== null && input_data !== undefined) {
			const meta = (Array.isArray(data) && data.length > 0) ? data[0] : {};
			valid_data = [{
				id:    null,
				value: input_data,
				tipo:  meta.tipo,
				lang:  meta.lang
			}];
		} else {
			valid_data = null;
		}

		let result = apply_parser(parser_def.fn, valid_data, parser_def.options ?? {});

		if (result === null) {
			if (!parser_def.id) return null;
			continue;
		}

		if (parser_def.id) {
			state.set(parser_def.id, Array.isArray(result) ? result : [result]);
		} else {
			last_unmapped_result = result;
		}
	}

	// Output logic (in case the chain ended with unmapped or mapped items)
	if (state.size > 0) {
		const combined: any[] = [];
		for (const [key, val] of state.entries()) {
			if (Array.isArray(val)) {
				for (const v_item of val) {
					if (typeof v_item === 'object' && v_item !== null) {
						combined.push({ ...v_item, id: key });
					} else {
						combined.push({ id: key, value: v_item });
					}
				}
			} else {
				combined.push({ id: key, value: val });
			}
		}
		
		// Re-integrate any original data items that were NOT mapped into state
		if (Array.isArray(data)) {
			for (const d_orig of data) {
				if (d_orig && d_orig.id !== null && !state.has(d_orig.id)) {
					combined.push(d_orig);
				} else if (d_orig && d_orig.id === null) {
					combined.push(d_orig);
				}
			}
		}
		
		return combined;
	}

	// ── DEFAULT COMPLETION CHAIN ─────────────────────────────────────────────
	// If the last result still contains data_item[] with value:string[] (emitted
	// by text_format or any other parser), auto-apply merge to collapse them.
	//
	// When columns are available (passed from the column-order branch of process_record),
	// delegate to merge() for proper column-aware collapsing.
	// When columns are absent, collapse array values inline (simple join/flatten).
	if (Array.isArray(last_unmapped_result) && last_unmapped_result.length > 0) {
		const has_array_values = last_unmapped_result.some(
			(item: any) =>
				item !== null &&
				typeof item === 'object' &&
				Array.isArray(item.value) &&
				item.value.length > 0 &&
				typeof item.value[0] === 'string'
		);
		if (has_array_values) {
			if (columns && columns.length > 0 && output_format !== 'json') {
				// Column-aware merge — preserves position and empty slots (string output only).
				// For json output, values flow through as-is so the fan-out can JSON.stringify them.
				const merge_opts: Record<string, any> = { columns, merge: 'string' };
				if (main_lang) merge_opts.main_lang = main_lang;
				const merged = merge(last_unmapped_result, merge_opts);
				if (merged) last_unmapped_result = merged;
			} else {
				// No columns — simple inline collapse (no merge() call needed)
				last_unmapped_result = last_unmapped_result.map((item: any) => ({
					...item,
					value: Array.isArray(item.value)
						? (output_format === 'json'
							? item.value.flat(Infinity)
							: item.value.filter((v: any) => v !== null && v !== undefined && v !== '').join(' | '))
						: item.value
				}));
			}
		}
	}

	return last_unmapped_result;
}
