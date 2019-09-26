<?php
/*
* CLASS COMPONENT_IRI
*
*
*/
include dirname(__FILE__) . "/class.dd_iri.php";

class component_iri extends component_common {



	/**
	* GET DATO
	* Array with objects, every object have two properties: "iri" mandatory with string value and "title" optional with string value
	*[ 
	*	{
	*    "iri": "http://www.render.es/dedalo",
	*    "title": "dedalo"
	* 	}
	*]
	*/
	public function get_dato() {

		$dato = parent::get_dato();

		/* 
		* For accept values from component_input_text
		* we need change the string value of the input_text to object value of IRI
		*/
		$input_text = false;
		if(!empty($dato)){
			foreach ($dato as $key => $value) {
				if(!is_object($value)){
					$input_text = true;
					$object = new stdClass();
					$object->iri = $value;
					$dato[$key] = $object;
				}
			}
			if($input_text===true){
				$this->set_dato($dato);
				$this->Save();
			}

		}
		
		
		if(SHOW_DEBUG===true) {
			if ( !is_null($dato) && !is_array($dato)  ) {
				debug_log(__METHOD__." WRONG TYPE of dato. tipo: $this->tipo - section_tipo: $this->section_tipo - section_id: $this->parent. Expected array. Given: ".gettype($dato), logger::ERROR);
			}
		}

		return (array)$dato;
	}//end get_dato



