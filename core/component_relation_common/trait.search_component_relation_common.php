<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_COMMON
 * From class component_relation_common
 * Common search methods for relation components
 */
trait search_component_relation_common {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Parses given query_object to use it into the SQL query
	* @param object $query_object
	* @return object|false $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Extract and Normalize search value (q)
        $q = self::extract_normalized_relation_q($query_object);
        if ($q === false) {
            return false;
        }

        // 2. Gather Search Context (metadata, column, table, etc.)
        $ctx = self::get_relation_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 3. Dispatch to Specific Operator Handler
        $query_object = self::dispatch_relation_operator_sql($query_object, $q, $ctx);

		// 4. Post-processing: relation_search (only for component_autocomplete_hi)
        $legacy_model = ontology_node::get_legacy_model_by_tipo($ctx->component_tipo);
        if ($legacy_model === 'component_autocomplete_hi') {
            $query_object = self::add_relation_search($query_object);
        }

        return $query_object;
    }



    /**
    * EXTRACT_NORMALIZED_RELATION_Q
    * Extracts and normalizes the search query value (q) from the input object.
    */
    protected static function extract_normalized_relation_q(object $query_object) : string|false {

        $format = $query_object->format ?? null;
        $q_raw  = $query_object->q ?? null;

        if ($format !== 'function') {
            if (!is_object($q_raw) && $q_raw !== 'only_operator') {
                debug_log(__METHOD__ . " Expected q type is object. Type: " . gettype($q_raw), logger::WARNING);
            }
        }

        // For unification, all non string are JSON encoded
        $q = is_string($q_raw) ? $q_raw : json_encode($q_raw);

        // Remove initial and final array square brackets if they exist
        if (strpos($q, '[') === 0) {
            $q = preg_replace('/^(\[)(.*)(\])$/m', '$2', $q);
        }

        // Safe q check
        if (strpos($q, '{') === false && $format !== 'function' && $q !== 'only_operator') {
            debug_log(__METHOD__ . ' Ignored invalid unsafe q: ' . to_string($q), logger::ERROR);
            $q = '[]';
        }

        return $q;
    }



    /**
    * GET_RELATION_SEARCH_CONTEXT
    * Validates the path and collects necessary metadata for SQL generation.
    */
    protected static function get_relation_search_context(object $query_object) : object|false {

        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $path_end       = end($query_object->path);
        $component_tipo = $path_end->component_tipo ?? null;

        if (empty($component_tipo)) {
            debug_log(__METHOD__ . " Invalid component tipo from path", logger::ERROR);
            return false;
        }

        $ctx = new stdClass();
        $ctx->component_tipo = $component_tipo;
        $ctx->column         = section_record_data::get_column_name(get_called_class());
        $ctx->table_alias    = $query_object->table_alias;
        $ctx->q_operator     = $query_object->q_operator ?? null;

        // Set defaults on query_object
        $query_object->type           = 'jsonb';
        $query_object->unaccent       = false;
        $query_object->component_path = ['relations'];

        return $ctx;
    }



    /**
    * DISPATCH_RELATION_OPERATOR_SQL
    * Routes the search resolution to the correct operator handler.
    */
    protected static function dispatch_relation_operator_sql(object $query_object, string $q, object $ctx) : object {

        switch (true) {
            case ($ctx->q_operator === '!*'):
                return self::resolve_relation_empty_value_sql($query_object, $ctx);

            case ($ctx->q_operator === '*'):
                return self::resolve_relation_not_empty_value_sql($query_object, $ctx);

            case ($ctx->q_operator === '!=' && !empty($q) && $q !== 'only_operator'):
                return self::resolve_relation_different_sql($query_object, $q, $ctx);

            case ($ctx->q_operator === '!==' && !empty($q) && $q !== 'only_operator'):
                return self::resolve_relation_strict_different_sql($query_object, $q, $ctx);

            default:
                return self::resolve_relation_contain_sql($query_object, $q, $ctx);
        }
    }



    /**
    * RESOLVE_RELATION_EMPTY_VALUE_SQL (!*)
    * !* Is Empty
	* Translation: "Is empty" / "Does not have data"
	* Technical Logic: NOT (column ? key)
	* What it returns: Records that have no relations for the specific component.
	* When to use: To find items with no assigned relations.
	* Example: "Show me all Books with no Author assigned."
    */
    protected static function resolve_relation_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params   = ['_Q1_' => $ctx->component_tipo];
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} ? _Q1_)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_NOT_EMPTY_VALUE_SQL (*)
    * * Not Empty
	* Translation: "Not empty" / "Has data"
	* Technical Logic: (column ? key)
	* What it returns: Records that have at least one relation for the specific component.
	* When to use: To find items that have some assigned relations.
	* Example: "Show me all Books that have an Author assigned."
    */
    protected static function resolve_relation_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params   = ['_Q1_' => $ctx->component_tipo];
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} ? _Q1_)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_DIFFERENT_SQL (!=)
    * != Different (Negative Filter)
	* Translation: "Does not have X."
	* Technical Logic: NOT EXISTS (...)
	* What it returns:
	* Records that have other relations (but not X).
	* Records that have no relations at all (Empty).
	* When to use: When you want to find everything that is completely unrelated to a specific section.
	* Example: "Show me all Books that were NOT written by Author A." (This will include books with no author assigned yet).
    */
    protected static function resolve_relation_different_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params = [
            '_Q1_' => '{"' . $ctx->component_tipo . '":[' . $q . ']}',
            '_Q2_' => $ctx->component_tipo
        ];
        $query_object->sentence = "({$ctx->table_alias}.{$ctx->column} ? _Q2_) AND NOT ({$ctx->table_alias}.{$ctx->column} @> _Q1_::jsonb)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_STRICT_DIFFERENT_SQL (!==)
    * !== Strict Different (Absolute Absence)
	* Translation: "Does not have X."
	* Technical Logic: NOT EXISTS (...)
	* What it returns:
	* Records that have no relations at all (Empty).
	* When to use: When you want to find everything that is completely unrelated to a specific section.
	* Example: "Show me all Books that are NOT written by Author A." (This will include books with no author assigned yet).
    */
    protected static function resolve_relation_strict_different_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params   = ['_Q1_' => '{"' . $ctx->component_tipo . '":[' . $q . ']}'];
        $query_object->sentence = "NOT ({$ctx->table_alias}.{$ctx->column} @> _Q1_::jsonb)";
        return $query_object;
    }



    /**
    * RESOLVE_RELATION_CONTAIN_SQL (Default)
    * == Contain
	* Translation: "Contains X."
	* Technical Logic: (column @> jsonb)
	* What it returns: Records that contain the specific relation.
	* When to use: To find items associated with a specific relation.
	* Example: "Show me all Books written by Author A."
    */
    protected static function resolve_relation_contain_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params   = ['_Q1_' => '{"' . $ctx->component_tipo . '":[' . $q . ']}'];
        $query_object->sentence = "{$ctx->table_alias}.{$ctx->column} @> _Q1_::jsonb";
        return $query_object;
    }



    /**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!*'	=> 'empty',
			'*'		=> 'no_empty', // not null
			'!='	=> 'different_from',
			'!=='	=> 'strict_different_from'
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* ADD_RELATION_SEARCH
	* @param object $query_object
	* @return object $new_query_object
	*/
	protected static function add_relation_search( object $query_object ) : object {

		// q_operator
		$q_operator = $query_object->q_operator ?? null;

		// Clone and modify query_object for search in relation_search too if the operator is different to ==
        $relation_search_obj = clone $query_object;
        if ($q_operator!=='==') {
            $relation_search_obj->component_path = ['relation_search'];
        }

		// Group the two query_object in a 'or' clause
		$operator = '$or';
		if ($q_operator==='!=' || $q_operator==='!*') {
			$operator = '$and';
		}
		$new_query_object = new stdClass();
			$new_query_object->{$operator} = [$query_object, $relation_search_obj];


		return $new_query_object;
	}//end add_relation_search



}//end search_component_relation_common
