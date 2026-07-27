/**
 * TYPES
 * Shared type definitions for the diffusion engine.
 */
System.register("api/v1/lib/types", [], function (exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    return {
        setters: [],
        execute: function () {/**
             * TYPES
             * Shared type definitions for the diffusion engine.
             */
        }
    };
});
/**
 * PARSER_HELPER
 * Shared helper functions for parsers.
 */
System.register("api/v1/lib/parsers/parser_helper", [], function (exports_2, context_2) {
    "use strict";
    var EMPTY_MARKER;
    var __moduleName = context_2 && context_2.id;
    /**
     * GET_FIRST
     * Returns the first data item from the list.
     *
     * @param data    - Array of data items
     * @param options - Parser options
     * @returns Array containing only the first data item
     */
    function get_first(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const lang_seen = new Set();
        const result = [];
        for (const item of data) {
            const lang = (_a = item.lang) !== null && _a !== void 0 ? _a : '__nolan__';
            if (!lang_seen.has(lang)) {
                lang_seen.add(lang);
                const val = item.value;
                const final_val = (Array.isArray(val) && val.length > 0)
                    ? val[0]
                    : val;
                result.push({
                    ...item,
                    value: final_val
                });
            }
        }
        return result.length > 0 ? result : null;
    }
    exports_2("get_first", get_first);
    /**
     * GET_TAIL
     * Returns all data items except the first one (per language).
     *
     * @param data    - Array of data items
     * @param options - Parser options
     * @returns Array containing all but the first data item per lang
     */
    function get_tail(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const lang_seen = new Set();
        const result = [];
        for (const item of data) {
            const lang = (_a = item.lang) !== null && _a !== void 0 ? _a : '__nolan__';
            if (lang_seen.has(lang)) {
                // Already saw the first item for this lang, add to tail
                result.push(item);
            }
            else {
                // Mark first item seen
                lang_seen.add(lang);
            }
        }
        return result.length > 0 ? result : null;
    }
    exports_2("get_tail", get_tail);
    /**
     * COUNT
     * Count total values.
     *
     * @param data    - Array of data items
     * @param options - Parser options
     * @returns Total count packaged as a data_item value within an array
     */
    function count(data, options) {
        if (!data || data.length === 0)
            return null;
        let count_val = 0;
        for (const item of data) {
            const value = item.value;
            count_val += Array.isArray(value) ? value.length : 0;
        }
        return [{
                ...data[0],
                value: count_val
            }];
    }
    exports_2("count", count);
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
    function merge(data, options) {
        var _a, _b, _c, _d, _e;
        if (!data || data.length === 0)
            return null;
        // columns is mandatory for explicit parser calls (injected by diffusion_processor).
        // Internal auto-completion calls in apply_parser_chain omit columns — return null
        // so their `if (merged) result = merged` guard is a no-op and data flows through.
        const columns = options.columns;
        if (!columns || columns.length === 0)
            return null;
        const merge_style = options === null || options === void 0 ? void 0 : options.merge;
        const fields_sep = (_a = options === null || options === void 0 ? void 0 : options.fields_separator) !== null && _a !== void 0 ? _a : ', ';
        const records_sep = (_b = options === null || options === void 0 ? void 0 : options.records_separator) !== null && _b !== void 0 ? _b : ' | ';
        const main_lang = (_c = options === null || options === void 0 ? void 0 : options.main_lang) !== null && _c !== void 0 ? _c : null;
        const empty_columns = (_d = options === null || options === void 0 ? void 0 : options.empty_columns) !== null && _d !== void 0 ? _d : true;
        const section_data = new Map();
        const seen_sections = [];
        const lang_ref_items = new Map();
        for (const item of data) {
            const section_key = (item.section_id != null) ? String(item.section_id) : '__no_section__';
            const tipo_key = (_e = item.tipo) !== null && _e !== void 0 ? _e : '__unknown__';
            const lang_key = (!item.lang || item.lang === 'lg-nolan') ? '__nolan__' : item.lang;
            if (!section_data.has(section_key)) {
                section_data.set(section_key, new Map());
                seen_sections.push(section_key);
            }
            const tipo_map = section_data.get(section_key);
            if (!tipo_map.has(tipo_key))
                tipo_map.set(tipo_key, new Map());
            const lang_map = tipo_map.get(tipo_key);
            if (!lang_map.has(lang_key))
                lang_map.set(lang_key, []);
            lang_map.get(lang_key).push(item.value);
            // Store first ref_item per specific lang (skip nolan — not emitted standalone)
            if (lang_key !== '__nolan__' && !lang_ref_items.has(lang_key)) {
                lang_ref_items.set(lang_key, item);
            }
        }
        // -----------------------------------------------------------------------
        // Phase 2: Determine langs to render.
        // If only nolan items exist, emit one item with lang = null.
        // -----------------------------------------------------------------------
        const specific_langs = [...lang_ref_items.keys()];
        const langs_to_render = specific_langs.length > 0 ? specific_langs : ['__nolan__'];
        if (specific_langs.length === 0) {
            lang_ref_items.set('__nolan__', data[0]);
        }
        // -----------------------------------------------------------------------
        // Phase 3: Build one output item per lang, respecting merge_style.
        // resolve_slot applies the 5-level fallback chain for a tipo × lang pair.
        // -----------------------------------------------------------------------
        const resolve_slot = (tipo_map, tipo, lang_key) => {
            const lang_map = tipo_map.get(tipo);
            if (!lang_map || lang_map.size === 0)
                return '';
            let vals;
            if (lang_map.has(lang_key))
                vals = lang_map.get(lang_key); // 1. exact lang
            else if (lang_map.has('__nolan__'))
                vals = lang_map.get('__nolan__'); // 2. nolan
            else if (main_lang && lang_map.has(main_lang))
                vals = lang_map.get(main_lang); // 3. main_lang
            else
                vals = lang_map.values().next().value; // 4. any-lang
            if (!vals || vals.length === 0)
                return ''; // 5. empty
            // Join accumulated values for this slot with records_sep
            const parts = vals
                .filter(v => v !== null && v !== undefined)
                .map(v => String(v));
            return parts.length > 0 ? parts.join(records_sep) : '';
        };
        const result = [];
        for (const lang_key of langs_to_render) {
            // Build col_values per section (ordered, with "" for missing/empty slots)
            const sections_col_values = seen_sections.map(section_key => {
                const tipo_map = section_data.get(section_key);
                return columns.map(col => resolve_slot(tipo_map, col.tipo, lang_key));
            });
            // When empty_columns is false, strip empty slots from every section before merging
            const effective_col_values = empty_columns
                ? sections_col_values
                : sections_col_values.map(cv => cv.filter(v => v !== ''));
            let final_value;
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
                ...lang_ref_items.get(lang_key),
                lang: lang_key === '__nolan__' ? null : lang_key,
                value: final_value,
            });
        }
        return result.length > 0 ? result : null;
    }
    exports_2("merge", merge);
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
    function replace(pattern, values) {
        if (!pattern)
            return '';
        // Phase 1: Replace all placeholders
        // Build a map: a→0, b→1, c→2, ...
        let result = pattern;
        const placeholder_regex = /\$\{([a-zA-Z0-9_]+)\}/g;
        // Collect all placeholder names in order
        const placeholder_names = [];
        let match;
        const regex_copy = new RegExp(placeholder_regex.source, placeholder_regex.flags);
        while ((match = regex_copy.exec(pattern)) !== null) {
            if (!placeholder_names.includes(match[1])) {
                placeholder_names.push(match[1]);
            }
        }
        // Replace each placeholder with its value or the empty marker
        for (let i = 0; i < placeholder_names.length; i++) {
            const name = placeholder_names[i];
            const value = values[i];
            const is_empty = value === null || value === undefined || value === '';
            const safe_name = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const ph_regex = new RegExp(`\\$\\{${safe_name}\\}`, 'g');
            result = result.replace(ph_regex, is_empty ? EMPTY_MARKER : String(value));
        }
        // Phase 2: Cleanup formatting
        result = cleanup_formatting(result);
        return result;
    }
    exports_2("replace", replace);
    /**
     * CLEANUP_FORMATTING
     * Cleans up text formatting by removing empty value markers and fixing punctuation/spacing.
     *
     * @param text - Text containing empty markers
     * @returns Cleaned text
     */
    function cleanup_formatting(text) {
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
    exports_2("cleanup_formatting", cleanup_formatting);
    /**
     * Escape a string for use in a RegExp
     */
    function esc(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return {
        setters: [],
        execute: function () {/**
             * PARSER_HELPER
             * Shared helper functions for parsers.
             */
            /**
             * PATTERN_REPLACER
             * Advanced pattern replacement with empty value handling.
             * Port of PHP class.pattern_replacer.php
             *
             * Replaces ${a}, ${b}, etc. placeholders in a pattern string with provided values.
             * Gracefully handles empty or null values by cleaning up surrounding punctuation.
             */
            EMPTY_MARKER = '\x00EMPTY\x00';
        }
    };
});
/**
 * PARSER_TEXT
 * Process diffusion object text values.
 * Port of PHP class.parser_text.php
 *
 * Provides text joining and pattern-based formatting for diffusion data.
 */
