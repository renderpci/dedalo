<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_NUMBER
 * SQL search-builder mixin for component_number (standard matrix tables).
 *
 * Responsibilities:
 * - Implements resolve_query_object_sql(), the public entry point that the search engine
 *   calls on every numeric filter leaf in an SQO (Search Query Object) tree.
 * - Splits the SQL-generation work across three focused helper methods that can be
 *   tested or overridden independently:
 *     1. extract_normalized_number_q()   — pulls and normalises the raw query value.
 *     2. get_number_search_context()     — validates the component path and assembles
 *                                          the SQL-building context object ($ctx).
 *     3. dispatch_number_operator_sql()  — routes to the correct operator handler.
 * - Provides eight operator handlers covering the full set of numeric comparisons:
 *   empty (!*), not-empty (*), between (...), >=, <=, >, <, and equality (=, default).
 * - For matrix_time_machine queries, the dispatch is forwarded to
 *   dispatch_number_operator_sql_tm() defined in search_component_number_tm, which uses
 *   direct column comparisons instead of JSONB array traversal.
 * - Exposes search_operators_info() so the UI can enumerate available operators.
 *
 * Data shape this trait searches against:
 *   matrix_<section_tipo>.<number> JSONB column, structured as:
 *   { "<component_tipo>": [ {"id":<int>, "value":<numeric>}, … ] }
 *   All comparisons unpack that array with jsonb_array_elements() and cast elem->>'value'
 *   to ::numeric so Postgres evaluates the operator arithmetically.
 *
 * SQL safety model:
 *   - Literal values from $q are bound via the _Q1_ / _Q2_ named-placeholder pattern
 *     (replaced by search::get_placeholder() before the statement is prepared), never
 *     interpolated directly into SQL text.
 *   - component_tipo is interpolated as a JSONB key; it is validated upstream by
 *     search::conform_filter() / is_valid_tipo() before this trait runs.
 *
 * Relationships:
 *   - Used by: component_number (via `use search_component_number`).
 *   - Delegates TM variant to: search_component_number_tm (trait).
 *   - Sibling: trait.search_component_number_tm.php (matrix_time_machine overloads).
 *   - Callers upstream: search::conform_filter() → component_number::resolve_query_object_sql().
 *
 * @package Dédalo
 * @subpackage Core
 */
