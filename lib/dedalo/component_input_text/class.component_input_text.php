
<?php
/*
* CLASS COMPONENT INPUT TEXT
*/


class component_input_text extends component_common {
	
	# GET DATO
	public function get_dato() {

		$dato = parent::get_dato();
		#if(SHOW_DEBUG && $this->tipo=='rsc22') {
			#dump($dato, ' dato ++ '.to_string($this->tipo.'-'.$this->parent.'-'.$this->section_tipo));
		#}
			

		if(SHOW_DEBUG) {
			if ( !is_null($dato) && !is_string($dato)  ) {
				dump(parent::get_dato(), 'WRONG TYPE dato: '.$this->tipo);
			}
		}
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		if($dato=='""') $dato = ''; // empty dato json encoded
		parent::set_dato( (string)$dato );			
	}
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Dato candidate to save
		$dato = $this->dato;
		

		switch (true) {

			case ($this->section_tipo==DEDALO_SECTION_USERS_TIPO) :
				
					# Test is dato already exists
			 		$dato_already_exists = component_common::dato_already_exists($dato, $this->tipo, DEDALO_DATA_NOLAN, $this->section_tipo);
			 			#dump($dato_already_exists,'$dato_already_exists');

			 		# Error trigger
			 		if($dato_already_exists) {
			 			$msg = "Error: ".label::get_label('usuario_ya_existe')." [$dato]";		 			
			 			return $msg;
			 		}
					break;
			
			default:
					# Nothing to do
					break;
		}

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
		
	}#end Save


	

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
	/*
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='ILIKE') {//, $logical_operator = 'AND' 
		if ( empty($search_value) ) {
			return null;
		}
		if(SHOW_DEBUG) {
			#dump($search_value, ' search_value');
		}
		
		switch (true) {
			case ($comparison_operator=='=' || $comparison_operator=='!='):
				$search_query = " $json_field#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' $comparison_operator '$search_value' ";
				break;
			default:
				$search_query = " $json_field#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' $comparison_operator '%$search_value%' ";
				break;
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}
		return $search_query;
	}
	*/



	
}
?>