System.register("api/v1/lib/parsers/parser_text", ["api/v1/lib/parsers/parser_helper"], function (exports_3, context_3) {
    "use strict";
    var parser_helper_1;
    var __moduleName = context_3 && context_3.id;
    /**
     * DEFAULT_JOIN
     * Alias for `parser_helper::merge` with merge:"string".
     * Collapses all data items into a single scalar string per lang.
     *
     * @param data    - Array of data items
     * @param options - { records_separator?: string, fields_separator?: string }
     * @returns Single data_item with joined string value, wrapped in array
     */
    function default_join(data, options) {
        return parser_helper_1.merge(data, { ...options, merge: 'string' });
    }
    exports_3("default_join", default_join);
    /**
     * JOIN_ITEMS_TO_STRING
     * Helper to join data items into a single string.
     */
    function join_items_to_string(data, options) {
        var _a, _b;
        if (!data || data.length === 0)
            return null;
        const records_separator = (_a = options.records_separator) !== null && _a !== void 0 ? _a : ' | ';
        const fields_separator = (_b = options.fields_separator) !== null && _b !== void 0 ? _b : ', ';
        const parts = [];
        for (const item of data) {
            const val = item.value;
            if (val === null || val === undefined)
                continue;
            if (Array.isArray(val)) {
                const joined = val
                    .filter((v) => v !== null && v !== undefined && v !== '')
                    .map((v) => stringify_value(v))
                    .join(fields_separator);
                if (joined)
                    parts.push(joined);
            }
            else {
                const str = stringify_value(val);
                if (str)
                    parts.push(str);
            }
        }
        if (parts.length === 0)
            return null;
        return parts.join(records_separator);
    }
    exports_3("join_items_to_string", join_items_to_string);
    /**
     * TEXT_FORMAT
     * Generic text pattern processor.
     *
     * Applies a pattern template (e.g. "${a}, ${b} / ${c}") to data items keyed by
     * their `id` property.  The processor works in three phases:
     *
     * 1. **Lang grouping** — Items are first grouped by their `lang` property so
     *    that each language receives its own independent formatting pass.  This
     *    preserves per-language values (e.g. lg-spa having four entries while
     *    lg-eng has only one) and prevents cross-language contamination.
     *
     * 2. **Value zipping** — Within each lang group, values are collected into an
     *    `id_map` keyed by the item `id`.  When multiple items share the same id
     *    they are appended to the same array.  The processor then iterates over
     *    the longest array (max_len) and builds one result per zip-row:
     *    - Single-element arrays are repeated across all rows (broadcast).
     *    - Multi-element arrays are consumed positionally (row 0 gets index 0, etc.).
     *
     * 3. **Pattern replacement** — For each zip-row the placeholder names from the
     *    pattern are resolved to their positional values and passed to the
     *    `replace()` helper, which handles empty/null cleanup.
     *
     * ---
     *
     * **Standard mode** (default, `group_by_section_id` absent or false):
     * All items within a lang group are zipped together regardless of their
     * `section_id`.  This produces one output data_item per zip-row.  Downstream
     * merge steps (explicit or the executor's auto-completion) are responsible
     * for joining multiple rows into a final string.
     *
     * **Section-grouped mode** (`group_by_section_id: true`):
     * After lang grouping, items are further sub-grouped by `section_id`.  The
     * value zipping and pattern replacement happen independently within each
     * section.  Section-level results are then joined using `fields_separator`
     * (between multiple zip-rows of the same section) and `records_separator`
     * (between different sections).  This produces exactly one output data_item
     * per lang with all section content already collapsed into a single string.
     *
     * This mode is useful when a single field references multiple ontology
     * records (e.g. iconography with several section_ids) and you need each
     * record's values formatted as a coherent group rather than a flat list.
     *
     * ---
     *
     * @param data    - Array of data items with `id` and `value`
     * @param options - Configuration object:
     *   - pattern: string — Template with ${id} placeholders (required).
     *   - group_by_section_id: boolean — When true, sub-group by section_id
     *     before zipping.  Section results are joined with records_separator.
     *   - fields_separator: string — Separator between multiple zip-rows within
     *     the same section (default: ", ").  Only used with group_by_section_id.
     *   - records_separator: string — Separator between different sections
     *     (default: " | ").  Only used with group_by_section_id.
     * @returns data_item[] where each value is string[], or null
     *
     * @example
     *   // Standard mode — multi-field zip
     *   text_format(
     *     [{id:'a',value:['Ana','Ger']},{id:'b',value:['Hero','Del']}],
     *     {pattern:'${a} ${b}'}
     *   )
     *   // → [{value:['Ana Hero']}, {value:['Ger Del']}]
     *
     *   // Standard mode — single-field with literal prefix
     *   text_format([{id:'a',value:'spa'}], {pattern:'lg-${a}'})
     *   // → [{value:['lg-spa']}]
     *
     *   // Section-grouped mode — two sections with one field
     *   text_format(
     *     [
     *       {id:'a',value:'Cabeza', section_id:'1'},
     *       {id:'a',value:'izquierda', section_id:'1'},
     *       {id:'a',value:'Diadema', section_id:'1125'}
     *     ],
     *     {pattern:'${a}', group_by_section_id:true, fields_separator:', ', records_separator:' | '}
     *   )
     *   // → [{value:['Cabeza, izquierda | Diadema']}]
     */
    function text_format(data, options) {
        var _a, _b, _c;
        // Early return for empty input
        if (!data || data.length === 0)
            return null;
        // Extract pattern; fall back to default_join when no pattern is defined
        const pattern = options.pattern;
        if (!pattern) {
            return default_join(data, options);
        }
        // Section-grouping mode: when true, items are sub-grouped by section_id
        // before the zip pass so each section produces an independent formatted
        // string.  Sections are then joined with records_separator.
        const group_by_section_id = options.group_by_section_id === true;
        // Separators used only in section-grouped mode:
        //   fields_separator  — joins multiple zip-rows within the same section
        //   records_separator — joins different sections together
        const fields_separator = (_a = options.fields_separator) !== null && _a !== void 0 ? _a : ', ';
        const records_separator = (_b = options.records_separator) !== null && _b !== void 0 ? _b : ' | ';
        // Extract unique placeholder names from the pattern in order of appearance.
        // These names correspond to the `id` property of data items and determine
        // which values are collected and in what order they are substituted.
        const placeholder_regex = /\$\{([a-zA-Z0-9_]+)\}/g;
        const placeholder_names = [];
        let match;
        while ((match = placeholder_regex.exec(pattern)) !== null) {
            if (!placeholder_names.includes(match[1])) {
                placeholder_names.push(match[1]);
            }
        }
        // Phase 1: Group items by lang so each language gets its own zip pass.
        // Items without a lang are placed in the '__nolan__' bucket (language-agnostic).
        const lang_groups = new Map();
        for (const item of data) {
            const lang_key = (_c = item.lang) !== null && _c !== void 0 ? _c : '__nolan__';
            if (!lang_groups.has(lang_key))
                lang_groups.set(lang_key, []);
            lang_groups.get(lang_key).push(item);
        }
        const all_results = [];
        // Phase 2 & 3: Process each language group independently
        for (const [lang_key, lang_items] of lang_groups) {
            if (group_by_section_id) {
                // Sub-group items by section_id, preserving insertion order.
                // This ensures that when a field references multiple ontology records
                // (each with a distinct section_id), each record is formatted as a
                // coherent group rather than being mixed with other records.
                const section_groups = new Map();
                const section_order = [];
                for (const item of lang_items) {
                    const skey = (item.section_id != null) ? String(item.section_id) : '__no_section__';
                    if (!section_groups.has(skey)) {
                        section_groups.set(skey, []);
                        section_order.push(skey);
                    }
                    section_groups.get(skey).push(item);
                }
                // Process each section independently and collect its formatted string
                const section_strings = [];
                for (const skey of section_order) {
                    const section_items = section_groups.get(skey);
                    // Build id_map: collect all values per placeholder id within this section
                    const id_map = new Map();
                    let max_len = 1;
                    for (const item of section_items) {
                        if (item.id) {
                            const val = item.value;
                            // Normalize values to string arrays for consistent zip behavior
                            const new_vals = Array.isArray(val)
                                ? val.map(v => v !== null && v !== undefined ? stringify_value(v) : null)
                                : [val !== null && val !== undefined ? stringify_value(val) : null];
                            if (id_map.has(item.id)) {
                                id_map.get(item.id).push(...new_vals);
                            }
                            else {
                                id_map.set(item.id, new_vals);
                            }
                            max_len = Math.max(max_len, id_map.get(item.id).length);
                        }
                    }
                    // Zip pass: build one formatted string per row, then join with fields_separator
                    const section_parts = [];
                    for (let i = 0; i < max_len; i++) {
                        const values = placeholder_names.map(name => {
                            var _a;
                            const mapped = id_map.get(name);
                            if (!mapped)
                                return null;
                            // Single-element values are broadcast across all rows;
                            // multi-element values are consumed positionally
                            return mapped.length === 1 ? mapped[0] : ((_a = mapped[i]) !== null && _a !== void 0 ? _a : null);
                        });
                        const result_str = parser_helper_1.replace(pattern, values);
                        if (result_str)
                            section_parts.push(result_str);
                    }
                    // Join all zip-rows of this section with fields_separator
                    if (section_parts.length > 0) {
                        section_strings.push(section_parts.join(fields_separator));
                    }
                }
                // Join all sections with records_separator → one output item per lang
                if (section_strings.length > 0) {
                    all_results.push({
                        id: null,
                        value: [section_strings.join(records_separator)],
                        tipo: lang_items[0].tipo,
                        lang: lang_key === '__nolan__' ? null : lang_key,
                        section_id: lang_items[0].section_id,
                        section_tipo: lang_items[0].section_tipo,
                    });
                }
            }
            else {
                // Standard mode: all items in the lang group are zipped together
                // regardless of section_id.  Produces one output per zip-row.
                // Build id_map: collect all values per placeholder id across the entire lang group
                const id_map = new Map();
                let max_len = 1;
                for (const item of lang_items) {
                    if (item.id) {
                        const val = item.value;
                        let new_vals = [];
                        if (Array.isArray(val)) {
                            new_vals = val.map(v => v !== null && v !== undefined ? stringify_value(v) : null);
                        }
                        else {
                            new_vals = [val !== null && val !== undefined ? stringify_value(val) : null];
                        }
                        if (id_map.has(item.id)) {
                            id_map.get(item.id).push(...new_vals);
                        }
                        else {
                            id_map.set(item.id, new_vals);
                        }
                        max_len = Math.max(max_len, id_map.get(item.id).length);
                    }
                }
                // One result per zip row. Always apply pattern replacement and wrap the
                // result string in a single-element array so the shape is uniform regardless
                // of placeholder count. Downstream merge (explicit or auto) handles joining.
                for (let i = 0; i < max_len; i++) {
                    const values = placeholder_names.map(name => {
                        var _a;
                        const mapped = id_map.get(name);
                        if (!mapped)
                            return null;
                        // Single-element values are broadcast across all rows;
                        // multi-element values are consumed positionally
                        return mapped.length === 1 ? mapped[0] : ((_a = mapped[i]) !== null && _a !== void 0 ? _a : null);
                    });
                    const result_str = parser_helper_1.replace(pattern, values);
                    if (result_str) {
                        all_results.push({
                            id: null,
                            value: [result_str],
                            tipo: lang_items[0].tipo,
                            lang: lang_key === '__nolan__' ? null : lang_key,
                            section_id: lang_items[0].section_id,
                            section_tipo: lang_items[0].section_tipo,
                        });
                    }
                }
            }
        }
        return all_results.length > 0 ? all_results : null;
    }
    exports_3("text_format", text_format);
    /**
     * STRINGIFY_VALUE
     * Converts any value to a string representation.
     */
    function stringify_value(val) {
        if (typeof val === 'string')
            return val;
        if (typeof val === 'number')
            return String(val);
        if (typeof val === 'boolean')
            return val ? 'true' : 'false';
        if (Array.isArray(val)) {
            return val.map(v => stringify_value(v)).join(', ');
        }
        if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
        }
        return '';
    }
    /**
     * MAP_VALUE
     * Maps values based on a provided dictionary.
     *
     * @param data    - Array of data items
     * @param options - { map: [{ [id]: { [key]: value } }] }
     * @returns Mapped data item values or null
     */
    function map_value(data, options) {
        if (!data || data.length === 0)
            return null;
        const map_options = options.map;
        if (!map_options || !Array.isArray(map_options)) {
            return default_join(data, options);
        }
        // Flatten the map array into a single lookup object for easier access
        // The structure in options is usually: "map": [{"a": {"1": "yes", "2": "no"}}]
        const result = [];
        for (const item of data) {
            const original_val = stringify_value(item.value);
            let mapped_val = null;
            // Try to find a map that applies
            for (const m of map_options) {
                // Check if map set key matches item.id (if item.id is present)
                if (item.id && m[item.id]) {
                    const mapping = m[item.id];
                    if (mapping[original_val] !== undefined) {
                        mapped_val = mapping[original_val];
                        break;
                    }
                }
                // Just use the first map found if generic or item.id is missing/unmatched
                for (const map_key in m) {
                    const mapping = m[map_key];
                    if (mapping[original_val] !== undefined) {
                        mapped_val = mapping[original_val];
                        break;
                    }
                }
                if (mapped_val !== null)
                    break;
            }
            result.push({
                ...item,
                value: mapped_val !== null ? mapped_val : original_val
            });
        }
        return result.length > 0 ? result : null;
    }
    exports_3("map_value", map_value);
    /**
     * V5_HTML
     * Cleans and normalises CKEditor/TinyMCE HTML for v5-compatible diffusion output.
     * Port of PHP component_text_area::get_diffusion_value (L1995-L2036).
     *
     * Processing pipeline (mirrors PHP logic exactly):
     *  1. Decode HTML entities on the raw string value.
     *  2. Return null when the result is empty.
     *  3. Remove empty paragraphs (`<p></p>` / `<p> </p>`).
     *  4. Convert `<p>` and `<p style="…">` opening tags → `<br>`.
     *  5. Strip all `</p>` closing tags.
     *  6. Remove a leading `<br />` or `<br>`.
     *  7. Remove a trailing `<br />` or `<br>`.
     *  8. Trim leading/trailing `&nbsp;` and whitespace.
     *
     * @param data    - Array of data items; only the first item's value is processed.
     * @param options - Standard parser options (unused but kept for interface consistency).
     * @returns Cleaned string wrapped in a data_item array, or null.
     */
    function v5_html(data, options) {
        if (!data || data.length === 0)
            return null;
        const first = data[0];
        const raw = first.value;
        if (raw === null || raw === undefined)
            return null;
        // 1. Decode HTML entities (mirrors PHP html_entity_decode)
        let value = decode_html_entities(String(raw));
        // 2. Empty guard
        if (!value || value.trim() === '')
            return null;
        // 3. Remove empty paragraphs
        if (value === '<p></p>' || value === '<p> </p>') {
            value = '';
        }
        // 4. Convert <p> / <p style="…"> → <br>
        value = value.replace(/<p( style="[^"]*")?>/gi, '<br>');
        // 5. Strip </p>
        value = value.replace(/<\/p>/gi, '');
        // 6. Remove leading <br /> or <br>
        if (value.startsWith('<br />')) {
            value = value.slice('<br />'.length);
        }
        else if (value.startsWith('<br>')) {
            value = value.slice('<br>'.length);
        }
        // 7. Remove trailing <br /> or <br>
        if (value.endsWith('<br />')) {
            value = value.slice(0, -'<br />'.length);
        }
        else if (value.endsWith('<br>')) {
            value = value.slice(0, -'<br>'.length);
        }
        // 8. Trim &nbsp; at boundaries and surrounding whitespace
        value = value.replace(/^&nbsp;|&nbsp;$/g, '').trim();
        if (!value)
            return null;
        return [{
                id: null,
                value: value,
                tipo: first.tipo,
                lang: first.lang
            }];
    }
    exports_3("v5_html", v5_html);
    /**
     * DECODE_HTML_ENTITIES
     * Converts common HTML entities to their character equivalents.
     * Mirrors PHP html_entity_decode behaviour for the subset used in diffusion text.
     */
    function decode_html_entities(str) {
        return str
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&apos;/g, "'")
            .replace(/&nbsp;/g, '\u00a0');
    }
    return {
        setters: [
            function (parser_helper_1_1) {
                parser_helper_1 = parser_helper_1_1;
            }
        ],
        execute: function () {/**
             * PARSER_TEXT
             * Process diffusion object text values.
             * Port of PHP class.parser_text.php
             *
             * Provides text joining and pattern-based formatting for diffusion data.
             */
        }
    };
});
/**
 * PARSER_DATE
 * Process diffusion object date values.
 * Port of PHP class.parser_date.php
 *
 * Converts Dédalo dd_date objects to formatted date strings.
 * Supports modes: date, range, time_range, period.
 */