trait search_component_number {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Entry point for the search engine: converts a numeric filter leaf from the SQO
	* tree into a $query_object decorated with a SQL sentence and bound params.
	*
	* Orchestration sequence:
	*   1. extract_normalized_number_q()  — extract and normalise the query value ($q).
	*      Returns false when there is no usable value and no operator, short-circuiting
	*      the search so no spurious WHERE clause is added.
	*   2. get_number_search_context()    — validate the component path and build the
	*      SQL context ($ctx: column, table, table_alias, q_operator, …).
	*      Returns false on a malformed path (bad structure, missing component_tipo).
	*   3. dispatch_number_operator_sql() — inspect $q and $ctx->q_operator to pick the
	*      right operator handler, then delegate.
	*
	* Contract:
	*   - Mutates and returns $query_object on success (adds ->sentence and ->params).
	*   - Returns false when the search should be skipped entirely (no valid query value
	*     and no stand-alone operator like '*' or '!*').
	*   - Never throws; errors are logged via debug_log / logger::ERROR and return false.
	*
	* @param object $query_object - SQO filter leaf (q, q_operator, path, table_alias, table, …)
	* @return object|false        - decorated $query_object with ->sentence and ->params set,
	*                               or false when no SQL should be emitted for this filter
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_number_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_number_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 3. Dispatch to Specific Operator Handler
        return self::dispatch_number_operator_sql($query_object, $q, $ctx);
    }



    /**
    * EXTRACT_NORMALIZED_NUMBER_Q
    * Extracts and normalises the search query value ($q) from the SQO filter leaf.
    *
    * Input shapes handled:
    *   - $query_object->q is an array  → take the first element (reset).
    *   - $query_object->q is a scalar  → use as-is.
    *   - $query_object->q is an object → extract ->value if present, otherwise keep object.
    * After extraction the raw value is cast to string via to_string() when it is not
    * already a string (e.g. numeric literals sent as int/float by the client).
    *
    * Early-exit rule:
    *   Returns false when $q_raw is null AND $query_object->q_operator is also empty,
    *   meaning there is neither a value to compare nor a stand-alone operator to apply.
    *   Presence of a q_operator alone (e.g. '*' / '!*') is sufficient to continue; the
    *   operator handlers that need no value (resolve_number_empty_value_sql, etc.) do not
    *   read $q at all.
    *
    * @param object $query_object - SQO filter leaf containing ->q and optionally ->q_operator
    * @return string|false        - normalised query string, or false to abort this filter
    */
    protected static function extract_normalized_number_q(object $query_object) : string|false {

        $q_raw = isset($query_object->q) && is_array($query_object->q)
            ? reset($query_object->q)
            : ($query_object->q ?? null);

        if ($q_raw === null && empty($query_object->q_operator)) {
            return false;
        }

        // Extract scalar value from q_raw object
        if (is_object($q_raw)) {
            $q_raw = $q_raw->value ?? $q_raw;
        }

        $q = is_string($q_raw) ? $q_raw : to_string($q_raw);
        return $q;
    }



    /**
    * GET_NUMBER_SEARCH_CONTEXT
    * Validates the SQO path and assembles the SQL-building context object.
    *
    * The returned $ctx stdClass carries every piece of metadata the operator handlers
    * need so they do not have to re-read $query_object directly:
    *   ->component_tipo  string  ontology tipo of the number component (e.g. 'dd62')
    *                             used as the JSONB key in the 'number' column.
    *   ->column          string  name of the JSONB data column on the matrix table
    *                             resolved from the calling class via
    *                             section_record_data::get_column_name(get_called_class()).
    *                             For component_number this is always 'number'.
    *   ->table_alias     string  SQL alias for the matrix table in the current query.
    *   ->table           string  physical matrix table name (used to detect time machine).
    *   ->q_operator      ?string operator symbol supplied by the client (e.g. '>=', '!*').
    *   ->between_sep     string  the literal string '...' used as the between-range separator.
    *   ->q_only_op       string  sentinel value 'only_operator' set when the query string
    *                             carried only an operator prefix and no numeric value;
    *                             operator handlers coerce this to '0'.
    *
    * Side-effect: sets $query_object->type = 'number' and ->unaccent = false so that
    * the upstream search::build_sql_query_where() selects the correct statement-builder path.
    *
    * @param object $query_object - SQO filter leaf
    * @return object|false        - populated $ctx, or false when ->path is missing/invalid
    */
    protected static function get_number_search_context(object $query_object) : object|false {

        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $path_end       = end($query_object->path);
        $component_tipo = $path_end->component_tipo;

        $ctx = new stdClass();
        $ctx->component_tipo = $component_tipo;
        $ctx->column         = section_record_data::get_column_name(get_called_class());
        $ctx->table_alias    = $query_object->table_alias;
        $ctx->table          = $query_object->table;
        $ctx->q_operator     = $query_object->q_operator ?? null;
        $ctx->between_sep    = '...';
        $ctx->q_only_op      = 'only_operator';

        // Set defaults on query_object
        $query_object->type     = 'number';
        $query_object->unaccent = false;

        return $ctx;
    }



    /**
    * DISPATCH_NUMBER_OPERATOR_SQL
    * Routes the normalised query value and context to the appropriate operator handler.
    *
    * Operator detection order (first match wins):
    *   1. matrix_time_machine table → delegate entirely to dispatch_number_operator_sql_tm()
    *      (defined in search_component_number_tm) which uses direct column comparisons
    *      instead of JSONB array traversal.
    *   2. q_operator === '!*'              → IS NULL / no-data check.
    *   3. q_operator === '*'               → IS NOT NULL / has-data check.
    *   4. $q contains '...'               → BETWEEN range (inclusive).
    *   5. q_operator or $q prefix '>='    → greater than or equal.
    *   6. q_operator or $q prefix '<='    → less than or equal.
    *   7. q_operator or $q prefix '>'     → strict greater than.
    *   8. q_operator or $q prefix '<'     → strict less than.
    *   9. default                          → exact equality (=).
    *
    * (!) The two-character operators '>=' and '<=' MUST be tested before the
    * single-character '>' and '<' cases; the switch(true) approach ensures this
    * only when the case ordering is preserved — do not reorder.
    *
    * @param object $query_object - SQO filter leaf being decorated
    * @param string $q            - normalised query string from extract_normalized_number_q()
    * @param object $ctx          - context from get_number_search_context()
    * @return object              - $query_object (or a wrapper object for TM's $and pattern)
    *                               with ->sentence and ->params populated
    */
    protected static function dispatch_number_operator_sql(object $query_object, string $q, object $ctx) : object {

        if($ctx->table === 'matrix_time_machine'){
            // Use time machine specific dispatcher from trait search_component_relation_common_tm
            return self::dispatch_number_operator_sql_tm($query_object, $q, $ctx);
        }

        switch (true) {
            case ($ctx->q_operator === '!*'):
                return self::resolve_number_empty_value_sql($query_object, $ctx);

            case ($ctx->q_operator === '*'):
                return self::resolve_number_not_empty_value_sql($query_object, $ctx);

            case (strpos($q, $ctx->between_sep) !== false):
                return self::resolve_number_between_sql($query_object, $q, $ctx);

            case ($ctx->q_operator === '>=' || substr($q, 0, 2) === '>='):
                return self::resolve_number_greater_than_or_equal_sql($query_object, $q, $ctx);

            case ($ctx->q_operator === '<=' || substr($q, 0, 2) === '<='):
                return self::resolve_number_less_than_or_equal_sql($query_object, $q, $ctx);

            case ($ctx->q_operator === '>' || substr($q, 0, 1) === '>'):
                return self::resolve_number_greater_than_sql($query_object, $q, $ctx);

            case ($ctx->q_operator === '<' || substr($q, 0, 1) === '<'):
                return self::resolve_number_less_than_sql($query_object, $q, $ctx);

            default:
                return self::resolve_number_equal_sql($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_NUMBER_EMPTY_VALUE_SQL (!*)
    * !* Is Empty
    * Operator: '!*' — "does not have data" / field is absent or contains only null values.
    *
    * Generated SQL pattern:
    *   (<alias>.<col>->'<tipo>' IS NULL
    *    OR NOT <alias>.<col> @? '$..<tipo>[*] ? (@.value != null)'::jsonpath)
    *
    * Two conditions are OR-ed because JSONB absence and explicit null-valued items are
    * semantically equivalent "empty" states:
    *   - The IS NULL branch matches records where the component tipo key does not exist
    *     at all in the 'number' column (no data ever saved).
    *   - The NOT @? branch matches records where the key exists but every item has
    *     value:null (a placeholder array with no real numeric data).
    *
    * The jsonpath is bound as a named placeholder (_Q1_) and cast to ::jsonpath inline.
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param object $ctx          - search context (component_tipo, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => "$.{$ctx->component_tipo}[*] ? (@.value != null)"
        ];
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}' IS NULL OR NOT {$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath)";
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_NOT_EMPTY_VALUE_SQL (*)
    * * Not Empty
    * Operator: '*' — "has data" / field contains at least one non-null numeric value.
    *
    * Generated SQL pattern:
    *   <alias>.<col> @? '$..<tipo>[*].value ? (@ != null)'::jsonpath
    *
    * Uses the @? jsonpath existence operator: returns true when at least one array
    * element inside the component_tipo key has a non-null 'value' property.
    * No parameter substitution is needed beyond the inline jsonpath string, which
    * carries no user-supplied data (only the server-controlled component_tipo).
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param object $ctx          - search context (component_tipo, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => "$.{$ctx->component_tipo}[*].value ? (@ != null)"
        ];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_BETWEEN_SQL (value1...value2)
    * ... Between
    * Operator: '...' embedded in $q — "is between X and Y" (both bounds inclusive).
    *
    * Input parsing:
    *   $q is split on the '...' separator into $first_val (lower) and $second_val (upper).
    *   Commas are replaced with dots to normalise European decimal notation.
    *   Non-numeric bounds are coerced to '0' (lower) or to $first_val (upper) rather
    *   than raising an error, so a partial range like "5..." still produces valid SQL.
    *
    * Generated SQL pattern:
    *   (<alias>.<col> @? '$..<tipo>[*]')
    *   AND EXISTS (
    *     SELECT 1
    *     FROM jsonb_array_elements(<alias>.<col>->'<tipo>') AS elem
    *     WHERE (elem->>'value')::numeric >= (_Q1_)::numeric
    *       AND (elem->>'value')::numeric <= (_Q2_)::numeric
    *   )
    *
    * The existence pre-check (`@?`) quickly skips records with no data for the tipo before
    * the heavier jsonb_array_elements() subquery runs.  Both bounds are parameterised
    * (_Q1_, _Q2_) and cast ::numeric in SQL so the Postgres planner uses numeric ordering.
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param string $q            - query string in "lower...upper" format
    * @param object $ctx          - search context (component_tipo, between_sep, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_between_sql(object $query_object, string $q, object $ctx) : object {
        $ar_parts   = explode($ctx->between_sep, $q);
        $first_val  = !empty($ar_parts[0]) ? trim(str_replace(',', '.', $ar_parts[0])) : '0';
        $second_val = !empty($ar_parts[1]) ? trim(str_replace(',', '.', $ar_parts[1])) : $first_val;
        // SEARCH-02: both bounds are cast `::numeric` in SQL; coerce non-numeric to '0'.
        if (!is_numeric($first_val))  { $first_val  = '0'; }
        if (!is_numeric($second_val)) { $second_val = $first_val; }

        $json_path = "$.{$ctx->component_tipo}[*]";

        $query_object->params = [
            '_Q1_' => $first_val,
            '_Q2_' => $second_val
        ];

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (".PHP_EOL .
            '  SELECT 1'.PHP_EOL .
            "  FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}') AS elem".PHP_EOL .
            "  WHERE (elem->>'value')::numeric >= (_Q1_)::numeric".PHP_EOL .
            "    AND (elem->>'value')::numeric <= (_Q2_)::numeric".PHP_EOL .
            ' )';
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_GREATER_THAN_OR_EQUAL_SQL (>=)
    * >= Greater Than or Equal
    * Operator: '>=' (via q_operator or as a prefix in $q) — "is >= X".
    *
    * Input cleaning:
    *   The operator prefix '>=' and any commas (European decimal separator) are stripped
    *   from $q to isolate the numeric literal. If the remainder is empty, equals the
    *   'only_operator' sentinel, or is not numeric, it is coerced to '0' (SEARCH-02
    *   guard) so Postgres never receives a non-numeric value for the ::numeric cast.
    *
    * Generated SQL pattern:
    *   (<alias>.<col> @? '$..<tipo>[*]')
    *   AND EXISTS (
    *     SELECT 1
    *     FROM jsonb_array_elements(<alias>.<col>->'<tipo>') AS elem
    *     WHERE (elem->>'value')::numeric >= (_Q1_)::numeric
    *   )
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param string $q            - query string (e.g. '>=3.5' or '3.5' with q_operator='>=')
    * @param object $ctx          - search context (component_tipo, q_only_op, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_greater_than_or_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['>=', ','], ['', '.'], $q);
        // SEARCH-02: coerce empty / operator-only / non-numeric input to '0'. The
        // cleaned value is bound and cast `(_Q1_)::numeric` in SQL; a non-numeric
        // value raised a Postgres cast error (surfacing as a failed/empty search).
        if ($q_clean==='' || $q_clean===$ctx->q_only_op || !is_numeric($q_clean)) {
            $q_clean = '0';
        }

        $json_path = "$.{$ctx->component_tipo}[*]";
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (".PHP_EOL .
            '  SELECT 1'.PHP_EOL .
            "  FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}') AS elem".PHP_EOL .
            "  WHERE (elem->>'value')::numeric >= (_Q1_)::numeric".PHP_EOL .
            ' )';
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_LESS_THAN_OR_EQUAL_SQL (<=)
    * <= Less Than or Equal
    * Operator: '<=' (via q_operator or as a prefix in $q) — "is <= X".
    *
    * Input cleaning:
    *   Strips '<=' and commas from $q, then applies the SEARCH-02 coercion guard
    *   (non-numeric or operator-only residual becomes '0') before binding as _Q1_.
    *
    * Generated SQL pattern:
    *   (<alias>.<col> @? '$..<tipo>[*]')
    *   AND EXISTS (
    *     SELECT 1
    *     FROM jsonb_array_elements(<alias>.<col>->'<tipo>') AS elem
    *     WHERE (elem->>'value')::numeric <= (_Q1_)::numeric
    *   )
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param string $q            - query string (e.g. '<=10' or '10' with q_operator='<=')
    * @param object $ctx          - search context (component_tipo, q_only_op, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_less_than_or_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['<=', ','], ['', '.'], $q);
        // SEARCH-02: coerce empty / operator-only / non-numeric input to '0'. The
        // cleaned value is bound and cast `(_Q1_)::numeric` in SQL; a non-numeric
        // value raised a Postgres cast error (surfacing as a failed/empty search).
        if ($q_clean==='' || $q_clean===$ctx->q_only_op || !is_numeric($q_clean)) {
            $q_clean = '0';
        }

        $json_path = "$.{$ctx->component_tipo}[*]";
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (".PHP_EOL .
            '  SELECT 1'.PHP_EOL .
            "  FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}') AS elem".PHP_EOL .
            "  WHERE (elem->>'value')::numeric <= (_Q1_)::numeric".PHP_EOL .
            ' )';
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_GREATER_THAN_SQL (>)
    * > Greater Than
    * Operator: '>' (via q_operator or as a prefix in $q) — "is strictly > X".
    *
    * Input cleaning:
    *   Strips '>' and commas from $q, then applies the SEARCH-02 coercion guard.
    *   Note that '>' is a substring of '>=' so the dispatch order in
    *   dispatch_number_operator_sql() must test '>=' before '>' to avoid false matches.
    *
    * Generated SQL pattern:
    *   (<alias>.<col> @? '$..<tipo>[*]')
    *   AND EXISTS (
    *     SELECT 1
    *     FROM jsonb_array_elements(<alias>.<col>->'<tipo>') AS elem
    *     WHERE (elem->>'value')::numeric > (_Q1_)::numeric
    *   )
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param string $q            - query string (e.g. '>5' or '5' with q_operator='>')
    * @param object $ctx          - search context (component_tipo, q_only_op, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_greater_than_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['>', ','], ['', '.'], $q);
        // SEARCH-02: coerce empty / operator-only / non-numeric input to '0'. The
        // cleaned value is bound and cast `(_Q1_)::numeric` in SQL; a non-numeric
        // value raised a Postgres cast error (surfacing as a failed/empty search).
        if ($q_clean==='' || $q_clean===$ctx->q_only_op || !is_numeric($q_clean)) {
            $q_clean = '0';
        }

        $json_path = "$.{$ctx->component_tipo}[*]";
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (".PHP_EOL .
            '  SELECT 1'.PHP_EOL .
            "  FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}') AS elem".PHP_EOL .
            "  WHERE (elem->>'value')::numeric > (_Q1_)::numeric".PHP_EOL .
            ' )';
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_LESS_THAN_SQL (<)
    * < Less Than
    * Operator: '<' (via q_operator or as a prefix in $q) — "is strictly < X".
    *
    * Input cleaning:
    *   Strips '<' and commas from $q, then applies the SEARCH-02 coercion guard.
    *   Note that '<' is a substring of '<=' so the dispatch order in
    *   dispatch_number_operator_sql() must test '<=' before '<' to avoid false matches.
    *
    * Generated SQL pattern:
    *   (<alias>.<col> @? '$..<tipo>[*]')
    *   AND EXISTS (
    *     SELECT 1
    *     FROM jsonb_array_elements(<alias>.<col>->'<tipo>') AS elem
    *     WHERE (elem->>'value')::numeric < (_Q1_)::numeric
    *   )
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param string $q            - query string (e.g. '<100' or '100' with q_operator='<')
    * @param object $ctx          - search context (component_tipo, q_only_op, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_less_than_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['<', ','], ['', '.'], $q);
        // SEARCH-02: coerce empty / operator-only / non-numeric input to '0'. The
        // cleaned value is bound and cast `(_Q1_)::numeric` in SQL; a non-numeric
        // value raised a Postgres cast error (surfacing as a failed/empty search).
        if ($q_clean==='' || $q_clean===$ctx->q_only_op || !is_numeric($q_clean)) {
            $q_clean = '0';
        }

        $json_path = "$.{$ctx->component_tipo}[*]";
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (".PHP_EOL .
            '  SELECT 1'.PHP_EOL .
            "  FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}') AS elem".PHP_EOL .
            "  WHERE (elem->>'value')::numeric < (_Q1_)::numeric".PHP_EOL .
            ' )';
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_EQUAL_SQL (Default)
    * = Equal
    * Operator: default (no recognised operator prefix or q_operator) — "is exactly X".
    *
    * Input cleaning:
    *   Strips '+' (allowed sign prefix) and commas (European decimal separator) from $q,
    *   then normalises dots. Non-numeric or empty residuals are coerced to '0' (SEARCH-02).
    *   Unlike the comparison operators, no operator symbol is stripped here because the
    *   equality path is the default catch-all: $q should already be a plain numeric string.
    *
    * Generated SQL pattern:
    *   (<alias>.<col> @? '$..<tipo>[*]')
    *   AND EXISTS (
    *     SELECT 1
    *     FROM jsonb_array_elements(<alias>.<col>->'<tipo>') AS elem
    *     WHERE (elem->>'value')::numeric = (_Q1_)::numeric
    *   )
    *
    * @param object $query_object - SQO filter leaf to decorate
    * @param string $q            - query string containing the numeric value to match
    * @param object $ctx          - search context (component_tipo, column, table_alias)
    * @return object              - $query_object with ->sentence and ->params set
    */
    protected static function resolve_number_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', ','], ['', '.'], $q);
        // SEARCH-02: bound value is cast `(_Q1_)::numeric`; coerce non-numeric to '0'.
        if ($q_clean==='' || !is_numeric($q_clean)) {
            $q_clean = '0';
        }

        $json_path = "$.{$ctx->component_tipo}[*]";
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (".PHP_EOL .
            '  SELECT 1'.PHP_EOL .
            "  FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}') AS elem".PHP_EOL .
            "  WHERE (elem->>'value')::numeric = (_Q1_)::numeric".PHP_EOL .
            ' )';
        return $query_object;
    }



	/**
	* SEARCH_OPERATORS_INFO
	* Returns the map of operators supported by component_number's search interface.
	*
	* Used by the UI layer to build the operator selector shown alongside the search
	* input for numeric fields. Each key is the operator symbol sent in q_operator (or
	* embedded in the q string), and the value is the human-readable label key used for
	* i18n lookup on the client.
	*
	* Operator symbols and their semantics:
	*   '*'   — not-empty   : field has at least one non-null numeric value.
	*   '!*'  — empty       : field is absent or contains only null-valued items.
	*   '...' — between     : inclusive range; client sends q as "lower...upper".
	*   '>='  — greater_than_or_equal
	*   '<='  — less_than_or_equal
	*   '>'   — greater_than
	*   '<'   — less_than
	*   (no key for equality/default '=' — the absence of a recognised operator triggers it)
	*
	* @return array $ar_operators - map of operator symbol (string) => label key (string)
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'		=> 'no_empty', // Checked 13-01-2026
			'!*'	=> 'empty', // Checked 13-01-2026
			'...'	=> 'between', // Checked 13-01-2026
			'>='	=> 'greater_than_or_equal', // Checked 13-01-2026
			'<='	=> 'less_than_or_equal', // Checked 13-01-2026
			'>' 	=> 'greater_than', // Checked 13-01-2026
			'<'		=> 'less_than' // Checked 13-01-2026
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_number
