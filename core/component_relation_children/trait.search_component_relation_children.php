<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_CHILDREN
 * From class component_relation_children
 * Common search methods for relation children component
 */
trait search_component_relation_children {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Resolves the query object for SQL generation.
	* Converts a query object containing child locators into a format suitable for database querying,
	* specifically optimizing for 'IN' operator queries against section IDs.
	*
	* @param object $query_object The initial query object with search parameters.
	* @return object|false The modified query object ready for SQL generation.
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

		return $query_object;
	}//end resolve_query_object_sql



	/**
    * EXTRACT_NORMALIZED_RELATION_Q
    * Extracts and normalizes the search query value (q) from the input object.
    */
    protected static function extract_normalized_relation_q(object $query_object) : string|false {

        $q_raw  = $query_object->q ?? null;

        // For unification, all non string are JSON encoded
        $q = is_string($q_raw) ? $q_raw : json_encode($q_raw);

        // Remove initial and final array square brackets if they exist
        if (strpos($q, '[') === 0) {
            $q = preg_replace('/^(\[)(.*)(\])$/m', '$2', $q);
        }

        // Safe q check
        if (strpos($q, '{') === false && $q !== 'only_operator') {
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
		$ctx->table          = $query_object->table;
        $ctx->q_operator     = $query_object->q_operator ?? null;

        // Set defaults on query_object
        $query_object->type = 'jsonb';

		// target_parent_tipo
		$ar_target_parent_tipo	= component_relation_children::get_ar_related_parent_tipo(
			$component_tipo,
			'hierarchy20' // ITS NOT CORRECT, but is not possible know the section_tipo here
		);
		$target_parent_tipo = $ar_target_parent_tipo[0] ?? null;
		if(empty($target_parent_tipo)){
			debug_log(__METHOD__
				. " Invalid target parent tipo " . PHP_EOL
				. ' ar_target_parent_tipo: ' . to_string($ar_target_parent_tipo) . PHP_EOL
				. ' query_object: ' . to_string($query_object)
				, logger::ERROR
			);
			return false;
		}
		$ctx->target_parent_tipo = $target_parent_tipo;

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
    */
	protected static function resolve_relation_empty_value_sql(object $query_object, object $ctx) : object {

		$query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo
		];

		/**
		 * Use NOT EXISTS for efficiency.
		 * Use ::text comparison for section_id to ensure matching works regardless of
		 * whether the ID is stored as a string or a number in the JSONB column.
		 */
		$query_object->sentence = "NOT EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
		)";

		return $query_object;
	}



    /**
    * RESOLVE_RELATION_NOT_EMPTY_VALUE_SQL (*)
    */
    protected static function resolve_relation_not_empty_value_sql(object $query_object, object $ctx) : object {
        $query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo
		];

		$query_object->sentence = "EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
		)";

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
			'_Q1_' => $ctx->target_parent_tipo,
			'_Q2_' => $q
		];

		/**
		 * Different (!=): Record has data (children) AND the target child is not present.
		 * Logic: (EXISTS any child) AND (NOT EXISTS specific child X)
		 */
		$query_object->sentence = "EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
		) AND NOT EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
			  AND sub.section_id::text = (_Q2_::jsonb->>'section_id')
			  AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo')
		)";

        return $query_object;
    }



	/**
    * RESOLVE_RELATION_STRICT_DIFFERENT_SQL (!==)
	* !== Strict Different (Absolute Absence)
	* Translation: "Does not have X."
	* Technical Logic: NOT EXISTS (...)
	* What it returns:
	* Records that have other relations (but not X).
	* Records that have no relations at all (Empty).
	* When to use: When you want to find everything that is completely unrelated to a specific section.
	* Example: "Show me all Books that are NOT written by Author A." (This will include books with no author assigned yet).
	*/
    protected static function resolve_relation_strict_different_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo,
			'_Q2_' => $q
		];

		$query_object->sentence = "NOT EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
			  AND sub.section_id::text = (_Q2_::jsonb->>'section_id')
			  AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo')
		)";

        return $query_object;
    }



	/**
    * RESOLVE_RELATION_CONTAIN_SQL (Default)
    */
    protected static function resolve_relation_contain_sql(object $query_object, string $q, object $ctx) : object {
        $query_object->params = [
			'_Q1_' => $ctx->target_parent_tipo,
			'_Q2_' => $q
		];

		$query_object->sentence = "EXISTS (
			SELECT 1
			FROM \"{$ctx->table}\" AS sub
			CROSS JOIN LATERAL jsonb_array_elements(
				CASE
					WHEN jsonb_typeof(sub.relation->_Q1_) = 'array' THEN sub.relation->_Q1_
					ELSE jsonb_build_array(sub.relation->_Q1_)
				END
			) AS elem
			WHERE sub.relation ? _Q1_
			  AND elem->>'section_id' = {$ctx->table_alias}.section_id::text
			  AND sub.section_id::text = (_Q2_::jsonb->>'section_id')
			  AND sub.section_tipo = (_Q2_::jsonb->>'section_tipo')
		)";

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



}//end search_component_relation_children