System.register("api/v1/lib/parsers/parser_date", ["api/v1/lib/diffusion_processor"], function (exports_4, context_4) {
    "use strict";
    var diffusion_processor_1;
    var __moduleName = context_4 && context_4.id;
    /**
     * SELECT_PROPERTIES
     * Extracts specified properties (start, end, period) from date objects.
     * Each date value is an object like { start: {...}, end: {...}, period: {...} }.
     * This parser selects only the requested properties and flattens them.
     *
     * Default: ["start"]
     *
     * @param data    - Array of data items containing date values
     * @param options - { select: string[] }  e.g. ["start"] or ["start", "end"]
     * @returns Array of data items with extracted date parts
     */
    function select_properties(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const select_props = (_a = options.select) !== null && _a !== void 0 ? _a : ['start'];
        const result = [];
        for (const item of data) {
            const val = item.value;
            const values = Array.isArray(val) ? val : [val];
            const extracted = [];
            for (const date_obj of values) {
                if (!date_obj || typeof date_obj !== 'object')
                    continue;
                for (const prop of select_props) {
                    if (date_obj[prop] !== undefined && date_obj[prop] !== null) {
                        extracted.push(date_obj[prop]);
                    }
                }
            }
            if (extracted.length > 0) {
                result.push({
                    ...item,
                    value: extracted
                });
            }
        }
        return result.length > 0 ? result : null;
    }
    exports_4("select_properties", select_properties);
    /**
     * SELECT_KEYS
     * Picks array elements by index. Pads missing month/day with 0 for SQL compatibility.
     *
     * Default keys: [0]
     *
     * @param data    - Array of data items whose value is an array of dd_date_parts
     * @param options - { keys: number[] }  e.g. [0] or [0, 1]
     * @returns Array of data items with selected elements
     */
    function select_keys(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const keys = (_a = options.keys) !== null && _a !== void 0 ? _a : [0];
        const result = [];
        for (const item of data) {
            const val = item.value;
            const values = Array.isArray(val) ? val : [val];
            const selected = [];
            for (const key_index of keys) {
                if (key_index < values.length && values[key_index] !== undefined) {
                    const date_part = values[key_index];
                    // Pad missing date fields with 0 for SQL compatibility
                    if (date_part && typeof date_part === 'object') {
                        if (date_part.month === undefined || date_part.month === null) {
                            date_part.month = 0;
                        }
                        if (date_part.day === undefined || date_part.day === null) {
                            date_part.day = 0;
                        }
                    }
                    selected.push(date_part);
                }
            }
            if (selected.length > 0) {
                result.push({
                    ...item,
                    value: selected
                });
            }
        }
        return result.length > 0 ? result : null;
    }
    exports_4("select_keys", select_keys);
    /**
     * FORMAT_STRING_DATE
     * Formats dd_date_part objects to string using a pattern.
     *
     * Default pattern: "Y-m-d"
     * Default records_separator: " | "
     * Default fields_separator: ", "
     *
     * Supported tokens: Y (4-digit year), m (2-digit month), d (2-digit day),
     *                   H (2-digit hour), i (2-digit minute), s (2-digit second)
     *
     * @param data    - Array of data items whose value is an array of dd_date_parts
     * @param options - { pattern, records_separator, fields_separator }
     * @returns Array of data items with formatted string as value
     */
    function format_string_date(data, options) {
        var _a, _b, _c;
        if (!data || data.length === 0)
            return null;
        const pattern = (_a = options.pattern) !== null && _a !== void 0 ? _a : 'Y-m-d';
        const records_separator = (_b = options.records_separator) !== null && _b !== void 0 ? _b : ' | ';
        const fields_separator = (_c = options.fields_separator) !== null && _c !== void 0 ? _c : ', ';
        const result = [];
        for (const item of data) {
            const val = item.value;
            const values = Array.isArray(val) ? val : [val];
            const formatted_parts = [];
            for (const date_part of values) {
                if (date_part && typeof date_part === 'object') {
                    if (pattern === 'unix_timestamp') {
                        formatted_parts.push(date_part.get_unix_timestamp());
                    }
                    else {
                        formatted_parts.push(format_dd_date(date_part, pattern));
                    }
                }
            }
            if (formatted_parts.length > 0) {
                result.push({
                    ...item,
                    value: formatted_parts.join(fields_separator)
                });
            }
        }
        // If multiple records, join them
        if (result.length > 1) {
            const combined = result.map(r => r.value).join(records_separator);
            return [{
                    ...result[0],
                    value: combined
                }];
        }
        return result.length > 0 ? result : null;
    }
    exports_4("format_string_date", format_string_date);
    /**
     * STRING_DATE
     * Global parser that chains: select_properties → select_keys → format_string_date.
     * All options are optional with sensible defaults.
     *
     * @param data    - Array of data items containing date values
     * @param options - Combined options for all three sub-parsers:
     *   - select:             string[] (default: ["start"])
     *   - keys:               number[] (default: [0])
     *   - pattern:            string   (default: "Y-m-d")
     *   - records_separator:  string   (default: " | ")
     *   - fields_separator:   string   (default: ", ")
     * @returns Array of data items with formatted date string
     */
    function string_date(data, options) {
        if (!data || data.length === 0)
            return null;
        // Merge defaults
        const merged_options = {
            select: ['start'],
            keys: [0],
            pattern: 'Y-m-d',
            records_separator: ' | ',
            fields_separator: ', ',
            ...options
        };
        // Step 1: select_properties
        let result = select_properties(data, merged_options);
        // Step 2: select_keys
        result = select_keys(result, merged_options);
        // Step 3: format_string_date
        result = format_string_date(result, merged_options);
        return result;
    }
    exports_4("string_date", string_date);
    /**
     * DEFAULT
     * Port of PHP component_date::get_diffusion_value().
     * Mode-aware parser that converts dd_date objects to a diffusion-ready string.
     *
     * Modes (resolved via options.date_mode):
     *   - 'range' | 'time_range' : "start_ts,end_ts"  (comma-separated, "Y-m-d H:i:s")
     *   - 'period'               : "N years N months N days" (human-readable, localized labels)
     *   - 'date' | default       : "Y-m-d H:i:s" of the start date-part
     *
     * Returns only the first collected value (mirrors PHP "Temporal !!" behaviour).
     * Returns null when data is empty or no valid date part is found.
     *
     * @param data    - Array of data items containing date values
     * @param options - { date_mode?: string, records_separator?: string, fields_separator?: string }
     * @returns Array with a single data item whose value is the formatted string, or null
     */
    function default_1(data, options) {
        var _a, _b, _c;
        if (!data || data.length === 0)
            return null;
        const date_mode = (_a = options.date_mode) !== null && _a !== void 0 ? _a : 'date';
        const records_separator = (_b = options.records_separator) !== null && _b !== void 0 ? _b : ' | ';
        const fields_separator = (_c = options.fields_separator) !== null && _c !== void 0 ? _c : ', ';
        // Collect one [formatted_string] per date object — parallel to text_format output shape.
        // merge/auto-completion downstream handles joining across records.
        const ar_diffusion_items = [];
        const ar_period_items = []; // per-lang items for period mode
        for (const item of data) {
            const val = item.value;
            const values = Array.isArray(val) ? val : [val];
            for (const date_obj of values) {
                if (!date_obj || typeof date_obj !== 'object')
                    continue;
                switch (date_mode) {
                    case 'range':
                    case 'time_range': {
                        const ar_date = [];
                        if (date_obj.start && date_obj.start.year !== undefined) {
                            ar_date.push(format_dd_date(date_obj.start, 'Y-m-d H:i:s'));
                        }
                        if (date_obj.end && date_obj.end.year !== undefined) {
                            ar_date.push(format_dd_date(date_obj.end, 'Y-m-d H:i:s'));
                        }
                        if (ar_date.length > 0) {
                            ar_diffusion_items.push({ ...item, value: [ar_date.join(fields_separator)] });
                        }
                        break;
                    }
                    case 'period': {
                        if (date_obj.period) {
                            const period = date_obj.period;
                            // Build the period string for a given lang code
                            const build_period_string = (target_lang) => {
                                const parts = [];
                                if (period.year !== undefined)
                                    parts.push(period.year + ' ' + get_label('years', target_lang));
                                if (period.month !== undefined)
                                    parts.push(period.month + ' ' + get_label('months', target_lang));
                                if (period.day !== undefined)
                                    parts.push(period.day + ' ' + get_label('days', target_lang));
                                return parts.length > 0 ? parts.join(' ') : null;
                            };
                            const target_langs = diffusion_processor_1.langs_config.langs;
                            if (target_langs.length > 0) {
                                // Emit one item per lang — value:[string] matches text_format shape
                                for (const target_lang of target_langs) {
                                    const period_str = build_period_string(target_lang);
                                    if (period_str) {
                                        ar_period_items.push({ ...item, lang: target_lang, value: [period_str] });
                                    }
                                }
                            }
                        }
                        break;
                    }
                    case 'date':
                    default: {
                        if (date_obj.start && date_obj.start.year !== undefined) {
                            ar_diffusion_items.push({ ...item, value: [format_dd_date(date_obj.start, 'Y-m-d H:i:s')] });
                        }
                        break;
                    }
                }
            }
        } // end for
        // Period mode: return per-lang items (each value is string[])
        if (ar_period_items.length > 0) {
            return ar_period_items;
        }
        if (ar_diffusion_items.length === 0)
            return null;
        // Return one item per date record — merge/auto-completion joins them downstream.
        return ar_diffusion_items;
    }
    exports_4("default", default_1);
    /**
     * UNIX_TIMESTAMP
     * Converts dd_date objects to Unix timestamp (seconds since epoch).
     * Chains: select_properties → select_keys → convert to timestamp.
     *
     * Default: select=["start"], keys=[0]
     *
     * @param data    - Array of data items containing date values
     * @param options - { select: string[], keys: number[] }
     * @returns Array of data items with Unix timestamp (int) as value
     */
    function unix_timestamp(data, options) {
        if (!data || data.length === 0)
            return null;
        const merged_options = {
            select: ['start'],
            keys: [0],
            ...options
        };
        // Step 1: select_properties
        let result = select_properties(data, merged_options);
        // Step 2: select_keys (also pads missing month/day with 0)
        result = select_keys(result, merged_options);
        if (!result || result.length === 0)
            return null;
        // Step 3: convert to unix timestamp
        const final_result = [];
        for (const item of result) {
            const val = item.value;
            const values = Array.isArray(val) ? val : [val];
            for (const date_part of values) {
                if (date_part && typeof date_part === 'object') {
                    const ts = dd_date_to_unix(date_part);
                    final_result.push({
                        ...item,
                        value: ts
                    });
                }
            }
        }
        return final_result.length > 0 ? final_result : null;
    }
    exports_4("unix_timestamp", unix_timestamp);
    // =====================================================
    // Helpers
    // =====================================================
    /**
     * GET_LABEL
     * Returns a localized human-readable label for date period units.
     * Mirrors PHP's label::get_label() for the keys used by component_date.
     *
     * @param key  - 'years' | 'months' | 'days'
     * @param lang - Language code (e.g. 'en', 'es')
     * @returns Localized label string
     */
    function get_label(key, lang) {
        var _a, _b, _c, _d, _e;
        // Map Dédalo lang codes (e.g. "lg-spa") to the short key used in the label table.
        // Falls back to the lang string itself for direct short-code usage.
        const lang_code_map = {
            'lg-eng': 'en',
            'lg-spa': 'es',
            'lg-cat': 'ca',
            'lg-fra': 'fr',
            'lg-deu': 'de',
            'lg-por': 'pt',
            'lg-ita': 'it',
            'lg-nob': 'no',
            'lg-swe': 'sv',
            'lg-nld': 'nl',
        };
        const short = (_a = lang_code_map[lang]) !== null && _a !== void 0 ? _a : lang;
        const labels = {
            years: { en: 'years', es: 'años', ca: 'anys', fr: 'ans', de: 'Jahre', pt: 'anos', it: 'anni', no: 'år', sv: 'år', nl: 'jaar' },
            months: { en: 'months', es: 'meses', ca: 'mesos', fr: 'mois', de: 'Monate', pt: 'meses', it: 'mesi', no: 'mnd', sv: 'mån', nl: 'maanden' },
            days: { en: 'days', es: 'días', ca: 'dies', fr: 'jours', de: 'Tage', pt: 'dias', it: 'giorni', no: 'dager', sv: 'dagar', nl: 'dagen' },
        };
        return (_e = (_c = (_b = labels[key]) === null || _b === void 0 ? void 0 : _b[short]) !== null && _c !== void 0 ? _c : (_d = labels[key]) === null || _d === void 0 ? void 0 : _d['en']) !== null && _e !== void 0 ? _e : key;
    }
    /**
     * FORMAT_DD_DATE
     * Converts a dd_date_part object to a formatted string using PHP-style format tokens.
     *
     * @param date_part - The date components
     * @param pattern   - Format pattern (e.g., 'Y-m-d H:i:s')
     * @returns Formatted date string
     */
    function format_dd_date(date_part, pattern) {
        var _a, _b, _c, _d, _e, _f;
        const year = (_a = date_part.year) !== null && _a !== void 0 ? _a : 0;
        const month = (_b = date_part.month) !== null && _b !== void 0 ? _b : 0;
        const day = (_c = date_part.day) !== null && _c !== void 0 ? _c : 0;
        const hour = (_d = date_part.hour) !== null && _d !== void 0 ? _d : 0;
        const minute = (_e = date_part.minute) !== null && _e !== void 0 ? _e : 0;
        const second = (_f = date_part.second) !== null && _f !== void 0 ? _f : 0;
        // PHP sprintf('%04d', year) style padding
        let year_str = String(year);
        if (year < 0) {
            year_str = '-' + String(Math.abs(year)).padStart(3, '0');
        }
        else {
            year_str = year_str.padStart(4, '0');
        }
        let result = pattern;
        result = result.replace(/Y/g, year_str);
        result = result.replace(/m/g, String(month).padStart(2, '0'));
        result = result.replace(/d/g, String(day).padStart(2, '0'));
        result = result.replace(/H/g, String(hour).padStart(2, '0'));
        result = result.replace(/i/g, String(minute).padStart(2, '0'));
        result = result.replace(/s/g, String(second).padStart(2, '0'));
        return result;
    }
    /**
     * DD_DATE_TO_UNIX
     * Converts a dd_date_part to Unix timestamp (seconds since 1970-01-01).
     *
     * @param date_part - The date components
     * @returns Unix timestamp as integer
     */
    function dd_date_to_unix(date_part) {
        var _a, _b, _c, _d, _e, _f;
        const year = (_a = date_part.year) !== null && _a !== void 0 ? _a : 1970;
        const month = ((_b = date_part.month) !== null && _b !== void 0 ? _b : 1) - 1; // JS months are 0-indexed
        const day = (_c = date_part.day) !== null && _c !== void 0 ? _c : 1;
        const hour = (_d = date_part.hour) !== null && _d !== void 0 ? _d : 0;
        const minute = (_e = date_part.minute) !== null && _e !== void 0 ? _e : 0;
        const second = (_f = date_part.second) !== null && _f !== void 0 ? _f : 0;
        const date = new Date(Date.UTC(year, month, day, hour, minute, second));
        return Math.floor(date.getTime() / 1000);
    }
    return {
        setters: [
            function (diffusion_processor_1_1) {
                diffusion_processor_1 = diffusion_processor_1_1;
            }
        ],
        execute: function () {/**
             * PARSER_DATE
             * Process diffusion object date values.
             * Port of PHP class.parser_date.php
             *
             * Converts Dédalo dd_date objects to formatted date strings.
             * Supports modes: date, range, time_range, period.
             */
        }
    };
});
/**
 * PARSER_INFO
 * Process diffusion object info values.
 */
