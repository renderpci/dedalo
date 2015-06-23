
<?php
/*
* CLASS COMPONENT INPUT TEXT
*/


class component_input_text extends component_common {
	
	# GET DATO
	public function get_dato() {				
		$dato = parent::get_dato();
		if(SHOW_DEBUG) {
			if ( !is_null($dato) && !is_string($dato)  ) {
				dump(parent::get_dato(), 'WRONG TYPE dato: '.$this->tipo);
			}
		}	
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
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
	* @param string ..
	* @see class.section_list.php get_rows_data filter_by_search
	* @return string SQL query (ILIKE by default)
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value ) {
		if ( empty($search_value) ) {
			return null;
		}
		if (intval($search_value)===0) {
			# Search as string
			$search_query = " $json_field#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' ILIKE '%$search_value%' ";
		}else{
			$search_query = " $json_field#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' = '" . intval($search_value) ."'";

			#$field_name   = "$json_field#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}'";
			#$search_value = "'".$search_value."'";
			#$search_query = component_common::resolve_search_operators( $field_name, $search_value, $default_operator='=' );
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}
		return $search_query;
	}



	
}
?>