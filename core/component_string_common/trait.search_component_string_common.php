<?php declare(strict_types=1);
/**
* TRAIT SEARCH_COMPONENT_STRING_COMMON
* From class component_string_common
* Common search methods for string components
*/
trait search_component_string_common {



    /**
    * RESOLVE_QUERY_OBJECT_SQL
    * @param object $query_object
    * @return object|false $query_object
    * Edited/parsed version of received object
    */
    public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Handle Query Splitting (if applicable)
        if (($query_object->q_split ?? false) === true && !search::is_literal($q)) {
            $q_items = self::split_search_terms($q);
            if (count($q_items) > 1) {
                return self::handle_query_splitting($query_object, $q_items, '$and');
            }
        }

        // 3. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 4. Dispatch to Specific Operator Handler
        return self::dispatch_operator_sql($query_object, $q, $ctx);
    }



    /**
    * EXTRACT_NORMALIZED_Q
    * Extracts and normalizes the search value from the query object.
    */
    protected static function extract_normalized_q(object $query_object) : string|false {
        
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
    * SPLIT_SEARCH_TERMS
    * Process operators and wildcards before splitting the query string.
    */
    protected static function split_search_terms(string $q) : array {
        
        // Join operators with next word (remove space)
        // Operators: !=, ==, !!, !*, =, -
        $q = preg_replace('/(\!=|==|!!|!*|=|-)\s+/', '$1', $q);
        
        // Join wildcard at the end (remove space before wildcard)
        $q = preg_replace('/\s+(\*)/', '$1', $q);

        return preg_split('/\s/', $q, -1, PREG_SPLIT_NO_EMPTY);
    }



    /**
    * GET_SEARCH_CONTEXT
    * Validates the path and collects necessary metadata for SQL generation.
    */
    protected static function get_search_context(object $query_object) : object|false {
        
        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $path_end       = end($query_object->path);
        $component_tipo = $path_end->component_tipo;
        
        $ctx = new stdClass();
        $ctx->component_tipo = $component_tipo;
        $ctx->translatable   = ontology_node::get_translatable($component_tipo);
        $ctx->column         = section_record_data::get_column_name(get_called_class());
        $ctx->table_alias    = $query_object->table_alias;
        $ctx->table          = $query_object->table;
        $ctx->q_operator     = $query_object->q_operator ?? null;
        
        // Set defaults on query_object
        $query_object->type = 'string';
        $query_object->lang = $query_object->lang ?? DEDALO_DATA_LANG;

        return $ctx;
    }



    /**
    * DISPATCH_OPERATOR_SQL
    * Routes the search resolution to the correct operator handler.
    */
    protected static function dispatch_operator_sql(object $query_object, string $q, object $ctx) : object {

        switch (true) {
            case ($q==='!*' || $ctx->q_operator==='!*'):
                return self::resolve_empty_value_sql($query_object, $ctx);

            case ($q==='*' || $ctx->q_operator==='*'):
                return self::resolve_not_empty_value_sql($query_object, $ctx);

            case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
                return self::resolve_different_sql($query_object, $q, $ctx);

            case (strpos($q, '==')===0 || $ctx->q_operator==='=='):
                return self::resolve_exactly_equal_sql($query_object, $q, $ctx);

            case (strpos($q, '-')===0 || $ctx->q_operator==='-'):
                return self::resolve_not_contain_sql($query_object, $q, $ctx);

            case (strpos($q, '!!')===0 || $ctx->q_operator==='!!'):
                return self::resolve_duplicated_sql($query_object, $ctx);

            case (substr($q, 0, 1)==='*' || substr($q, -1)==='*' || search::is_literal($q)):
                return self::resolve_wildcard_literal_sql($query_object, $q, $ctx);

            default:
                return self::resolve_contains_sql($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_EMPTY_VALUE_SQL (!*)
    * !* Is Empty
	* Translation: "Is empty" / "Does not have data"
	* Technical Logic: column IS NULL OR NOT (column @? jsonpath)
	* What it returns: Records where the specific string field is null or contains only empty/null values.
    */
    protected static function resolve_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => ($query_object->lang === 'all')
                ? "$.{$ctx->component_tipo}[*].value ? (@ != \"\" && @ != null)"
                : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.value != \"\" && @.value != null)"
        ];
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} IS NULL OR NOT ({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath))";
        return $query_object;
    }



    /**
    * RESOLVE_NOT_EMPTY_VALUE_SQL (*)
    * * Not Empty
	* Translation: "Not empty" / "Has data"
	* Technical Logic: (column @? jsonpath)
	* What it returns: Records that have at least one non-empty string entry.
    */
    protected static function resolve_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => ($query_object->lang === 'all')
                ? "$.{$ctx->component_tipo}[*].value ? (@ != \"\" && @ != null)"
                : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\" && @.value != \"\" && @.value != null)"
        ];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        return $query_object;
    }



    /**
    * RESOLVE_DIFFERENT_SQL (!=)
    * != Different
	* Translation: "Has data AND does not contain X."
	* Technical Logic: (column @? jsonpath) AND NOT EXISTS (specific match)
	* What it returns: Records with data where the specific pattern X is not present.
    */
    protected static function resolve_different_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('!=', '', $q));
        $query_object->params = ['_Q1_' => str_replace('*', '', $q_clean)];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $first_char = mb_substr($q_clean, 0, 1);
        $last_char  = mb_substr($q_clean, -1);

        $match_logic = '';
        switch (true) {
            case ($first_char==='*' && $last_char==='*'):
                $match_logic = "f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)";
                break;
            case ($first_char==='*'):
                $match_logic = "f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')";
                break;
            case ($last_char==='*'):
                $match_logic = "f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))";
                break;
            default:
                $match_logic = "f_unaccent(elem->>'value') = f_unaccent(_Q1_)";
                break;
        }

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND NOT EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE {$match_logic}" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_EXACTLY_EQUAL_SQL (==)
    * == Exactly Equal
	* Translation: "Contains exactly X."
	* Technical Logic: EXISTS (unaccented exact match)
	* What it returns: Records where at least one entry matches the full string exactly.
    */
    protected static function resolve_exactly_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('==', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE f_unaccent(elem->>'value') = f_unaccent(_Q1_)" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_NOT_CONTAIN_SQL (-)
    * - Does Not Contain
	* Translation: "Does not contain string X anywhere."
	* Technical Logic: NOT EXISTS (string ILIKE fragment X)
	* What it returns: Records that do not have the provided string fragment in any of their entries.
    */
    protected static function resolve_not_contain_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = trim(str_replace('-', '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = "$.{$ctx->component_tipo}[*]";
        $lang_filter = ($query_object->lang === 'all') ? '' : " AND elem->>'lang' = '{$query_object->lang}'";

        $query_object->sentence = "NOT EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE elem->>'value' IS NOT NULL AND f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)" . $lang_filter . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_DUPLICATED_SQL (!!)
    * !! Duplicated
	* Translation: "Has any value shared by another record."
	* Technical Logic: EXISTS (another record with same unaccented 'value')
	* What it returns: Records containing string values found in other records of the same type.
    */
    protected static function resolve_duplicated_sql(object $query_object, object $ctx) : object {
        $query_object->duplicated = true;
        $query_object->unaccent   = true;

        if ($query_object->lang !== 'all' && $ctx->translatable === false) {
            $query_object->lang = DEDALO_DATA_NOLAN;
        }

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM {$ctx->table} AS m2," . PHP_EOL .
            "       jsonb_path_query(m2.{$ctx->column}, '{$json_path}') AS m2_elem," . PHP_EOL .
            "       jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS m1_elem" . PHP_EOL .
            "  WHERE m2.{$ctx->column} @? '{$json_path}'" . PHP_EOL .
            "    AND m2.section_id != {$ctx->table_alias}.section_id" . PHP_EOL .
            "    AND m2.section_tipo = {$ctx->table_alias}.section_tipo" . PHP_EOL .
            "    AND f_unaccent(m2_elem->>'value') = f_unaccent(m1_elem->>'value')" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_WILDCARD_LITERAL_SQL (*text, text*, 'text')
    * Wildcard / Literal Match
	* Translation: "Matches pattern X (startsWith, endsWith, or literal)."
	* Technical Logic: Postgres REGEX or exact match based on wildcard position.
	* What it returns: Records matching the specified string pattern.
    */
    protected static function resolve_wildcard_literal_sql(object $query_object, string $q, object $ctx) : object {
        
        $is_literal = search::is_literal($q);
        $q_clean    = trim(str_replace(["'", '*'], '', $q));
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $match_logic = '';
        switch (true) {
            case $is_literal:
                $match_logic = "f_unaccent(elem->>'value') = f_unaccent(_Q1_)";
                break;
            case substr($q, 0, 1)==='*':
                $match_logic = "f_unaccent(elem->>'value') ~* (f_unaccent(_Q1_) || '$')";
                break;
            case substr($q, -1)==='*':
                $match_logic = "f_unaccent(elem->>'value') ~* ('^' || f_unaccent(_Q1_))";
                break;
            default:
                $match_logic = "f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)";
                break;
        }

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE {$match_logic}" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * RESOLVE_CONTAINS_SQL (Default)
    * Contains
	* Translation: "Contains string X."
	* Technical Logic: EXISTS (unaccented ILIKE match)
	* What it returns: Records containing the provided string fragment.
    */
    protected static function resolve_contains_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q);
        $query_object->params = ['_Q1_' => $q_clean];

        $json_path = ($query_object->lang === 'all')
            ? "$.{$ctx->component_tipo}[*]"
            : "$.{$ctx->component_tipo}[*] ? (@.lang == \"{$query_object->lang}\")";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            "  SELECT 1" . PHP_EOL .
            "  FROM jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS elem" . PHP_EOL .
            "  WHERE f_unaccent(elem->>'value') ~* f_unaccent(_Q1_)" . PHP_EOL . " )";

        return $query_object;
    }



    /**
    * SEARCH_OPERATORS_INFO
    * Return valid operators for search in current component
    * @return array $ar_operators
    */
    public function search_operators_info() : array {

        $ar_operators = [
            '!*'		=> 'empty', // null
            '*'			=> 'no_empty', // not null            
            '=='		=> 'exactly',
            '='			=> 'similar_to',
            '!='		=> 'different_from',
            '-'			=> 'does_not_contain',
            '!!'		=> 'duplicated',
            'text*'		=> 'begins_with',
            '*text'		=> 'end_with',
            '\'text\''	=> 'literal'
        ];

        return $ar_operators;
    }//end search_operators_info



}//end search_component_string_common