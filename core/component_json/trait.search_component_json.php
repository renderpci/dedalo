<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_JSON
* SQL search builder for component_json — resolves a Search Query Object (SQO)
* into a PostgreSQL JSONB path expression fragment and its bound parameters.
*
* Responsibilities:
* - Implements resolve_query_object_sql(), the public entry point called by the
*   WHERE-clause assembler (search::build_sql_query_where → trait.where) when the
*   component is component_json.
* - Normalises the raw SQO `q` value, optionally fans it out across split terms
*   (q_split=true), and then dispatches to one of nine per-operator handlers.
* - Each handler writes a self-contained SQL fragment into $query_object->sentence
*   and places its bound values into $query_object->params under the named-token
*   keys '_Q1_', '_Q2_', … that trait.where later substitutes with positional
*   PostgreSQL placeholders ($1, $2, …).
*
* Data shape:
* - component_json stores its value in the 'misc' JSONB column of the section's
*   matrix table (see section_record_data::$column_map → 'misc').
* - Each row's misc column is a JSON object keyed by component tipo, where the
*   value of each key is a JSONB array of data-item objects:
*     misc = { "<component_tipo>": [ { "id": 1, "value": <any JSON> } ] }
* - The JSONB path prefix used in queries is therefore '$.<component_tipo>' for
*   regular matrix tables, or '$' for the flat matrix_time_machine.data column.
*
* Operator dispatch table:
*   !*        → resolve_json_empty_value_sql       — IS NULL / no valid value items
*   *         → resolve_json_not_empty_value_sql   — @? path exists
*   !=        → resolve_json_different_sql          — NOT @? like_regex (case-insensitive)
*   ==        → resolve_json_exactly_equal_sql      — @? == exact string
*   -         → resolve_json_not_contain_sql        — NOT @? like_regex (case-insensitive)
*   *text     → resolve_json_ends_with_sql          — like_regex "$" anchor
*   text*     → resolve_json_begins_with_sql        — like_regex "^" anchor
*   'text'    → resolve_json_literal_sql            — @? == exact literal
*   !!        → resolve_json_duplicated_sql         — EXISTS correlated subquery
*   (default) → resolve_json_contains_sql           — @? like_regex substring
*
* Time-machine routing:
* - When $query_object->table === 'matrix_time_machine' the operator dispatch is
*   forwarded to dispatch_operator_sql_tm() supplied by trait search_component_json_tm
*   (mixed in by class.component_json.php alongside this trait).
*
* Note on q_split:
* - When q_split=true and the query is not a literal ('text'), multi-word input is
*   tokenised and resolve_query_object_sql() is called recursively per token via
*   component_common::handle_query_splitting(), combining results with $and.
*
* Used by: component_json (class.component_json.php)
* Twin: trait.search_component_json_tm — time-machine operator handlers.
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_json {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Public entry point: transforms a Search Query Object (SQO) into a SQL fragment
	* + bound parameters that the WHERE assembler can inject into the final query.
	*
	* Pipeline (four stages):
	*   1. extract_normalized_json_q() — unwrap and normalise the `q` field; bail
	*      immediately with false if neither q nor q_operator carries a usable value.
	*   2. q_split fan-out — if q_split=true and the query is not a literal, split
	*      on whitespace and delegate each token back through this method, combining
	*      results under a '$and' group (via handle_query_splitting()).
	*   3. get_json_search_context() — validate path, resolve column name, build the
	*      context object $ctx used by every operator handler.
	*   4. dispatch_json_operator_sql() — route to the appropriate per-operator handler
	*      that populates $query_object->sentence and ->params.
	*
	* On success the returned object has at minimum:
	*   ->sentence  string   SQL fragment with _Q1_ / _Q2_ named-token placeholders
	*   ->params    array    Named-token map, e.g. ['_Q1_' => 'search term']
	*
	* @param object $query_object - Incoming SQO; see search_architecture-sqo.md for the
	*   full contract. Relevant fields consumed here:
	*   ->q          mixed   Raw search value (scalar or single-element array)
	*   ->q_operator string  Operator token ('*', '!*', '!=', '==', '-', '!!')
	*   ->q_split    bool    True to tokenise q on whitespace and combine with $and
	*   ->path       array   Component-path describing where in the section hierarchy
	*                        this component lives; last element has ->component_tipo
	*   ->table      string  Matrix table name (e.g. 'rs197_rs279_dd64', 'matrix_time_machine')
	*   ->table_alias string SQL alias for the table in the assembled query
	* @return object|false $query_object - Augmented SQO on success; false when q and
	*   q_operator are both absent/empty (signals the WHERE assembler to skip this filter).
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_json_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Handle Query Splitting (if applicable)
        if (($query_object->q_split ?? false) === true && !search::is_literal($q)) {

            // Pre-process q for splitting (join operators and wildcards)
            $q_proc = preg_replace('/(\!=|==|!!|!*|=|-)\s+/', '$1', $q);
            $q_proc = preg_replace('/\s+(\*)/', '$1', $q_proc);

            $q_items = preg_split('/\s/', $q_proc, -1, PREG_SPLIT_NO_EMPTY);
            if (count($q_items) > 1) {
                return self::handle_query_splitting($query_object, $q_items, '$and');
            }
        }

        // 3. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_json_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 4. Dispatch to Specific Operator Handler
        return self::dispatch_json_operator_sql($query_object, $q, $ctx);
    }



    /**
    * EXTRACT_NORMALIZED_JSON_Q
    * Unwraps and normalises the raw search term from the SQO `q` field.
    *
    * The client may send `q` in three shapes:
    *   - A plain scalar:            $query_object->q = "my term"
    *   - A single-element array:    $query_object->q = ["my term"]
    *   - An array wrapping a value-object:
    *       $query_object->q = [{"value": "my term", ...}]
    * All three are reduced to a single plain string.
    *
    * Early-exit rule: returns false only when BOTH q and q_operator are absent
    * or empty. An operator-only query (e.g. `!*` via q_operator with no q string)
    * is valid and must NOT short-circuit — hence the q_operator guard.
    *
    * Parallel note: mirrors extract_normalized_q() in trait.search_component_sql_builder
    * but is reproduced here because json search context resolution differs from the
    * string-family shared builder. These two must be kept in sync if the SQO wire
    * format for `q` ever changes.
    *
    * @param object $query_object - SQO; reads ->q and ->q_operator.
    * @return string|false - Normalised (stripslashed) search term, or false when
    *   neither q nor q_operator carries a usable value.
    */
    protected static function extract_normalized_json_q(object $query_object) : string|false {

        $q_raw = isset($query_object->q) && is_array($query_object->q)
            ? $query_object->q[0]
            : ($query_object->q ?? null);

        if ((empty($q_raw) || (is_object($q_raw) && empty($q_raw->value))) && empty($query_object->q_operator)) {
            return false;
        }

        $q = (is_object($q_raw) ? $q_raw->value : $q_raw) ?? '';

        return stripslashes($q);
    }



    /**
    * GET_JSON_SEARCH_CONTEXT
    * Validates the SQO path and builds the $ctx object consumed by every
    * per-operator handler in this trait.
    *
    * The context object $ctx carries:
    *   ->component_tipo  string|null  Ontology tipo from the last path element,
    *                                  e.g. 'dd1574'. Null for matrix_time_machine
    *                                  (flat array with no component-tipo key).
    *   ->column          string       JSONB data column name (always 'misc' for
    *                                  component_json in regular matrix tables;
    *                                  'data' for matrix_time_machine).
    *   ->table_alias     string       SQL alias for the table in the query.
    *   ->table           string       Actual table name.
    *   ->q_operator      string|null  The operator override token if sent via
    *                                  q_operator rather than embedded in q.
    *
    * Side effect: sets $query_object->type = 'string' so that downstream
    * assemblers treat the JSONB content as a text search target rather than
    * a typed numeric or date field.
    *
    * @param object $query_object - SQO; reads ->path, ->table_alias, ->table, ->q_operator.
    * @return object|false - $ctx on success; false if ->path is missing or not an array.
    */
    protected static function get_json_search_context(object $query_object) : object|false {

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

        // Time machine case: matrix_time_machine stores component data in 'data' column
        // as a flat JSONB array [{id:1, value:"..."}], not keyed by component tipo
        if ($ctx->table === 'matrix_time_machine') {
            $ctx->column         = 'data';
            $ctx->component_tipo = null; // flat array, no component tipo key
        }

        // Set defaults on query_object
        // Because the component data schema is heterogeneous, the search is performed as a string.
		$query_object->type = 'string';

        return $ctx;
    }



    /**
    * BUILD_JSON_PATH_PREFIX
    * Builds the JSONB path prefix for SQL queries.
    * Regular sections: $.component_tipo (e.g. $.dd1574)
    * Time machine (matrix_time_machine): $ (flat array, no component tipo key)
    *
    * The prefix is used as the leading segment of every JSONPath expression passed
    * to the PostgreSQL '@?' operator and like_regex filters.  For regular matrix
    * tables the misc column is a JSON object keyed by component tipo, so the path
    * must drill into the correct key first.  For matrix_time_machine the data column
    * already IS the flat JSONB array, so no key segment is needed.
    *
    * @param object $ctx - Search context (see get_json_search_context()).
    *   ->component_tipo  string|null  Component tipo key; null for time machine.
    * @return string - JSONPath root prefix, e.g. '$.dd1574' or '$'.
    */
    protected static function build_json_path_prefix(object $ctx) : string {

        return ($ctx->component_tipo !== null)
            ? '$.' . $ctx->component_tipo
            : '$';
    }



    /**
    * DISPATCH_JSON_OPERATOR_SQL
    * Routes the search to the correct per-operator handler based on the operator
    * token embedded in $q or sent via $ctx->q_operator.
    *
    * Operator detection precedence (evaluated in switch-true order):
    *   !*  — empty check (prefix OR q_operator)
    *   *   — not-empty check (prefix OR q_operator)
    *   !=  — starts-with OR q_operator
    *   ==  — starts-with OR q_operator
    *   -   — starts-with OR q_operator
    *   *…  — first char is '*' → ends-with
    *   …*  — last char is '*'  → begins-with
    *   'x' — search::is_literal() == true → literal
    *   !!  — duplicate detection (prefix OR q_operator)
    *   default → contains (case-insensitive JSONB like_regex)
    *
    * Time-machine short-circuit: when the target table is matrix_time_machine,
    * control is handed off immediately to dispatch_operator_sql_tm() (provided by
    * trait search_component_json_tm) because the flat data column requires different
    * SQL patterns (LIKE/= instead of @?/jsonpath).
    *
    * (!) The $q_json_path escape (double-quotes → \") is applied to $q before the
    * switch so that all JSONPath string literals are safe to embed verbatim. Any
    * operator-prefix stripping ('!=', '==', '-', '*', "'") is performed inside the
    * individual handlers, not here.
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q            - Normalised search term (may include operator prefix).
    * @param object $ctx          - Search context from get_json_search_context().
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function dispatch_json_operator_sql(object $query_object, string $q, object $ctx) : object {

        if($ctx->table==='matrix_time_machine') {
            return self::dispatch_operator_sql_tm($query_object, $q, $ctx);
        }

        // escape q string for JSON Path. Backslash MUST be escaped before the double
        // quote, otherwise a literal "\" in $q turns the following escaped quote into an
        // unescaped terminator and breaks out of the JSONPath string literal.
        $q_json_path = str_replace(['\\', '"'], ['\\\\', '\\"'], $q);

        switch (true) {
            case ($q === '!*' || $ctx->q_operator==='!*'):
                return self::resolve_json_empty_value_sql($query_object, $ctx);

            case ($q === '*' || $ctx->q_operator==='*'):
                return self::resolve_json_not_empty_value_sql($query_object, $ctx);

            case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
                return self::resolve_json_different_sql($query_object, $q_json_path, $ctx);

            case (strpos($q, '==')===0 || $ctx->q_operator==='=='):
                return self::resolve_json_exactly_equal_sql($query_object, $q_json_path, $ctx);

            case (strpos($q, '-')===0 || $ctx->q_operator==='-'):
                return self::resolve_json_not_contain_sql($query_object, $q_json_path, $ctx);

            case (substr($q, 0, 1)==='*'):
                return self::resolve_json_ends_with_sql($query_object, $q_json_path, $ctx);

            case (substr($q, -1)==='*'):
                return self::resolve_json_begins_with_sql($query_object, $q_json_path, $ctx);

            case (search::is_literal($q)===true):
                return self::resolve_json_literal_sql($query_object, $q_json_path, $ctx);

            case (strpos($q, '!!')===0 || $ctx->q_operator==='!!'):
                return self::resolve_json_duplicated_sql($query_object, $ctx);

            default:
                return self::resolve_json_contains_sql($query_object, $q_json_path, $ctx);
        }
    }



    /**
    * RESOLVE_JSON_EMPTY_VALUE_SQL (!*)
    * Generates SQL that matches records where the JSONB field has no valid (non-empty,
    * non-null) value items.
    *
    * Operator: !*  ("Is empty" / "Does not have data")
    *
    * Generated pattern:
    *   (<alias>.<column> IS NULL
    *   OR NOT EXISTS (
    *    SELECT 1
    *    FROM jsonb_array_elements(<alias>.<column>->'<tipo>') AS elem
    *    WHERE elem->>'value' IS NOT NULL
    *    AND elem->>'value' != ''
    *   ))
    *
    * The double check (IS NULL + NOT EXISTS) handles both the case where the entire
    * misc column is null and the case where it contains a component tipo key whose
    * array consists only of items with null or empty string 'value' properties.
    * For matrix_time_machine ($ctx->component_tipo === null) the '->' key navigation
    * is omitted and jsonb_array_elements receives the column directly.
    *
    * @param object $query_object - SQO being assembled; ->sentence is written.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence set (no params needed).
    */
    protected static function resolve_json_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->sentence  = "({$ctx->table_alias}.{$ctx->column} IS NULL" . PHP_EOL;
        $query_object->sentence .= "OR NOT EXISTS (" . PHP_EOL;
        $query_object->sentence .= " SELECT 1" . PHP_EOL;
        $query_object->sentence .= " FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}";
        if ($ctx->component_tipo !== null) {
            $query_object->sentence .= "->'{$ctx->component_tipo}'";
        }
        $query_object->sentence .= ") AS elem" . PHP_EOL;
        $query_object->sentence .= " WHERE elem->>'value' IS NOT NULL" . PHP_EOL;
        $query_object->sentence .= " AND elem->>'value' != ''" . PHP_EOL;
        $query_object->sentence .= " )" . PHP_EOL;
        $query_object->sentence .= ")";
        return $query_object;
    }



    /**
    * RESOLVE_JSON_NOT_EMPTY_VALUE_SQL (*)
    * Generates SQL that matches records where the JSONB field has at least one
    * element (i.e. the component tipo key exists and its array is non-empty).
    *
    * Operator: *  ("Not empty" / "Has data")
    *
    * Generated pattern:
    *   (<alias>.<column> @? (_Q1_)::jsonpath)
    *   where _Q1_ = '$.<tipo>[*]'  (or '$[*]' for time machine)
    *
    * The PostgreSQL '@?' operator returns true when the jsonpath expression matches
    * at least one element — a lightweight existence check that avoids a subquery.
    * The value is sent as a prepared-statement parameter (_Q1_) rather than inlined
    * to avoid SQL injection even though it is not user-supplied.
    *
    * @param object $query_object - SQO being assembled.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_not_empty_value_sql(object $query_object, object $ctx) : object {
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath)";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*]"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_DIFFERENT_SQL (!=)
    * Generates SQL that matches records that do NOT contain the given string
    * anywhere within the nested 'value' fields, using a case-insensitive regex.
    *
    * Operator: !=  ("Does not contain X")
    *
    * Generated pattern:
    *   NOT (<alias>.<column> @? (_Q1_)::jsonpath)
    *   where _Q1_ = '$.<tipo>[*].value.** ? (@ like_regex "<term>" flag "i")'
    *
    * The '!=' prefix is stripped from $q_json_path before embedding it in the path.
    * The like_regex flag "i" makes the comparison case-insensitive.
    * '.**' traverses the full JSON subtree of each 'value' field, matching nested
    * string scalars as well as top-level strings.
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q_json_path  - Search term with '"' already escaped; still has '!=' prefix.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_different_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace('!=', '', $q_json_path);
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath)";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_EXACTLY_EQUAL_SQL (==)
    * Generates SQL that matches records where at least one value item equals the
    * given string exactly (case-sensitive).
    *
    * Operator: ==  ("Contains exactly X")
    *
    * Generated pattern:
    *   <alias>.<column> @? (_Q1_)::jsonpath
    *   where _Q1_ = '$.<tipo>[*].value ? (@ == "<term>")'
    *
    * Unlike the default contains handler (like_regex with flag "i"), this handler
    * uses the JSONPath '==' predicate which is a byte-for-byte comparison.  The
    * '==' prefix is stripped from the input before embedding it.
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q_json_path  - Search term with '"' escaped; still has '==' prefix.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_exactly_equal_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace('==', '', $q_json_path);
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*].value ? (@ == \"{$q_clean}\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_NOT_CONTAIN_SQL (-)
    * Generates SQL that matches records that do NOT contain the given string
    * fragment anywhere inside their value items (case-insensitive).
    *
    * Operator: -  ("Does not contain string X")
    *
    * Generated pattern:
    *   NOT (<alias>.<column> @? (_Q1_)::jsonpath)
    *   where _Q1_ = '$.<tipo>[*].value.** ? (@ like_regex "<term>" flag "i")'
    *
    * Semantically equivalent to resolve_json_different_sql() in the SQL it produces;
    * the distinction is that '-' is a negated-contains (no anchoring), while '!='
    * in the user-facing UI is labelled "different from".  Both operators strip their
    * respective prefix characters ('-' vs '!=') before embedding the clean term.
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q_json_path  - Search term with '"' escaped; still has '-' prefix.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_not_contain_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace('-', '', $q_json_path);
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath)";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_ENDS_WITH_SQL (*text)
    * Generates SQL that matches records where at least one value item ends with
    * the given string (case-insensitive).
    *
    * Operator: *text  (leading asterisk — "ends with X")
    *
    * Generated pattern:
    *   <alias>.<column> @? (_Q1_)::jsonpath
    *   where _Q1_ = '$.<tipo>[*].value.** ? (@ like_regex "<term>$" flag "i")'
    *
    * The '$' anchor in the regex asserts end-of-string.  All '*' characters are
    * stripped from $q_json_path before embedding, so '*Draft' becomes the regex
    * 'Draft$' (matching strings that end with "Draft").
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q_json_path  - Search term with '"' escaped; may have leading/trailing '*'.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_ends_with_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean  = str_replace('*', '', $q_json_path);
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*].value.** ? (@ like_regex \"{$q_clean}$\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_BEGINS_WITH_SQL (text*)
    * Generates SQL that matches records where at least one value item begins with
    * the given string (case-insensitive).
    *
    * Operator: text*  (trailing asterisk — "begins with X")
    *
    * Generated pattern:
    *   <alias>.<column> @? (_Q1_)::jsonpath
    *   where _Q1_ = '$.<tipo>[*].value.** ? (@ like_regex "^<term>" flag "i")'
    *
    * The '^' anchor asserts start-of-string.  All '*' characters are stripped from
    * $q_json_path before embedding, so 'Draft*' becomes the regex '^Draft'
    * (matching strings that start with "Draft").
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q_json_path  - Search term with '"' escaped; may have leading/trailing '*'.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_begins_with_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean  = str_replace('*', '', $q_json_path);
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*].value.** ? (@ like_regex \"^{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_LITERAL_SQL ('text')
    * Generates SQL that matches records where at least one value item is exactly
    * equal to the given literal string (case-sensitive, using JSONPath '==').
    *
    * Operator: 'text'  (single-quote delimited — "matches literally / exactly")
    *
    * Generated pattern:
    *   <alias>.<column> @? (_Q1_)::jsonpath
    *   where _Q1_ = '$.<tipo>[*].value ? (@ == "<term>")'
    *
    * Single-quote characters are stripped from $q_json_path before embedding in
    * the JSONPath expression.  The resulting comparison is semantically identical
    * to resolve_json_exactly_equal_sql() but is triggered by the 'text' quoting
    * syntax rather than the '==' prefix.
    *
    * search::is_literal() is the authoritative detector for this operator; it checks
    * whether q begins and ends with a single-quote character.
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q_json_path  - Search term with '"' escaped; still has surrounding "'".
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_literal_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean  = str_replace("'", '', $q_json_path);
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*].value ? (@ == \"{$q_clean}\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_DUPLICATED_SQL (!!)
    * Generates SQL that matches records whose JSON value appears in at least one
    * other record of the same section type in the same matrix table.
    *
    * Operator: !!  ("Has any value shared by another record")
    *
    * Generated pattern:
    *   (<alias>.<column> @? '<path>[*]')
    *   AND EXISTS (
    *    SELECT 1
    *    FROM <table> AS m2,
    *     jsonb_path_query(m2.<column>, '<path>[*]') AS m2_elem,
    *     jsonb_path_query(<alias>.<column>, '<path>[*]') AS m1_elem
    *    WHERE m2.<column> @? '<path>[*]'
    *      AND m2.id != <alias>.id
    *      AND m2_elem->>'value' = m1_elem->>'value'
    *   )
    *
    * The outer check ensures the current row is not itself empty; the EXISTS
    * correlated subquery scans all other rows in the same table whose nested
    * 'value' string matches any 'value' string in the current row's item array.
    *
    * Side effects: sets $query_object->duplicated = true and ->unaccent = true so
    * that the WHERE assembler can apply additional de-duplication processing and
    * unaccent normalisation when post-processing results.
    *
    * (!) The JSONPath expression is embedded directly (not via _Q1_ params) because
    * the path value is constructed internally from trusted ontology-tipo strings and
    * is never user-supplied. This is safe but differs from the other handlers which
    * always parameterise their patterns.
    *
    * @param object $query_object - SQO being assembled; ->duplicated and ->unaccent are set.
    * @param object $ctx          - Search context (column, table_alias, table, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and flags set.
    */
    protected static function resolve_json_duplicated_sql(object $query_object, object $ctx) : object {
        $query_object->duplicated = true;
        $query_object->unaccent   = true;

        $path_prefix = self::build_json_path_prefix($ctx);
        $json_path = "{$path_prefix}[*]";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            " SELECT 1" . PHP_EOL .
            " FROM {$ctx->table} AS m2," . PHP_EOL .
            "  jsonb_path_query(m2.{$ctx->column}, '{$json_path}') AS m2_elem," . PHP_EOL .
            "  jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS m1_elem" . PHP_EOL .
            "  WHERE m2.{$ctx->column} @? '{$json_path}'" . PHP_EOL .
            "   AND m2.id != {$ctx->table_alias}.id" . PHP_EOL .
            "   AND m2_elem->>'value' = m1_elem->>'value'" . PHP_EOL .
            " )";
        return $query_object;
    }



    /**
    * RESOLVE_JSON_CONTAINS_SQL (Default)
    * Generates SQL that matches records where at least one value item contains the
    * given string fragment (case-insensitive substring match).
    *
    * Operator: (default / no recognised prefix)  ("Contains string X")
    *
    * Generated pattern:
    *   <alias>.<column> @? (_Q1_)::jsonpath
    *   where _Q1_ = '$.<tipo>[*].value.** ? (@ like_regex "<term>" flag "i")'
    *
    * Before embedding, the characters '+', '*', and '=' are stripped from the clean
    * term to remove ambiguous remnant prefix/wildcard characters that could cause
    * JSONPath syntax errors.  The '**' descent operator in the path ensures that
    * nested JSON objects within a 'value' field are also searched (deep traversal).
    *
    * This is the fallback handler; it is reached when none of the more specific
    * operator prefixes are detected in dispatch_json_operator_sql().
    *
    * @param object $query_object - SQO being assembled.
    * @param string $q_json_path  - Search term with '"' escaped; operator chars stripped below.
    * @param object $ctx          - Search context (column, table_alias, component_tipo).
    * @return object              - Augmented $query_object with ->sentence and ->params set.
    */
    protected static function resolve_json_contains_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q_json_path);
        $path_prefix = self::build_json_path_prefix($ctx);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "{$path_prefix}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



	/**
	* SEARCH_OPERATORS_INFO
	* Returns the map of supported search operators for the component_json UI,
	* used by the search interface to populate the operator selector widget.
	*
	* Each key is the operator token sent in the SQO (either embedded in q or via
	* q_operator); the value is the i18n label key resolved by the client.
	*
	* Operator semantics reference:
	*   '*'       — not empty: at least one value item exists
	*   '!*'      — empty: no value items, or all items have null/empty value
	*   '='       — similar to (contains, case-insensitive; same as default path)
	*   '!='      — different from: does not contain (case-insensitive)
	*   '-'       — does not contain: negated substring match (case-insensitive)
	*   '!!'      — duplicate: value shared with another record in the same table
	*   'text*'   — begins with: value starts with the given string
	*   '*text'   — ends with: value ends with the given string
	*   "'text'"  — literal: exact case-sensitive match (single-quoted syntax)
	*
	* @return array<string,string> Operator-token → i18n-label-key map.
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'			=> 'no_empty', // Checked 13-01-2026
			'!*'		=> 'empty', // Checked 13-01-2026
			'='			=> 'similar_to', // Checked 13-01-2026
			'!='		=> 'different_from', // Checked 13-01-2026
			'-'			=> 'does_not_contain', // Checked 13-01-2026
			'!!'		=> 'duplicate', // Checked 13-01-2026
			'text*'		=> 'begins_with', // Checked 13-01-2026
			'*text'		=> 'end_with', // Checked 13-01-2026
			'\'text\''	=> 'literal' // Checked 13-01-2026
		];

		return $ar_operators;
	}//end search_operators_info


}//end search_component_json
