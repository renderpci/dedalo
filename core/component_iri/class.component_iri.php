<?php declare(strict_types=1);
include dirname(__FILE__) . '/class.dd_iri.php';
/**
* CLASS COMPONENT_IRI
* Manages Internationalized Resource Identifiers (URI allowing Unicode). E.g. https://dedalo.dev
*
*[
*	{
*		"id": 1,
*		"iri": "https://dedalo.dev",
*		"title": "Dédalo web site",
*		"id": 1
*	}
*]
*
*/
class component_iri extends component_common {



	/**
	* CLASS VARS
	* @var
	*/
	// with_lang_versions. Set in properties for true like component_input_text
	public $with_lang_versions = true;



	/**
	* GET DATO
	* Array with objects, every object have two properties:
	* "iri" mandatory with string value and "title" optional with string value
	* Sample:
		* [
		*		{
		*			"id": 1,
		*			"iri": "https://dedalo.dev",
		*			"title": "Dédalo web site",
		*		}
		* ]
	* @return array|null $dato
	*/
	public function get_dato() : ?array {

		$dato = parent::get_dato();

		// check if the data becomes from input_text.
		// To accept values from component_input_text,
		// needs to change the string value of the input_text to IRI object value
		// setting the `iri` property with the previous input_text value.
			$input_text = false;
			if(!empty($dato)) {
				foreach ((array)$dato as $key => $value) {
					if(!is_object($value) ){
						$input_text = true;
						// get the component counter
						// it's the last counter used
						$counter = $this->get_counter();
						$id = $counter++;
						$object = new stdClass();
							$object->iri = $value;
							$object->id = $id;
						$dato[$key] = $object;
						// set the new counter as the id (previous counter + 1)
						$this->set_counter( $id );
					}
				}
				if($input_text===true) {
					$this->set_dato($dato);
					$this->Save();
				}
			}

		// check dato
			if ( !is_null($dato) && !is_array($dato)  ) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						. " WRONG TYPE of dato. Expected array or null. Given: ".gettype($dato) . PHP_EOL
						. " tipo: $this->tipo" . PHP_EOL
						. " section_tipo: $this->section_tipo" . PHP_EOL
						. " section_id: $this->section_id" . PHP_EOL
						.' dato: ' . json_encode($dato)
						, logger::ERROR
					);
				}
				if (is_string($dato)) {
					$object = new stdClass();
						$object->iri = $dato;
					$dato = [$object];
					$this->set_dato($dato);
					$this->Save();
				}
			}


		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param array|null $dato
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// string case. Tool Time machine mode, dato is string
		if (is_string($dato)) {
			$dato = json_handler::decode($dato);
		}

		// check type
		if (!is_array($dato) && !is_null($dato)) {
			debug_log(__METHOD__
				. " Warning. Received dato is NOT array. Type is '".gettype($dato)."' and will be converted to array" . PHP_EOL
				. " tipo: $this->tipo" . PHP_EOL
				. " section_tipo: $this->section_tipo" . PHP_EOL
				. " section_id: $this->section_id" . PHP_EOL
				. " dato: " . to_string($dato) . PHP_EOL
				. ' type: ' . gettype($dato)
				, logger::DEBUG
			);
		}

		// check the data values to fit the IRI data
		$input_text = false;
		if(!empty($dato)) {
			foreach ((array)$dato as $key => $value) {
				if(!is_object($value) ){
					$input_text = true;
					// get the component counter
					// it's the last counter used
					$counter = $this->get_counter();
					$counter++;
					$id = $counter;
					$object = new stdClass();
						$object->iri = $value;
						$object->id = $id;
					$dato[$key] = $object;
					// set the new counter as the id (previous counter + 1)
					$this->set_counter( $id );
				}
			}
			if($input_text===true) {
				$this->dato = $dato;
			}
		}


		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	* @return int|null $section_id
	*/
	public function Save() : ?int {

		// dato candidate to save
			$dato = $this->dato;

		// deleting IRI
			if (empty($dato)) {
				# Save in standard empty format
				return parent::Save();
			}

		// dato format verify
			if ( !is_array($dato) && !is_null($dato) ) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						." Bad IRI format: ". PHP_EOL
						.' dato:' . to_string($dato) . PHP_EOL
						.' type: ' . gettype($dato)
						, logger::ERROR
					);
				}
				return false;
			}

		// Save in standard format
		return parent::Save();
	}//end Save



	/**
	* GET_GRID_VALUE
	* Get the value of the component.
	* component filter return a array of values
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// column_obj. Set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$class_list			= $ddo->class_list ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// set the label of the component as column label
			$label = $this->get_label();

		// properties
			$properties = $this->get_properties();

		// fields_separator. set the separator text that will be used to render the column
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// ar_values
			$ar_values	= [];
			$data		= $this->get_dato();
			if (!empty($data)) {
				foreach ($data as $current_value) {

					$current_iri	= $current_value->iri ?? '';
					$current_title	= $current_value->title ?? '';

					$ar_values[] = $current_title . $fields_separator . $current_iri;
				}
			}

		// flat_value (array of one value full resolved)
			$flat_value = [implode($records_separator, $ar_values)];

		// value
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('iri'); // text
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($flat_value);
				$dd_grid_cell_object->set_data($data);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_GRID_FLAT_VALUE
	* Get the flat value of the components (text version of data).
	* overwrite in every different specific component
	* @return dd_grid_cell_object $flat_value
	* 	dd_grid_cell_object
	*/
	public function get_grid_flat_value() : dd_grid_cell_object {

		$flat_value = parent::get_grid_flat_value();

		// overwrite cell_type (custom case)
		$flat_value->set_cell_type('iri');

		// add data (custom case)
		$data = $this->get_dato();
		$flat_value->set_data($data);


		return $flat_value;
	}//end get_grid_flat_value



	/**
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG, $index='all') : ?string {

		$dato = $this->get_dato();

		if ($index==='all') {

			$ar_val = [];
			if (is_array($dato)) {
				foreach ($dato as $value) {

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
			}

			$valor = !empty($ar_val)
				? implode(', ', $ar_val)
				: null;

		}else{

			$index = (int)$index;
			$valor = isset($dato[$index])
				? $dato[$index]
				: null;
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
			$this->get_dato(); // Get dato from DB
		}

		$valor = $this->get_valor($lang);
		$valor = !empty($valor)
			? strip_tags($valor) // Removes the span tag used in list mode
			: $valor;


		return (string)$valor;
	}//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* If index var is received, return dato element corresponding to this index if exists
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$dato = $this->get_dato();

		// no lang fallback
			if (empty($dato) && $lang!==DEDALO_DATA_NOLAN) {
				// try using nolan
				$this->set_lang(DEDALO_DATA_NOLAN);
				$dato = $this->get_dato();
				// restore lang
				$this->set_lang($lang);
			}

		// no value case
			if (empty($dato)) {
				return null;
			}


		$ar_values = [];
		foreach ($dato as $value) {

			if(empty($value)) {
				continue;
			}

			$ar_parts = [];
			if (!empty($value->title)) {
				$ar_parts[] = $value->title;
			}
			if (!empty($value->iri)) {
				$ar_parts[] = $value->iri;
			}

			// add value
			$ar_values[] = implode(', ', $ar_parts);
		}

		// diffusion_value string
		$diffusion_value = implode(' | ', $ar_values);


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* UPDATE_DATO_VERSION
	* @param object $options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $options) : object {

		// options
			$update_version	= $options->update_version ?? null;
			$dato_unchanged	= $options->dato_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_dato';

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '6.8.0':

			// Update the locator to move old ds and dataframe to v6 dataframe model.
				if (!empty($dato_unchanged) && is_array($dato_unchanged)) {

					$model = RecordObj_dd::get_modelo_name_by_tipo( $tipo );
					$component = component_common::get_instance(
						$model, // string model
						$tipo, // string tipo
						$section_id, // string section_id
						'edit', // string mode
						DEDALO_DATA_NOLAN, // string lang
						$section_tipo // string section_tipo
					);

					$new_data = [];
					foreach ( (array)$dato_unchanged as $current_data) {
						// Clone the current data so as not to touch the originals.
						$iri_data = json_decode(json_encode( $current_data ));

						// set the id to the data
						if(!isset($iri_data->id)){
							$counter = $component->get_counter();
							$counter++;
							$id = $counter;
							$iri_data->id = $id;
							$component->set_counter( $id );
						}
						$new_data[] = $iri_data;

					}//end foreach

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_data;
						$response->msg		= "[$reference_id] Data were changed from ".to_string($dato_unchanged)." to ".to_string($new_data).".<br />";

				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}//end (!empty($dato_unchanged) && is_array($dato_unchanged))
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
	* @return object $query_object
	*	Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// $q
			$q = is_array($query_object->q)
				? reset($query_object->q)
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

		// Prepend if exists
			// if (isset($query_object->q_operator)) {
			// 	$q = $query_object->q_operator . $q;
			// }

		switch (true) {
			# EMPTY VALUE (in current lang data)
			case ($q==='!*' || $q_operator==='!*'):
				$operator = 'IS NULL';
				$q_clean  = '';
				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;
				$query_object->lang		= 'all';

				$logical_operator = '$or';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// Search empty only in current lang
					$lang = DEDALO_DATA_LANG;

					$clone = clone($query_object);
						$clone->operator = '=';
						$clone->q_parsed = '\'[]\'';
						$clone->lang 	 = $lang;
					$new_query_json->$logical_operator[] = $clone;

					// $clone = clone($query_object);
					// 	$clone->operator	= '=';
					// 	$clone->q_parsed	= '\'\'';
					// 	$clone->lang		= $lang;
					// $new_query_json->$logical_operator[] = $clone;

					// legacy data (set as null instead '')
					$clone = clone($query_object);
						$clone->operator	= 'IS NULL';
						$clone->lang		= $lang;
					$new_query_json->$logical_operator[] = $clone;

				# override
				$query_object = $new_query_json ;
				break;
			# NOT EMPTY (in any project lang data)
			case ($q==='*' || $q_operator==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;

				$logical_operator = '$and';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// langs check
					$ar_query_object = [];
					$ar_all_langs 	 = common::get_ar_all_langs();
					$ar_all_langs[]  = DEDALO_DATA_NOLAN; // Added no lang also
					foreach ($ar_all_langs as $current_lang) {
						$clone = clone($query_object);
							$clone->operator	= '!=';
							$clone->q_parsed	= '\'[]\'';
							$clone->lang		= $current_lang;

						$ar_query_object[] = $clone;
					}

					$logical_operator ='$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $ar_query_object;

				$sub_group1 = new stdClass();
					$sub_name1 = '$and';
					$sub_group1->$sub_name1 = [$new_query_json, $langs_query_json];

				// override
				$query_object = $sub_group1;
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
			case (search::is_literal($q)===true):
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
			'*text*'	=> 'contains',
			'text*'		=> 'begins_with',
			'*text'		=> 'end_with',
			'\'text\''	=> 'literal',
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* URL_TO_IRI
	* Return valid operators for search in current component
	* @param string $url
	* @return object $data_iri
	*/
	public function url_to_iri(string $url) : object {

		$data_iri = new stdClass();
			$data_iri->iri = $url;

		return $data_iri;
	}//end url_to_iri



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


		// $has_protocol function to be used in any case, $import_value is an array of objects (IRI format)
		// or array of strings or string values needed to begin with the protocol HTTP or HTTPS
			$has_protocol = function(string $text_value) : bool {

				$begins_http	= substr($text_value, 0, 7);
				$begins_https	= substr($text_value, 0, 8);

				if($begins_http === 'http://' || $begins_https === 'https://') {

					return true;
				}

				return false;
			};

		// valid_string
		// check the begin and end of the value string, if it has a [] or other combination that seems array
		// if the text has [" or "] it's not admitted, because it's a bad array of strings.
			$is_valid_string = function(string $text_value) : bool {

				$begins_one	= substr($text_value, 0, 1);
				$ends_one	= substr($text_value, -1);
				$begins_two	= substr($text_value, 0, 2);
				$ends_two	= substr($text_value, -2);

				if (($begins_two !== '["' && $ends_two !== '"]') ||
					($begins_two !== '["' && $ends_one !== ']') ||
					($begins_one !== '[' && $ends_two !== '"]')
					){
						return true;
				}

				return false;
			};

		// object | array case
			// Check if is a JSON stringified. Is yes, decode
			// if data is a object | array it will be the Dédalo format and check if the IRI is OK.
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$dato_from_json	= json_handler::decode($import_value);

				if(is_object($dato_from_json)){

					$first_key = array_keys((array)$dato_from_json)[0];
					if (strpos($first_key, 'lg-')===0) {

						$conformed_value = new stdClass();

						foreach ($dato_from_json as $lang => $current_value) {

							$valid_langs = common::get_ar_all_langs();
							$valid_langs[] = DEDALO_DATA_NOLAN;
							if(!in_array($lang, $valid_langs)){

								debug_log(__METHOD__
									." invalid language, looks like a syntax error: ". PHP_EOL
									. to_string($import_value)
									, logger::ERROR
								);

								$failed = new stdClass();
									$failed->section_id		= $this->section_id;
									$failed->data			= to_string($import_value);
									$failed->component_tipo	= $this->get_tipo();
									$failed->msg			= 'IGNORED: language is not define in the config '. to_string($lang);
								$response->errors[] = $failed;

								return $response;
							}

							$safe_ar_value = is_array($current_value)
								? $current_value
								: [$current_value];

							$value = [];
							foreach ($safe_ar_value as $key => $iri_object) {

								$data_iri = new stdClass();

								if(is_object($iri_object)){

									if(!empty($iri_object->iri)){
										// remove unused spaces or other invalid code as \t \n, etc
										$iri_object->iri = trim($iri_object->iri);
										$result = $has_protocol($iri_object->iri);
										if($result===false){

											// import value seems to be a JSON malformed.
											// it begin [" or end with "]
											// log JSON conversion error
											debug_log(__METHOD__
												." invalid http uri value, looks like a syntax error: ". PHP_EOL
												. to_string($import_value)
												, logger::ERROR
											);

											$failed = new stdClass();
												$failed->section_id		= $this->section_id;
												$failed->data			= to_string($import_value);
												$failed->component_tipo	= $this->get_tipo();
												$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
											$response->errors[] = $failed;

											return $response;
										}

										$data_iri->iri = $iri_object->iri;
									}
									if(!empty($iri_object->title)){
										$data_iri->title = $iri_object->title;
									}
								}else if(is_string($iri_object)){

									$valid_string = $is_valid_string($iri_object);
									$result = $has_protocol($current_value);

									if($valid_string===false || $result===false){
										// import value seems to be a JSON malformed.
										// it begin [" or end with "]
										// log JSON conversion error
										debug_log(__METHOD__
											." invalid http uri value, looks like a syntax error: ". PHP_EOL
											. to_string($iri_object)
											, logger::ERROR
										);

										$failed = new stdClass();
											$failed->section_id		= $this->section_id;
											$failed->data			= to_string($iri_object);
											$failed->component_tipo	= $this->get_tipo();
											$failed->msg			= 'IGNORED: malformed data '. to_string($iri_object);
										$response->errors[] = $failed;

										return $response;
									}
									$data_iri->iri = $iri_object;
								}

								$value[] = $data_iri;
							}

							$conformed_value->$lang = $value;
						}

						$response->result	= $conformed_value ?? null;
						$response->msg		= 'OK';

						return $response;

					}else{

						$iri_object = new stdClass();
						if(isset($dato_from_json->iri)){

							$result = $has_protocol($dato_from_json->iri);
							if($result===false){

								// import value seems to be a JSON malformed.
								// it begin [" or end with "]
								// log JSON conversion error
								debug_log(__METHOD__
									." invalid http uri value, looks like a syntax error: ". PHP_EOL
									. to_string($dato_from_json)
									, logger::ERROR
								);

								$failed = new stdClass();
									$failed->section_id		= $this->section_id;
									$failed->data			= to_string($dato_from_json);
									$failed->component_tipo	= $this->get_tipo();
									$failed->msg			= 'IGNORED: malformed data '. to_string($dato_from_json);
								$response->errors[] = $failed;

								return $response;
							}

							$iri_object->iri = $dato_from_json->iri;
						}
						if(isset($dato_from_json->title)){
							$iri_object->title = $dato_from_json->title;
						}

						$value = [$iri_object];

						$response->result	= $value;
						$response->msg		= 'OK';

						return $response;
					}
				}

				// the importer support array of objects (default, iri data) of array of strings as:
				// [{"iri":"https://dedalo.dev","title":"Dedalo webpage"},{"iri":"https://dedalo.dev/docs","title":"Dedalo documentation"}]
				// ["https://dedalo.dev","https://dedalo.dev/docs"]
				if(is_array($dato_from_json)){

					$value = [];
					foreach ($dato_from_json as $current_value) {
						// check if the value is a flat string with the uri
						if(is_string($current_value)){
							$result = $has_protocol($current_value);

							if ($result === false) {

								// import value seems to be a JSON malformed.
								// it begin [" or end with "]
								// log JSON conversion error
								debug_log(__METHOD__
									." invalid http uri value, looks like a syntax error: ". PHP_EOL
									. to_string($import_value)
									, logger::ERROR
								);

								$failed = new stdClass();
									$failed->section_id		= $this->section_id;
									$failed->data			= to_string($import_value);
									$failed->component_tipo	= $this->get_tipo();
									$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
								$response->errors[] = $failed;

								return $response;
							}

							$iri_object = new stdClass();
								$iri_object->iri = $current_value;

							$value[] = $iri_object;
						// check if the value is a object
						}else if(is_object($current_value)){

							$iri_object = new stdClass();

							if(isset($current_value->iri)){

								$result = $has_protocol($current_value->iri);
								if($result===false){

									// import value seems to be a JSON malformed.
									// it begin [" or end with "]
									// log JSON conversion error
									debug_log(__METHOD__
										." invalid http uri value, looks like a syntax error: ". PHP_EOL
										. to_string($import_value)
										, logger::ERROR
									);

									$failed = new stdClass();
										$failed->section_id		= $this->section_id;
										$failed->data			= to_string($import_value);
										$failed->component_tipo	= $this->get_tipo();
										$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
									$response->errors[] = $failed;

									return $response;
								}

								$iri_object->iri = $current_value->iri;
							}
							if(isset($current_value->title)){
								$iri_object->title = $current_value->title;
							}

							$value[] = $iri_object;
						}
					}

					$response->result	= $value ?? null;
					$response->msg		= 'OK';

					return $response;

				}else{

					$response->result	= null;
					$response->msg		= 'Error. Expected array and get: '.gettype($dato_from_json);

					return $response;
				}
			}

		// string case
			$valid = $is_valid_string($import_value);
			if ($valid===false) {

				// import value seems to be a JSON malformed.
				// it begin [" or end with "]
				// log JSON conversion error
				debug_log(__METHOD__
					." invalid JSON value, looks like a syntax error: ". PHP_EOL
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

		$value = null;
		if(!empty($import_value)) {

			$iri_object = new stdClass();

			$properties = $this->get_properties();

			$records_separator = isset($properties->records_separator)
				? $properties->records_separator
				: ' | ';

			$fields_separator = isset($properties->fields_separator)
				? $properties->fields_separator
				: ', ';

			$has_records_separator	= strpos($import_value, $records_separator)!==false;
			$has_field_separator	= strpos($import_value, $fields_separator.'http')!==false;
			$with_protocol			= $has_protocol($import_value);
			if ($has_records_separator===false && $has_field_separator===false && $with_protocol===false) {

				// error
				debug_log(__METHOD__
					." invalid http uri value, looks like a syntax error: ". PHP_EOL
					. to_string($import_value)
					, logger::ERROR
				);

				$failed = new stdClass();
					$failed->section_id		= $this->section_id;
					$failed->data			= to_string($import_value);
					$failed->component_tipo	= $this->get_tipo();
					$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
				$response->errors[] = $failed;

				return $response;
			}else{

				$value = [];
				$records = explode($records_separator, $import_value);
				foreach ($records as $record) {
					$iri_object = new stdClass();

					$fields = explode($fields_separator, $record);

					if ( $has_protocol($fields[0])===true ) {
						$iri_object->iri = $fields[0];
					}else{
						$iri_object->title = $fields[0];
					}
					if ( isset($fields[1]) && $has_protocol($fields[1])===true ) {
						$iri_object->iri = $fields[1];
					}
					$value[] = $iri_object;
				}
			}
		}//end if(!empty($import_value))

		$response->result	= $value;
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



	/**
	* SET_COUNTER
	* Component counter is saved into section data as object with the tipo and the value as int
	* Set the component counter with the given value in the section's data
	* @param int $value
	* @return int $counter
	*/
	public function set_counter( int $value ) : int {

		$section	= $this->get_my_section();
		$counter	= $section->set_component_counter( $this->tipo, $value );

		return $counter;
	}//end set_counter



	/**
	* GET_COUNTER
	* Get last counter used by the component
	* Component counter is saved into section data as object with the tipo and the value as int
	* @return int $counter
	*/
	public function get_counter() : int {

		$section	= $this->get_my_section();
		$counter	= $section->get_component_counter( $this->tipo );

		return $counter;
	}//end get_counter



}//end class component_iri
