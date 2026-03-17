<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_NUMBER_TM
 * From class component_number
 * Common search methods for number component
 */
trait search_component_number_tm {



    /**
    * DISPATCH_NUMBER_OPERATOR_SQL_TM
    * Routes the search resolution to the correct operator handler for time machine number queries.
    * Sets the column to 'id' for time machine table and dispatches to appropriate resolve method.
    *
    * Supported Operators:
    *   - !*        : Empty (IS NULL)
    *   - *         : Not empty (IS NOT NULL)
    *   - ...       : Between range (value1...value2)
    *   - >=        : Greater than or equal
    *   - <=        : Less than or equal
    *   - >         : Greater than
    *   - <         : Less than
    *   - default   : Equal (=)
    *
    * @param object $query_object The query object containing search parameters and SQL building state
    * @param string $q The search query value with operators
    * @param object $ctx The search context containing table_alias, column, q_operator, and between_sep
    * @return object The modified query object with SQL sentence and params set
    */
    protected static function dispatch_number_operator_sql_tm(object $query_object, string $q, object $ctx) : object {

        $ctx->column = 'id';

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
    * !* Is Empty (Time Machine version)
    * Translation: "Is empty" / "Does not have data"
    * Technical Logic: Direct column IS NULL check on matrix_time_machine.id
    * What it returns: Records where the id column is null.
    * When to use: To find time machine records with no ID assigned.
    * Example: "Show me all time machine records with no ID."
    *
    * @param object $query_object The query object to modify with SQL
    * @param object $ctx The search context with table_alias and column name (set to 'id')
    * @return object The query object with SQL sentence "column IS NULL"
    */
    protected static function resolve_number_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params = [];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} IS NULL";
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_NOT_EMPTY_VALUE_SQL_TM (*)
    * * Not Empty (Time Machine version)
    * Translation: "Not empty" / "Has data"
    * Technical Logic: Direct column IS NOT NULL check on matrix_time_machine.id
    * What it returns: Records where the id column is not null.
    * When to use: To find time machine records with an ID assigned.
    * Example: "Show me all time machine records that have an ID."
    *
    * @param object $query_object The query object to modify with SQL
    * @param object $ctx The search context with table_alias and column name (set to 'id')
    * @return object The query object with SQL sentence "column IS NOT NULL"
    */
    protected static function resolve_number_not_empty_value_sql_tm(object $query_object, object $ctx) : object {
        $query_object->params = [];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} IS NOT NULL";
        return $query_object;
    }



    /**
    * RESOLVE_NUMBER_BETWEEN_SQL_TM (value1...value2)
    * ... Between (Time Machine version)
    * Translation: "Is between X and Y."
    * Technical Logic: Uses $and clause with >= and <= comparisons on matrix_time_machine.id
    * What it returns: Records where id falls within the specified range (inclusive).
    * When to use: To find time machine records with IDs in a specific range.
    * Example: "Show me records with IDs between 100 and 200."
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q The search query in format "min...max" with between separator
    * @param object $ctx The search context with table_alias, column, and between_sep
    * @return object The query object wrapped in $and clause with range conditions
    */
    protected static function resolve_number_between_sql_tm(object $query_object, string $q, object $ctx) : object {
            
        $between_separator = '...';
        $ar_parts          = explode($between_separator, $q);
        $first_val         = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
        $second_val        = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

        $query_object_one = clone $query_object;
            $query_object_one->sentence = "{$ctx->table_alias}.{$ctx->column} >= _Q1_";
            $query_object_one->params   = ['_Q1_' => $first_val];

        $query_object_two = clone $query_object;
            $query_object_two->sentence = "{$ctx->table_alias}.{$ctx->column} <= _Q1_";
            $query_object_two->params   = ['_Q1_' => $second_val];

        $new_query_object = new stdClass();
        $new_query_object->{'$and'} = [$query_object_one, $query_object_two];

        return $new_query_object;
    }



    /**
    * RESOLVE_NUMBER_GREATER_THAN_OR_EQUAL_SQL_TM (>=)
    * >= Greater Than or Equal (Time Machine version)
    * Translation: "Is greater than or equal to X."
    * Technical Logic: Direct column >= comparison with JSON param validation
    * What it returns: Records with id >= the specified number.
    * When to use: To find time machine records with ID greater than or equal to a value.
    * Example: "Show me records with ID >= 1000."
    *
    * Error Handling:
    *   - Returns "1=0" (always false) if JSON decode fails
    *   - Returns "1=0" if value is missing or not numeric
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing value (e.g. '{"value":100}') or operator prefix
    * @param object $ctx The search context with table_alias, column, and q_only_op
    * @return object The query object with SQL sentence and params set, or fallback "1=0" on error
    */
    protected static function resolve_number_greater_than_or_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

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
    * <= Less Than or Equal (Time Machine version)
    * Translation: "Is less than or equal to X."
    * Technical Logic: Direct column <= comparison with JSON param validation
    * What it returns: Records with id <= the specified number.
    * When to use: To find time machine records with ID less than or equal to a value.
    * Example: "Show me records with ID <= 500."
    *
    * Error Handling:
    *   - Returns "1=0" (always false) if JSON decode fails
    *   - Returns "1=0" if value is missing or not numeric
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing value (e.g. '{"value":100}') or operator prefix
    * @param object $ctx The search context with table_alias, column, and q_only_op
    * @return object The query object with SQL sentence and params set, or fallback "1=0" on error
    */
    protected static function resolve_number_less_than_or_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
       // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

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
    * > Greater Than (Time Machine version)
    * Translation: "Is greater than X."
    * Technical Logic: Direct column > comparison with JSON param validation
    * What it returns: Records with id > the specified number.
    * When to use: To find time machine records with ID greater than a value.
    * Example: "Show me records with ID > 100."
    *
    * Error Handling:
    *   - Returns "1=0" (always false) if JSON decode fails
    *   - Returns "1=0" if value is missing or not numeric
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing value (e.g. '{"value":100}') or operator prefix
    * @param object $ctx The search context with table_alias, column, and q_only_op
    * @return object The query object with SQL sentence and params set, or fallback "1=0" on error
    */
    protected static function resolve_number_greater_than_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

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
    * < Less Than (Time Machine version)
    * Translation: "Is less than X."
    * Technical Logic: Direct column < comparison with JSON param validation
    * What it returns: Records with id < the specified number.
    * When to use: To find time machine records with ID less than a value.
    * Example: "Show me records with ID < 50."
    *
    * Error Handling:
    *   - Returns "1=0" (always false) if JSON decode fails
    *   - Returns "1=0" if value is missing or not numeric
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing value (e.g. '{"value":100}') or operator prefix
    * @param object $ctx The search context with table_alias, column, and q_only_op
    * @return object The query object with SQL sentence and params set, or fallback "1=0" on error
    */
    protected static function resolve_number_less_than_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

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
    * = Equal (Time Machine version)
    * Translation: "Is equal to X."
    * Technical Logic: Direct column = comparison with JSON param validation
    * What it returns: Records with id equal to the specified number.
    * When to use: Default operator for exact ID matches in time machine.
    * Example: "Show me the record with ID 1234."
    *
    * Error Handling:
    *   - Returns "1=0" (always false) if JSON decode fails
    *   - Returns "1=0" if value is missing or not numeric
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q JSON encoded string containing value (e.g. '{"value":123}')
    * @param object $ctx The search context with table_alias and column
    * @return object The query object with SQL sentence and params set, or fallback "1=0" on error
    */
    protected static function resolve_number_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        // Validate input parameters
        $q_object = json_decode($q);
        
        // Check JSON decoding and required properties
        if (json_last_error() !== JSON_ERROR_NONE) {
            debug_log(__METHOD__ . " JSON decode error: " . json_last_error_msg(), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        if (!isset($q_object->value) || !is_numeric($q_object->value)) {
            debug_log(__METHOD__ . " Invalid or missing value in query object: " . to_string($q_object), logger::ERROR);
            $query_object->params   = [];
            $query_object->sentence = "1=0"; // Always false
            return $query_object;
        }

        $q_clean = str_replace(['+', ','], ['', '.'], $q_object->value);

        $query_object->params   = ['_Q1_' => $q_clean];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} = _Q1_";

        return $query_object;
    }



}//end search_component_number_tm
