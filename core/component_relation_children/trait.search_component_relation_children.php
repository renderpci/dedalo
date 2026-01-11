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

		// q
			$q = $query_object->q;
			// q sample :
			// [
			//     {
			//         "section_tipo": "test3",
			//         "section_id": "7974",
			//         "from_component_tipo": "test71"
			//     }
			// ]

		// children_locators
			$children_locators = is_string($q)
				? json_decode($q)
				: $q;
			if (!is_array($children_locators)) {
				$children_locators = [$children_locators];
			}

		// children
			$ar_parent = [];
			foreach ($children_locators as $current_locator) {

				$child_component_tipo	= $current_locator->from_component_tipo;
				$ar_target_parent_tipo	= component_relation_children::get_ar_related_parent_tipo(
					$child_component_tipo,
					'hierarchy20' // ITS NOT CORRECT, but is not possible know the section_tipo here
				);
				if (!empty($ar_target_parent_tipo)) {
					foreach ($ar_target_parent_tipo as $children_component_tipo) {

						$model_name	= ontology_node::get_model_by_tipo($children_component_tipo, true); // component_relation_children
						$component	= component_common::get_instance(
							$model_name,
							$children_component_tipo,
							$current_locator->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$current_locator->section_tipo
						);
						$component_parent_data = $component->get_data();
						foreach ($component_parent_data as $parent_locator) {
							$ar_parent[] = $parent_locator->section_id;
						}
					}//end foreach ($ar_target_parent_tipo as $children_component_tipo)
				}
			}

		// q_clean
			$q_clean = array_map(function($el){
				return (int)$el;
			}, $ar_parent);

		// query_object
			$query_object->operator			= 'IN';
			$query_object->q_parsed			= implode(',', $q_clean);
			$query_object->format			= 'in_column';
			$query_object->type				= 'number';
			$query_object->column_name		= 'section_id';
			$query_object->component_path	= ['section_id'];
			$query_object->unaccent			= false;


		return $query_object;
	}//end resolve_query_object_sql



}//end search_component_relation_children
