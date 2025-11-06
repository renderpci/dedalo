<?php declare(strict_types=1);
/**
* INTERFACE COMPONENT_STRING_COMMON
* Used as common base from all components that works with media
* like component_3d, component_av, component_image, component_pdf, component_svg
*/
interface component_string_interface {

	// from component_string_common


}//end component_media_interface



/**
* CLASS COMPONENT_STRING_COMMON
* Used as common base from all components that works with media
* like component_input_text, component_text_area
*/
class component_string_common extends component_common {



	/**
	* CLASS VARS
	*/

	// data_column. DB column where to get the data.
	protected $data_column = 'string';

	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = true;


	/**
	* GET_STRING_COMPONENTS
	* Return array with model names of defined as 'string components'.
	* Add future string components here
	* @return array
	* @test true
	*/
	public static function get_string_components() : array {

		return [
			'component_input_text',
			'component_text_area'
		];
	}//end get_string_components



	/**
	* IS_EMPTY
	* @param mixed $value
	* Check if given value is or not empty considering
	* spaces and ' ' as empty values
	* @return bool
	*/
	public function is_empty(mixed $value) : bool {

		if($value===null) {
			return true;
		}

		// check for only spaces values as ' '
		$trim_value = is_string($value) ? trim($value) : $value;
		if($trim_value!=='0' && empty($trim_value)) {
			return true;
		}

		return false;
	}//end is_empty



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
			dump($dato, ' dato ++ ');

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
			$count = is_array($dato) ? count($dato) : 0;
			if ($count === 1 && $this->is_empty((array)$dato[0])) {
				$safe_dato = null;
			} else {
				foreach ((array)$dato as $value) {
					$safe_dato[] = (!is_string($value))
						? to_string($value)
						: $value;
				}
			}
			$dato = $safe_dato;


		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* EXTRACT_COMPONENT_DATO_FALLBACK
	* Retrieves component data for a specific language and implements
	* a fallback mechanism when data is missing or empty. It follows
	* a hierarchical fallback strategy to ensure data availability across different
	* language contexts.
	*
	* FALLBACK HIERARCHY:
	* 1. Current language data (if not empty)
	* 2. Main/default language data
	* 3. No-language (NOLAN) data
	* 4. All other available project languages (in sequence)
	* 5. null (if no data found in any language)
	*
	* ALGORITHM FLOW:
	* - Preserves current language state for restoration
	* - Retrieves data for the requested language
	* - For each empty value, iterates through fallback languages
	* - Returns first non-empty value found or null
	* - Restores original language state
	* @param string $lang = DEDALO_DATA_LANG
	* @param string $main_lang = DEDALO_DATA_LANG_DEFAULT
	* @return array $dato_fb
	*/
	public function extract_component_dato_fallback(string $lang=DEDALO_DATA_LANG, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : array {

		// get and store initial lang to restore later
			$initial_lang = $this->get_lang();

		// Try direct dato
			$dato = $this->get_dato();
			if (empty($dato)) {
				// set one null value to force iterate data
				$dato = [null];
			}

		// fallback if empty
		$dato_fb = [];
		foreach ($dato as $key => $value) {

			if( $this->is_empty($value)===true ) {

				// Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
					if ($lang!==$main_lang || $this->with_lang_versions===true) {
						// change temporally the component lang
						$this->set_lang($main_lang);
						$dato_lang = $this->get_dato();
						$dato_fb[$key] = isset($dato_lang[$key])
							? $dato_lang[$key]
							: null;
					}

				// Try nolan
					if (empty($dato_fb[$key])) {
						// change temporally the component lang
						$this->set_lang(DEDALO_DATA_NOLAN);
						$dato_lang = $this->get_dato();
						$dato_fb[$key] = isset($dato_lang[$key])
							? $dato_lang[$key]
							: null;
					}

				// Try all projects langs sequence
					if (empty($dato_fb[$key])) {
						$data_langs = common::get_ar_all_langs(); // Langs from config projects
						foreach ($data_langs as $current_lang) {
							if ($current_lang===$lang || $current_lang===$main_lang) {
								continue; // Already checked
							}
							// change temporally the component lang
							$this->set_lang($current_lang);
							$dato_lang = $this->get_dato();
							$dato_fb[$key] = isset($dato_lang[$key])
								? $dato_lang[$key]
								: null;

							// useful value is found
							if (!empty($dato_fb[$key])) {
								break; // Stops when any data is found
							}
						}
					}

				// empty case
					if (empty($dato_fb[$key])) {
						$dato_fb[$key] = null;
					}
			}else{
				$dato_fb[$key] = $value;
			}
		}

		// restore initial lang
			$this->set_lang($initial_lang);


		return $dato_fb;
	}//end extract_component_dato_fallback



	/**
	* EXTRACT_COMPONENT_VALUE_FALLBACK
	* @todo Note: It is still using 'get_valor()'. Normalize to modern 'get_value()'
	* reviewing all references
	* @param string $lang = DEDALO_DATA_LANG
	* @param bool $mark = true
	* @param string $main_lang = DEDALO_DATA_LANG_DEFAULT
	* @return string $value
	*/
	public function extract_component_value_fallback(string $lang=DEDALO_DATA_LANG, bool $mark=true, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : string {

		// get and store initial lang to restore later
		$initial_lang = $this->get_lang();

		// Try direct value
		$value = $this->get_valor($lang);

		if (empty($value)) {

			// Try main lang. (Used config DEDALO_DATA_LANG_DEFAULT as main_lang)
			if ($lang!==$main_lang) {
				$this->set_lang($main_lang);
				$value = $this->get_valor($main_lang);
			}

			// Try nolan
			if (empty($value)) {
				$this->set_lang(DEDALO_DATA_NOLAN);
				$value = $this->get_valor(DEDALO_DATA_NOLAN);
			}

			// Try all projects langs sequence
			if (empty($value)) {
				$data_langs = common::get_ar_all_langs(); // Langs from config projects
				foreach ($data_langs as $current_lang) {
					if ($current_lang===$lang || $current_lang===$main_lang) {
						continue; // Already checked
					}
					$this->set_lang($current_lang);
					$value = $this->get_valor($current_lang);
					if (!empty($value)) break; // Stops when first data is found
				}
			}

			// Set value as untranslated
			if ($mark===true) {
				$value = '<mark>'.$value.'</mark>';
			}
		}

		if (!is_string($value)) {
			$value = to_string($value);
		}

		// restore initial lang
		$this->set_lang($initial_lang);


		return $value;
	}//end extract_component_value_fallback



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

		// Validate path and calculate translatable
			if (empty($query_object->path) || !is_array($query_object->path)) {
				throw new Exception("Invalid component path");
			}
			$path_end = end($query_object->path);
			$component_tipo = $path_end->component_tipo;
			$translatable = ontology_node::get_translatable($component_tipo);

		// escape q string for DB
			$q = pg_escape_string(DBi::_getConnection(), stripslashes($q));

		// q_operator. Search component do not use a 'q_operator' but for compatibility with
		// any search call, it is added here and is accepted too.
			$q_operator = $query_object->q_operator ?? null;

		// type. Always set fixed values
			$query_object->type = 'string';

		switch (true) {

			// EMPTY VALUE
			case ($q==='!*'):
				$operator	= 'IS NULL';
				$q_clean	= '';

				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;

				// Search empty only in current lang
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

			// NOT EMPTY
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

			// IS DIFFERENT
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

			// IS EXACTLY EQUAL ==
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

			// IS SIMILAR
			case (strpos($q, '=')===0 || $q_operator==='='):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator	= '~*';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent	= true;
				break;

			// NOT CONTAIN
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;

			// CONTAIN EXPLICIT
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;

			// ENDS WITH
			case (substr($q, 0, 1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\[".*'.$q_clean.'.*"\'';
				$query_object->unaccent	= true;
				break;

			// BEGINS WITH
			case (substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*\["'.$q_clean.'.*\'';
				$query_object->unaccent	= true;
				break;

			// LITERAL
			case (search::is_literal($q)===true):
				$operator = '~'; // case sensitive regular expression matching
				$q_clean  = str_replace("'", '', $q);
				$query_object->operator	= $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent	= true;
				break;

			// DUPLICATED
			case (strpos($q, '!!')===0 || $q_operator==='!!'):
				$operator = '=';
				$query_object->operator 	= $operator;
				$query_object->unaccent		= false; // (!) always false
				$query_object->duplicated	= true;
				// Resolve lang based on if is translatable
					$lang = $translatable===true ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
					$query_object->lang	= $lang;
				break;

			// DEFAULT CONTAINS
			default:
				$operator = '~*'; // case insensitive regular expression matching
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
			'=='		=> 'exactly',
			'='			=> 'similar_to',
			'!='		=> 'different_from',
			'-'			=> 'does_not_contain',
			'!!'		=> 'duplicated',
			'*text*'	=> 'contains',
			'text*'		=> 'begins_with',
			'*text'		=> 'end_with',
			'\'text\''	=> 'literal'
		];

		return $ar_operators;
	}//end search_operators_info



}//end component_string_common