System.register("api/v1/lib/parsers/parser_info", [], function (exports_5, context_5) {
    "use strict";
    var __moduleName = context_5 && context_5.id;
    /**
     * WIDGET
     * Filters component_info dato items by widget name and id, then collects their values.
     * Port of PHP component_info::get_diffusion_dato().
     *
     * Each dato item is expected to have the shape:
     *   { widget: string, key: number, id: string, value: unknown }
     *
     * @param data    - Array of data_items whose `.value` is a widget-dato array (or a single object)
     * @param options - {
     *   widget_name: string[]   – list of widget function names to match (e.g. ["get_archive_weights"])
     *   select:      string[]   – parallel list of `id` values to select (e.g. ["media_diameter"])
     *   keys?:       number[]   – direct positional keys into the collected values array (e.g. [0] picks first, [0,2] picks first and third); omit to keep all
     * }
     * @returns Array of data_items with collected values, or null when nothing matches
     */
    function widget(data, options) {
        var _a, _b, _c, _d;
        if (!data || data.length === 0)
            return null;
        const widget_name = (_a = options.widget_name) !== null && _a !== void 0 ? _a : [];
        const select = (_b = options.select) !== null && _b !== void 0 ? _b : [];
        const keys = (_c = options.keys) !== null && _c !== void 0 ? _c : null;
        const collected = [];
        for (const item of data) {
            // The raw dato may be stored as an array directly in item.value
            const data_array = Array.isArray(item.value) ? item.value : [item.value];
            for (let i = 0; i < widget_name.length; i++) {
                const current_widget_name = widget_name[i];
                const current_select = (_d = select[i]) !== null && _d !== void 0 ? _d : null;
                // Filter dato items matching widget + id (mirrors PHP array_filter)
                const matched = data_array.filter((el) => (el === null || el === void 0 ? void 0 : el.widget) === current_widget_name && (el === null || el === void 0 ? void 0 : el.id) === current_select);
                for (const el of matched) {
                    collected.push(el.value);
                }
            }
        }
        if (collected.length === 0)
            return null;
        // Apply keys selector
        const final_values = keys
            ? keys.filter(i => i < collected.length).map(i => collected[i])
            : collected;
        // Re-wrap as data_items, preserving metadata from the first source item
        return final_values.map(v => ({
            ...data[0],
            value: v
        }));
    }
    exports_5("widget", widget);
    /**
     * DEFAULT
     * Port of PHP component_info::get_diffusion_value().
     * Processes a component_info diffusion value:
     *   1. Skips null/empty values.
     *   2. Strips <mark> / </mark> tags (untranslated markers) from the string.
     *   3. Applies keys index-based slicing when provided:
     *        - Splits the value by `record_separator` (default ", "),
     *        - Keeps only the parts whose 0-based index is listed in `keys`,
     *        - Rejoins them with the same record_separator.
     *
     * Options:
     *   keys?:  number[]  – 0-based indices to keep after splitting
     *   record_separator?:   string    – delimiter used to split/join (default ", ")
     *
     * @param data    - Array of data items whose `.value` is a string
     * @param options - Parser options (keys, record_separator)
     * @returns Array of processed data items, or null when nothing remains
     */
    function default_2(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const keys = Array.isArray(options.keys)
            ? options.keys
            : null;
        const record_separator = (_a = options.record_separator) !== null && _a !== void 0 ? _a : ', ';
        const result = [];
        for (const item of data) {
            // null/empty guard
            const raw = item.value;
            if (raw === null || raw === undefined || raw === '')
                continue;
            // Coerce to string (mirrors PHP to_string())
            let value = typeof raw === 'string' ? raw : String(raw);
            // Strip <mark> / </mark> tags (PHP: preg_replace("/<\/?mark>/", "", …))
            value = value.replace(/<\/?mark>/g, '');
            if (value === '')
                continue;
            // keys slicing (mirrors PHP case isset($option_obj->keys))
            if (keys !== null) {
                const beats = value.split(record_separator);
                const selection = beats.filter((_part, index) => keys.includes(index));
                value = selection.join(record_separator);
            }
            if (value === '')
                continue;
            result.push({
                ...item,
                value
            });
        }
        return result.length > 0 ? result : null;
    }
    exports_5("default", default_2);
    return {
        setters: [],
        execute: function () {/**
             * PARSER_INFO
             * Process diffusion object info values.
             */
        }
    };
});
/**
 * PARSER_IRI
 * Process diffusion object IRI values (component_iri).
 *
 * Each data item value is expected to have the shape:
 *   { iri: string, title?: string }
 *
 * Example input:
 *   [
 *     { iri: "https://dedalo.dev",  title: "Official Dédalo web" },
 *     { iri: "https://other.es",    title: "other" }
 *   ]
 *
 * Example output (default options):
 *   "Official Dédalo web, https://dedalo.dev | other, https://other.es"
 */
System.register("api/v1/lib/parsers/parser_iri", [], function (exports_6, context_6) {
    "use strict";
    var __moduleName = context_6 && context_6.id;
    /**
     * FLAT
     * Joins IRI records into a flat string.
     *
     * For each data item whose `.value` is an `{ iri, title? }` object (or an
     * array of such objects), the function formats each entry as:
     *   "<title><fields_separator><iri>"   when a non-empty title is present
     *   "<iri>"                             when there is no title
     *
     * Individual formatted IRI entries (whether from a single object or an array)
     * are joined with `records_separator`.
     *
     * @param data    - Array of data items; each value may be an iri_value or iri_value[].
     * @param options - {
     *   fields_separator?:  string  – separates title and iri within one entry  (default ", ")
     *   records_separator?: string  – separates records (data items)             (default " | ")
     * }
     * @returns Formatted string wrapped in a data_item array, or null.
     *
     * @example
     *   const data = [
     *     { value: [{ iri: "https://dedalo.dev", title: "Official Dédalo web" },
     *               { iri: "https://other.es",   title: "other" }]
     * 		}
     *   ];
     *   flat(data, {});
     *   // → [{ value: "Official Dédalo web, https://dedalo.dev | other, https://other.es" }]
     */
    function flat(data, options) {
        var _a, _b, _c, _d, _e, _f;
        if (!data || data.length === 0)
            return null;
        const fields_separator = (_a = options.fields_separator) !== null && _a !== void 0 ? _a : ', ';
        const records_separator = (_b = options.records_separator) !== null && _b !== void 0 ? _b : ' | ';
        const all_formatted_entries = [];
        for (const item of data) {
            const raw = item.value;
            if (raw === null || raw === undefined)
                continue;
            // Normalise to array so both single objects and arrays are handled uniformly
            const entries = Array.isArray(raw)
                ? raw
                : [raw];
            for (const entry of entries) {
                if (!entry || typeof entry !== 'object')
                    continue;
                const iri = (_d = (_c = entry.iri) === null || _c === void 0 ? void 0 : _c.trim()) !== null && _d !== void 0 ? _d : '';
                const title = (_f = (_e = entry.title) === null || _e === void 0 ? void 0 : _e.trim()) !== null && _f !== void 0 ? _f : '';
                if (!iri)
                    continue;
                // Build "title<sep>iri" or just "iri" when title is absent
                const formatted = title
                    ? `${title}${fields_separator}${iri}`
                    : iri;
                all_formatted_entries.push(formatted);
            }
        }
        if (all_formatted_entries.length === 0)
            return null;
        return [{
                id: null,
                value: all_formatted_entries.join(records_separator),
                tipo: data[0].tipo,
                lang: data[0].lang
            }];
    }
    exports_6("flat", flat);
    return {
        setters: [],
        execute: function () {/**
             * PARSER_IRI
             * Process diffusion object IRI values (component_iri).
             *
             * Each data item value is expected to have the shape:
             *   { iri: string, title?: string }
             *
             * Example input:
             *   [
             *     { iri: "https://dedalo.dev",  title: "Official Dédalo web" },
             *     { iri: "https://other.es",    title: "other" }
             *   ]
             *
             * Example output (default options):
             *   "Official Dédalo web, https://dedalo.dev | other, https://other.es"
             */
        }
    };
});
/**
 * PARSER_GEO
 * Process diffusion geolocation values (component_geolocation).
 *
 * Two code paths mirror PHP behavior:
 *
 * 1. lib_data present → pass through as-is (already a GeoJSON layer array).
 * 2. lib_data absent  → build a GeoJSON layer array from lat/lon fields.
 *    - Default test coords (lat=39.462571, lon=-0.376295) → return null.
 *    - zoom and other fields are ignored.
 *
 * Input value shape (array, first element used):
 *   { id?, alt?, lat: string|number, lon: string|number, zoom?, lib_data?: layer[] }
 *
 * Output value shape (GeoJSON layer array):
 *   [{ layer_id: 1, text: "", layer_data: FeatureCollection }]
 */
System.register("api/v1/lib/parsers/parser_geo", [], function (exports_7, context_7) {
    "use strict";
    var DEFAULT_TEST_LAT, DEFAULT_TEST_LON;
    var __moduleName = context_7 && context_7.id;
    /**
     * GEO
     * Main parser function.
     *
     * @param data    - Array of data_items whose value is a geo_value[]
     * @param options - Parser options (currently unused, reserved for future use)
     * @returns data_item[] with GeoJSON layer array as value, or null
     */
    function geojson(data, options) {
        if (!data || data.length === 0)
            return null;
        const result = [];
        for (const item of data) {
            // DIFFTS-07: per-item layers. layer_array was declared outside the loop and
            // accumulated across all items, so each item pushed a result containing the
            // growing combined set. Scope it to the current item.
            const layer_array = [];
            const raw = item.value;
            if (raw === null || raw === undefined)
                continue;
            // Normalise: value may be a single object or an array
            const entries = Array.isArray(raw) ? raw : [raw];
            for (const geo_obj of entries) {
                if (!geo_obj || typeof geo_obj !== 'object')
                    continue;
                // Check if lib_data exists and actually contains features
                let has_features = false;
                if (geo_obj.lib_data && Array.isArray(geo_obj.lib_data)) {
                    for (const layer of geo_obj.lib_data) {
                        const ldata = layer.layer_data;
                        if (ldata && ldata.features && Array.isArray(ldata.features) && ldata.features.length > 0) {
                            has_features = true;
                            break;
                        }
                    }
                }
                if (has_features) {
                    // Path 1: lib_data already present and has valid features → pass through
                    layer_array.push(...geo_obj.lib_data);
                }
                else {
                    // Path 2: Build GeoJSON from lat/lon because either no lib_data or features are empty
                    const geojson = build_geojson_layer(geo_obj);
                    if (geojson)
                        layer_array.push(geojson);
                }
            }
            // DIFFTS-07: only emit a result when this item actually produced layers
            // (the previous `if (layer_array)` was always truthy).
            if (layer_array.length > 0) {
                result.push({
                    ...item,
                    value: layer_array
                });
            }
        }
        return result.length > 0 ? result : null;
    }
    exports_7("geojson", geojson);
    /**
     * BUILD_GEOJSON_LAYER
     * Constructs a GeoJSON layer array from raw lat/lon.
     * Returns null for missing coordinates or PHP default test values.
     *
     * @param geo_obj - Raw geo value object
     * @returns GeoJSON layer object or null
     */
    function build_geojson_layer(geo_obj) {
        const feature = build_single_feature(geo_obj);
        if (!feature)
            return null;
        return {
            layer_id: 1,
            text: '',
            layer_data: {
                type: 'FeatureCollection',
                features: [feature]
            }
        };
    }
    /**
     * BUILD_SINGLE_FEATURE
     * Constructs a single GeoJSON Feature from raw lat/lon.
     * Returns null for missing coordinates or PHP default test values.
     */
    function build_single_feature(geo_obj) {
        if (!geo_obj.lat || !geo_obj.lon)
            return null;
        // Normalise to string with '.' decimal separator (mirrors PHP str_replace(',', '.', …))
        const lat_str = String(geo_obj.lat).replace(',', '.');
        const lon_str = String(geo_obj.lon).replace(',', '.');
        // Skip PHP default test coordinates
        if (lat_str === DEFAULT_TEST_LAT && lon_str === DEFAULT_TEST_LON)
            return null;
        const lat = parseFloat(lat_str);
        const lon = parseFloat(lon_str);
        if (isNaN(lat) || isNaN(lon))
            return null;
        return {
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'Point',
                coordinates: [lon, lat] // GeoJSON order: [longitude, latitude]
            }
        };
    }
    return {
        setters: [],
        execute: function () {/**
             * PARSER_GEO
             * Process diffusion geolocation values (component_geolocation).
             *
             * Two code paths mirror PHP behavior:
             *
             * 1. lib_data present → pass through as-is (already a GeoJSON layer array).
             * 2. lib_data absent  → build a GeoJSON layer array from lat/lon fields.
             *    - Default test coords (lat=39.462571, lon=-0.376295) → return null.
             *    - zoom and other fields are ignored.
             *
             * Input value shape (array, first element used):
             *   { id?, alt?, lat: string|number, lon: string|number, zoom?, lib_data?: layer[] }
             *
             * Output value shape (GeoJSON layer array):
             *   [{ layer_id: 1, text: "", layer_data: FeatureCollection }]
             */
            /** Default test coordinates used by PHP to signal "no real data" */
            DEFAULT_TEST_LAT = '39.462571';
            DEFAULT_TEST_LON = '-0.376295';
        }
    };
});
System.register("api/v1/lib/parsers/parser_global", [], function (exports_8, context_8) {
    "use strict";
    var _cached_publication_timestamp;
    var __moduleName = context_8 && context_8.id;
    /**
     * MERGE_COLUMNS
     * Merges the values of specified columns into a single string.
     *
     * Receives the full row entries as data_items where item.id = column_tipo.
     * The processor injects the full row when this parser is detected.
     *
     * @param data    - Array of data items with item.id set to column tipo
     * @param options - Parser options containing 'columns' array and 'fields_separator'
     * @returns Merged string or null
     */
    function merge_columns(data, options) {
        const raw_columns = options.columns;
        const columns = Array.isArray(raw_columns) ? raw_columns : (raw_columns ? [String(raw_columns)] : []);
        const fields_separator = options.fields_separator !== undefined
            ? String(options.fields_separator)
            : ' ';
        if (!data || data.length === 0 || columns.length === 0) {
            return null;
        }
        const merged = [];
        for (const item of data) {
            // item.id is the column tipo (e.g. 'actv63') injected by the processor
            if (!item || !item.id || !columns.includes(item.id))
                continue;
            const val = item.value;
            if (val === undefined || val === null || val === '')
                continue;
            if (Array.isArray(val)) {
                const mapped = val
                    .map((v) => {
                    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                        return String(v);
                    }
                    return JSON.stringify(v);
                })
                    .filter((v) => v !== '');
                if (mapped.length > 0) {
                    merged.push(mapped.join(fields_separator));
                }
            }
            else if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
                merged.push(String(val));
            }
            else {
                merged.push(JSON.stringify(val));
            }
        }
        return merged.length > 0 ? merged.join(fields_separator) : null;
    }
    exports_8("merge_columns", merge_columns);
    /**
     * PUBLICATION_UNIX_TIMESTAMP
     * Generates a unique UNIX timestamp (seconds since epoch) for the entire diffusion process.
     * The value is memoized upon first call so that all rows receive the exact same timestamp.
     *
     * @param data    - Ignored
     * @param options - Ignored
     * @returns UNIX timestamp as an integer
     */
    function publication_unix_timestamp(data, options) {
        if (_cached_publication_timestamp === null) {
            _cached_publication_timestamp = Math.floor(Date.now() / 1000);
        }
        return _cached_publication_timestamp;
    }
    exports_8("publication_unix_timestamp", publication_unix_timestamp);
    return {
        setters: [],
        execute: function () {
            _cached_publication_timestamp = null;
        }
    };
});
/**
 * PARSER_MAP
 * Resolves diffusion data items against a custom map template.
 *
 * Provides:
 *   - `custom`: Builds a JSON array of objects by grouping data_items by
 *     (section_id, section_tipo) and interpolating ${id} placeholders in a
 *     map template. Designed for relation_list diffusion output.
 */
