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

			//check the dato for determinate the original format and if the $dato is correct.
			$dato_trim				= trim($dato);
			$dato_first_character 	= substr($dato_trim, 0, 1);
			$dato_last_character  	= substr($dato_trim, -1);

			if ($dato_first_character==='[' && $dato_last_character===']') {
				# dato is json encoded
				$dato = json_handler::decode($dato_trim);
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

		$valor ='';

		$dato = $this->get_dato();
		if(empty($dato)) {
			return (string)$valor;
		}

		if ($index==='all') {
			$ar = array();
			foreach ($dato as $key => $value) {
				$value = trim($value);
				if (!empty($value)) {
					$ar[] = $value;
				}
			}
			if (count($ar)>0) {
				$valor = implode(',',$ar);
			}
		}else{
			$index = (int)$index;
			$valor = isset($dato[$index]) ? $dato[$index] : null;
		}


		return (string)$valor;
	}//end get_valor



	/**
	* LOAD TOOLS
	*//**/
	public function load_tools( $check_lang_tools=true ) {

		$propiedades = $this->get_propiedades();
		if (isset($propiedades->with_lang_versions) && $propiedades->with_lang_versions===true) {
			# Allow tool lang on non translatable components
			$check_lang_tools = false;
		}

		return parent::load_tools( $check_lang_tools );
	}//end load_tools




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

				$component 	= component_common::get_instance(__CLASS__,
															 $tipo,
															 $parent,
															 $modo,
															 DEDALO_DATA_LANG,
															 $section_tipo);

				#$dato_full = $component->get_dato_full();
				#$value = component_common::get_value_with_fallback_from_dato_full( $dato_full, true );
				$value = component_common::extract_component_value_fallback($component, $lang=DEDALO_DATA_LANG, $mark=true, $main_lang=DEDALO_DATA_LANG_DEFAULT);
			}

		}//end if (strpos($modo, 'edit')!==false)


		# Add value of current lang to nolan data
			$RecordObj_dd = new RecordObj_dd($tipo);
			$propiedades  = json_decode($RecordObj_dd->get_propiedades());
			if (isset($propiedades->with_lang_versions) && $propiedades->with_lang_versions===true) {

				$component 			= component_common::get_instance(__CLASS__,
																	 $tipo,
																	 $parent,
																	 $modo,
																	 $lang,
																	 $section_tipo);
				#$add_value = component_common::extract_component_value_fallback($component);
				$add_value = $component->get_valor($lang);
				if (!empty($add_value) && $add_value!==$value) {
					$value .= ' ('.$add_value.')';
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

		if (empty($valor)) {

			$valor = $this->get_valor($lang);

		}else{

			# Add value of current lang to nolan data
			$propiedades = $this->get_propiedades();
			if (isset($propiedades->with_lang_versions) && $propiedades->with_lang_versions===true) {

				$component = $this;
				$component->set_lang($lang);
				#$add_value = component_common::extract_component_value_fallback($component);
				$add_value = $component->get_valor($lang);
				if (!empty($add_value) && $add_value!==$valor) {
					$valor .= ' ('.$add_value.')';
				}
			}
		}

		if (empty($valor)) {
			$valor = component_common::extract_component_value_fallback($this, $lang=DEDALO_DATA_LANG, $mark=true, $main_lang=DEDALO_DATA_LANG_DEFAULT);
		}

		return to_string($valor);
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

					$clone = clone($query_object);
						$clone->operator = '=';
						$clone->q_parsed = '\'[]\'';
						$clone->lang 	 = $lang;

					$new_query_json->$logical_operator[] = $clone;

					// legacy data (set as null instead [])
					$clone = clone($query_object);
						$clone->operator = 'IS NULL';
						$clone->lang 	 = $lang;

					$new_query_json->$logical_operator[] = $clone;

				// langs check all
					/*
					$ar_query_object = [];
					$ar_all_langs 	 = common::get_ar_all_langs();
					$ar_all_langs[]  = DEDALO_DATA_NOLAN; // Added no lang also
					foreach ($ar_all_langs as $current_lang) {
						// Empty data is blank array []
						$clone = clone($query_object);
							$clone->operator = '=';
							$clone->q_parsed = '\'[]\'';
							$clone->lang 	 = $current_lang;

						$ar_query_object[] = $clone;

						// legacy data (set as null instead [])
						$clone = clone($query_object);
							$clone->operator = 'IS NULL';
							$clone->lang 	 = $current_lang;

						$ar_query_object[] = $clone;
					}

					$new_query_json->$logical_operator = array_merge($new_query_json->$logical_operator, $ar_query_object);
					*/

				# override
				$query_object = $new_query_json;
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
					$ar_all_langs 	 = common::get_ar_all_langs();
					$ar_all_langs[]  = DEDALO_DATA_NOLAN; // Added no lang also
					foreach ($ar_all_langs as $current_lang) {
						$clone = clone($query_object);
							$clone->operator = '!=';
							$clone->q_parsed = '\'[]\'';
							$clone->lang 	 = $current_lang;

						$ar_query_object[] = $clone;
					}

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
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# CONTAIN EXPLICIT
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# ENDS WITH
			case (substr($q, 0, 1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'".*\'';
				$query_object->unaccent = true;
				break;
			# BEGINS WITH
			case (substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*\["'.$q_clean.'.*\'';
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
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
		}//end switch (true) {
		#dump($query_object, ' query_object ++ '.to_string());


		return $query_object;
	}//end resolve_query_object_sql



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
	* GET_DIFFUSION_VALUE
	* Calculate current component diffsuion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang ) {

		# Default behaviour is get value
		$diffusion_value = $this->get_valor( $lang );

		// Fallback to nolan dato
		if (empty($diffusion_value) && $this->traducible==='no') {
			# try no lang
			$this->set_lang(DEDALO_DATA_NOLAN);
			$diffusion_value = $this->get_valor( DEDALO_DATA_NOLAN );
		}

		# strip_tags all values (remove untranslate mark elements)
		$diffusion_value = preg_replace("/<\/?mark>/", "", $diffusion_value);


		return (string)$diffusion_value;
	}//end get_diffusion_value



}//end class component_input_text
