<?php
/*
* CLASS COMPONENT_INPUT_TEXT
* Manage specific component input text logic
* Common components properties and method are inherited of component_common class that are inherited from common class
*/
class component_input_text extends component_common {
	


	/**
	* GET DATO
	*/
	public function get_dato() {

		$dato = parent::get_dato();
		
		if(SHOW_DEBUG===true) {
			#if ( !is_null($dato) && !is_array($dato)  ) {
				#dump( $dato, "WRONG TYPE of dato. tipo: $this->tipo - section_tipo: $this->section_tipo - section_id: $this->parent");
			#}
		}

		return (array)$dato;
	}//end get_dato



	/**
	*  SET_DATO
	* @param array $dato
	* 	Dato now is multiple. For this expected type is array
	*	but in some cases can be an array json encoded or some rare times a plain string
	*/
	public function set_dato($dato) {
		
		if (is_string($dato)) { # Tool Time machine case, dato is string
			if (strpos($dato, '[')!==false) {
				# dato is json encoded 
				$dato = json_handler::decode($dato);
			}else{
				# dato is string plain value
				$dato = array($dato);
				#debug_log(__METHOD__." Warning. [$this->tipo,$this->parent] Dato received is a plain string. Support for this type is deprecated. Use always an array to set dato. ".to_string($dato), logger::DEBUG);
			}
		}

		if(SHOW_DEBUG===true) {
			if (!is_array($dato)) {
				debug_log(__METHOD__." Warning. [$this->tipo,$this->parent]. Received dato is NOT array. Type is '".gettype($dato)."' and dato: '".to_string($dato)."' will be converted to array", logger::DEBUG);
			}
			#debug_log(__METHOD__." dato [$this->tipo,$this->parent] Type is ".gettype($dato)." -> ".to_string($dato), logger::ERROR);
		}

		$safe_dato=array();
		foreach ((array)$dato as $key => $value) {
			if (!is_string($value)) {
				$safe_dato[] = to_string($value);
			}else{
				$safe_dato[] = $value;
			}
		}
		$dato = $safe_dato;
		
		parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string $valor
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $index='all' ) {
		
		$dato = $this->get_dato();
				
		if ($index==='all') {			
			$ar = array();
			foreach ($dato as $key => $value) {
				$ar[] = $value;				
			}
			$valor = implode(',',$ar);
		}else{
			$index = (int)$index;
			$valor = isset($dato[$index]) ? $dato[$index] : null;
		}


		return (string)$valor;
	}//end get_valor



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Dato candidate to save
		$dato = $this->dato;		

		switch (true) {

			case ($this->section_tipo===DEDALO_SECTION_USERS_TIPO) :
				
					# Test is dato already exists
			 		$dato_already_exists = component_common::dato_already_exists($dato, $this->tipo, DEDALO_DATA_NOLAN, $this->section_tipo);
			 			#dump($dato_already_exists,'$dato_already_exists');

			 		# Error trigger
			 		if($dato_already_exists) {
			 			$valor = $this->get_valor();
			 			$msg = "Error: ".label::get_label('usuario_ya_existe')." [$valor]";		 			
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
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id=null, $current_locator=null, $caller_component_tipo=null) {
		
		if (strpos($modo, 'edit')!==false) {
			$component 			= component_common::get_instance(__CLASS__,
																 $tipo,
															 	 $parent,
															 	 $modo,
																 $lang,
															 	 $section_tipo);					
			$value = $component->get_html();

		}else{

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
			if (empty($value) || $value===$empty_list_value) {

				$main_lang = common::get_main_lang( $section_tipo, $parent );
				# main lang
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
		}		

		return $value;
	}//end render_list_value



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (is_null($valor)) {
			$valor = $this->get_valor($lang);
		}

		return to_string($valor);
	}//end get_valor_export	



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



	/**
	* UPDATE_DATO_VERSION
	* @return object $response
	*/
	public static function update_dato_version($update_version, $dato_unchanged, $reference_id) {

		$update_version = implode(".", $update_version);

		switch ($update_version) {
			case '4.0.21':
				#$dato = $this->get_dato_unchanged();
					
				# Compatibility old dedalo instalations
				if (!empty($dato_unchanged) && is_string($dato_unchanged)) {

					$new_dato = (array)$dato_unchanged;
											
					$response = new stdClass();
						$response->result   = 1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;					

				}else if(is_array($dato_unchanged)){

					$response = new stdClass();
						$response->result   = 1;
						$response->new_dato = $dato_unchanged;
						$response->msg = "[$reference_id] Dato is array ".to_string($dato_unchanged)." only save .<br />";
					return $response;

				}else{
					
					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)." 
					return $response;
				}
				break;
		}
	}//end update_dato_version



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
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='ILIKE') {//, $logical_operator = 'AND' 
		
		if (empty($search_value)) return false;

		#$tipo_de_dato_search = 'valor';

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search	


		$current_lang='all'; // Forced to search in all langs always	

		$search_query='';
		switch (true) {
			case ($comparison_operator==='ILIKE' || $comparison_operator==='LIKE'):
				// Allow wildcards like "house*" or "*house"
				// dump($search_value[strlen($search_value) - 1], "$search_value[0] ".to_string());
				$separator 	   = '*';			
				if ( $search_value[0] === $separator ) {
					// Begin with * like
					$search_value = str_replace($separator, '', $search_value);
					if ($current_lang=='all') {
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') $comparison_operator unaccent('%[\"%{$search_value}') ";
					}else{
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator unaccent('%$search_value') ";
					}
				
				}else if ( $search_value[strlen($search_value) - 1] === $separator ) {
					// End with *
					$search_value = str_replace($separator, '', $search_value);
					if ($current_lang=='all') {
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') $comparison_operator unaccent('%[\"{$search_value}%') ";
					}else{
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator unaccent('$search_value%') ";
					}
				}else{
					// Contain
					$search_value = str_replace($separator, '', $search_value);
					if ($current_lang=='all') {
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') ~* unaccent('.*\[\".*$search_value.*') ";
					}else{
						$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator unaccent('%$search_value%') ";
					}

				}
				break;

			case ($comparison_operator==='=' || $comparison_operator==='!='):
				$comparison_operator = '@>';
				if ($current_lang=='all') {
					$ar_lang_search_query = array();
					foreach (common::get_ar_all_langs() as $iter_lang) {
						$ar_lang_search_query[] = "{$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $iter_lang ."}' $comparison_operator '\"$search_value\"'";
					}
					$search_query = " (".implode(" OR ", $ar_lang_search_query).") ";
				}else{
					$search_query = " {$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' $comparison_operator '\"$search_value\"' ";
				}				
				break;

			case ($comparison_operator==='IS NULL' || $comparison_operator==='IS NOT NULL'):
				if($comparison_operator === 'IS NULL'){
					$comparison_operator2 = '=';
					$union_operator = 'OR';
				}else{
					$comparison_operator2 = '!=';
					$union_operator = 'AND';
				}
				$search_query  = " ({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator $union_operator ";
				$search_query .= " {$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator2 '' )";								
				break;

			default:
				if ($current_lang=='all') {
					$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search}') $comparison_operator '%$search_value%' ";
				}else{
					$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator '%$search_value%' ";
				}
				break;
		}
		
		if(SHOW_DEBUG===true) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}
		return (string)$search_query;
	}//end get_search_query





}//end class component_input_text
?>