System.register("api/v1/lib/parsers/parser_map", [], function (exports_9, context_9) {
    "use strict";
    var __moduleName = context_9 && context_9.id;
    /**
     * CUSTOM
     * Applies a custom object map template to resolved data items.
     *
     * Real input shape: each data_item has `id` (letter), `value`, and the
     * metadata properties `section_id` and `section_tipo` injected by the PHP
     * chain processor directly on the item object.
     *
     * Algorithm:
     *   1. Group all data_items by their (section_id, section_tipo) pair.
     *   2. For each group, build an id→value lookup.
     *   3. Find the matching map template row for the group's section_tipo.
     *   4. Interpolate all ${id} placeholders in the template using the lookup.
     *   5. Always inject section_id and section_tipo into the resolved object.
     *   6. Return a single data_item whose value is the array of all resolved objects.
     *
     * The executor stores the result as a JSON array (output_format: "json").
     *
     * @param data    - data_item[] where each item has id, value, section_id, section_tipo
     * @param options - { map: Record<string,string>[] }
     * @returns Single data_item with value = resolved objects array, or null
     *
     * @example
     *   data = [
     *     { id: 'a', value: 'bbb',   section_id: '1', section_tipo: 'rsc205', tipo: 'rsc140', lang: 'lg-nolan' },
     *     { id: 'b', value: 'jo jo', section_id: '1', section_tipo: 'rsc205', tipo: 'rsc86',  lang: 'lg-nolan' },
     *     { id: 'c', value: 'la 11', section_id: '1', section_tipo: 'rsc205', tipo: 'rsc85',  lang: 'lg-nolan' },
     *   ]
     *   options.map = [{
     *     table: 'publications',
     *     title: '${a}',
     *     author: '${b}, ${c}',
     *     section_tipo: '${section_tipo}',
     *   }]
     *   // → [{ value: [
     *   //       { section_id:'1', section_tipo:'rsc205', table:'publications',
     *   //         title:'bbb', author:'jo jo, la 11' }
     *   //     ] }]
     */
    function custom(data, options) {
        var _a, _b, _c;
        if (!data || data.length === 0)
            return null;
        const map_templates = options.map;
        if (!map_templates || !Array.isArray(map_templates) || map_templates.length === 0)
            return null;
        const groups = new Map();
        for (const item of data) {
            if (item.id === null || item.id === undefined)
                continue;
            const section_id = String((_a = item.section_id) !== null && _a !== void 0 ? _a : '');
            const section_tipo = String((_b = item.section_tipo) !== null && _b !== void 0 ? _b : '');
            const key = `${section_id}__${section_tipo}`;
            if (!groups.has(key)) {
                groups.set(key, { section_id, section_tipo, id_map: new Map() });
            }
            const group = groups.get(key);
            const raw = item.value;
            const str = (raw !== null && raw !== undefined) ? String(raw) : '';
            // Concatenate if the same id appears multiple times within a group
            if (group.id_map.has(item.id)) {
                group.id_map.set(item.id, group.id_map.get(item.id) + str);
            }
            else {
                group.id_map.set(item.id, str);
            }
        }
        if (groups.size === 0)
            return null;
        // ── 2. Interpolate helper ─────────────────────────────────────────────────
        const interpolate = (tmpl_value, id_map) => tmpl_value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_match, id_name) => { var _a; return (_a = id_map.get(id_name)) !== null && _a !== void 0 ? _a : ''; });
        // ── 3. Resolve each group against the map template ────────────────────────
        const resolved_rows = [];
        for (const { section_id, section_tipo, id_map } of groups.values()) {
            // Inject built-in ids so templates can reference them via ${section_id} etc.
            id_map.set('section_id', section_id);
            id_map.set('section_tipo', section_tipo);
            // Find matching template: compare literal section_tipo or accept wildcard
            const template = map_templates.find(tmpl => {
                const t = tmpl['section_tipo'];
                if (!t || t === '${section_tipo}')
                    return true; // wildcard or missing
                return t === section_tipo;
            });
            if (!template)
                continue;
            // Always start with section_id and section_tipo
            const resolved = { section_id, section_tipo };
            for (const [key, tmpl_value] of Object.entries(template)) {
                if (key === 'section_id' || key === 'section_tipo')
                    continue; // already injected
                if (typeof tmpl_value !== 'string') {
                    resolved[key] = String(tmpl_value);
                    continue;
                }
                const interpolated = interpolate(tmpl_value, id_map);
                if (interpolated !== '')
                    resolved[key] = interpolated;
            }
            resolved_rows.push(resolved);
        }
        if (resolved_rows.length === 0)
            return null;
        // ── 4. Emit a single data_item whose value is the full resolved array ─────
        return [{
                id: null,
                value: resolved_rows,
                tipo: data[0].tipo,
                lang: (_c = data[0].lang) !== null && _c !== void 0 ? _c : null,
            }];
    }
    exports_9("custom", custom);
    return {
        setters: [],
        execute: function () {/**
             * PARSER_MAP
             * Resolves diffusion data items against a custom map template.
             *
             * Provides:
             *   - `custom`: Builds a JSON array of objects by grouping data_items by
             *     (section_id, section_tipo) and interpolating ${id} placeholders in a
             *     map template. Designed for relation_list diffusion output.
             */
        }
    };
});
/**
 * PARSERS INDEX
 * Parser registry and dispatcher.
 * Maps PHP-format function strings (e.g., "parser_text::text_format")
 * to their JS implementations.
 */
