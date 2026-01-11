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
	public static function resolve_query_object_sql( object $query_object ) : object|false {

		$with_references = false;

		// q_operator check
			$q_operator = $query_object->q_operator ?? null;
			if (	$q_operator==='*' // It contains information
				|| 	$q_operator==='!*' // Empty
				) {

				// section_tipo from path
				$section_tipo = end($query_object->path)->section_tipo;

				// references to current section tipo and type
				$references = component_relation_index::get_references_to_section(
					$section_tipo
				);
				if (!empty($references)) {

					// format. Always set format to column (but in sequence case)
					$query_object->format = 'column';
					// component path  array
					$query_object->component_path = ['section_id'];
					// operator
					$query_object->operator	= $q_operator==='!*'
						? 'NOT IN'
						: 'IN';
					// in column sentence
					$q_clean = array_map(function($el){
						return (int)$el;
					}, $references);
					$query_object->q_parsed	= implode(',', $q_clean);
					$query_object->format	= 'in_column';

					$with_references = true;
				}
			}

		// no references case
			if ($with_references===false) {
				// @todo This method do not works if no references are found !
				// Working here !
			}


		return $query_object;
	}//end resolve_query_object_sql



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
