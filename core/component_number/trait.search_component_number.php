<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_NUMBER
 * From class component_number
 * Common search methods for number component
 */
trait search_component_number {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object|false $query_object
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
    * Extracts and normalizes the search query value (q) from the input object.
    */
    protected static function extract_normalized_number_q(object $query_object) : string|false {
        
        $q_raw = isset($query_object->q) && is_array($query_object->q) 
            ? reset($query_object->q) 
            : ($query_object->q ?? null);

        if ($q_raw === null && empty($query_object->q_operator)) {
            return false;
        }

        $q = is_string($q_raw) ? $q_raw : to_string($q_raw);
        return $q;
    }



    /**
    * GET_NUMBER_SEARCH_CONTEXT
    * Validates the path and collects necessary metadata for SQL generation.
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
    * Routes the search resolution to the correct operator handler.
    */
    protected static function dispatch_number_operator_sql(object $query_object, string $q, object $ctx) : object {

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
	* Translation: "Is empty" / "Does not have data"
	* Technical Logic: column IS NULL OR NOT (column @? jsonpath)
	* What it returns: Records where the specific number field is null or contains only null values.
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
	* Translation: "Not empty" / "Has data"
	* Technical Logic: (column @? jsonpath)
	* What it returns: Records that have at least one valid numeric value.
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
	* Translation: "Is between X and Y."
	* Technical Logic: EXISTS (numeric >= X AND numeric <= Y)
	* What it returns: Records where at least one value falls within the specified range.
    */
    protected static function resolve_number_between_sql(object $query_object, string $q, object $ctx) : object {
        $ar_parts   = explode($ctx->between_sep, $q);
        $first_val  = !empty($ar_parts[0]) ? trim(str_replace(',', '.', $ar_parts[0])) : '0';
        $second_val = !empty($ar_parts[1]) ? trim(str_replace(',', '.', $ar_parts[1])) : $first_val;

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
	* Translation: "Is greater than or equal to X."
	* Technical Logic: EXISTS (numeric >= X)
	* What it returns: Records with at least one value >= the specified number.
    */
    protected static function resolve_number_greater_than_or_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['>=', ','], ['', '.'], $q);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
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
	* Translation: "Is less than or equal to X."
	* Technical Logic: EXISTS (numeric <= X)
	* What it returns: Records with at least one value <= the specified number.
    */
    protected static function resolve_number_less_than_or_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['<=', ','], ['', '.'], $q);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
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
	* Translation: "Is greater than X."
	* Technical Logic: EXISTS (numeric > X)
	* What it returns: Records with at least one value > the specified number.
    */
    protected static function resolve_number_greater_than_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['>', ','], ['', '.'], $q);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
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
	* Translation: "Is less than X."
	* Technical Logic: EXISTS (numeric < X)
	* What it returns: Records with at least one value < the specified number.
    */
    protected static function resolve_number_less_than_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['<', ','], ['', '.'], $q);
        if ($q_clean==='' || $q_clean===$ctx->q_only_op) {
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
	* Translation: "Is equal to X."
	* Technical Logic: EXISTS (numeric = X)
	* What it returns: Records with at least one value equal to the specified number.
    */
    protected static function resolve_number_equal_sql(object $query_object, string $q, object $ctx) : object {
        $q_clean = str_replace(['+', ','], ['', '.'], $q);

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
	* Return valid operators for search in current component
	* @return array $ar_operators
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
