<?php
/*
* CLASS COMPONENT SECTION_ID
*
*
*/
class component_section_id extends component_common {
	
	# GET DATO
	public function get_dato() {
		return (int)$this->parent;
	}

	# GET DATO
	public function get_valor() {
		return (int)$this->parent;
	}


	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql($query_object) {
		
		$q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;

		if (isset($query_object->type) && $query_object->type==='jsonb') {
			$q = json_decode($q);
		}	

    	# Always set fixed values
		$query_object->type = 'number';

		# Always set format to column
		$query_object->format = 'column';

		$between_separator  = '...';
		$sequence_separator = ',';

		// Case is an array of values
		if (is_array($q)) {
			$q = implode($sequence_separator, $q);
		}

		# component path
		$query_object->component_path = ['section_id'];

		$query_object->unaccent = false;


        switch (true) {
        	# BETWEEN
			case (strpos($q, $between_separator)!==false):
				// Transform "12...25" to "12 AND 25"
				$ar_parts 	= explode($between_separator, $q);
				$first_val  = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
				$second_val = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

				$query_object_one = clone $query_object;
					$query_object_one->operator = '>=';
					$query_object_one->q_parsed	= $first_val;

				$query_object_two = clone $query_object;
					$query_object_two->operator = '<=';
					$query_object_two->q_parsed	= $second_val;

				// Return an array instead object
				#$query_object = [$query_object_one,$query_object_two];

				// Group in a new "AND"
				$current_op = '$and';
				$new_query_object = new stdClass();
					$new_query_object->{$current_op} = [$query_object_one,$query_object_two];

				$query_object = $new_query_object;
				break;
        	# SEQUENCE
			case (strpos($q, $sequence_separator)!==false):
				// Transform "12,25,36" to "(12 OR 25 OR 36)"
				$ar_parts 	= explode($sequence_separator, $q);
				$ar_result  = [];
				foreach ($ar_parts as $key => $value) {
					$value = (int)$value;
					if ($value<1) continue;
					$query_object_current = clone $query_object;
						$query_object_current->operator = '=';
						$query_object_current->q_parsed	= $value;
					$ar_result[] = $query_object_current;
				}
				// Return an subquery instead object
				$cop = '$or';
				$new_object = new stdClass();
					$new_object->{$cop} = $ar_result;
				$query_object = $new_object;
				break;
			# BIGGER OR EQUAL THAN
			case (substr($q, 0, 2)==='>='):
				$operator = '>=';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
				break;
			# SMALLER OR EQUAL THAN
			case (substr($q, 0, 2)==='<='):
				$operator = '<=';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
				break;
			# BIGGER THAN
			case (substr($q, 0, 1)==='>'):
				$operator = '>';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
				break;
			# SMALLER THAN
			case (substr($q, 0, 1)==='<'):
				$operator = '<';
				$q_clean  = (int)str_replace($operator, '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
				break;
			// EQUAL DEFAULT
			default:
				$operator = '=';
				$q_clean  = (int)str_replace('+', '', $q);
				$query_object->operator = $operator;
    			$query_object->q_parsed	= $q_clean;
				break;
		}//end switch (true) {
       	// dump($query_object, ' query_object ++ '.to_string());
		// debug_log(__METHOD__." query_object ".to_string($query_object), logger::DEBUG);


        return $query_object;
	}//end resolve_query_object_sql



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() {

		$ar_operators = [
			'...' 	=> 'entre',
			',' 	=> 'secuencia',
			'>=' 	=> 'mayor_o_igual_que',
			'<='	=> 'menor_o_igual_que',
			'>' 	=> 'mayor_que',
			'<'		=> 'menor_que',
			#'=' 	=> 'igual'
		];

		return $ar_operators;
	}//end search_operators_info



}//end class component_section_id