	/**
	*  SET_DATO
	*/
	public function set_dato($dato) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}

		if(SHOW_DEBUG===true) {
			if (!is_array($dato)) {
				debug_log(__METHOD__." Warning in set dato [$this->tipo,$this->parent]. Received dato is NOT array. Type is '".gettype($dato)."' and dato: '".to_string($dato)."' will be converted to array", logger::DEBUG);
			}
			#debug_log(__METHOD__." dato [$this->tipo,$this->parent] Type is ".gettype($dato)." -> ".to_string($dato), logger::ERROR);
		}
		
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
			$valor = null;
			$ar_val = [];
			foreach ($dato as $key => $value) {

				$ar_line = [];

				if (!empty($value->title)) {
					$ar_line[] = $value->title;
				}
				if (!empty($value->iri)) {
					$ar_line[] = $value->iri;
				}

				if (!empty($ar_line)) {
					
					$ar_val[] = implode(' | ', $ar_line);
				}
			}
			
			$valor = !empty($ar_val) ? implode(', ', $ar_val) : null;

		}else{
			
			$index = (int)$index;
			$valor = isset($dato[$index]) ? $dato[$index] : null;
		}

		return $valor;
	}//end get_valor



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Dato candidate to save
		$dato = $this->dato;

		# DELETING IRI
		if (empty($dato)) {
			# Save in standar empty format
			return parent::Save();
		}

		# DATO FORMAT VERIFY
		if ( !is_array($dato) ) {
			if(SHOW_DEBUG===true) {
				#dump($dato,'$dato');
				#throw new Exception("Dato is not string!", 1);
				error_log("Bad iri format:".to_string($dato));
			}
			return false;
		}

		# Save in standar format
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

				$main_lang = common::get_main_lang( $section_tipo );
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
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (empty($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor = $this->get_valor($lang);
		$valor = strip_tags($valor); // Removes the span tag used in list mode
		/*
		$previous_modo = $this->get_modo();
		$this->set_modo('list'); // Force list mode
		$valor = $this->get_html();
		# Restore modo after 
		$this->set_modo($previous_modo);
		*/
		if(SHOW_DEBUG===true) {
			#return "DATE: ".$valor;
		}
		return (string)$valor;
	}//end get_valor_export



	/**
	* UPDATE_DATO_VERSION
	* @return object $response
	*/
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;

		
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

		$search_query='';
		switch (true) {
			case ($comparison_operator==='ILIKE' || $comparison_operator==='LIKE'):
				// Allow wildcards like "house*" or "*house"
				// dump($search_value[strlen($search_value) - 1], "$search_value[0] ".to_string());
				$separator 	   = '*';				
				if ( $search_value[0] === $separator ) {
					// Begin with * like
					$search_value = str_replace($separator, '', $search_value);
					$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator '%$search_value' ";
				
				}else if ( $search_value[strlen($search_value) - 1] === $separator ) {
					// End with *
					$search_value = str_replace($separator, '', $search_value);
					$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator '$search_value%' ";
					
				}else{
					// Contain
					$search_value = str_replace($separator, '', $search_value);
					$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator '%$search_value%' ";
				}
				break;

			case ($comparison_operator==='=' || $comparison_operator==='!='):
				$comparison_operator = '@>';
				$search_query = " {$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' $comparison_operator '\"$search_value\"' ";
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
				$search_query = " unaccent({$json_field}#>>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}') $comparison_operator '%$search_value%' ";
				break;
		}
		
		if(SHOW_DEBUG===true) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
		}

		return (string)$search_query;
	}//end get_search_query



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*	Edited/parsed version of received object 
	*/
	public static function resolve_query_object_sql($query_object) {
        #debug_log(__METHOD__." query_object ".to_string($query_object), logger::DEBUG);
					
		$q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;
			
		#$q = $query_object->q;
		#if (isset($query_object->type) && $query_object->type==='jsonb') {
		#	$q = json_decode($q);
		#}	

		# Always set fixed values
		$query_object->type = 'string';
		
		$q = pg_escape_string(stripslashes($q));

		$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;

		# Prepend if exists
		#if (isset($query_object->q_operator)) {
		#	$q = $query_object->q_operator . $q;
		#}

		switch (true) {
			# EMPTY VALUE (in current lang data)
			case ($q==='!*'):
				$operator = 'IS NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent = false;
				$query_object->lang 	= 'all';

				$logical_operator = '$or';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// Search empty only in current lang
				// Resolve lang based on if is translatable
					$path_end 		= end($query_object->path);
					$component_tipo = $path_end->component_tipo;
					$RecordObj_dd   = new RecordObj_dd($component_tipo);
					$lang 			= $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;

					#$clone = clone($query_object);
					#	$clone->operator = '=';
					#	$clone->q_parsed = '\'[]\'';
					#	$clone->lang 	 = $lang;
					#$new_query_json->$logical_operator[] = $clone;

					$clone = clone($query_object);
						$clone->operator = '=';
						$clone->q_parsed = '\'\'';
						$clone->lang 	 = $lang;
					$new_query_json->$logical_operator[] = $clone;

					// legacy data (set as null instead '')
					$clone = clone($query_object);
						$clone->operator = 'IS NULL';
						$clone->lang 	 = $lang;
					$new_query_json->$logical_operator[] = $clone;			

				# override
				$query_object = $new_query_json ;
				break;
			# NOT EMPTY (in any project lang data)
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent = false;

				$logical_operator ='$and';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// langs check
					$ar_query_object = [];
					
						#$clone = clone($query_object);
						#	$clone->operator = '!=';
						#	$clone->q_parsed = '\'[]\'';
						#	$clone->lang 	 = DEDALO_DATA_NOLAN;
						#$ar_query_object[] = $clone;

						$clone = clone($query_object);
							$clone->operator = '!=';
							$clone->q_parsed = '\'\'';
							$clone->lang 	 = DEDALO_DATA_NOLAN;
						$ar_query_object[] = $clone;
					

					$logical_operator ='$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $ar_query_object;				

				# override
				$query_object = [$new_query_json, $langs_query_json];
				break;
			# IS DIFFERENT			
			case (strpos($q, '!=')===0 || $q_operator==='!='):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '!~';
				$query_object->q_parsed = '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			# IS SIMILAR
			case (strpos($q, '=')===0 || $q_operator==='='):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '~*';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = true;
				break;
			# NOT CONTAIN
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# CONTAIN EXPLICIT
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# ENDS WITH
			case (substr($q, 0, 1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'".*\'';
				$query_object->unaccent = true;
				break;
			# BEGINS WITH
			case (substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# LITERAL
			case (substr($q, 0, 1)==="'" && substr($q, -1)==="'"):
				$operator = '~';
				$q_clean  = str_replace("'", '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			# DEFAULT CONTAIN 
			default:
				$operator = '~*';
				$q_clean  = str_replace('+', '', $q);				
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;			
		}//end switch (true) {
		  
		return $query_object;
	}//end resolve_query_object_sql


	/**
	* GET_DIFFUSION_VALUE
	* If index var is received, return dato element corresponding to this index if exists
	* @return string $valor
	*/
	public function get_diffusion_value( $lang=DEDALO_DATA_LANG ) {
		
		$dato = $this->get_dato();
				
		$ar_values = [];
		foreach ($dato as $key => $value) {
			if(empty($value)) continue;

			$ar_parts = [];
			if (!empty($value->title)) {
				$ar_parts[] = $value->title;
			}
			if (!empty($value->iri)) {
				$ar_parts[] = $value->iri;
			}
			$ar_values[] = implode(', ', $ar_parts);
		}
		
		$diffusion_value = implode(' | ', $ar_values);

		return $diffusion_value;
	}//end get_diffusion_value

	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
	public function search_operators_info() {
		
		$ar_operators = [
			'*' 	 => 'no_vacio', // not null
			'!*' 	 => 'campo_vacio', // null	
			'=' 	 => 'similar_a',
			'!=' 	 => 'distinto_de',
			'-' 	 => 'no_contiene',
			'*text*' => 'contiene',
			'text*'  => 'empieza_con',
			'*text'  => 'acaba_con',
			'\'text\'' => 'literal',
		];

		return $ar_operators;
	}//end search_operators_info
	
	/**
	* GET_STRUCTURE_BUTTONS
	* @return 
	*/
	public function get_structure_buttons($permissions=null) {
		

		return [];
	}//end get_structure_buttons


}//end class component_iri
?>