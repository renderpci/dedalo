<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_INDEX
 * From class component_relation_index
 * Common search methods for relation index component
 */
trait search_component_relation_index {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @todo This method do not works if no references are found !
	*
	* @param object $query_object
	* @return object|false $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object|false {

        // 1. Gather Search Context
        $ctx = self::get_relation_index_search_context($query_object);
        if (!$ctx) {
            return false;
        }

        // 2. Dispatch to Specific Operator Handler
        return self::dispatch_relation_index_operator_sql($query_object, $ctx);
    }



    /**
    * GET_RELATION_INDEX_SEARCH_CONTEXT
    * Collects necessary metadata for SQL generation, focusing on the target section type.
    */
    protected static function get_relation_index_search_context(object $query_object) : object|false {
        
        if (empty($query_object->path) || !is_array($query_object->path)) {
            debug_log(__METHOD__ . " Invalid component path", logger::ERROR);
            return false;
        }

        $path_end = end($query_object->path);
        
        $ctx = new stdClass();
        $ctx->section_tipo = $path_end->section_tipo;
        $ctx->table_alias  = $query_object->table_alias;
        $ctx->q_operator   = $query_object->q_operator ?? null;

        return $ctx;
    }



    /**
    * DISPATCH_RELATION_INDEX_OPERATOR_SQL
    * Routes the search resolution to the correct operator handler.
    */
    protected static function dispatch_relation_index_operator_sql(object $query_object, object $ctx) : object {

        switch ($ctx->q_operator) {
            case '*':
                return self::resolve_relation_index_not_empty_sql($query_object, $ctx);

            case '!*':
                return self::resolve_relation_index_empty_sql($query_object, $ctx);

            default:
                // Other operators or no operator.
                // @todo Handle specific q values if necessary
                return $query_object;
        }
    }



    /**
    * RESOLVE_RELATION_INDEX_NOT_EMPTY_SQL (*)
    * * Not Empty
	* Translation: "Item is indexed/related elsewhere"
	* Technical Logic: section_id IN (list of referenced IDs)
	* What it returns: Records that are preserved as relations/references in any other part of the system.
    */
    protected static function resolve_relation_index_not_empty_sql(object $query_object, object $ctx) : object {
        
        $references = component_relation_index::get_references_to_section($ctx->section_tipo);
        
        if (empty($references)) {
            // No references exist, so NO record of this type is indexed.
            $query_object->sentence = "1=0";
            return $query_object;
        }

		// sentence
		$query_object->sentence = "{$ctx->table_alias}.section_id IN (" . implode(',', array_map('intval', $references)) . ")";

        return $query_object;
    }



    /**
    * RESOLVE_RELATION_INDEX_EMPTY_SQL (!*)
    * !* Is Empty
	* Translation: "Item is NOT indexed/related anywhere"
	* Technical Logic: section_id NOT IN (list of referenced IDs)
	* What it returns: Records that are NOT being used as relations/references by any other part of the system.
    */
    protected static function resolve_relation_index_empty_sql(object $query_object, object $ctx) : object {
        
        $references = component_relation_index::get_references_to_section($ctx->section_tipo);

        if (empty($references)) {
            // No references exist, so ALL records of this type are "empty" (not indexed).
            $query_object->sentence = "1=1";
            return $query_object;
        }

		// sentence
		$query_object->sentence = "{$ctx->table_alias}.section_id NOT IN (" . implode(',', array_map('intval', $references)) . ")";

        return $query_object;
    }



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'		=> 'no_empty',
			'!*'	=> 'empty'
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_relation_index
