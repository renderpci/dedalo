<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INPUT_TEXT
* Manage specific component input text logic
* Common components properties and method are inherited of component_common class that are inherited from common class
*/
class component_input_text extends component_common {



	/**
	* GET_DATO
	* @return array|null $dato
	*/
	public function get_dato() : ?array {

		$dato = parent::get_dato();

		if (!is_null($dato) && !is_array($dato)) {
			$type = gettype($dato);
			debug_log(__METHOD__
				. " Expected dato type array or null, but type is: $type. Converted to array of strings and saving " . PHP_EOL
				. ' tipo: ' . $this->tipo . PHP_EOL
				. ' section_tipo: ' . $this->section_tipo . PHP_EOL
				. ' section_id: ' . $this->section_id
				, logger::ERROR
			);
			dump($dato, ' dato ++ '.to_string());

			$dato = !empty($dato)
				? [to_string($dato)]
				: null;

			// update
			$this->set_dato($dato);
			$this->Save();
		}


		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param array|null $dato
	* 	Dato now is multiple. Because this, expected type is array
	*	but in some cases can be an array JSON encoded or some rare times a plain string
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// remove data when data is null
			if(is_null($dato)){
				return parent::set_dato(null);
			}

		// string case. (Tool Time machine case, dato is string)
			if (is_string($dato)) {

				// check the dato for determinate the original format and if the $dato is correct.
				$dato_trim				= trim($dato);
				$dato_first_character	= substr($dato_trim, 0, 1);
				$dato_last_character	= substr($dato_trim, -1);

				if ($dato_first_character==='[' && $dato_last_character===']') {
					# dato is JSON encoded
					$dato = json_handler::decode($dato_trim);
				}else{
					# dato is string plain value
					$dato = array($dato);
					#debug_log(__METHOD__." Warning. [$this->tipo,$this->parent] Dato received is a plain string. Support for this type is deprecated. Use always an array to set dato. ".to_string($dato), logger::DEBUG);
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				if (!is_array($dato)) {
					debug_log(__METHOD__
						." Warning. [$this->tipo,$this->parent]. Received dato is NOT array. Type is '".gettype($dato)."' and dato: '".to_string($dato)."' will be converted to array"
						, logger::DEBUG
					);
				}
				#debug_log(__METHOD__." dato [$this->tipo,$this->parent] Type is ".gettype($dato)." -> ".to_string($dato), logger::ERROR);
			}

		// safe dato
			$safe_dato = array();
			$empty_check = true;
			foreach ((array)$dato as $value) {
				if($this->is_empty($value)){
					$safe_dato[] = null;
				}else{
					$empty_check = false;
					$safe_dato[] = (!is_string($value))
						? to_string($value)
						: $value;
					}
			}
			if($empty_check=== true){
				$safe_dato = [];
			}

			$dato = $safe_dato;


		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* IS_EMPTY
	* @param mixed $value
	* Check if given value is or not empty considering
	* spaces and '<p></p>' as empty values
	* @return bool
	*/
	public function is_empty(mixed $value) : bool {

		if(is_null($value)) {
			return true;
		}

		$value = trim($value);

		if($value!=='0' && empty($value)) {
			return true;
		}

		return false;
	}//end is_empty



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// records_separator. Set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$properties			= $this->get_properties();
			$records_separator	= isset($ddo->records_separator)
				? $ddo->records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// dato
			$dato			= $this->get_dato() ?? [];
			$fallback_value	= component_common::extract_component_dato_fallback(
				$this, // component instance this
				$this->get_lang(), // string lang
				DEDALO_DATA_LANG_DEFAULT // string main_lang
			);

		// flat_value (array of one value full resolved)
			$flat_value = empty($dato)
				? []
				: [implode($records_separator, $dato)];

		// flat_fallback_value (array of one value full resolved)
			$flat_fallback_value = [implode($records_separator, $fallback_value)];

		// class_list
			$class_list = $ddo->class_list ?? null;

		// label
			$label = $this->get_label();

		// value
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($flat_value);
				$dd_grid_cell_object->set_fallback_value($flat_fallback_value);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG, $index='all') : ?string {

		$valor ='';

		$dato = $this->get_dato();
		if(empty($dato)) {
			return (string)$valor;
		}

		if ($index==='all') {
			$ar = array();
			foreach ($dato as $value) {

				if (is_string($value)) {
					$value = trim($value);
				}

				if (!empty($value)) {
					$ar[] = $value;
				}
			}
			if (count($ar)>0) {
				// $valor = implode(',',$ar);
				$valor = implode(' | ', $ar);
			}
		}else{
			$index = (int)$index;
			$valor = isset($dato[$index]) ? $dato[$index] : null;
		}


		return $valor;
	}//end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string $valor
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		if (empty($valor)) {

			$valor = $this->get_valor($lang);

		}else{

			// Add value of current lang to nolan data
			if ($this->with_lang_versions===true) {

				$component = $this;
				$component->set_lang($lang);
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
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		// lang empty case. Apply default
			if (empty($lang)) {
				$lang = DEDALO_DATA_LANG;
			}

		// Default behavior is get value in given lang
			$diffusion_value = $this->get_valor($lang);

		// fallback
			if (empty($diffusion_value)) {
				if ($this->traducible==='no') {
					$this->set_lang(DEDALO_DATA_NOLAN);
					$diffusion_value = $this->get_valor(DEDALO_DATA_NOLAN);
				}else{
					$all_project_langs = common::get_ar_all_langs();
					foreach ($all_project_langs as $current_lang) {
						if ($current_lang!==$lang) {
							$this->set_lang($current_lang);
							$diffusion_value = $this->get_valor($current_lang);
							if (!empty($diffusion_value)) {
								break;
							}
						}
					}
				}
			}

		// strip_tags all values (remove untranslated mark elements)
			$diffusion_value = !empty($diffusion_value)
				? preg_replace("/<\/?mark>/", '', $diffusion_value)
				: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->dato_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '4.0.21':
				#$dato = $this->get_dato_unchanged();

				# Compatibility old dedalo installations
				if (!empty($dato_unchanged) && is_string($dato_unchanged)) {

					$new_dato = (array)$dato_unchanged;

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

				}else if(is_array($dato_unchanged)){

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $dato_unchanged;
						$response->msg		= "[$reference_id] Dato is array ".to_string($dato_unchanged)." only save .<br />";

				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* sample:
		* {
		*    "q": [
		*        "Raurich Pérez"
		*    ],
		*    "q_operator": null,
		*    "path": [
		*        {
		*            "name": "Surname",
		*            "model": "component_input_text",
		*            "section_tipo": "rsc197",
		*            "component_tipo": "rsc86"
		*        }
		*    ],
		*    "q_split": true,
		*    "type": "jsonb",
		*    "component_path": [
		*        "components",
		*        "rsc86",
		*        "dato"
		*    ],
		*    "lang": "all"
		* }
	* @return object $query_object
	*	Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// $q
		// Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
			$q = is_array($query_object->q)
				? (!empty($query_object->q[0]) ? $query_object->q[0] : '')
				: ($query_object->q ?? '');

		// split q case
			$q_split = $query_object->q_split ?? false;
			if ($q_split===true && !search::is_literal($q)) {
				$q_items = preg_split('/\s/', $q);
				if (count($q_items)>1) {
					return self::handle_query_splitting($query_object, $q_items, '$and');
				}
			}

		// escape q string for DB
			$q = pg_escape_string(DBi::_getConnection(), stripslashes($q));

		// q_operator
			$q_operator = $query_object->q_operator ?? null;

		// type. Always set fixed values
			$query_object->type = 'string';

		switch (true) {
			# EMPTY VALUE
			case ($q==='!*'):
				$operator	= 'IS NULL';
				$q_clean	= '';

				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;

				// Search empty only in current lang
				// Resolve based on if is translatable
					$path_end		= end($query_object->path);
					$component_tipo	= $path_end->component_tipo;
					$translatable = RecordObj_dd::get_translatable($component_tipo);

					// $lang = (isset($query_object->lang) && $query_object->lang!=='all')
					// 	? $query_object->lang
					// 	: 'all';

					$lang = $translatable===true
						? DEDALO_DATA_LANG
						: DEDALO_DATA_NOLAN;

					$lang_query_not_null = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> 'IS NULL',
						'lang'			=> $lang,
						'translatable'	=> $translatable
					]);
					$lang_query_empty = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> '=',
						'q_parsed'		=> '\'[]\'',
						'lang'			=> $lang,
						'translatable'	=> $translatable
					]);

					$lang_query_objects = array_merge($lang_query_not_null, $lang_query_empty);

					$logical_operator = '$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $lang_query_objects;

				$logical_operator = '$and';
				$final_query_json = new stdClass;
					$final_query_json->$logical_operator = [$langs_query_json];
				$query_object = $final_query_json;
				break;
			# NOT EMPTY
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;

					$lang = (isset($query_object->lang) && $query_object->lang!=='all')
						? $query_object->lang
						: 'all';

					$lang_query_objects_null = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> 'IS NOT NULL',
						'lang'			=> $lang,
					]);
					$lang_query_objects_empty = component_common::resolve_query_object_lang_behavior( (object)[
						'query_object'	=> $query_object,
						'operator'		=> '!=',
						'q_parsed'		=> '\'[]\'',
						'lang'			=> $lang,
					]);

					$lang_query_objects = array_merge($lang_query_objects_null, $lang_query_objects_empty);

					$logical_operator = '$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $lang_query_objects;

				# override
				$logical_operator = '$and';
				$final_query_json = new stdClass;
					$final_query_json->$logical_operator = [$langs_query_json];
				$query_object = $final_query_json;
				break;
			# IS DIFFERENT
			case (strpos($q, '!=')===0 || $q_operator==='!='):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator	= '!~';
				$first_char	= mb_substr($q_clean, 0, 1);
				$last_char	= mb_substr($q_clean, -1);
				switch (true) {
					// contains
					case ($first_char==='*' && $last_char==='*'):
						$q_clean = str_replace('*', '', $q_clean);
						$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
						break;
					// begins with
					case ($first_char==='*'):
						$q_clean = str_replace('*', '', $q_clean);
						$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'".*\'';
						break;
					// ends with
					case ($last_char==='*'):
						$q_clean = str_replace('*', '', $q_clean);
						$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*"\'';
						break;
					default:
						$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
						break;
				}
				$query_object->unaccent	= false;
				break;
			# IS EXACTLY EQUAL ==
			case (strpos($q, '==')===0 || $q_operator==='=='):
				$operator = '==';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '@>';
				$query_object->q_parsed	= '\'["'.$q_clean.'"]\'';
				$query_object->unaccent = false;
				$query_object->type = 'object';
				if (isset($query_object->lang) && $query_object->lang!=='all') {
					$query_object->component_path[] = $query_object->lang;
				}
				if (isset($query_object->lang) && $query_object->lang==='all') {
					$logical_operator = '$or';
					$ar_query_object = [];
					$ar_all_langs 	 = common::get_ar_all_langs();
					$ar_all_langs[]  = DEDALO_DATA_NOLAN; // Added no lang also
					foreach ($ar_all_langs as $current_lang) {
						// Empty data is blank array []
						$clone = clone($query_object);
							$clone->component_path[] = $current_lang;

						$ar_query_object[] = $clone;
					}
					$query_object = new stdClass();
						$query_object->$logical_operator = $ar_query_object;
				}
				break;
			# IS SIMILAR
			case (strpos($q, '=')===0 || $q_operator==='='):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator	= '~*';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent	= true;
				break;
			# NOT CONTAIN
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;
			# CONTAIN EXPLICIT
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;
			# ENDS WITH
			case (substr($q, 0, 1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*"\'';
				$query_object->unaccent	= true;
				break;
			# BEGINS WITH
			case (substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\["'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;
			# LITERAL
			case (search::is_literal($q)===true):
				$operator = '~';
				$q_clean  = str_replace("'", '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent	= true;
				break;
			# DUPLICATED
			case (strpos($q, '!!')===0 || $q_operator==='!!'):
				$operator = '=';
				$query_object->operator 	= $operator;
				$query_object->unaccent		= false; // (!) always false
				$query_object->duplicated	= true;
				// Resolve lang based on if is translatable
					$path_end			= end($query_object->path);
					$component_tipo		= $path_end->component_tipo;
					$query_object->lang	= RecordObj_dd::get_translatable($component_tipo) ?  DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				break;
			# DEFAULT CONTAIN
			default:
				$operator = '~*';
				$q_clean  = str_replace('+', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
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



	/**
	* CONFORM_IMPORT_DATA
	* @param string $import_value
	* @param string $column_name
	* @return object $response
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// object | array case
			// Check if is a JSON string. Is yes, decode
			// if data is a object | array it will be the Dédalo format and it's not necessary processed
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$dato_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				$response->result	= $dato_from_json;
				$response->msg		= 'OK';

				return $response;
			}

		// string case
			// check the begin and end of the value string, if it has a [] or other combination that seems array
			// sometimes the value text could be [Ac], as numismatic legends, it's admit, but if the text has [" or "] it's not admitted.
			$begins_one	= substr($import_value, 0, 1);
			$ends_one	= substr($import_value, -1);
			$begins_two	= substr($import_value, 0, 2);
			$ends_two	= substr($import_value, -2);

			if (($begins_two !== '["' && $ends_two !== '"]') ||
				($begins_two !== '["' && $ends_one !== ']') ||
				($begins_one !== '[' && $ends_two !== '"]')
				){
				$value = !empty($import_value) || $import_value==='0'
					? [$import_value]
					: null;
			}else{
				// import value seems to be a JSON malformed.
				// it begin [" or end with "]
				// log JSON conversion error
				debug_log(__METHOD__
					." invalid JSON value, seems a syntax error: ". PHP_EOL
					. to_string($import_value)
					, logger::ERROR
				);

				$failed = new stdClass();
					$failed->section_id		= $this->section_id;
					$failed->data			= stripslashes( $import_value );
					$failed->component_tipo	= $this->get_tipo();
					$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
				$response->errors[] = $failed;

				return $response;
			}

		$response->result	= $value;
		$response->msg		= 'OK';

		return $response;
	}//end conform_import_data



}//end class component_input_text
