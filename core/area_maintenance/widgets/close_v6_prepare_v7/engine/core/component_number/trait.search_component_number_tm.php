<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_NUMBER_TM
* From class component_number
* Time-machine search methods for the number component.
*
* This trait provides the SQL-building counterpart to search_component_number for
* searches against the `matrix_time_machine` table instead of the regular `matrix`
* data tables. It is used exclusively when the search context has `$ctx->table ===
* 'matrix_time_machine'`, a branch taken by dispatch_number_operator_sql() in
* trait.search_component_number.php.
*
* Why a separate trait?
*   The regular matrix stores number values as JSONB arrays keyed by component tipo
*   (e.g. `data->'dd123'`). The time-machine table does not use JSONB for the three
*   component tipos that map to its native integer columns:
*     - DEDALO_TIME_MACHINE_COLUMN_ID         (dd1573) → column `id`
*     - DEDALO_TIME_MACHINE_COLUMN_SECTION_ID (dd1212) → column `section_id`
*     - DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID (dd1371) → column `bulk_process_id`
*   All comparison operators therefore produce direct integer column SQL
*   (e.g. `tm.id >= _Q1_`) rather than the JSONB EXISTS / jsonb_array_elements
*   patterns used in the regular-matrix trait.
*
* Operators supported (mirrors search_component_number):
*   !*  — IS NULL  (empty)
*   *   — IS NOT NULL  (not empty)
*   ... — inclusive range (BETWEEN via $and of >= and <=)
*   >=  — greater than or equal
*   <=  — less than or equal
*   >   — greater than
*   <   — less than
*   =   — exact equality (default)
*
* All methods are protected static and follow the same query_object mutation
* contract as the rest of the search trait family: they receive a query_object
* and return it (or a new wrapping object) with ->sentence and ->params set.
*
* Used by class component_number via `use search_component_number_tm`.
* Companion trait: search_component_number (regular matrix queries).
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_number_tm {



    /**
    * DISPATCH_NUMBER_OPERATOR_SQL_TM
    * Routes the search resolution to the correct operator handler for time-machine number queries.
    *
    * Before dispatching, rewrites $ctx->column from the JSONB column name (set by
    * get_number_search_context()) to the native integer column name for the three
    * component tipos that correspond to physical columns on matrix_time_machine:
    *   - DEDALO_TIME_MACHINE_COLUMN_ID         (dd1573) → 'id'
    *   - DEDALO_TIME_MACHINE_COLUMN_SECTION_ID (dd1212) → 'section_id'
    *   - DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID (dd1371) → 'bulk_process_id'
    *   - any other tipo → column name left unchanged (default branch)
    *
    * Then delegates to the corresponding resolve_number_*_sql_tm() method based on
    * $ctx->q_operator and the content of $q (operator prefix or between separator).
    * The switch uses `true` as the subject so each case is an arbitrary boolean
    * expression — operator-prefix checks on $q guard against clients that embed the
    * operator in the query string rather than sending it separately via q_operator.
    *
    * @param object $query_object - search query object; ->sentence and ->params are set on return
    * @param string $q - normalized search value string (may carry an operator prefix such as '>=42')
    * @param object $ctx - search context: table_alias, column, q_operator, between_sep, component_tipo
    * @return object - $query_object (or a new $and wrapper object) with ->sentence and ->params populated
    */
    protected static function dispatch_number_operator_sql_tm(object $query_object, string $q, object $ctx) : object {

        // Column remapping for time-machine native columns.
        // matrix_time_machine stores id/section_id/bulk_process_id as plain
        // integer columns, not inside a JSONB blob. The match rewrites $ctx->column
        // from the default JSONB column name (e.g. 'number') to the real column
        // name so that subsequent resolve methods emit correct SQL.
        $ctx->column = match($ctx->component_tipo) {
            DEDALO_TIME_MACHINE_COLUMN_ID => 'id', // dd1573
            DEDALO_TIME_MACHINE_COLUMN_SECTION_ID => 'section_id', // dd1212
            DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID => 'bulk_process_id', // dd1371
            default  => $ctx->column
        };

        switch (true) {
            case ($ctx->q_operator === '!*'):
                return self::resolve_number_empty_value_sql_tm($query_object, $ctx);

            case ($ctx->q_operator === '*'):
                return self::resolve_number_not_empty_value_sql_tm($query_object, $ctx);

            case (strpos($q, $ctx->between_sep) !== false):
                return self::resolve_number_between_sql_tm($query_object, $q, $ctx);

            case ($ctx->q_operator === '>=' || substr($q, 0, 2) === '>='):
                return self::resolve_number_greater_than_or_equal_sql_tm($query_object, $q, $ctx);

            case ($ctx->q_operator === '<=' || substr($q, 0, 2) === '<='):
                return self::resolve_number_less_than_or_equal_sql_tm($query_object, $q, $ctx);

            case ($ctx->q_operator === '>' || substr($q, 0, 1) === '>'):
                return self::resolve_number_greater_than_sql_tm($query_object, $q, $ctx);

            case ($ctx->q_operator === '<' || substr($q, 0, 1) === '<'):
                return self::resolve_number_less_than_sql_tm($query_object, $q, $ctx);

            default:
                return self::resolve_number_equal_sql_tm($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_NUMBER_EMPTY_VALUE_SQL_TM (!*)
    * Builds a SQL IS NULL clause for the '!*' (is-empty) operator against a
    * time-machine integer column.
    *
    * Unlike the regular-matrix variant, which must descend into JSONB with a
    * jsonpath expression, the TM column is a plain integer, so IS NULL suffices.
    * No bound parameters are needed; params is set to an empty array.
    *
    * @param object $query_object - search query object to populate
    * @param object $ctx - search context; ctx->table_alias and ctx->column must be set
    * @return object - $query_object with ->sentence = "<alias>.<column> IS NULL", ->params = []
    */
    protected static function resolve_number_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params = [];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} IS NULL";
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_NOT_EMPTY_VALUE_SQL_TM (*)
    * Builds a SQL IS NOT NULL clause for the '*' (not-empty) operator against a
    * time-machine integer column.
    *
    * Symmetric counterpart of resolve_number_empty_value_sql_tm(). The TM column
    * is a plain integer, so IS NOT NULL is the complete predicate; no JSONB traversal
    * or bound parameters are required.
    *
    * @param object $query_object - search query object to populate
    * @param object $ctx - search context; ctx->table_alias and ctx->column must be set
    * @return object - $query_object with ->sentence = "<alias>.<column> IS NOT NULL", ->params = []
    */
    protected static function resolve_number_not_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params = [];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} IS NOT NULL";
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_BETWEEN_SQL_TM (value1...value2)
    * Builds an inclusive range predicate for the '...' (between) operator against a
    * time-machine integer column.
    *
    * The '...' separator splits $q into a lower bound and an upper bound. Both are
    * coerced to integers via intval(); if either part is missing it falls back to 0
    * (lower) or the lower bound (upper). The range is expressed as two separate
    * query_object clones joined by a '$and' wrapper so the search engine can combine
    * them with AND in the final WHERE clause.
    *
    * (!) Both clones share the positional placeholder '_Q1_'. This is safe because
    * each clone carries its own ->params array; they are never merged before the
    * containing '$and' processor expands them independently.
    *
    * @param object $query_object - search query object used as the clone template
    * @param string $q - range string in the form "min...max" (e.g. "100...200")
    * @param object $ctx - search context; ctx->table_alias and ctx->column must be set
    * @return object - new stdClass with ->{'$and'} = [query_object_one, query_object_two]
    */
    protected static function resolve_number_between_sql_tm(object $query_object, string $q, object $ctx) : object {

        // (!) $between_separator is redefined here as a local literal rather than
        // reading $ctx->between_sep. Both resolve to '...', so the result is
        // correct, but the local variable is the effective separator used by explode.
        $between_separator = '...';
        $ar_parts          = explode($between_separator, $q);
        $first_val         = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
        $second_val        = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

        // Lower-bound clause: column >= first_val
        $query_object_one = clone $query_object;
            $query_object_one->sentence = "{$ctx->table_alias}.{$ctx->column} >= _Q1_";
            $query_object_one->params   = ['_Q1_' => $first_val];

        // Upper-bound clause: column <= second_val
        $query_object_two = clone $query_object;
            $query_object_two->sentence = "{$ctx->table_alias}.{$ctx->column} <= _Q1_";
            $query_object_two->params   = ['_Q1_' => $second_val];

        // Wrap in a $and operator node so the search engine ANDs both clauses.
        // Returns a new object rather than mutating $query_object.
        $new_query_object = new stdClass();
        $new_query_object->{'$and'} = [$query_object_one, $query_object_two];

        return $new_query_object;
    }



    /**
    * RESOLVE_NUMBER_GREATER_THAN_OR_EQUAL_SQL_TM (>=)
    * Builds a SQL >= predicate for the time-machine integer column.
    *
    * Unlike the regular-matrix counterpart, this method expects $q to be a
    * JSON-encoded object string such as '{"value":100}' (as produced by the client
    * when an explicit operator object is submitted). It json_decodes $q and reads
    * ->value from the result. On decode failure or a missing/non-numeric value the
    * method returns a "1=0" (always-false) sentence and logs an ERROR, so invalid
    * input produces zero results rather than a SQL error.
    *
    * After stripping the '>=' prefix and normalizing the decimal separator (',' → '.'),
    * the cleaned value is bound to the positional placeholder '_Q1_' in the SQL.
    * If the cleaned value is empty or equals the sentinel 'only_operator', it is
    * replaced with '0' to avoid a cast failure in the database.
    *
    * @param object $query_object - search query object to populate
    * @param string $q - JSON-encoded query object string, e.g. '{"value":">=100"}' or '{"value":100}'
    * @param object $ctx - search context; ctx->table_alias, ctx->column, ctx->q_only_op must be set
    * @return object - $query_object with ->sentence and ->params set, or "1=0" fallback on invalid input
    */
    protected static function resolve_number_greater_than_or_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Attempt to decode the client-supplied query string as JSON.
        // TM comparison methods receive $q as a JSON-encoded object (e.g. '{"value":">=100"}')
        // rather than a plain value string. This differs from the regular-matrix resolvers
        // which use the raw string directly.
        $q_object = json_decode($q);

        // Guard: malformed JSON — emit always-false rather than propagating a PHP error.
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Guard: missing or non-numeric value — same always-false fallback.
        // is_numeric() rejects operator-only strings such as '>=' before the
        // database receives them, avoiding a cast failure in PostgreSQL.
        if (!isset($q_object->value) || !is_numeric($q_object->value)) {
            debug_log(__METHOD__ . " Invalid or missing value in query object: " . to_string($q_object), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        $q_clean = str_replace(['>=', ','], ['', '.'], $q_object->value);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
            $q_clean = '0';
        }

        $query_object->params   = ['_Q1_' => $q_clean];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} >= _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_LESS_THAN_OR_EQUAL_SQL_TM (<=)
    * Builds a SQL <= predicate for the time-machine integer column.
    *
    * Symmetric counterpart of resolve_number_greater_than_or_equal_sql_tm().
    * Follows the same JSON-decode / value-validation / always-false-fallback
    * contract; see that method for a full description of the pattern.
    *
    * @param object $query_object - search query object to populate
    * @param string $q - JSON-encoded query object string, e.g. '{"value":"<=500"}' or '{"value":500}'
    * @param object $ctx - search context; ctx->table_alias, ctx->column, ctx->q_only_op must be set
    * @return object - $query_object with ->sentence and ->params set, or "1=0" fallback on invalid input
    */
    protected static function resolve_number_less_than_or_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Decode $q as a JSON object (same convention as the >= resolver).
        $q_object = json_decode($q);

        // Guard: malformed JSON.
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Guard: missing or non-numeric value.
        if (!isset($q_object->value) || !is_numeric($q_object->value)) {
            debug_log(__METHOD__ . " Invalid or missing value in query object: " . to_string($q_object), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        $q_clean = str_replace(['<=', ','], ['', '.'], $q_object->value);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
            $q_clean = '0';
        }

        $query_object->params   = ['_Q1_' => $q_clean];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} <= _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_GREATER_THAN_SQL_TM (>)
    * Builds a SQL > (strict greater-than) predicate for the time-machine integer column.
    *
    * Follows the same JSON-decode / value-validation / always-false-fallback
    * contract as resolve_number_greater_than_or_equal_sql_tm(); see that method
    * for a full description of the pattern. The only difference is the SQL operator.
    *
    * @param object $query_object - search query object to populate
    * @param string $q - JSON-encoded query object string, e.g. '{"value":">100"}' or '{"value":100}'
    * @param object $ctx - search context; ctx->table_alias, ctx->column, ctx->q_only_op must be set
    * @return object - $query_object with ->sentence and ->params set, or "1=0" fallback on invalid input
    */
    protected static function resolve_number_greater_than_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Decode $q as a JSON object (same convention as the >= resolver).
        $q_object = json_decode($q);

        // Guard: malformed JSON.
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Guard: missing or non-numeric value.
        if (!isset($q_object->value) || !is_numeric($q_object->value)) {
            debug_log(__METHOD__ . " Invalid or missing value in query object: " . to_string($q_object), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        $q_clean = str_replace(['>', ','], ['', '.'], $q_object->value);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
            $q_clean = '0';
        }

        $query_object->params   = ['_Q1_' => $q_clean];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} > _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_LESS_THAN_SQL_TM (<)
    * Builds a SQL < (strict less-than) predicate for the time-machine integer column.
    *
    * Follows the same JSON-decode / value-validation / always-false-fallback
    * contract as resolve_number_greater_than_or_equal_sql_tm(); see that method
    * for a full description of the pattern. The only difference is the SQL operator.
    *
    * @param object $query_object - search query object to populate
    * @param string $q - JSON-encoded query object string, e.g. '{"value":"<50"}' or '{"value":50}'
    * @param object $ctx - search context; ctx->table_alias, ctx->column, ctx->q_only_op must be set
    * @return object - $query_object with ->sentence and ->params set, or "1=0" fallback on invalid input
    */
    protected static function resolve_number_less_than_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Decode $q as a JSON object (same convention as the >= resolver).
        $q_object = json_decode($q);

        // Guard: malformed JSON.
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Guard: missing or non-numeric value.
        if (!isset($q_object->value) || !is_numeric($q_object->value)) {
            debug_log(__METHOD__ . " Invalid or missing value in query object: " . to_string($q_object), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        $q_clean = str_replace(['<', ','], ['', '.'], $q_object->value);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
            $q_clean = '0';
        }

        $query_object->params   = ['_Q1_' => $q_clean];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} < _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_EQUAL_SQL_TM (Default / =)
    * Builds a SQL = (equality) predicate for the time-machine integer column.
    *
    * This is the default case reached when no other operator matches in
    * dispatch_number_operator_sql_tm(). Unlike the other comparison resolvers
    * in this trait, this method does NOT json_decode $q — it treats $q as a
    * plain string value (the normalized output of extract_normalized_number_q()).
    * It strips '+' and normalizes comma decimal separators (',') to '.' before
    * binding the result to the '_Q1_' placeholder.
    *
    * No validity or empty-string guard is applied here; a non-numeric string
    * bound as '_Q1_' in the database INTEGER comparison may produce a cast error
    * depending on the database's strict-mode configuration. See the sibling
    * comparison resolvers (>=, <=, >, <) for the guarded pattern.
    *
    * @param object $query_object - search query object to populate
    * @param string $q - plain normalized value string (no JSON encoding)
    * @param object $ctx - search context; ctx->table_alias and ctx->column must be set
    * @return object - $query_object with ->sentence = "<alias>.<column> = _Q1_" and ->params = ['_Q1_' => $q_clean]
    */
    protected static function resolve_number_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', ','], ['', '.'], $q);

        $query_object->params   = ['_Q1_' => $q_clean];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} = _Q1_";

        return $query_object;
    }



}//end search_component_number_tm
