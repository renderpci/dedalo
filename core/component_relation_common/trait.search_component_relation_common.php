<?php declare(strict_types=1);
/**
 * TRAIT SEARCH_COMPONENT_RELATION_COMMON
 * From class component_relation_common
 * Common search methods for relation components
 */
trait search_component_relation_common {



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* Parses given SQO to use it into the SQL query
	* @param object $query_object
		* 	sample:
		* {
		*		"q": {
		*			"type": "dd151",
		*			"section_id": "1",
		*			"section_tipo": "dd64",
		*			"from_component_tipo": "hierarchy24"
		*		},
		*		"path": [
		*			{
		*				"name": "Usable in indexing",
		*				"model": "component_radio_button",
		*				"section_tipo": "hierarchy20",
		*				"component_tipo": "hierarchy24"
		*			}
		*		],
		*		"q_operator": null,
		*		"component_path": [
		*			"components",
		*			"hierarchy24",
		*			"dato"
		*		],
		*		"lang": "all",
		*		"type": "jsonb"
		* }
	* @return object|false $query_object
		*  sample:
		* {
		*	"q": {
		*		"type": "dd151",
		*		"section_id": "1",
		*		"section_tipo": "dd64",
		*		"from_component_tipo": "hierarchy24"
		*	},
		*	"path": [
		*		{
		*			"name": "Usable in indexing",
		*			"model": "component_radio_button",
		*			"section_tipo": "hierarchy20",
		*			"component_tipo": "hierarchy24"
		*		}
		*	],
		*	"q_operator": null,
		*	"component_path": [
		*		"relations"
		*	],
		*	"lang": "all",
		*	"type": "jsonb",
		*	"unaccent": false,
		*	"operator": "@>",
		*	"q_parsed": "'[{\"type\":\"dd151\",\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"from_component_tipo\":\"hierarchy24\"}]'"
		* }
	*/
	public static function resolve_query_object_sql( object $query_object ) : object|false {

		// Always set fixed values
		$query_object->type		= 'jsonb';
		$query_object->unaccent	= false;

		// component path
		$query_object->component_path = ['relations'];

		// format. Used for example to to set 'function' (see numisdata161 sqo->filter_by_list)
		$format = $query_object->format ?? null;		

		// q . Expected:
		// - Object locator as {"section_id":"4","section_tipo":"hierarchy13","type":"dd151","from_component_tipo":"hierarchy9"}
		// - String as "numisdata309_numisdata300_1" for used in database function as `relations_flat_fct_st_si` format
		$q = $query_object->q;

		if ($format!=='function') {
			if (!is_object($q) && $q!=='only_operator') {
				debug_log(__METHOD__
					. " Expected q type is object " . PHP_EOL
					. ' type: ' . gettype($q) . PHP_EOL
					. ' q: ' . json_encode($q) . PHP_EOL
					. ' query_object: ' . to_string($query_object)
					, logger::WARNING
				);
			}
		}

		// For unification, all non string are JSON encoded
		// This allows accept mixed values (encoded and no encoded)
		if (!is_string($q)) {
			$q = json_encode($q);
		}

		// remove initial and final array square brackets if they exists
		// $q = str_replace(array('[',']'), '', $q);
		if (strpos($q, '[')===0) {
			$re	= '/^(\[)(.*)(\])$/m';
			$q	= preg_replace($re, '$2', $q);
		}

		// safe q
		// it could be an object as locator or a string with a flat version of the locator to be used in database function as `relations_flat_fct_st_si`
		// e.g of call with a flat locator.
		// {
		// 	"q": "numisdata309_numisdata300_55",
		// 	"path": [
		// 		{
		// 			"section_tipo": "numisdata3",
		// 			"component_tipo": "numisdata309"
		// 		}
		// 	],
		// 	"format": "function",
		// 	"use_function": "relations_flat_fct_st_si"
		// }
		if (strpos($q, '{')===false && $format!=='function') {
			if ($q!=='only_operator') {
				debug_log(__METHOD__
					. ' Ignored invalid unsafe q ' . PHP_EOL
					. ' q: ' . to_string($q) . PHP_EOL
					. ' query_object: ' . to_string($query_object)
					, logger::ERROR
				);
			}
			$q = '[]';
		}

		$q_operator		= $query_object->q_operator ?? null;
		$path			= $query_object->path ?? [];
		$last_path_item	= end($path);
		$component_tipo	= $last_path_item->component_tipo ?? null;
		if (empty($component_tipo)) {
			debug_log(__METHOD__
				. " Invalid component tipo from path " . PHP_EOL
				. ' path: ' . to_string($path) . PHP_EOL
				. ' query_object: ' . to_string($query_object)
				, logger::ERROR
			);
		}

		// column
		$column = section_record_data::get_column_name( get_called_class() );
		
		// table_alias
		$table_alias = $query_object->table_alias;

		switch (true) {

			// IS DIFFERENT (!=)
			// Matches records that HAVE the component key but DO NOT contain the specified locator in their data array.
			// This is a filtered negative search: it excludes records that don't have the component at all.
			case ($q_operator==='!=' && !empty($q)):
				// Must have the component key AND NOT contain the specific locator
				$sql = "({$table_alias}.{$column} ? _Q2_) AND NOT ({$table_alias}.{$column} @> _Q1_::jsonb)";
				$query_object->sentence = $sql;

				// params
				$q_clean = '{"'.$component_tipo.'":['.$q.']}';
				$query_object->params = [
					'_Q1_' => $q_clean,
					'_Q2_' => $component_tipo
				];
				break;

			// IS STRICT DIFFERENT (!==)
			// Matches ALL records that DOES NOT contain the specified locator.
			// This includes records that have the component key (but different data) AND records that 
			// don't have the component key at all.
			case ($q_operator==='!==' && !empty($q)):
				// Matches all cases where it DOES NOT contain the specific locator (negotiated containment)
				$sql = "NOT ({$table_alias}.{$column} @> _Q1_::jsonb)";
				$query_object->sentence = $sql;

				// params
				$q_clean = '{"'.$component_tipo.'":['.$q.']}';
				$query_object->params = ['_Q1_' => $q_clean];
				break;
			
			// IS NULL / EMPTY (!*)
			// Matches records that DO NOT have the component key in the relations jsonb object.
			// Equivalent to "Component has no data".
			case ($q_operator==='!*'):
				$sql = "NOT ({$table_alias}.{$column} ? _Q1_)";
				$query_object->sentence = $sql;
				$query_object->params   = ['_Q1_' => $component_tipo];
				break;
		
			// IS NOT NULL / NOT EMPTY (*)
			// Matches records that HAVE the component key in the relations jsonb object.
			// Equivalent to "Component has at least one locator".
			case ($q_operator==='*'):
				$sql = "({$table_alias}.{$column} ? _Q1_)";
				$query_object->sentence = $sql;
				$query_object->params   = ['_Q1_' => $component_tipo];
				break;
		
			// CONTAIN (default)
			// Standard containment search. Matches records that have the component key AND 
			// whose data array contains the specified locator.
			default:
				$sql = "{$table_alias}.{$column} @> _Q1_::jsonb";
				$query_object->sentence = $sql;

				// params
				$q_clean = '{"'.$component_tipo.'":['.$q.']}';
				$query_object->params = ['_Q1_' => $q_clean];
				break;
		}//end switch (true)


		// relations_search. only for component_autocomplete_hi
			$legacy_model = ontology_node::get_legacy_model_by_tipo($component_tipo);
			if ($legacy_model==='component_autocomplete_hi'){
				$query_object = self::add_relations_search($query_object);
			}


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* ADD_RELATIONS_SEARCH
	* @param object $query_object
	* @return object $new_query_object
	*/
	protected static function add_relations_search( object $query_object ) : object {

		// q_operator
			$q_operator = $query_object->q_operator ?? null;

		// Clone and modify query_object for search in relations_search too if the operator is different to ==
			$relation_search_obj = clone $query_object;
			if ($q_operator!=='==') {
				$relation_search_obj->component_path = ['relations_search'];
			}

		// Group the two query_object in a 'or' clause
		$operator = '$or';
		if ($q_operator==='!=') {
			$operator = '$and';
		}
		$new_query_object = new stdClass();
			$new_query_object->{$operator} = [$query_object,$relation_search_obj];


		return $new_query_object;
	}//end add_relations_search



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'!='	=> 'different_from',
			'!=='	=> 'strict_different_from',
			'!*'	=> 'empty',
			'*'		=> 'no_empty' // not null
		];

		return $ar_operators;
	}//end search_operators_info



}//end search_component_relation_common
