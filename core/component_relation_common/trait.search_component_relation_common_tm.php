<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_COMMON_TM
 * From class component_relation_common
 * Common search methods for relation components (time machine specific)
 */
trait search_component_relation_common_tm {



    /**
    * DISPATCH_RELATION_OPERATOR_SQL_TM
    * Routes the search resolution to the correct operator handler.
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
    * Technical Logic: Direct user_id IS NULL check for matrix_time_machine
    * What it returns: Records that have no user_id assigned in time machine.
    * When to use: To find time machine records with no user assigned.
    * Example: "Show me all time machine records with no user assigned."
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
    * Technical Logic: Direct user_id IS NOT NULL check for matrix_time_machine
    * What it returns: Records that have a user_id assigned in time machine.
    * When to use: To find time machine records with a user assigned.
    * Example: "Show me all time machine records that have a user assigned."
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
    * Technical Logic: Direct user_id inequality check for matrix_time_machine
    * What it returns: Records that have a user_id different from the specified one.
    * When to use: To find time machine records not associated with a specific user.
    * Example: "Show me all time machine records not created by user 123."
    */
    protected static function resolve_relation_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        if (!isset($q_object->section_id) || !is_numeric($q_object->section_id)) {
            debug_log(__METHOD__ . " Invalid or missing section_id in query object: " . to_string($q_object), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Validate section_id is an integer (allow negative values like -1)
        $section_id = (int)$q_object->section_id;

        $query_object->params   = ['_Q1_' => $section_id];
        $query_object->sentence = "{$ctx->table_alias}.user_id != _Q1_";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_STRICT_DIFFERENT_SQL_TM (!==)
    * !== Strict Different (Time Machine version)
    * Translation: "Does not have X user ID."
    * Technical Logic: Direct user_id inequality check for matrix_time_machine
    * What it returns: Records that have a user_id different from the specified one.
    * When to use: To find time machine records not associated with a specific user.
    * Example: "Show me all time machine records not created by user 123."
    */
    protected static function resolve_relation_strict_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        // For time machine, strict different is the same as different
        return self::resolve_relation_different_sql_tm($query_object, $q, $ctx);
    }



    /**
    * RESOLVE_RELATION_CONTAIN_SQL_TM
    * Template method for resolving relation contain SQL for matrix_time_machine table
    * Translation: "Contains relation with specific user ID."
    * Technical Logic: Direct user_id equality check on matrix_time_machine
    * What it returns: Records that contain the specific user_id relation.
    * When to use: To find items associated with a specific user ID in time machine context.
    * Example: "Show me all items related to user ID 123."
    */
    protected static function resolve_relation_contain_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        if (!isset($q_object->section_id) || !is_numeric($q_object->section_id)) {
            debug_log(__METHOD__ . " Invalid or missing section_id in query object: " . to_string($q_object), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        // Validate section_id is an integer (allow negative values like -1)
        $section_id = (int)$q_object->section_id;

        $query_object->params   = ['_Q1_' => $section_id];
        $query_object->sentence = "{$ctx->table_alias}.user_id = _Q1_";
        return $query_object;
    }



}//end search_component_relation_common_tm