System.register("api/v1/lib/parsers/index", ["api/v1/lib/parsers/parser_text", "api/v1/lib/parsers/parser_date", "api/v1/lib/parsers/parser_locator", "api/v1/lib/parsers/parser_helper", "api/v1/lib/parsers/parser_info", "api/v1/lib/parsers/parser_iri", "api/v1/lib/parsers/parser_geo", "api/v1/lib/parsers/parser_global", "api/v1/lib/parsers/parser_map"], function (exports_10, context_10) {
    "use strict";
    var parser_text_1, parser_date_1, parser_date_2, parser_locator_1, parser_helper_2, parser_info_1, parser_info_2, parser_iri_1, parser_geo_1, parser_global_1, parser_map_1, parser_registry;
    var __moduleName = context_10 && context_10.id;
    /**
     * RESOLVE_PARSER
     * Returns the JS function for a PHP-format parser string.
     *
     * @param fn_string - e.g., "parser_text::text_format"
     * @returns The corresponding JS function or null if not found
     */
    function resolve_parser(fn_string) {
        var _a;
        return (_a = parser_registry[fn_string]) !== null && _a !== void 0 ? _a : null;
    }
    exports_10("resolve_parser", resolve_parser);
    /**
     * APPLY_PARSER
     * Resolves and calls a parser function.
     *
     * @param fn_string - e.g., "parser_text::text_format"
     * @param data      - Data items array
     * @param options   - Parser options
     * @returns Parsed string or intermediate data or null
     */
    function apply_parser(fn_string, data, options) {
        const fn = resolve_parser(fn_string);
        if (!fn) {
            console.warn(`[parsers] Unknown parser function: ${fn_string}, falling back to default_join`);
            return parser_text_1.default_join(data, options);
        }
        return fn(data, options);
    }
    exports_10("apply_parser", apply_parser);
    return {
        setters: [
            function (parser_text_1_1) {
                parser_text_1 = parser_text_1_1;
                exports_10({
                    "default_join": parser_text_1_1["default_join"],
                    "join_items_to_string": parser_text_1_1["join_items_to_string"],
                    "text_format": parser_text_1_1["text_format"],
                    "map_value": parser_text_1_1["map_value"],
                    "v5_html": parser_text_1_1["v5_html"]
                });
            },
            function (parser_date_1_1) {
                parser_date_1 = parser_date_1_1;
                parser_date_2 = parser_date_1_1;
                exports_10({
                    "date_default": parser_date_1_1["default"],
                    "select_properties": parser_date_1_1["select_properties"],
                    "select_keys": parser_date_1_1["select_keys"],
                    "format_string_date": parser_date_1_1["format_string_date"],
                    "string_date": parser_date_1_1["string_date"],
                    "unix_timestamp": parser_date_1_1["unix_timestamp"]
                });
            },
            function (parser_locator_1_1) {
                parser_locator_1 = parser_locator_1_1;
                exports_10({
                    "get_section_id": parser_locator_1_1["get_section_id"],
                    "get_section_tipo": parser_locator_1_1["get_section_tipo"],
                    "get_term_id": parser_locator_1_1["get_term_id"],
                    "truncate_by_term_id": parser_locator_1_1["truncate_by_term_id"],
                    "truncate_by_model": parser_locator_1_1["truncate_by_model"],
                    "filter_by_section_tipo": parser_locator_1_1["filter_by_section_tipo"],
                    "filter_parents_by_term_id": parser_locator_1_1["filter_parents_by_term_id"],
                    "slice_chain": parser_locator_1_1["slice_chain"],
                    "map_section_tipo_to_name": parser_locator_1_1["map_section_tipo_to_name"]
                });
            },
            function (parser_helper_2_1) {
                parser_helper_2 = parser_helper_2_1;
                exports_10({
                    "get_first": parser_helper_2_1["get_first"],
                    "get_tail": parser_helper_2_1["get_tail"],
                    "count": parser_helper_2_1["count"],
                    "merge": parser_helper_2_1["merge"]
                });
                exports_10({
                    "replace_pattern": parser_helper_2_1["replace"]
                });
            },
            function (parser_info_1_1) {
                parser_info_1 = parser_info_1_1;
                parser_info_2 = parser_info_1_1;
                exports_10({
                    "info_default": parser_info_1_1["default"],
                    "widget": parser_info_1_1["widget"]
                });
            },
            function (parser_iri_1_1) {
                parser_iri_1 = parser_iri_1_1;
                exports_10({
                    "flat": parser_iri_1_1["flat"]
                });
            },
            function (parser_geo_1_1) {
                parser_geo_1 = parser_geo_1_1;
                exports_10({
                    "geojson": parser_geo_1_1["geojson"]
                });
            },
            function (parser_global_1_1) {
                parser_global_1 = parser_global_1_1;
            },
            function (parser_map_1_1) {
                parser_map_1 = parser_map_1_1;
                exports_10({
                    "map_custom": parser_map_1_1["custom"]
                });
            }
        ],
        execute: function () {/**
             * PARSERS INDEX
             * Parser registry and dispatcher.
             * Maps PHP-format function strings (e.g., "parser_text::text_format")
             * to their JS implementations.
             */
            /**
             * Registry mapping "class::method" strings to JS functions.
             */
            parser_registry = {
                'parser_helper::get_first': parser_helper_2.get_first,
                'parser_helper::get_tail': parser_helper_2.get_tail,
                'parser_helper::count': parser_helper_2.count,
                'parser_helper::merge': parser_helper_2.merge,
                'parser_text::default_join': parser_text_1.default_join,
                'parser_text::text_format': parser_text_1.text_format,
                'parser_text::map_value': parser_text_1.map_value,
                'parser_text::v5_html': parser_text_1.v5_html,
                'parser_locator::get_section_id': parser_locator_1.get_section_id,
                'parser_locator::get_section_tipo': parser_locator_1.get_section_tipo,
                'parser_locator::get_term_id': parser_locator_1.get_term_id,
                'parser_locator::filter_parents_by_term_id': parser_locator_1.filter_parents_by_term_id,
                'parser_locator::parents': parser_locator_1.parents,
                'parser_locator::truncate_by_term_id': parser_locator_1.truncate_by_term_id,
                'parser_locator::truncate_by_model': parser_locator_1.truncate_by_model,
                'parser_locator::filter_by_section_tipo': parser_locator_1.filter_by_section_tipo,
                'parser_locator::slice_chain': parser_locator_1.slice_chain,
                'parser_locator::map_section_tipo_to_name': parser_locator_1.map_section_tipo_to_name,
                'parser_date::select_properties': parser_date_1.select_properties,
                'parser_date::select_keys': parser_date_1.select_keys,
                'parser_date::format_string_date': parser_date_1.format_string_date,
                'parser_date::string_date': parser_date_1.string_date,
                'parser_date::unix_timestamp': parser_date_1.unix_timestamp,
                'parser_date::default': parser_date_2.default,
                'parser_info::widget': parser_info_1.widget,
                'parser_info::default': parser_info_2.default,
                'parser_iri::flat': parser_iri_1.flat,
                'parser_geo::geojson': parser_geo_1.geojson,
                'parser_global::merge_columns': parser_global_1.merge_columns,
                'parser_global::publication_unix_timestamp': parser_global_1.publication_unix_timestamp,
                'parser_map::custom': parser_map_1.custom,
            };
        }
    };
});
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
System.register("api/v1/lib/diffusion_processor", ["api/v1/lib/parsers/index"], function (exports_11, context_11) {
    "use strict";
    var index_1, langs_config;
    var __moduleName = context_11 && context_11.id;
    /**
     * PROCESS_RESPONSE
     * Main entry point. Takes the full PHP response and returns
     * an array of processed_table objects ready for SQL insertion.
     *
     * @param response - The PHP dd_diffusion_api response
     * @returns Array of processed tables with records
     */
    function process_response(response) {
        var _a;
        if (!response.result || !response.datum || !response.main) {
            return [];
        }
        // Resolve database name from main hierarchy
        const database_name = resolve_database_name(response.main);
        // All available languages from the response (keys of the langs object)
        const all_langs = response.langs ? Object.keys(response.langs) : [];
        const main_lang = (_a = response.main_lang) !== null && _a !== void 0 ? _a : null;
        langs_config.langs = all_langs;
        langs_config.main_lang = main_lang;
        const tables = [];
        for (const datum of response.datum) {
            const table = process_datum_group(datum, database_name);
            if (table) {
                tables.push(table);
            }
        }
        return tables;
    }
    exports_11("process_response", process_response);
    /**
     * RESOLVE_DATABASE_NAME
     * Extracts the database name from the main hierarchy.
     * Looks for the node with model: "database".
     *
     * @param main - Array of hierarchy nodes
     * @returns Database name string
     */
    function resolve_database_name(main) {
        // Look for database definition in the hierarchy (model: "database")
        for (const node of main) {
            // DIFFTS-04: parenthesize — && binds tighter than ||, so without parens a
            // plain 'database' node entered the branch even without a term and returned
            // undefined. Require a term for both model kinds.
            if ((node.model === 'database' || node.model === 'database_alias') && node.term) {
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
    function resolve_table_name(datum) {
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
    function process_datum_group(datum, database_name) {
        if (!datum.data || datum.data.length === 0) {
            return null;
        }
        const table_name = resolve_table_name(datum);
        const records = [];
        const deletions = [];
        // Map context fields by sanitized name for SQL generator metadata
        const columns_context = {};
        for (const ctx of datum.context) {
            const col_name = sanitize_column_name(ctx.term);
            columns_context[col_name] = ctx;
        }
        for (const record of datum.data) {
            // Records marked for deletion by PHP (unpublishable)
            if (record.fields === 'delete') {
                deletions.push(record.section_id);
                continue;
            }
            // Flatten grouped fields back into flat entry_value[] for parser compatibility
            const flat_record = flatten_fields(record);
            const processed = process_record(flat_record, datum.context);
            records.push(...processed);
        }
        // Return null only if there's nothing to do at all
        if (records.length === 0 && deletions.length === 0) {
            return null;
        }
        return {
            database_name,
            table_name,
            section_tipo: datum.section_tipo,
            records,
            deletions,
            columns_context,
        };
    }
    /**
     * FLATTEN_FIELDS
     * Expands the new grouped fields schema back into the flat entry_value[]
     * structure that parsers expect.
     *
     * For each diffusion_tipo key in record.fields, each field_group is
     * expanded into one entry_value per entry in the group, merging the
     * group-level metadata (tipo, lang, id, section_id, section_tipo)
     * with the entry-level data (value + any extra properties).
     *
     * @param record - The datum record with grouped fields
     * @returns A flat record with entries keyed by diffusion_tipo
     */
    function flatten_fields(record) {
        const entries = {};
        if (record.fields === 'delete') {
            // Should not reach here (deletions are filtered upstream), but handle safely
            return { section_id: record.section_id, entries: {} };
        }
        for (const [diffusion_tipo, groups] of Object.entries(record.fields)) {
            const flat = [];
            for (const group of groups) {
                for (const entry of group.entries) {
                    const ev = {
                        tipo: group.tipo,
                        lang: group.lang,
                        value: entry.value,
                        id: group.id,
                    };
                    // Copy optional group-level metadata
                    if (group.section_id != null)
                        ev.section_id = group.section_id;
                    if (group.section_tipo != null)
                        ev.section_tipo = group.section_tipo;
                    // Copy extra entry-level properties (e.g. file_url, meta, etc.)
                    for (const [k, v] of Object.entries(entry)) {
                        if (k !== 'value' && !(k in ev)) {
                            ev[k] = v;
                        }
                    }
                    flat.push(ev);
                }
            }
            entries[diffusion_tipo] = flat;
        }
        return { section_id: record.section_id, entries };
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
     * @param record    - The flat datum record with entries keyed by tipo
     * @param context   - Array of context field definitions (columns)
     * @returns Array of processed records, one per lang
     */
    function process_record(record, context) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        // ---------------------------------------------------------------
        // PHASE 1: Parse all entries per column, grouped by lang
        // ---------------------------------------------------------------
        // Structure: column_name → Map<lang | "nolan", parsed_value>
        const column_parsed_values = new Map();
        // Also track tipo → lang_values for the merge_columns post-pass
        const tipo_to_lang_values = new Map();
        // Contexts that use merge_columns are deferred to run AFTER all other columns
        const deferred_merge_ctx = [];
        for (const ctx of context) {
            const tipo = ctx.tipo;
            const entries = record.entries[tipo];
            const column_name = sanitize_column_name(ctx.term);
            // Initialize the lang→value map for this column
            const lang_values = new Map();
            column_parsed_values.set(column_name, lang_values);
            tipo_to_lang_values.set(tipo, lang_values);
            // Check parsers
            const parser = ctx.parser;
            // Defer merge_columns until all other columns are resolved
            if (parser_uses_merge_columns(parser)) {
                deferred_merge_ctx.push(ctx);
                continue;
            }
            // Data-independent parsers (e.g. publication_unix_timestamp) generate their own
            // value without needing server data — run them even when entries is empty.
            if (parser_is_data_independent(parser)) {
                const effective_parser = ((_a = ctx.columns) === null || _a === void 0 ? void 0 : _a.length)
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
            if ((_b = ctx.columns) === null || _b === void 0 ? void 0 : _b.length) {
                const has_parser = Array.isArray(parser)
                    ? parser.length > 0
                    : (parser && Object.keys(parser).length > 0);
                if (has_parser) {
                    const all_data_items = entries.map((e) => {
                        const item = { id: e.id, value: e.value, tipo: e.tipo, lang: e.lang };
                        if (e.meta)
                            item.meta = e.meta;
                        if (e.section_id != null)
                            item.section_id = e.section_id;
                        if (e.section_tipo != null)
                            item.section_tipo = e.section_tipo;
                        return item;
                    });
                    const effective_parser = inject_columns_into_parser(parser, ctx.columns, langs_config.main_lang);
                    const parser_result = apply_parser_chain(effective_parser, all_data_items, ctx.output_format, ctx.columns, langs_config.main_lang);
                    if (Array.isArray(parser_result) && parser_result.length > 0) {
                        for (const item of parser_result) {
                            let val_str = null;
                            if (item.value !== null && item.value !== undefined) {
                                if (ctx.output_format === 'int') {
                                    val_str = String(parseInt(String(item.value), 10));
                                    if (val_str === 'NaN')
                                        val_str = '0';
                                }
                                else if (ctx.output_format === 'json') {
                                    val_str = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
                                }
                                else {
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
                else {
                    // No explicit parser — auto-apply merge() with columns directly on raw entries.
                    // Handles the common case of "parser": {} with columns defined.
                    const all_data_items = entries.map((e) => {
                        const item = { id: e.id, value: e.value, tipo: e.tipo, lang: e.lang };
                        if (e.section_id != null)
                            item.section_id = e.section_id;
                        if (e.section_tipo != null)
                            item.section_tipo = e.section_tipo;
                        return item;
                    });
                    if (ctx.output_format === 'json') {
                        // JSON output: resolve_slot is string-only and would corrupt complex values
                        // (e.g. locator arrays). Fan-out directly, JSON.stringify preserves structure.
                        for (const item of all_data_items) {
                            if (item.value === null || item.value === undefined)
                                continue;
                            const val_str = typeof item.value === 'string' ? item.value : JSON.stringify(item.value);
                            const lang_key = (!item.lang || item.lang === 'lg-nolan') ? 'nolan' : item.lang;
                            lang_values.set(lang_key, val_str);
                        }
                    }
                    else {
                        // String/int output: merge() with columns for proper separator and fallback handling
                        const auto_result = index_1.merge(all_data_items, {
                            columns: ctx.columns,
                            merge: 'string',
                            main_lang: (_c = langs_config.main_lang) !== null && _c !== void 0 ? _c : undefined,
                        });
                        if (Array.isArray(auto_result) && auto_result.length > 0) {
                            for (const item of auto_result) {
                                let val_str = null;
                                if (item.value !== null && item.value !== undefined) {
                                    if (ctx.output_format === 'int') {
                                        val_str = String(parseInt(String(item.value), 10));
                                        if (val_str === 'NaN')
                                            val_str = '0';
                                    }
                                    else {
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
                const data_items = lang_entries.map((e) => {
                    const item = {
                        id: e.id,
                        value: e.value,
                        tipo: e.tipo,
                        lang: e.lang,
                    };
                    if (e.meta) {
                        item.meta = e.meta;
                    }
                    if (e.section_id !== undefined && e.section_id !== null) {
                        item.section_id = e.section_id;
                    }
                    if (e.section_tipo !== undefined && e.section_tipo !== null) {
                        item.section_tipo = e.section_tipo;
                    }
                    return item;
                });
                let column_value = null;
                let handled_by_parser = false;
                // Check if parser definition exists (object, array, etc)
                const has_parser = Array.isArray(parser) ? parser.length > 0 : (parser && Object.keys(parser).length > 0);
                if (has_parser) {
                    const effective_parser = ((_d = ctx.columns) === null || _d === void 0 ? void 0 : _d.length)
                        ? inject_columns_into_parser(parser, ctx.columns, langs_config.main_lang)
                        : parser;
                    const parser_result = apply_parser_chain(effective_parser, data_items, ctx.output_format);
                    if (parser_result !== null) {
                        // Final result should be data_item[], but apply_parser_chain returns any
                        // We convert the final result to a string for column value
                        if (Array.isArray(parser_result)) {
                            if (parser_result.length > 0) {
                                for (const item of parser_result) {
                                    let val_str = null;
                                    if (item.value !== null) {
                                        // Apply requested output format if defined
                                        if (ctx.output_format === 'json') {
                                            // JSON stringify only if not already a plain string.
                                            // If the parser chain (e.g. map_value) already produced a string
                                            // value like "yes"/"no", leave it as-is to avoid double-encoding.
                                            if (typeof item.value === 'string') {
                                                val_str = item.value;
                                            }
                                            else {
                                                val_str = JSON.stringify(item.value);
                                            }
                                        }
                                        else if (ctx.output_format === 'int') {
                                            // Parse as integer
                                            val_str = String(parseInt(String(item.value), 10));
                                            if (val_str === 'NaN')
                                                val_str = '0';
                                        }
                                        else {
                                            // Default string format
                                            if (typeof item.value === 'object' && item.value !== null) {
                                                val_str = JSON.stringify(item.value);
                                            }
                                            else {
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
                            }
                            else {
                                column_value = null;
                            }
                        }
                        else {
                            // Fallback if somehow a parser returns a primitive string (unlikely with standardized parsers)
                            column_value = String(parser_result);
                        }
                    }
                }
                else {
                    // No parser — use join_items_to_string (default behavior) or apply specific format to the whole set
                    if (ctx.output_format === 'json') {
                        // Just JSON encode the values
                        const raw_values = data_items.flatMap(d => d.value);
                        column_value = JSON.stringify(raw_values);
                    }
                    else if (ctx.output_format === 'int') {
                        // Parse first value as int
                        const first_val = (_e = data_items[0]) === null || _e === void 0 ? void 0 : _e.value;
                        column_value = String(parseInt(String(first_val), 10));
                        if (column_value === 'NaN')
                            column_value = '0';
                    }
                    else {
                        column_value = index_1.join_items_to_string(data_items, {});
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
            const lang_values = column_parsed_values.get(column_name);
            const parser = ctx.parser;
            // Build data_items from already-parsed column values (SQL-ready strings).
            // item.id = column_tipo so parser_global::merge_columns can filter by columns option.
            const merged_items = [];
            for (const [col_tipo, col_lang_values] of tipo_to_lang_values) {
                // Pick best available value (nolan → main_lang → first)
                const val = (_h = (_g = (_f = col_lang_values.get('nolan')) !== null && _f !== void 0 ? _f : (langs_config.main_lang ? col_lang_values.get(langs_config.main_lang) : undefined)) !== null && _g !== void 0 ? _g : get_first_value(col_lang_values)) !== null && _h !== void 0 ? _h : null;
                merged_items.push({
                    id: col_tipo,
                    value: val,
                    tipo: col_tipo,
                    lang: null,
                });
            }
            const parser_result = apply_parser_chain(parser, merged_items, ctx.output_format);
            const merged_str = typeof parser_result === 'string' ? parser_result
                : (Array.isArray(parser_result) && parser_result.length > 0 ? String((_k = (_j = parser_result[0]) === null || _j === void 0 ? void 0 : _j.value) !== null && _k !== void 0 ? _k : '') : null);
            if (merged_str !== null && merged_str !== '') {
                lang_values.set('nolan', merged_str);
            }
        }
        // ---------------------------------------------------------------
        // PHASE 2: Expand to one record per lang
        // ---------------------------------------------------------------
        // If no langs provided, emit a single record with null lang
        if (langs_config.langs.length === 0) {
            const columns = {};
            for (const [column_name, lang_values] of column_parsed_values) {
                // Take nolan or first available
                columns[column_name] = (_m = (_l = lang_values.get('nolan')) !== null && _l !== void 0 ? _l : get_first_value(lang_values)) !== null && _m !== void 0 ? _m : null;
            }
            return [{
                    section_id: record.section_id,
                    lang: null,
                    columns,
                }];
        }
        const results = [];
        for (const lang of langs_config.langs) {
            const columns = {};
            for (const [column_name, lang_values] of column_parsed_values) {
                // Priority 1: exact lang match
                if (lang_values.has(lang)) {
                    columns[column_name] = lang_values.get(lang);
                    continue;
                }
                // Priority 2: nolan (language-independent)
                if (lang_values.has('nolan')) {
                    columns[column_name] = lang_values.get('nolan');
                    continue;
                }
                // Priority 3: main_lang fallback
                if (langs_config.main_lang && lang_values.has(langs_config.main_lang)) {
                    columns[column_name] = lang_values.get(langs_config.main_lang);
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
    function get_first_value(lang_values) {
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
    function group_entries_by_lang(entries) {
        const grouped = new Map();
        for (const entry of entries) {
            const lang = entry.lang || null;
            if (!grouped.has(lang)) {
                grouped.set(lang, []);
            }
            grouped.get(lang).push(entry);
        }
        return grouped;
    }
    /**
     * PARSER_USES_MERGE_COLUMNS
     * Returns true if any parser in the chain is parser_global::merge_columns.
     */
    function parser_uses_merge_columns(parser) {
        if (!parser)
            return false;
        const chain = Array.isArray(parser) ? parser : [parser];
        return chain.some((p) => (p === null || p === void 0 ? void 0 : p.fn) === 'parser_global::merge_columns');
    }
    /**
     * PARSER_IS_DATA_INDEPENDENT
     * Returns true for parsers that generate their own value without server data.
     * These are called even when the column has no entries (e.g. publication_unix_timestamp).
     */
    function parser_is_data_independent(parser) {
        if (!parser)
            return false;
        const chain = Array.isArray(parser) ? parser : [parser];
        return chain.some((p) => (p === null || p === void 0 ? void 0 : p.fn) === 'parser_global::publication_unix_timestamp');
    }
    /**
     * SANITIZE_COLUMN_NAME
     * Converts a human-readable term to a safe SQL column name.
     * Lowercases, replaces spaces/special chars with underscores.
     */
    function sanitize_column_name(term) {
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
    function inject_columns_into_parser(parser, columns, main_lang) {
        const extra = { columns };
        if (main_lang)
            extra.main_lang = main_lang;
        if (Array.isArray(parser)) {
            return parser.map(p => ({ ...p, options: { ...p.options, ...extra } }));
        }
        const p = parser;
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
    function apply_parser_chain(parsers, data, output_format = 'string', columns, main_lang) {
        var _a, _b, _c, _d;
        if (!parsers || (typeof parsers === 'object' && Object.keys(parsers).length === 0)) {
            return null;
        }
        const chain = Array.isArray(parsers) ? parsers : [parsers];
        const state = new Map();
        let last_unmapped_result = data;
        let last_parser_options = {};
        for (const parser_def of chain) {
            if (!parser_def.fn)
                continue;
            let input_data;
            if (parser_def.id) {
                if (state.has(parser_def.id)) {
                    input_data = state.get(parser_def.id);
                }
                else {
                    // Filter original data to only the items matching this id
                    input_data = Array.isArray(data) ? data.filter(d => d && d.id === parser_def.id) : data;
                }
            }
            else {
                if (state.size > 0) {
                    // Combine all state variables into a single data_item array for formatters
                    const combined = [];
                    for (const [key, val] of state.entries()) {
                        if (Array.isArray(val)) {
                            for (const v_item of val) {
                                if (typeof v_item === 'object' && v_item !== null) {
                                    combined.push({ ...v_item, id: key });
                                }
                                else {
                                    combined.push({ id: key, value: v_item });
                                }
                            }
                        }
                        else {
                            combined.push({ id: key, value: val });
                        }
                    }
                    // Re-integrate any original data items with a named id that were NOT mapped into state.
                    // Null-id items (e.g. parent locator entries like rsc139) are intentionally excluded:
                    // they were already present in the full `data` array fed to each parser step and
                    // re-adding them here causes parsers like text_format to see spurious extra values.
                    if (Array.isArray(data)) {
                        for (const d_orig of data) {
                            if (d_orig && d_orig.id !== null && !state.has(d_orig.id)) {
                                combined.push(d_orig);
                            }
                        }
                    }
                    input_data = combined;
                    state.clear();
                }
                else {
                    input_data = last_unmapped_result;
                }
            }
            let valid_data;
            if (Array.isArray(input_data)) {
                valid_data = input_data;
            }
            else if (input_data !== null && input_data !== undefined) {
                const meta = (Array.isArray(data) && data.length > 0) ? data[0] : {};
                valid_data = [{
                        id: null,
                        value: input_data,
                        tipo: meta.tipo,
                        lang: meta.lang
                    }];
            }
            else {
                valid_data = null;
            }
            let result = index_1.apply_parser(parser_def.fn, valid_data, (_a = parser_def.options) !== null && _a !== void 0 ? _a : {});
            if (result === null) {
                if (!parser_def.id)
                    return null;
                continue;
            }
            last_parser_options = (_b = parser_def.options) !== null && _b !== void 0 ? _b : {};
            if (parser_def.id) {
                state.set(parser_def.id, Array.isArray(result) ? result : [result]);
            }
            else {
                last_unmapped_result = result;
            }
        }
        // Output logic (in case the chain ended with unmapped or mapped items)
        if (state.size > 0) {
            const combined = [];
            for (const [key, val] of state.entries()) {
                if (Array.isArray(val)) {
                    for (const v_item of val) {
                        if (typeof v_item === 'object' && v_item !== null) {
                            combined.push({ ...v_item, id: key });
                        }
                        else {
                            combined.push({ id: key, value: v_item });
                        }
                    }
                }
                else {
                    combined.push({ id: key, value: val });
                }
            }
            // Re-integrate any original data items with a named id that were NOT mapped into state.
            // Null-id items are excluded for the same reason as the mid-chain block above.
            if (Array.isArray(data)) {
                for (const d_orig of data) {
                    if (d_orig && d_orig.id !== null && !state.has(d_orig.id)) {
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
            const has_array_values = last_unmapped_result.some((item) => item !== null &&
                typeof item === 'object' &&
                Array.isArray(item.value) &&
                item.value.length > 0 &&
                typeof item.value[0] === 'string');
            if (has_array_values) {
                // Only run the column-aware merge when EVERY column has a corresponding output
                // item. After a formatter like text_format, the output has only one item whose
                // tipo is the first input item's tipo (e.g. rsc85). The remaining columns
                // (e.g. rsc86) are absent — merge() would produce empty slots and trailing
                // separators. Requiring full coverage ensures we only merge raw per-column data.
                const column_tipos = columns ? new Set(columns.map((c) => c.tipo)) : null;
                const output_tipo_set = new Set(last_unmapped_result.map((item) => item === null || item === void 0 ? void 0 : item.tipo).filter(Boolean));
                const all_columns_covered = column_tipos
                    ? [...column_tipos].every(t => output_tipo_set.has(t))
                    : false;
                if (columns && columns.length > 0 && output_format !== 'json' && all_columns_covered) {
                    // Column-aware merge — preserves position and empty slots (string output only).
                    // For json output, values flow through as-is so the fan-out can JSON.stringify them.
                    const merge_opts = { columns, merge: 'string' };
                    if (main_lang)
                        merge_opts.main_lang = main_lang;
                    const merged = index_1.merge(last_unmapped_result, merge_opts);
                    if (merged)
                        last_unmapped_result = merged;
                }
                else {
                    // No columns — group by lang, join same-lang items, then collapse arrays.
                    // text_format may emit multiple items per lang; grouping prevents downstream
                    // overwrites in process_record's lang_values.set().
                    const lang_groups = new Map();
                    for (const item of last_unmapped_result) {
                        const lk = (_c = item.lang) !== null && _c !== void 0 ? _c : '__nolan__';
                        if (!lang_groups.has(lk))
                            lang_groups.set(lk, []);
                        lang_groups.get(lk).push(item);
                    }
                    const collapsed = [];
                    for (const [lk, items] of lang_groups) {
                        const all_vals = [];
                        for (const item of items) {
                            if (Array.isArray(item.value)) {
                                all_vals.push(...item.value.filter((v) => v !== null && v !== undefined && v !== ''));
                            }
                            else if (item.value !== null && item.value !== undefined && item.value !== '') {
                                all_vals.push(String(item.value));
                            }
                        }
                        collapsed.push({
                            ...items[0],
                            lang: lk === '__nolan__' ? null : lk,
                            value: output_format === 'json'
                                ? all_vals
                                : all_vals.join((_d = last_parser_options.records_separator) !== null && _d !== void 0 ? _d : ' | '),
                        });
                    }
                    last_unmapped_result = collapsed;
                }
            }
        }
        return last_unmapped_result;
    }
    return {
        setters: [
            function (index_1_1) {
                index_1 = index_1_1;
            }
        ],
        execute: function () {/**
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
            exports_11("langs_config", langs_config = {
                langs: [],
                main_lang: null
            });
        }
    };
});
/**
 * PARSER_LOCATOR
 * Locate and extract specific data from diffusion objects.
 */
System.register("api/v1/lib/parsers/parser_locator", ["api/v1/lib/diffusion_processor"], function (exports_12, context_12) {
    "use strict";
    var diffusion_processor_2;
    var __moduleName = context_12 && context_12.id;
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
    function get_section_id(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const result = [];
        const split = (_a = options === null || options === void 0 ? void 0 : options.split) !== null && _a !== void 0 ? _a : false;
        if (split) {
            let split_idx = 0;
            for (const item of data) {
                const val = item.value;
                const locators = Array.isArray(val) ? val : [val];
                for (const locator of locators) {
                    if (typeof locator === 'object' && locator !== null && 'section_id' in locator) {
                        const current_section_id = locator.section_id;
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
            const section_ids = [];
            for (const locator of locators) {
                if (typeof locator === 'object' && locator !== null && 'section_id' in locator) {
                    const current_section_id = locator.section_id;
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
    exports_12("get_section_id", get_section_id);
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
    function get_section_tipo(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const result = [];
        const split = (_a = options === null || options === void 0 ? void 0 : options.split) !== null && _a !== void 0 ? _a : false;
        if (split) {
            let split_idx = 0;
            for (const item of data) {
                const val = item.value;
                const locators = Array.isArray(val) ? val : [val];
                for (const locator of locators) {
                    if (typeof locator === 'object' && locator !== null && 'section_tipo' in locator) {
                        const current_section_tipo = locator.section_tipo;
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
            const section_tipos = [];
            for (const locator of locators) {
                if (typeof locator === 'object' && locator !== null && 'section_tipo' in locator) {
                    const current_section_tipo = locator.section_tipo;
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
    exports_12("get_section_tipo", get_section_tipo);
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
    function map_section_tipo_to_name(data, options) {
        if (!data || data.length === 0)
            return null;
        const map = options.map;
        if (!map || typeof map !== 'object')
            return null;
        const result = [];
        for (const item of data) {
            const val = item.value;
            const locators = Array.isArray(val) ? val : [val];
            const mapped_values = [];
            for (const locator of locators) {
                if (typeof locator === 'object' && locator !== null && 'section_tipo' in locator) {
                    const section_tipo = locator.section_tipo;
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
    exports_12("map_section_tipo_to_name", map_section_tipo_to_name);
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
    function get_term_id(data, options) {
        var _a;
        if (!data || data.length === 0)
            return null;
        const result = [];
        const split = (_a = options === null || options === void 0 ? void 0 : options.split) !== null && _a !== void 0 ? _a : false;
        if (split) {
            let split_idx = 0;
            for (const item of data) {
                const val = item.value;
                const locators = Array.isArray(val) ? val : [val];
                for (const loc of locators) {
                    if (typeof loc === 'object' && loc !== null && 'section_tipo' in loc && 'section_id' in loc) {
                        const tid = term_id_from_locator(loc);
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
            const term_ids = [];
            for (const loc of locators) {
                if (typeof loc === 'object' && loc !== null && 'section_tipo' in loc && 'section_id' in loc) {
                    const tid = term_id_from_locator(loc);
                    if (tid !== null)
                        term_ids.push(tid);
                }
            }
            result.push({
                ...item,
                value: term_ids
            });
        }
        return result.length > 0 ? result : null;
    }
    exports_12("get_term_id", get_term_id);
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
    function parents(data, options) {
        var _a, _b, _c, _d, _e, _f;
        if (!data || data.length === 0)
            return null;
        // Extract options with defaults
        const value_to_extract = (_a = options.value) !== null && _a !== void 0 ? _a : 'term';
        const include_parents = (_b = options.include_parents) !== null && _b !== void 0 ? _b : true;
        const include_self = (_c = options.include_self) !== null && _c !== void 0 ? _c : true;
        const fields_separator = (_d = options.fields_separator) !== null && _d !== void 0 ? _d : ', ';
        const records_separator = (_e = options.records_separator) !== null && _e !== void 0 ? _e : ' - ';
        const merge_style = (_f = options.merge) !== null && _f !== void 0 ? _f : (value_to_extract === 'term' ? 'string' : undefined);
        // langs
        const main_lang = diffusion_processor_2.langs_config.main_lang;
        const langs = diffusion_processor_2.langs_config.langs;
        const result = [];
        for (const item of data) {
            const parents_map = item.meta;
            const val = item.value;
            const values = Array.isArray(val) ? val : [val];
            // Map to collect extracted values by language.
            // Each entry carries the ordered chain values AND the composite key of the originating locator.
            // Composite key = section_tipo + '_' + section_id — guarantees uniqueness even when
            // two different section types share the same numeric section_id (e.g. es1_1 vs fr1_1).
            const lang_nodes = {};
            for (const current_val of values) {
                if (!current_val || typeof current_val !== 'object')
                    continue;
                const section_tipo = current_val.section_tipo;
                const section_id = current_val.section_id;
                if (!section_tipo || !section_id)
                    continue;
                const section_composite = `${section_tipo}_${section_id}`;
                const key = term_id_from_locator(current_val);
                if (!key || !parents_map || !parents_map[key])
                    continue;
                const original_chain = parents_map[key]; // [self, parent, grandparent, ...]
                if (!Array.isArray(original_chain) || original_chain.length === 0)
                    continue;
                // 1. Atomize: Apply filters and truncation logic
                const filtered_chain = apply_chain_filters(original_chain, options);
                if (filtered_chain.length === 0)
                    continue;
                // 2. Apply include_self and include_parents slicing
                const start_idx = include_self ? 0 : 1;
                const end_idx = include_parents ? filtered_chain.length : (include_self ? 1 : 0);
                if (start_idx >= filtered_chain.length || (end_idx <= start_idx && include_parents))
                    continue;
                const chain_to_process = filtered_chain.slice(start_idx, end_idx === 0 && !include_parents ? 1 : end_idx);
                if (chain_to_process.length === 0)
                    continue;
                if (value_to_extract === 'term') {
                    // Multilingual terms: one chain entry per lang
                    for (const lang of langs) {
                        const chain_values = [];
                        for (const node of chain_to_process) {
                            let term_str = '';
                            if (Array.isArray(node.term) && node.term.length > 0) {
                                // 1. exact lang
                                const exact_lang_objs = node.term.filter((t) => t.lang === lang);
                                if (exact_lang_objs.length > 0) {
                                    term_str = exact_lang_objs.map((t) => t.value).join(' | ');
                                }
                                else {
                                    // 2. main_lang fallback
                                    const main_lang_objs = main_lang ? node.term.filter((t) => t.lang === main_lang) : [];
                                    if (main_lang_objs.length > 0) {
                                        term_str = main_lang_objs.map((t) => t.value).join(' | ');
                                    }
                                    else {
                                        // 3. first available language group
                                        const first_lang = node.term[0].lang;
                                        const first_lang_objs = node.term.filter((t) => t.lang === first_lang);
                                        term_str = first_lang_objs.map((t) => t.value).join(' | ');
                                    }
                                }
                            }
                            if (term_str)
                                chain_values.push(term_str);
                        }
                        if (chain_values.length > 0) {
                            if (!lang_nodes[lang])
                                lang_nodes[lang] = [];
                            lang_nodes[lang].push({ chain: chain_values, section_composite });
                        }
                    }
                }
                else {
                    // Single-value extraction (term_id, section_id, typology, etc.) — language-independent
                    const nolan_key = '__nolan__';
                    const chain_values = [];
                    for (const node of chain_to_process) {
                        let extracted = null;
                        switch (value_to_extract) {
                            case 'term_id':
                                extracted = term_id_from_locator(node);
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
                        if (extracted)
                            chain_values.push(extracted);
                    }
                    if (chain_values.length > 0) {
                        if (!lang_nodes[nolan_key])
                            lang_nodes[nolan_key] = [];
                        lang_nodes[nolan_key].push({ chain: chain_values, section_composite });
                    }
                }
            }
            // Each locator's parent chain is self-contained — variable-length chains
            // should NOT be padded to a fixed column width. Join values within each
            // chain with fields_separator, then join chains with records_separator.
            for (const [lang, chain_entries] of Object.entries(lang_nodes)) {
                if (chain_entries.length === 0)
                    continue;
                const ref_item = lang === '__nolan__'
                    ? item
                    : data.find(d => d.lang === lang) || item;
                const chain_strings = chain_entries
                    .map(({ chain }) => chain.join(fields_separator))
                    .filter(s => s.length > 0);
                if (chain_strings.length === 0)
                    continue;
                let final_value;
                if (merge_style === 'unique') {
                    final_value = [...new Set(chain_entries.flatMap(({ chain }) => chain))];
                }
                else if (merge_style === 'flat') {
                    final_value = chain_strings;
                }
                else {
                    // 'string' (default for term) and undefined fallback
                    final_value = chain_strings.join(records_separator);
                }
                result.push({
                    ...ref_item,
                    lang: lang === '__nolan__' ? null : lang,
                    value: final_value,
                });
            }
        }
        if (result.length === 0)
            return null;
        return result;
    }
    exports_12("parents", parents);
    /**
     * APPLY_CHAIN_FILTERS (Atomized helper)
     * Applies truncation, filtering and splicing to a single parent chain.
     * Logic order follows legacy PHP behavior.
     */
    function apply_chain_filters(chain, options) {
        let processed = [...chain];
        let truncation_applied = false;
        // 1. Truncate by term_id (section_tipo_section_id)
        const end_ids = options.parent_end_by_term_id;
        if (end_ids && Array.isArray(end_ids) && end_ids.length > 0) {
            const end_set = new Set(end_ids);
            const result = [];
            for (const node of processed) {
                const term_id = term_id_from_locator(node);
                if (term_id && end_set.has(term_id)) {
                    truncation_applied = true;
                    break;
                }
                result.push(node);
            }
            processed = result;
        }
        // 2. Truncate by typology_term_id
        const end_models = options.parent_end_by_typology_term_id;
        if (end_models && Array.isArray(end_models) && end_models.length > 0) {
            const end_set = new Set(end_models);
            const result = [];
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
            const target_set = new Set(Array.isArray(target_tipo) ? target_tipo : [target_tipo]);
            processed = processed.filter(node => target_set.has(node.section_tipo));
        }
        // 3a. Filter by parent_term_id (supports array)
        processed = filter_chain_by_term_id(processed, options);
        // 4. Splice chain (only if NO truncation matched)
        // Mirrors PHP: splice applied only on parents (chain[1..]), self (chain[0]) is preserved.
        const splice_args = options.parents_splice;
        if (!truncation_applied && splice_args && Array.isArray(splice_args) && splice_args.length > 0) {
            processed = splice_chain(processed, splice_args);
        }
        // 5. Slice chain (only if NO truncation matched)
        const slice_args = options.parents_slice;
        if (!truncation_applied && slice_args && Array.isArray(slice_args) && slice_args.length > 0) {
            processed = slice_array(processed, slice_args);
        }
        return processed;
    }
    /**
     * Shared logic for filtering by term_id
     */
    function filter_chain_by_term_id(chain, options) {
        const target_term_id = options.parent_term_id;
        if (!target_term_id)
            return chain;
        const target_set = new Set(Array.isArray(target_term_id) ? target_term_id : [target_term_id]);
        return chain.filter(node => {
            const term_id = term_id_from_locator(node);
            return term_id ? target_set.has(term_id) : false;
        });
    }
    /**
     * Helper: iterate all chain entries in meta(with the parents data) map and apply a transform function.
     * Returns a new data array with modified meta map.
     */
    function map_chains(data, transform) {
        return data.map(item => {
            const parents_map = item.meta;
            if (!parents_map)
                return item;
            const new_map = {};
            for (const [key, chain] of Object.entries(parents_map)) {
                if (Array.isArray(chain)) {
                    new_map[key] = transform(chain);
                }
                else {
                    new_map[key] = chain;
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
    function truncate_by_term_id(data, options) {
        if (!data || data.length === 0)
            return null;
        const end_ids = options.parent_end_by_term_id;
        if (!end_ids || !Array.isArray(end_ids) || end_ids.length === 0)
            return data;
        const end_set = new Set(end_ids);
        return map_chains(data, (chain) => {
            const result = [];
            for (const node of chain) {
                const term_id = term_id_from_locator(node);
                if (term_id && end_set.has(term_id))
                    break;
                result.push(node);
            }
            return result;
        });
    }
    exports_12("truncate_by_term_id", truncate_by_term_id);
    /**
     * TRUNCATE_BY_MODEL
     * Cut the parent chain before any node whose typology model
     * (typology_section_tipo_typology_section_id) matches one of the specified values.
     *
     * @param options.parent_end_by_typology_term_id - Array of model strings, e.g. ["es2_8871"]
     * @param options.parent_end_by_typology_term_id - Alias for parent_end_by_typology_term_id
     */
    function truncate_by_model(data, options) {
        if (!data || data.length === 0)
            return null;
        const end_models = options.parent_end_by_typology_term_id;
        if (!end_models || !Array.isArray(end_models) || end_models.length === 0)
            return data;
        const end_set = new Set(end_models);
        return map_chains(data, (chain) => {
            const result = [];
            for (const node of chain) {
                if (node.typology_section_tipo && node.typology_section_id) {
                    const model_id = node.typology_section_tipo + '_' + node.typology_section_id;
                    if (end_set.has(model_id))
                        break;
                }
                result.push(node);
            }
            return result;
        });
    }
    exports_12("truncate_by_model", truncate_by_model);
    /**
     * FILTER_BY_SECTION_TIPO
     * Keep only nodes in the chain whose section_tipo matches the specified value.
     *
     * @param options.parent_section_tipo - The section_tipo to keep, e.g. "cult1" or ["cult1", "cult2"]
     */
    function filter_by_section_tipo(data, options) {
        if (!data || data.length === 0)
            return null;
        const target_tipo = options.parent_section_tipo;
        if (!target_tipo)
            return data;
        const target_set = new Set(Array.isArray(target_tipo) ? target_tipo : [target_tipo]);
        return map_chains(data, (chain) => {
            return chain.filter(node => target_set.has(node.section_tipo));
        });
    }
    exports_12("filter_by_section_tipo", filter_by_section_tipo);
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
    function splice_chain(chain, splice_args) {
        if (chain.length === 0)
            return chain;
        const self_node = chain[0];
        const parents = chain.slice(1);
        const start = splice_args[0];
        if (splice_args.length === 1) {
            // PHP array_splice($a, start) — remove from start to end
            parents.splice(start);
        }
        else {
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
    function slice_array(chain, slice_args) {
        const start_arg = slice_args[0];
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
    function slice_chain(data, options) {
        if (!data || data.length === 0)
            return null;
        const slice_args = options.parents_slice;
        if (!slice_args || !Array.isArray(slice_args) || slice_args.length === 0)
            return data;
        return map_chains(data, (chain) => slice_array(chain, slice_args));
    }
    exports_12("slice_chain", slice_chain);
    /**
     * Filter parents by term_id
     * filtered by parents_recursive_data. We want only terms with parent given (see propiedades of isad98)
     * This is useful when we want to discriminate thesaurus branch by top parent
     */
    function filter_parents_by_term_id(data, options) {
        if (!data || data.length === 0)
            return null;
        return map_chains(data, (chain) => filter_chain_by_term_id(chain, options));
    }
    exports_12("filter_parents_by_term_id", filter_parents_by_term_id);
    /**
     * TERM_ID_FROM_LOCATOR
     * Auxiliar method to calculate the term_id from a locator or parent/node data.
     * from : {section_tipo:"oh1", section_id:"25"} to "oh1_25"
     * @param locator - locator object
     * @returns term_id - String or null
     */
    function term_id_from_locator(locator) {
        if (!locator)
            return null;
        const term_id = (locator.section_tipo && locator.section_id)
            ? locator.section_tipo + '_' + locator.section_id
            : null;
        return term_id;
    }
    return {
        setters: [
            function (diffusion_processor_2_1) {
                diffusion_processor_2 = diffusion_processor_2_1;
            }
        ],
        execute: function () {/**
             * PARSER_LOCATOR
             * Locate and extract specific data from diffusion objects.
             */
        }
    };
});
System.register("migration/helpers/test_parents_parser", ["api/v1/lib/parsers/parser_locator"], function (exports_13, context_13) {
    "use strict";
    var parser_locator_2, mock_data;
    var __moduleName = context_13 && context_13.id;
    function run_test(name, options) {
        console.log(`\n--- Test: ${name} ---`);
        const result = parser_locator_2.parents(mock_data, options);
        if (result && result.length > 0) {
            console.log(JSON.stringify(result[0].value, null, 2));
        }
        else {
            console.log("NULL result");
        }
    }
    return {
        setters: [
            function (parser_locator_2_1) {
                parser_locator_2 = parser_locator_2_1;
            }
        ],
        execute: function () {
            mock_data = [
                {
                    tipo: "rsc",
                    lang: null,
                    value: [
                        { section_tipo: "es1", section_id: "1257" }, // Bilbao
                        { section_tipo: "fr1", section_id: "3" } // Abergement-Clémenciat
                    ],
                    parents: {
                        "es1_1257": [
                            {
                                section_tipo: "es1", section_id: "1257",
                                term: [{ lang: "lg-spa", value: "Bilbao" }],
                                typology_section_tipo: "geo", typology_section_id: "city"
                            },
                            {
                                section_tipo: "es1", section_id: "8844",
                                term: [{ lang: "lg-spa", value: "Bizkaia" }],
                                typology_section_tipo: "geo", typology_section_id: "province"
                            },
                            {
                                section_tipo: "es1", section_id: "8864",
                                term: [{ lang: "lg-spa", value: "País Vasco" }],
                                typology_section_tipo: "geo", typology_section_id: "region"
                            },
                            {
                                section_tipo: "es1", section_id: "1",
                                term: [{ lang: "lg-spa", value: "España" }],
                                typology_section_tipo: "geo", typology_section_id: "country"
                            }
                        ],
                        "fr1_3": [
                            {
                                section_tipo: "fr1", section_id: "3",
                                term: [{ lang: "lg-spa", value: "Abergement-Clémenciat (L')" }],
                                typology_section_tipo: "geo", typology_section_id: "city"
                            },
                            {
                                section_tipo: "fr1", section_id: "36686",
                                term: [{ lang: "lg-spa", value: "Bourg-en-Bresse" }],
                                typology_section_tipo: "geo", typology_section_id: "arrondissement"
                            },
                            {
                                section_tipo: "fr1", section_id: "37027",
                                term: [{ lang: "lg-spa", value: "Ain" }],
                                typology_section_tipo: "geo", typology_section_id: "department"
                            },
                            {
                                section_tipo: "fr1", section_id: "1",
                                term: [{ lang: "lg-spa", value: "France" }],
                                typology_section_tipo: "geo", typology_section_id: "country"
                            }
                        ]
                    }
                }
            ];
            // Existing basic scenarios
            run_test("rsc273 (basic string)", {
                value: "term",
                fields_separator: " - ",
                records_separator: ", "
            });
            // New filtering scenarios
            run_test("Truncate by term_id [es1_8864] (País Vasco)", {
                value: "term",
                parent_end_by_term_id: ["es1_8864"],
                fields_separator: " - ",
                records_separator: ", "
            });
            run_test("Truncate by typology_term_id [geo_department] (Ain)", {
                value: "term",
                parent_end_by_typology_term_id: ["geo_department"],
                fields_separator: " - ",
                records_separator: ", "
            });
            run_test("Filter by section_tipo array ['es1']", {
                value: "term",
                parent_section_tipo: ["es1"],
                fields_separator: " - ",
                records_separator: ", "
            });
            run_test("Splice chain [1, -1] (remove middle)", {
                value: "term",
                parents_splice: [1, 2], // Remove 2 elements starting at index 1
                fields_separator: " - ",
                records_separator: ", "
            });
            run_test("Truncation + Splice (Splice should NOT act)", {
                value: "term",
                parent_end_by_term_id: ["es1_8864"],
                parents_splice: [0, 1], // Would remove Bilbao if it acted
                fields_separator: " - ",
                records_separator: ", "
            });
        }
    };
});
