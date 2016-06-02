
<?php
/*
* CLASS COMPONENT SECTION_ID
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
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=','>','<','>=','<=','BETWEEN') ) {
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}//end build_search_comparison_operators

	/**
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components 
	* (is static to enable direct call from section_records without construct component)
	* Params
	* @param string $json_field . JSON container column Like 'dato'
	* @param string $search_tipo . Component tipo Like 'dd421'
	* @param string $tipo_de_dato_search . Component dato container Like 'dato' or 'valor'
	* @param string $current_lang . Component dato lang container Like 'lg-spa' or 'lg-nolan'
	* @param string $search_value . Value received from search form request Like 'paco'
	* @param string $comparison_operator . SQL comparison operator Like 'ILIKE'
	*
	* @see class.section_records.php get_rows_data filter_by_search
	* @return string $search_query . POSTGRE SQL query (like 'datos#>'{components, oh21, dato, lg-nolan}' ILIKE '%paco%' )
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
		
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}
		switch (true) {
			case ($comparison_operator=='BETWEEN'):
				$separator='...';
				if (strpos($search_value, $separator)!==false) {
					// Transform "12...25" to "12 AND 25"
					$ar_parts 	= explode($separator, $search_value);
					$first_val  = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
					$second_val = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

					$search_query = " section_id $comparison_operator $first_val AND $second_val ";
				}else{
					$search_query = " section_id = ". intval($search_value);
				}
				break;
			
			default:
				$search_query = " section_id $comparison_operator " . intval($search_value).' ';
				break;
		}
		
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}
		return $search_query;
	}//end get_search_query

	
	
	
}
?>