<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_JSON
 * From class component_json
 * Common search methods for json component
 */
trait search_component_json {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	*  Cloned from component_input_text
	* @param object $query_object
	* @return object|false $query_object
	*	Edited/parsed version of received object
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
    * Extracts and normalizes the search query value (q) from the input object.
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
    * Validates the path and collects necessary metadata for SQL generation.
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
        
        // Set defaults on query_object
		$query_object->type = 'jsonb';

        return $ctx;
    }



    /**
    * DISPATCH_JSON_OPERATOR_SQL
    * Routes the search resolution to the correct operator handler.
    */
    protected static function dispatch_json_operator_sql(object $query_object, string $q, object $ctx) : object {

        // escape q string for JSON Path (double quotes)
        $q_json_path = str_replace('"', '\\"', $q);

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
    * !* Is Empty
	* Translation: "Is empty" / "Does not have data"
	* Technical Logic: column IS NULL OR NOT EXISTS (valid value in json array)
	* What it returns: Records where the specific JSON field is null or contains only empty/null values.
    */
    protected static function resolve_json_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->sentence  = "({$ctx->table_alias}.{$ctx->column} IS NULL" . PHP_EOL;
        $query_object->sentence .= "OR NOT EXISTS (" . PHP_EOL;
        $query_object->sentence .= " SELECT 1" . PHP_EOL;
        $query_object->sentence .= " FROM jsonb_array_elements({$ctx->table_alias}.{$ctx->column}->'{$ctx->component_tipo}') AS elem" . PHP_EOL;
        $query_object->sentence .= " WHERE elem->>'value' IS NOT NULL" . PHP_EOL;
        $query_object->sentence .= " AND elem->>'value' != ''" . PHP_EOL;
        $query_object->sentence .= " )" . PHP_EOL;
        $query_object->sentence .= ")";
        return $query_object;
    }



    /**
    * RESOLVE_JSON_NOT_EMPTY_VALUE_SQL (*)
    * * Not Empty
	* Translation: "Not empty" / "Has data"
	* Technical Logic: (column @? jsonpath)
	* What it returns: Records that have at least one valid entry in the JSON array.
    */
    protected static function resolve_json_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath)";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*]"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_DIFFERENT_SQL (!=)
    * != Different
	* Translation: "Does not contain X."
	* Technical Logic: NOT (column @? jsonpath with like_regex)
	* What it returns: Records that do not contain the target value (case-insensitive).
    */
    protected static function resolve_json_different_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace('!=', '', $q_json_path);
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath)";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_EXACTLY_EQUAL_SQL (==)
    * == Exactly Equal
	* Translation: "Contains exactly X."
	* Technical Logic: (column @? jsonpath) with exact string match.
	* What it returns: Records where at least one entry in the JSON array matches the string exactly.
    */
    protected static function resolve_json_exactly_equal_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace('==', '', $q_json_path);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*].value ? (@ == \"{$q_clean}\")"];       
        return $query_object;
    }



    /**
    * RESOLVE_JSON_NOT_CONTAIN_SQL (-)
    * - Does Not Contain
	* Translation: "Does not contain string X."
	* Technical Logic: NOT (column @? jsonpath with like_regex)
	* What it returns: Records that do not contain the provided string fragment.
    */
    protected static function resolve_json_not_contain_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace('-', '', $q_json_path);
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath)";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_ENDS_WITH_SQL (*text)
    * *text Ends With
	* Translation: "Value ends with X."
	* Technical Logic: (column @? jsonpath with like_regex) and '$' anchor.
	* What it returns: Records where at least one entry ends with the provided string.
    */
    protected static function resolve_json_ends_with_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean  = str_replace('*', '', $q_json_path);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}$\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_BEGINS_WITH_SQL (text*)
    * text* Begins With
	* Translation: "Value begins with X."
	* Technical Logic: (column @? jsonpath with like_regex) and '^' anchor.
	* What it returns: Records where at least one entry begins with the provided string.
    */
    protected static function resolve_json_begins_with_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean  = str_replace('*', '', $q_json_path);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*].value.** ? (@ like_regex \"^{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_LITERAL_SQL ('text')
    * 'text' Literal Match
	* Translation: "Matches exactly X."
	* Technical Logic: (column @? jsonpath) using '@ ==' comparison.
	* What it returns: Records containing at least one exact match.
    */
    protected static function resolve_json_literal_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean  = str_replace("'", '', $q_json_path);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*].value ? (@ == \"{$q_clean}\")"];
        return $query_object;
    }



    /**
    * RESOLVE_JSON_DUPLICATED_SQL (!!)
    * !! Duplicated
	* Translation: "Has any value shared by another record."
	* Technical Logic: EXISTS (another record with same nested 'value')
	* What it returns: Records that contain values found in other records of the same type.
    */
    protected static function resolve_json_duplicated_sql(object $query_object, object $ctx) : object {
        $query_object->duplicated = true;
        $query_object->unaccent   = true;

        $json_path = "$.{$ctx->component_tipo}[*]";

        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} @? '{$json_path}') AND EXISTS (" . PHP_EOL .
            " SELECT 1" . PHP_EOL .
            " FROM {$ctx->table} AS m2," . PHP_EOL .
            "  jsonb_path_query(m2.{$ctx->column}, '{$json_path}') AS m2_elem," . PHP_EOL .
            "  jsonb_path_query({$ctx->table_alias}.{$ctx->column}, '{$json_path}') AS m1_elem" . PHP_EOL .
            "  WHERE m2.{$ctx->column} @? '{$json_path}'" . PHP_EOL .
            "   AND m2.section_id != {$ctx->table_alias}.section_id" . PHP_EOL .
            "   AND m2.section_tipo = {$ctx->table_alias}.section_tipo" . PHP_EOL .
            "   AND m2_elem->>'value' = m1_elem->>'value'" . PHP_EOL .
            " )";
        return $query_object;
    }



    /**
    * RESOLVE_JSON_CONTAINS_SQL (Default)
    * Contains
	* Translation: "Contains string X."
	* Technical Logic: (column @? jsonpath with like_regex)
	* What it returns: Records containing the provided string fragment.
    */
    protected static function resolve_json_contains_sql(object $query_object, string $q_json_path, object $ctx) : object {
        $q_clean = str_replace(['+', '*', '='], '', $q_json_path);
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @? (_Q1_)::jsonpath";
        $query_object->params   = ['_Q1_' => "$.{$ctx->component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
        return $query_object;
    }



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
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
