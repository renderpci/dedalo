<?php
/*
* CLASS COMPONENT_INPUT_TEXT
*/


class component_input_text extends component_common {
	


	/**
	* GET DATO
	*/
	public function get_dato() {

		$dato = parent::get_dato();		

		if(SHOW_DEBUG) {
			if ( !is_null($dato) && !is_string($dato)  ) {
				dump(parent::get_dato(), 'WRONG TYPE dato: '.$this->tipo);
			}
		}

		return (string)$dato;
	}//end get_dato



	/**
	*  SET_DATO
	*/
	public function set_dato($dato) {
		if($dato=='""') $dato = ''; // empty dato json encoded
		
		parent::set_dato( (string)$dato );			
	}//end set_dato



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
	}//end Save


	
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



	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id) {
		
		# Si el valor está vacío, es posible que este componente no tenga dato en este idioma. Si es así,
		# verificamos que NO estamos en el lenguaje principal (de momento config:DEDALO_DATA_LANG_DEFAULT)
		# creamos el componente para pedirle el valor en el lenguaje principal.
		# Esto es más lento, pero proporciona un fallback al lenguaje principal en los listados (de agradecer en los tesauros, por ejemplo)
		#
		# NOTA: Valorar de recorrer más idiomas o discriminar el cálculo de main_lang desde jerarquías (hierarchy1) o desde config 
		#
		# FALLBACK TO MAIN_LANG
		# dump($value, ' value ++ '.to_string());
		$empty_list_value = "\n".' <span class="css_span_dato"></span>';
		if (empty($value) || $value==$empty_list_value) {

			$main_lang = self::get_main_lang( $section_tipo );
			# main lang
			# dump($main_lang, ' main_lang ++ '." $section_tipo ".to_string(DEDALO_DATA_LANG));
			if ($main_lang!=$lang) {

				$component 	= component_common::get_instance(__CLASS__,
															 $tipo,
														 	 $parent,
														 	 $modo,
															 $main_lang,
														 	 $section_tipo); 
				
				$value = $component->get_valor($main_lang);
				$value = component_common::decore_untranslated( $value );
					#dump($value, ' value ++ '.to_string($main_lang));
				
				#$component->set_lang($main_lang);
				#$valor = $component->get_valor($main_lang);
				#$valor = component_common::decore_untranslated( $valor );				
			}
		}

		return $value;
	}//end render_list_value



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* Usaremos get_valor para permitir importaciones de fichas en lenguajes distintos al actual. Ejemplo: importar
	* Francia (jer_fr) en castellano (lg-spa)
	*
	* @see class.section.php
	* @return string $html
	*/
	public function get_valor_list_html_to_save() {
		
		# Get html from current component
		$html = $this->get_valor();		
		
		return (string)$html;
	}//end get_valor_list_html_to_save
	


	
}//end class component_input_text
?>