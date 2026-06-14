<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_RELATION_COMMON_TM
* From class component_relation_common — Time Machine search variant for relation components.
*
* Provides all SQL-building operator handlers that are specific to the
* `matrix_time_machine` PostgreSQL table when the search target is a relation
* component (component_relation_*). The time machine table stores audit/history
* rows and uses flat scalar columns (e.g. `user_id INTEGER`) rather than the
* JSONB `relation` column used by normal matrix tables. Because of this structural
* difference, every operator in this trait emits simple column-direct SQL instead
* of the JSONB containment (`@>`) and key-existence (`?`) expressions that the
* sister trait `search_component_relation_common` generates for live data.
*
* How this trait is invoked:
*   `search_component_relation_common::dispatch_relation_operator_sql()` detects
*   that the target table is `matrix_time_machine` and immediately delegates here
*   via `self::dispatch_relation_operator_sql_tm()`. All five methods in this trait
*   are therefore only called for TM-table searches.
*
* Relation column mapping:
*   In the live matrix the relation column is a JSONB blob keyed by component tipo;
*   in the time machine table the equivalent data is a plain INTEGER `user_id` column.
*   All operator methods here reference `user_id` directly rather than building any
*   JSONB path expression. The `$q` value (a JSON string from the client carrying
*   `{"section_id": N}`) is decoded to extract the integer user ID.
*
* SQL parameter model:
*   User-supplied values are passed as named placeholders (`_Q1_`) stored in
*   `$query_object->params`. The outer WHERE-builder performs the actual
*   prepared-statement binding. Never embed user input directly in the SQL
*   string — the placeholder convention is the SQL injection barrier.
*
* Operator coverage:
*   !*  — user_id IS NULL           (empty / no user assigned)
*   *   — user_id IS NOT NULL       (not empty / user assigned)
*   !=  — user_id != _Q1_           (not equal to given user)
*   !== — delegates to !=           (strict different, same semantics for scalar column)
*   ==  (default) — user_id = _Q1_ (equal to given user)
*
* Note: the `!=` and `!==` operators are functionally identical here because the
*   time machine `user_id` is a scalar INTEGER, not a JSONB structure. The non-TM
*   trait uses NOT @> (containment) for `!=` versus NOT EXISTS for `!==`, a
*   distinction that has no meaning on a scalar column.
*
* Relationship to the non-TM trait:
*   - `search_component_relation_common` handles all matrix tables except
*     `matrix_time_machine`; its `dispatch_relation_operator_sql()` detects the TM
*     table and delegates here.
*   - Both traits are `use`d simultaneously by `component_relation_common`, so all
*     methods in this trait carry the `_tm` suffix to avoid name collision.
*
* Extended by:
*   - `component_relation_common` (via `use search_component_relation_common_tm`)
*
* @package Dédalo
* @subpackage Core
*/
trait search_component_relation_common_tm {



