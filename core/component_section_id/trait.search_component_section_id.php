<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_SECTION_ID
 * From class component_section_id
 * Common search methods for section id component
 */
trait search_component_section_id {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object|false $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_section_id_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_section_id_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 3. Dispatch to Specific Operator Handler
        return self::dispatch_section_id_operator_sql($query_object, $q, $ctx);
    }



    /**
    * EXTRACT_NORMALIZED_SECTION_ID_Q
    */
    protected static function extract_normalized_section_id_q(object $query_object) : string|false {

        $q_raw = isset($query_object->q) && is_array($query_object->q)
            ? reset($query_object->q)
            : ($query_object->q ?? null);

        // if q is a locator, get the section_id as int
        if (is_object($q_raw) && isset($q_raw->section_id)) {
            $q_raw = $q_raw->section_id;
        }

        if (empty($q_raw) && empty($query_object->q_operator)) {
            return false;
        }

        $q = (string)$q_raw;

        // Prepend q_operator if exists
        if (isset($query_object->q_operator)) {
            $q = $query_object->q_operator . $q;
        }

        return $q;
    }



    /**
    * GET_SECTION_ID_SEARCH_CONTEXT
    */
    protected static function get_section_id_search_context(object $query_object) : object|false {

        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $column = section_record_data::get_column_name(get_called_class());

        $ctx = new stdClass();
        $ctx->column         = $column;
        $ctx->table_alias    = $query_object->table_alias;
        $ctx->q_operator     = $query_object->q_operator ?? null;

        // Set fixed values on query_object
        $query_object->type           = 'number';
        $query_object->unaccent       = false;
        $query_object->format         = 'column';
        $query_object->column_name    = 'section_id';
        $query_object->component_path = ['section_id'];

        return $ctx;
    }



    /**
    * DISPATCH_SECTION_ID_OPERATOR_SQL
    */
    protected static function dispatch_section_id_operator_sql(object $query_object, string $q, object $ctx) : object {

        $between_separator  = '...';
        $sequence_separator = ',';

        switch (true) {
            case (strpos($q, $between_separator)!==false):
                return self::resolve_section_id_between_sql($query_object, $q, $ctx);

            case (strpos($q, $sequence_separator)!==false):
                return self::resolve_section_id_sequence_sql($query_object, $q, $ctx);

            case (strpos($q, '!=')===0 || $ctx->q_operator==='!='):
                return self::resolve_section_id_different_sql($query_object, $q, $ctx);

            case (strpos($q, '>=')===0 || $ctx->q_operator==='>='):
                return self::resolve_section_id_bigger_or_equal_sql($query_object, $q, $ctx);

            case (strpos($q, '<=')===0 || $ctx->q_operator==='<='):
                return self::resolve_section_id_smaller_or_equal_sql($query_object, $q, $ctx);

            case (strpos($q, '>')===0 || $ctx->q_operator==='>'):
                return self::resolve_section_id_bigger_than_sql($query_object, $q, $ctx);

            case (strpos($q, '<')===0 || $ctx->q_operator==='<'):
                return self::resolve_section_id_smaller_than_sql($query_object, $q, $ctx);

            default:
                return self::resolve_section_id_equal_sql($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_SECTION_ID_BETWEEN_SQL (...)
    * ... Between
	* Translation: "section_id is between X and Y"
	* Technical Logic: column >= X AND column <= Y
	* What it returns: Records whose section_id falls within the specified numeric range.
    */
    protected static function resolve_section_id_between_sql(object $query_object, string $q, object $ctx) : object {

        $between_separator = '...';
        $ar_parts          = explode($between_separator, $q);
        $first_val         = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
        $second_val        = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

        $query_object_one = clone $query_object;
            $query_object_one->sentence = "{$ctx->table_alias}.{$ctx->column}::integer >= _Q1_";
            $query_object_one->params   = ['_Q1_' => $first_val];

        $query_object_two = clone $query_object;
            $query_object_two->sentence = "{$ctx->table_alias}.{$ctx->column}::integer <= _Q1_";
            $query_object_two->params   = ['_Q1_' => $second_val];

        $new_query_object = new stdClass();
        $new_query_object->{'$and'} = [$query_object_one, $query_object_two];

        return $new_query_object;
    }



    /**
    * RESOLVE_SECTION_ID_SEQUENCE_SQL (,)
    * , Sequence
	* Translation: "section_id is one of: [X, Y, Z]"
	* Technical Logic: column = ANY(array of integers)
	* What it returns: Records whose section_id matches any of the IDs provided in the comma-separated list.
    */
    protected static function resolve_section_id_sequence_sql(object $query_object, string $q, object $ctx) : object {

        $sequence_separator = ',';
        $ar_parts           = explode($sequence_separator, $q);
        $q_clean            = array_map(function($el){
            return (int)$el;
        }, $ar_parts);

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer = ANY(_Q1_::integer[])";
        $query_object->params   = ['_Q1_' => '{' . implode(',', $q_clean) . '}'];

        return $query_object;
    }



    /**
    * RESOLVE_SECTION_ID_DIFFERENT_SQL (!=)
    * != Different
	* Translation: "section_id is not X"
	* Technical Logic: column != X
	* What it returns: All records except the one with the specified section_id.
    */
    protected static function resolve_section_id_different_sql(object $query_object, string $q, object $ctx) : object {

        // remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer != _Q1_";
        $query_object->params   = ['_Q1_' => $q_clean];

        return $query_object;
    }



    /**
    * RESOLVE_SECTION_ID_BIGGER_OR_EQUAL_SQL (>=)
    * >= Greater Than or Equal
	* Translation: "section_id is greater than or equal to X"
	* Technical Logic: column >= X
	* What it returns: Records with section_id equal to or higher than X.
    */
    protected static function resolve_section_id_bigger_or_equal_sql(object $query_object, string $q, object $ctx) : object {

        // remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer >= _Q1_";
        $query_object->params   = ['_Q1_' => $q_clean];

        return $query_object;
    }



    /**
    * RESOLVE_SECTION_ID_SMALLER_OR_EQUAL_SQL (<=)
    * <= Less Than or Equal
	* Translation: "section_id is less than or equal to X"
	* Technical Logic: column <= X
	* What it returns: Records with section_id equal to or lower than X.
    */
    protected static function resolve_section_id_smaller_or_equal_sql(object $query_object, string $q, object $ctx) : object {

        // remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer <= _Q1_";
        $query_object->params   = ['_Q1_' => $q_clean];

        return $query_object;
    }



    /**
    * RESOLVE_SECTION_ID_BIGGER_THAN_SQL (>)
    * > Greater Than
	* Translation: "section_id is greater than X"
	* Technical Logic: column > X
	* What it returns: Records with section_id strictly higher than X.
    */
    protected static function resolve_section_id_bigger_than_sql(object $query_object, string $q, object $ctx) : object {

        // remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer > _Q1_";
        $query_object->params   = ['_Q1_' => $q_clean];

        return $query_object;
    }



    /**
    * RESOLVE_SECTION_ID_SMALLER_THAN_SQL (<)
    * < Less Than
	* Translation: "section_id is less than X"
	* Technical Logic: column < X
	* What it returns: Records with section_id strictly lower than X.
    */
    protected static function resolve_section_id_smaller_than_sql(object $query_object, string $q, object $ctx) : object {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

		$query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer < _Q1_";
        $query_object->params   = ['_Q1_' => $q_clean];

        return $query_object;
    }



    /**
    * RESOLVE_SECTION_ID_EQUAL_SQL (Default)
    * = Equal
	* Translation: "section_id is X"
	* Technical Logic: column = X
	* What it returns: The specific record matching the provided section_id.
    */
    protected static function resolve_section_id_equal_sql(object $query_object, string $q, object $ctx) : object {

		// remove non valid characters. Accepted: 0-9
		$q_clean = preg_replace('/[^0-9]/', '', $q);

        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column}::integer = _Q1_";
        $query_object->params   = ['_Q1_' => $q_clean];

        return $query_object;
    }



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'...'	=> 'between',
			','		=> 'sequence',
			'>='	=> 'greater_than_or_equal',
			'<='	=> 'less_than_or_equal',
			'>'		=> 'greater_than',
			'<'		=> 'less_than'
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_section_id
