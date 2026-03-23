<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_STRING_COMMON_TM
* From class component_string_common
* Common search methods for string components
*/
trait search_component_string_common_tm {



    /**
    * DISPATCH_OPERATOR_SQL_TM
    * Routes the search resolution to the correct operator handler for time machine string queries.
    * Handles special column resolution for specific component tipos (dd577, dd1772).
    *
    * @param object $query_object The query object containing search parameters and SQL building state
    * @param string $q The search query value with operators and wildcards
    * @param object $ctx The search context containing table_alias, column info, and metadata
    * @return object The modified query object with SQL sentence and params set
    */
    protected static function dispatch_operator_sql_tm(object $query_object, string $q, object $ctx) : object {

        // column resolve. time machine cases
        $ctx->column = match($ctx->component_tipo) {
            DEDALO_TIME_MACHINE_COLUMN_TIPO  => 'tipo', // dd577
            DEDALO_TIME_MACHINE_COLUMN_SECTION_TIPO => 'section_tipo', // dd1772
            DEDALO_TIME_MACHINE_COLUMN_DATA => 'data', // dd1574
            default  => $ctx->column
        };

        switch (true) {
            case ($q==='!*' || $ctx->q_operator==='!*'):
                return self::resolve_empty_value_sql_tm($query_object, $ctx);

            case ($q==='*' || $ctx->q_operator==='*'):
                return self::resolve_not_empty_value_sql_tm($query_object, $ctx);

            case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
                return self::resolve_different_sql_tm($query_object, $q, $ctx);

            case (strpos($q, '==')===0 || $ctx->q_operator==='=='):
                return self::resolve_exactly_equal_sql_tm($query_object, $q, $ctx);

            case (strpos($q, '-')===0 || $ctx->q_operator==='-'):
                return self::resolve_not_contain_sql_tm($query_object, $q, $ctx);

            case (strpos($q, '!!')===0 || $ctx->q_operator==='!!'):
                return self::resolve_duplicated_sql_tm($query_object, $ctx);

            case (substr($q, 0, 1)==='*' || substr($q, -1)==='*' || search::is_literal($q)):
                return self::resolve_wildcard_literal_sql_tm($query_object, $q, $ctx);

            default:
                // return self::resolve_contains_sql_tm($query_object, $q, $ctx);
                return $ctx->column==='data'
                    ? self::resolve_contains_sql_tm($query_object, $q, $ctx)
                    : self::resolve_exactly_equal_sql_tm($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_EMPTY_VALUE_SQL_TM (!*)
    * !* Is Empty (Time Machine version)
    * Translation: "Is empty" / "Does not have data"
    * Technical Logic: Direct column IS NULL check for matrix_time_machine table
    * What it returns: Records where the specific string field is null.
    * When to use: To find time machine records with empty string values.
    * Example: "Show me all time machine records with empty titles."
    *
    * @param object $query_object The query object to modify with SQL
    * @param object $ctx The search context with table_alias and column name
    * @return object The query object with SQL sentence set to "column IS NULL"
    */
    protected static function resolve_empty_value_sql_tm(object $query_object, object $ctx) : object {

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} IS NULL";
        return $query_object;
    }



    /**
    * RESOLVE_NOT_EMPTY_VALUE_SQL_TM (*)
    * * Not Empty (Time Machine version)
    * Translation: "Not empty" / "Has data"
    * Technical Logic: Direct column IS NOT NULL check for matrix_time_machine table
    * What it returns: Records that have a non-null string value.
    * When to use: To find time machine records with non-empty string values.
    * Example: "Show me all time machine records that have title data."
    *
    * @param object $query_object The query object to modify with SQL
    * @param object $ctx The search context with table_alias and column name
    * @return object The query object with SQL sentence set to "column IS NOT NULL"
    */
    protected static function resolve_not_empty_value_sql_tm(object $query_object, object $ctx) : object {

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} IS NOT NULL";
        return $query_object;
    }



    /**
    * RESOLVE_DIFFERENT_SQL_TM (!=)
    * != Different (Time Machine version)
    * Translation: "Does not equal X."
    * Technical Logic: Direct column inequality check with wildcard support for matrix_time_machine
    * What it returns: Records with string values different from the specified pattern.
    * When to use: To find time machine records not matching a specific string value.
    * Example: "Show me all time machine records with titles not equal to 'Draft'."
    *
    * Wildcard Support:
    *   - *text* : NOT LIKE '%text%' (does not contain)
    *   - *text  : NOT LIKE '%text' (does not end with)
    *   - text*  : NOT LIKE 'text%' (does not start with)
    *   - text   : != 'text' (not equal)
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q The search query with != operator and optional wildcards
    * @param object $ctx The search context with table_alias and column name
    * @return object The query object with SQL sentence and params set
    */
    protected static function resolve_different_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('!=', '', $q));

        $first_char = mb_substr($q_clean, 0, 1);
        $last_char  = mb_substr($q_clean, -1);

