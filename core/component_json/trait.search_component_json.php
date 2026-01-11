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

		// q array safe. Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
		$q = isset($query_object->q) && is_array($query_object->q) 
			? $query_object->q[0] 
			: $query_object->q;
		if ( (empty($q) || empty($q->value) ) && empty($query_object->q_operator)) {
			return false;
		}
		
		// fallback to emprty string in case of invalid or null q
		$q = (is_object($q) ? $q->value : $q) ?? '';

		// column
		$column = section_record_data::get_column_name( get_called_class() );
		
		// table_alias
		$table_alias = $query_object->table_alias;

		// component_tipo
		$path_end       = end($query_object->path);
		$component_tipo = $path_end->component_tipo;

		// split q case
			$q_split = $query_object->q_split ?? false;
			if ( $q_split===true && !search::is_literal($q)) {

				// Join operators with next word (remove space)
				// Operators: !=, ==, =, -, !!, !*
				$q = preg_replace('/(\!=|==|!!|!*|=|-)\s+/', '$1', $q);
				// Join wildcard at the end (remove space before wildcard)
				$q = preg_replace('/\s+(\*)/', '$1', $q);

				$q_items = preg_split('/\s/', $q);
				if (count($q_items)>1) {
					return self::handle_query_splitting($query_object, $q_items, '$and');
				}
			}

		// q_operator
		$q_operator = $query_object->q_operator ?? null;

		// type. Always set fixed values
		$query_object->type = 'string';

		// escape q string for JSON Path (double quotes)
		$q_json_path = str_replace('"', '\\"', $q);

		switch (true) {
			// EMPTY VALUE (!*)
			// Matches records where the component has no elements or the key is missing.
			// JSON Path: Checks for absence of any array elements.
			// Index optimization: Uses @? for GIN index support.
			case (strpos($q, '!*')===0 || $q_operator==='!*'):
				$query_object->sentence = "NOT ({$table_alias}.{$column} @? (_Q1_)::jsonpath)";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*]"];
				break;
			// NOT EMPTY (*)
			// Matches records where the component has at least one element.
			// JSON Path: Checks for presence of any array elements.
			// Index optimization: Uses @? for GIN index support.
			case (strpos($q, '*')===0 || $q_operator==='*'):
				$query_object->sentence = "({$table_alias}.{$column} @? (_Q1_)::jsonpath)";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*]"];
				break;
			// IS DIFFERENT (!=)
			// Matches records where NO nested value matches the search term (case-insensitive).
			// JSON Path: Uses recursive descent (..**) to search all nested values.
			// Regex: Case-insensitive pattern matching with like_regex flag "i".
			// Index optimization: Uses @? for structural pre-filtering.
			case (strpos($q, '!=')===0 || $q_operator==='!='):
				$q_clean = str_replace('!=', '', $q_json_path);
				$query_object->sentence = "NOT ({$table_alias}.{$column} @? (_Q1_)::jsonpath)";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
				break;
			// IS EXACTLY EQUAL (==)
			// Matches records where the top-level 'value' field exactly equals the search term.
			// Note: This searches ONLY the immediate 'value' property, not nested values.
			// JSON Path: Direct equality check on value property.
			// Index optimization: Uses @? for GIN index support.
			case (strpos($q, '==')===0 || $q_operator==='=='):
				$q_clean = str_replace('==', '', $q_json_path);
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value ? (@ == \"{$q_clean}\")"];
				$query_object->type     = 'jsonb';
				break;
			// IS SIMILAR (=)
			// Matches records where any nested value contains the search term (case-insensitive).
			// JSON Path: Uses recursive descent (..**) to search through all nested structures.
			// Regex: Case-insensitive pattern matching with like_regex flag "i".
			// Index optimization: Uses @? for structural pre-filtering.
			case (strpos($q, '=')===0 || $q_operator==='='):
				$q_clean = str_replace('=', '', $q_json_path);
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
				break;
			// NOT CONTAIN (-)
			// Matches records where NO nested value contains the search term (negated contains).
			// JSON Path: Uses recursive descent (..**) to search all nested values.
			// Regex: Case-insensitive pattern matching with negation.
			// Index optimization: Uses @? for structural pre-filtering.
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$q_clean = str_replace('-', '', $q_json_path);
				$query_object->sentence = "NOT ({$table_alias}.{$column} @? (_Q1_)::jsonpath)";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
				break;
			// CONTAIN EXPLICIT (*text*)
			// Standard contains search explicitly requested with asterisks.
			// Matches if any nested value contains the search term anywhere within it.
			// JSON Path: Recursive descent (..**) searches all nested values.
			// Regex: Case-insensitive pattern matching.
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$q_clean  = str_replace('*', '', $q_json_path);
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
				break;
			// ENDS WITH (*text)
			// Matches records where any nested value ends with the search term.
			// JSON Path: Recursive descent (..**) searches all nested values.
			// Regex: Case-insensitive with end anchor ($) for suffix matching.
			case (substr($q, 0, 1)==='*'):
				$q_clean  = str_replace('*', '', $q_json_path);
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}$\" flag \"i\")"];
				break;
			// BEGINS WITH (text*)
			// Matches records where any nested value begins with the search term.
			// JSON Path: Recursive descent (..**) searches all nested values.
			// Regex: Case-insensitive with start anchor (^) for prefix matching.
			case (substr($q, -1)==='*'):
				$q_clean  = str_replace('*', '', $q_json_path);
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value.** ? (@ like_regex \"^{$q_clean}\" flag \"i\")"];
				break;
			// LITERAL ('text')
			// Case-sensitive exact match for the top-level 'value' field.
			// When search term is enclosed in single quotes, performs literal exact matching.
			// Note: Searches only the immediate 'value' property, not nested values.
			// JSON Path: Direct equality check on value property.
			case (search::is_literal($q)===true):
				$q_clean  = str_replace("'", '', $q_json_path);
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value ? (@ == \"{$q_clean}\")"];
				break;
			// DUPLICATED (!!)
			// Special operator for finding duplicate values within a section type.
			// Uses legacy operator/q_parsed approach rather than sentence/params.
			// Language handling: Respects component translatability.
			// Note: This case is processed differently by the search engine.
			case (strpos($q, '!!')===0 || $q_operator==='!!'):
				$query_object->operator 	= '=';
				$query_object->unaccent		= false; // (!) always false
				$query_object->duplicated	= true;
				// Resolve lang based on if is translatable
					$query_object->lang	= ontology_node::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				// use escaped q for engine analysis
					$query_object->q = $q;
				break;
			// DEFAULT (Contains)
			// Standard fallback search: case-insensitive contains.
			// Matches if any nested value contains the search term anywhere within it.
			// JSON Path: Recursive descent (..**) to search through all nested structures.
			// Regex: Case-insensitive pattern matching with like_regex flag "i".
			// Index optimization: Uses @? for GIN index support.
			default:
				$q_clean = str_replace(['+', '*'], '', $q_json_path);
				$query_object->sentence = "{$table_alias}.{$column} @? (_Q1_)::jsonpath";
				$query_object->params   = ['_Q1_' => "$.{$component_tipo}[*].value.** ? (@ like_regex \"{$q_clean}\" flag \"i\")"];
				break;
		}//end switch (true)


		return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() : array {

		$ar_operators = [
			'*'			=> 'no_empty', // not null
			'!*'		=> 'empty', // null
			'='			=> 'similar_to',
			'!='		=> 'different_from',
			'-'			=> 'does_not_contain',
			'!!'		=> 'duplicate',
			'*text*'	=> 'contains',
			'text*'		=> 'begins_with',
			'*text'		=> 'end_with',
			'\'text\''	=> 'literal'
		];

		return $ar_operators;
	}//end search_operators_info


}