    /**
    * DISPATCH_RELATION_OPERATOR_SQL_TM
    * Entry point for all Time Machine relation searches — routes to the correct
    * operator handler based on `$ctx->q_operator`.
    *
    * Called by `search_component_relation_common::dispatch_relation_operator_sql()`
    * exclusively when the target table is `matrix_time_machine`. Unlike the normal
    * dispatcher, this method does NOT remap the column name first; the `user_id`
    * column is used directly by all handlers.
    *
    * Operator routing:
    *   '!*'                             → resolve_relation_empty_value_sql_tm      (IS NULL)
    *   '*'                              → resolve_relation_not_empty_value_sql_tm  (IS NOT NULL)
    *   '!=' with non-empty, non-sentinel q → resolve_relation_different_sql_tm    (!=)
    *   '!==' with non-empty, non-sentinel q → resolve_relation_strict_different_sql_tm (!==)
    *   default (incl. '==')             → resolve_relation_contain_sql_tm          (=)
    *
    * The sentinel string `'only_operator'` in $q means the caller supplied an
    * operator with no search value; those cases fall through to the default handler
    * rather than attempting to parse $q as JSON.
    *
    * @param object $query_object - SQO being built; ->sentence and ->params written on return.
    * @param string $q            - JSON search string, e.g. '{"section_id":123}', or sentinel 'only_operator'.
    * @param object $ctx          - Search context; ->q_operator and ->table_alias consumed here.
    * @return object              - The same $query_object with ->sentence and ->params set.
    */
    protected static function dispatch_relation_operator_sql_tm(object $query_object, string $q, object $ctx) : object {

        switch (true) {
            case ($ctx->q_operator === '!*'):
                return self::resolve_relation_empty_value_sql_tm($query_object, $ctx);

            case ($ctx->q_operator === '*'):
                return self::resolve_relation_not_empty_value_sql_tm($query_object, $ctx);

            case ($ctx->q_operator === '!=' && !empty($q) && $q !== 'only_operator'):
                return self::resolve_relation_different_sql_tm($query_object, $q, $ctx);

            case ($ctx->q_operator === '!==' && !empty($q) && $q !== 'only_operator'):
                return self::resolve_relation_strict_different_sql_tm($query_object, $q, $ctx);

            default:
                return self::resolve_relation_contain_sql_tm($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_RELATION_EMPTY_VALUE_SQL_TM (!*)
    * Operator "!*" — the user_id field is NULL (Time Machine table version).
    *
    * Emits a plain IS NULL predicate on the `user_id` column. This differs from the
    * live-matrix counterpart (`resolve_relation_empty_value_sql`) which checks JSONB
    * key existence with `NOT (column ? tipo)` — a check that is meaningless on the
    * flat scalar `user_id` column of `matrix_time_machine`.
    *
    * Params is set to an empty array because IS NULL requires no bound value.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param object $ctx          - Search context providing ->table_alias.
    * @return object              - $query_object with ->sentence "<alias>.user_id IS NULL".
    */
    protected static function resolve_relation_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params   = [];
        $query_object->sentence = "{$ctx->table_alias}.user_id IS NULL";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_NOT_EMPTY_VALUE_SQL_TM (*)
    * Operator "*" — the user_id field has a value (Time Machine table version).
    *
    * Emits a plain IS NOT NULL predicate on the `user_id` column. This is the
    * logical inverse of `resolve_relation_empty_value_sql_tm` and the counterpart to
    * `resolve_relation_not_empty_value_sql` in the live-matrix trait (which uses
    * `(column ? tipo)` JSONB key existence instead).
    *
    * Params is set to an empty array because IS NOT NULL requires no bound value.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param object $ctx          - Search context providing ->table_alias.
    * @return object              - $query_object with ->sentence "<alias>.user_id IS NOT NULL".
    */
    protected static function resolve_relation_not_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params   = [];
        $query_object->sentence = "{$ctx->table_alias}.user_id IS NOT NULL";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_DIFFERENT_SQL_TM (!=)
    * Operator "!=" — user_id does not equal the given value (Time Machine table version).
    *
    * Decodes $q as a JSON object, extracts `section_id` (the user's section_id in the
    * relation context, used as the user identifier), casts it to integer, and emits a
    * simple scalar inequality predicate on `user_id`.
    *
    * Contrast with the live-matrix version (`resolve_relation_different_sql`) which uses:
    *   (column ? tipo) AND NOT (column @> '{"tipo":[...]}')
    * That JSONB approach is inappropriate here because the TM table stores a plain
    * INTEGER `user_id`, not a JSONB relation blob.
    *
    * Note: negative values (e.g. -1 for system/anonymous users) are valid; the cast to
    * int preserves the sign.
    *
    * Error handling — both failure paths set sentence to "1=0" (always-false predicate):
    *   - JSON decode failure: malformed $q string
    *   - Missing or non-numeric section_id: caller sent an incomplete search object
    * These guard conditions prevent invalid SQL from propagating and ensure the query
    * returns no rows rather than crashing or leaking data.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - JSON string, e.g. '{"section_id":123}'.
    * @param object $ctx          - Search context providing ->table_alias.
    * @return object              - $query_object with ->sentence "<alias>.user_id != _Q1_" and
    *                               ->params ['_Q1_' => (int)section_id], or "1=0" on error.
    */
    protected static function resolve_relation_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Decode JSON search value
        // $q is the JSON-encoded relation search value from the client, e.g. '{"section_id":123}'.
        $q_object = json_decode($q);

        // Guard: malformed JSON
        // json_decode() returns null silently on failure; json_last_error() is the authoritative check.
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            // (!) Always-false fallback — ensures no rows match rather than emitting broken SQL.
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Guard: missing or non-numeric section_id
        // section_id carries the target user's identifier; non-numeric values would break the cast.
        if (!isset($q_object->section_id) || !is_numeric($q_object->section_id)) {
            debug_log(__METHOD__ . " Invalid or missing section_id in query object: " . to_string($q_object), logger::ERROR);
            // (!) Always-false fallback — prevents the query from running without a valid user id.
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Cast to integer (supports negative values like -1 for system users)
        $section_id = (int)$q_object->section_id;

        $query_object->params   = ['_Q1_' => $section_id];
        $query_object->sentence = "{$ctx->table_alias}.user_id != _Q1_";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_STRICT_DIFFERENT_SQL_TM (!==)
    * Operator "!==" — strict absence; delegates to the "!=" handler (Time Machine table version).
    *
    * In the live-matrix trait, `!=` and `!==` differ in their JSONB semantics:
    *   !=  → record has the relation key but not this value  (key exists AND value differs)
    *   !== → record truly does not contain this value at all (value absent regardless of key)
    *
    * In the time machine table `user_id` is a plain INTEGER column: a row either holds
    * exactly one user_id value or NULL. The JSONB containment distinction is therefore
    * irrelevant, and both operators produce identical SQL (`user_id != _Q1_`). This
    * method delegates to `resolve_relation_different_sql_tm` to keep the logic in one place.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - JSON string, e.g. '{"section_id":123}'.
    * @param object $ctx          - Search context providing ->table_alias.
    * @return object              - $query_object with ->sentence "<alias>.user_id != _Q1_" and params.
    */
    protected static function resolve_relation_strict_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Delegate to !=
        // The scalar user_id column makes !== and != equivalent — see doc-block for rationale.
        return self::resolve_relation_different_sql_tm($query_object, $q, $ctx);
    }



    /**
    * RESOLVE_RELATION_CONTAIN_SQL_TM (Default / ==)
    * Default operator — user_id equals the given value (Time Machine table version).
    *
    * This is the handler for the default dispatch branch (operator `==` or no explicit
    * operator). It decodes $q as a JSON object, extracts `section_id`, and emits a
    * plain scalar equality predicate on `user_id`.
    *
    * Contrast with the live-matrix counterpart (`resolve_relation_contain_sql`) which uses
    * the JSONB containment operator `@>` to match structured relation data. That is
    * irrelevant here because the TM table stores a flat INTEGER `user_id` column, not
    * a JSONB relation blob.
    *
    * Error handling — both failure paths set sentence to "1=0" (always-false predicate):
    *   - JSON decode failure: malformed $q string
    *   - Missing or non-numeric section_id: caller sent an incomplete search object
    * These guard conditions prevent invalid SQL from propagating and ensure the query
    * returns no rows rather than crashing or leaking data.
    *
    * @param object $query_object - SQO to modify; ->sentence and ->params set on return.
    * @param string $q            - JSON string, e.g. '{"section_id":123}'.
    * @param object $ctx          - Search context providing ->table_alias.
    * @return object              - $query_object with ->sentence "<alias>.user_id = _Q1_" and
    *                               ->params ['_Q1_' => (int)section_id], or "1=0" on error.
    */
    protected static function resolve_relation_contain_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Decode JSON search value
        // $q is the JSON-encoded relation search value from the client, e.g. '{"section_id":123}'.
        $q_object = json_decode($q);

        // Guard: malformed JSON
        // json_decode() returns null silently on failure; json_last_error() is the authoritative check.
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            // (!) Always-false fallback — ensures no rows match rather than emitting broken SQL.
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Guard: missing or non-numeric section_id
        // section_id carries the target user's identifier; non-numeric values would break the cast.
        if (!isset($q_object->section_id) || !is_numeric($q_object->section_id)) {
            debug_log(__METHOD__ . " Invalid or missing section_id in query object: " . to_string($q_object), logger::ERROR);
            // (!) Always-false fallback — prevents the query from running without a valid user id.
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Cast to integer (supports negative values like -1 for system users)
        $section_id = (int)$q_object->section_id;

        $query_object->params   = ['_Q1_' => $section_id];
        $query_object->sentence = "{$ctx->table_alias}.user_id = _Q1_";
        return $query_object;
    }



}//end search_component_relation_common_tm