        $match_logic = '';
        switch (true) {
            case ($first_char==='*' && $last_char==='*'):
                $query_object->params = ['_Q1_' => '%'.str_replace('*', '', $q_clean).'%'];
                $match_logic = "NOT LIKE _Q1_";
                break;
            case ($first_char==='*'):
                $query_object->params = ['_Q1_' => '%'.str_replace('*', '', $q_clean)];
                $match_logic = "NOT LIKE _Q1_";
                break;
            case ($last_char==='*'):
                $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean).'%'];
                $match_logic = "NOT LIKE _Q1_";
                break;
            default:
                $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];
                $match_logic = "!= _Q1_";
                break;
        }

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} $match_logic";

        return $query_object;
    }



    /**
    * RESOLVE_EXACTLY_EQUAL_SQL_TM (==)
    * == Exactly Equal (Time Machine version)
    * Translation: "Equals exactly X."
    * Technical Logic: Direct column equality check for matrix_time_machine table
    * What it returns: Records where the string value matches exactly.
    * When to use: To find time machine records with exact string matches.
    * Example: "Show me all records with title exactly 'Final Version'."
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q The search query with == operator
    * @param object $ctx The search context with table_alias and column name
    * @return object The query object with SQL sentence "column = _Q1_" and params set
    */
    protected static function resolve_exactly_equal_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('==', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} = _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_NOT_CONTAIN_SQL_TM (-)
    * - Does Not Contain (Time Machine version)
    * Translation: "Does not contain string X anywhere."
    * Technical Logic: Direct column NOT LIKE check with wildcards for matrix_time_machine
    * What it returns: Records that do not have the provided string fragment.
    * When to use: To find records not containing a specific substring.
    * Example: "Show me all records not containing 'temp' in the title."
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q The search query with - operator prefix
    * @param object $ctx The search context with table_alias and column name
    * @return object The query object with SQL sentence "column NOT LIKE '%value%'" and params set
    */
    protected static function resolve_not_contain_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('-', '', $q));
        $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} NOT LIKE _Q1_";

        return $query_object;
    }



    /**
    * RESOLVE_DUPLICATED_SQL_TM (!!)
    * !! Duplicated (Time Machine version)
    * Translation: "Has any value shared by another record."
    * Technical Logic: EXISTS subquery finding records with same column value in matrix_time_machine
    * What it returns: Records containing string values found in other records of the same type.
    * When to use: To find duplicate string values across time machine records.
    * Example: "Show me all records that share the same title with other records."
    *
    * Note: Sets $query_object->duplicated=true and $query_object->unaccent=true for downstream processing.
    *
    * @param object $query_object The query object to modify with SQL and flags
    * @param object $ctx The search context with table_alias, table, and column name
    * @return object The query object with EXISTS subquery SQL sentence and flags set
    */
    protected static function resolve_duplicated_sql_tm(object $query_object, object $ctx) : object {
        $query_object->duplicated = true;
        $query_object->unaccent   = true;

        $query_object->sentence = "EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM {$ctx->table} AS m2" . PHP_EOL .
            "  WHERE m2.{$ctx->column} = {$ctx->table_alias}.{$ctx->column}" . PHP_EOL .
            "    AND m2.section_id != {$ctx->table_alias}.section_id" . PHP_EOL .
            "    AND m2.section_tipo = {$ctx->table_alias}.section_tipo" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_WILDCARD_LITERAL_SQL_TM (*text, text*, 'text')
    * Wildcard / Literal Match (Time Machine version)
    * Translation: "Matches pattern X (startsWith, endsWith, or literal)."
    * Technical Logic: Direct LIKE comparison with wildcard patterns for matrix_time_machine
    * What it returns: Records matching the specified string pattern.
    * When to use: To find records using wildcard or exact literal patterns.
    * Example: "Show me records starting with 'Draft' (Draft*) or ending with '2024' (*2024)."
    *
    * Pattern Support:
    *   - 'text'  : Exact literal match (=)
    *   - *text   : Ends with (LIKE '%text')
    *   - text*   : Starts with (LIKE 'text%')
    *   - default : Contains (LIKE '%text%')
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q The search query with wildcards or literal quotes
    * @param object $ctx The search context with table_alias and column name
    * @return object The query object with SQL sentence and params set based on pattern type
    */
    protected static function resolve_wildcard_literal_sql_tm(object $query_object, string $q, object $ctx) : object {

        $is_literal = search::is_literal($q);
        $q_clean    = trim(str_replace(["'", '*'], '', $q));

        $match_logic = '';
        switch (true) {
            case $is_literal:
                $query_object->params = ['_Q1_' => $q_clean];
                $match_logic = "= _Q1_";
                break;
            case substr($q, 0, 1)==='*':
                $query_object->params = ['_Q1_' => '%'.$q_clean];
                $match_logic = "LIKE _Q1_";
                break;
            case substr($q, -1)==='*':
                $query_object->params = ['_Q1_' => $q_clean.'%'];
                $match_logic = "LIKE _Q1_";
                break;
            default:
                $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];
                $match_logic = "LIKE _Q1_";
                break;
        }

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} $match_logic";

        return $query_object;
    }



    /**
    * RESOLVE_CONTAINS_SQL_TM (Default)
    * Contains (Time Machine version)
    * Translation: "Contains string X."
    * Technical Logic: Direct LIKE '%value%' comparison for matrix_time_machine table
    * What it returns: Records containing the provided string fragment.
    * When to use: Default fallback when no specific operator is matched.
    * Example: "Show me all records containing 'project' in any position."
    *
    * Note: This is currently unused - the dispatcher falls back to resolve_exactly_equal_sql_tm instead.
    *
    * @param object $query_object The query object to modify with SQL and params
    * @param string $q The search query string (cleaned of +, *, = characters)
    * @param object $ctx The search context with table_alias and column name
    * @return object The query object with SQL sentence "column LIKE '%value%'" and params set
    */
    protected static function resolve_contains_sql_tm(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q);
        $query_object->params = ['_Q1_' => '%'.$q_clean.'%'];

        $query_object->sentence = "CAST({$ctx->table_alias}.{$ctx->column} AS text) LIKE _Q1_";

        return $query_object;
    }



}//end search_component_string_common_tm