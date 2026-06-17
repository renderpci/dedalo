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
System.register("migration/helpers/test_text_format", ["api/v1/lib/parsers/parser_text"], function (exports_4, context_4) {
    "use strict";
    var parser_text_ts_1, data, res;
    var __moduleName = context_4 && context_4.id;
    return {
        setters: [
            function (parser_text_ts_1_1) {
                parser_text_ts_1 = parser_text_ts_1_1;
            }
        ],
        execute: function () {
            data = [
                { id: 'a', value: ["1155", "1", "3"], tipo: 'rsc91' },
                { id: 'b', value: ["es1", "ad1", "fr1"], tipo: 'rsc91' }
            ];
            res = parser_text_ts_1.text_format(data, { pattern: "${b}_${a}" });
            console.log(JSON.stringify(res, null, 2));
        }
    };
});
