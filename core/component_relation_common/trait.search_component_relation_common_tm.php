<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_COMMON_TM
 * From class component_relation_common
 * Common search methods for relation components (time machine specific)
 */
trait search_component_relation_common_tm {



    /**
    * DISPATCH_RELATION_OPERATOR_SQL_TM
    * Routes the search resolution to the correct operator handler for time machine queries.
    * Dispatches based on q_operator to the appropriate resolve method.
    *
    * @param object $query_object The query object containing search parameters and SQL building state
    * @param string $q The search query value (JSON string with section_id for relation searches)
    * @param object $ctx The search context containing table_alias, column info, and metadata
    * @return object The modified query object with SQL sentence and params set
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
    * !* Is Empty (Time Machine version)
    * Translation: "Is empty" / "Does not have data"
    * Technical Logic: Direct user_id IS NULL check for matrix_time_machine table
    * What it returns: Records that have no user_id assigned in time machine.
    * When to use: To find time machine records with no user assigned.
    * Example: "Show me all time machine records with no user assigned."
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param object $ctx The search context with table_alias and metadata
    * @return object The query object with SQL sentence set to "user_id IS NULL"
    */
    protected static function resolve_relation_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params   = [];
        $query_object->sentence = "{$ctx->table_alias}.user_id IS NULL";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_NOT_EMPTY_VALUE_SQL_TM (*)
    * * Not Empty (Time Machine version)
    * Translation: "Not empty" / "Has data"
    * Technical Logic: Direct user_id IS NOT NULL check for matrix_time_machine table
    * What it returns: Records that have a user_id assigned in time machine.
    * When to use: To find time machine records with a user assigned.
    * Example: "Show me all time machine records that have a user assigned."
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param object $ctx The search context with table_alias and metadata
    * @return object The query object with SQL sentence set to "user_id IS NOT NULL"
    */
    protected static function resolve_relation_not_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params   = [];
        $query_object->sentence = "{$ctx->table_alias}.user_id IS NOT NULL";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_DIFFERENT_SQL_TM (!=)
    * != Different (Time Machine version)
    * Translation: "Does not have X user ID."
    * Technical Logic: Direct user_id inequality check for matrix_time_machine table with JSON param validation
    * What it returns: Records that have a user_id different from the specified one.
    * When to use: To find time machine records not associated with a specific user.
    * Example: "Show me all time machine records not created by user 123."
    *
    * Error Handling:
    *   - Returns "1=0" (always false) if JSON decode fails
    *   - Returns "1=0" if section_id is missing or not numeric
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing section_id (e.g. '{"section_id":123}')
    * @param object $ctx The search context with table_alias and metadata
    * @return object The query object with SQL sentence and params set, or fallback "1=0" on error
    */
    protected static function resolve_relation_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            // Return always-false condition to prevent invalid SQL execution
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        if (!isset($q_object->section_id) || !is_numeric($q_object->section_id)) {
            debug_log(__METHOD__ . " Invalid or missing section_id in query object: " . to_string($q_object), logger::ERROR);
            // Return always-false condition when section_id is invalid
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
    * !== Strict Different (Time Machine version)
    * Translation: "Does not have X user ID."
    * Technical Logic: Delegates to resolve_relation_different_sql_tm for time machine (same behavior as !=)
    * What it returns: Records that have a user_id different from the specified one.
    * When to use: To find time machine records not associated with a specific user.
    * Example: "Show me all time machine records not created by user 123."
    *
    * Note: For time machine table, strict different (!==) is functionally equivalent to different (!=).
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing section_id (e.g. '{"section_id":123}')
    * @param object $ctx The search context with table_alias and metadata
    * @return object The query object with SQL sentence and params set
    */
    protected static function resolve_relation_strict_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        // For time machine table, strict different (!==) is functionally equivalent to (!=)
        // because time machine records use simple scalar user_id, not JSONB containment
        return self::resolve_relation_different_sql_tm($query_object, $q, $ctx);
    }



    /**
    * RESOLVE_RELATION_CONTAIN_SQL_TM (Default / ==)
    * Contain / Equal (Time Machine version)
    * Translation: "Contains relation with specific user ID."
    * Technical Logic: Direct user_id equality check on matrix_time_machine table with JSON param validation
    * What it returns: Records that contain the specific user_id relation.
    * When to use: To find items associated with a specific user ID in time machine context.
    * Example: "Show me all items related to user ID 123."
    *
    * Error Handling:
    *   - Returns "1=0" (always false) if JSON decode fails
    *   - Returns "1=0" if section_id is missing or not numeric
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing section_id (e.g. '{"section_id":123}')
    * @param object $ctx The search context with table_alias and metadata
    * @return object The query object with SQL sentence "user_id = _Q1_" and params set, or fallback "1=0" on error
    */
    protected static function resolve_relation_contain_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            // Return always-false condition to prevent invalid SQL execution
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        if (!isset($q_object->section_id) || !is_numeric($q_object->section_id)) {
            debug_log(__METHOD__ . " Invalid or missing section_id in query object: " . to_string($q_object), logger::ERROR);
            // Return always-false condition when section_id is invalid
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
