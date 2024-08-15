<?php
declare(strict_types=1);
/**
* CLASS COMPONENT TEXT AREA
*
*
*/
class component_text_area extends component_common {



	public $arguments;



	/**
	* GET DATO
	* @return array|null $dato
	*/
	public function get_dato() {

		$dato = parent::get_dato();

		if (!is_null($dato) && !is_array($dato)) {
			$dato = [$dato];
		}

		return $dato;
	}//end get_dato



	/**
	*  SET_DATO
	* @param array $dato
	* 	Dato now is multiple. For this, expected type is array
	*	but in some cases can be an array JSON encoded or some rare times as plain string
	* @return bool
	*/
	public function set_dato($dato) : bool {

		// remove data when data is null
		if(is_null($dato)) {
			return parent::set_dato(null);
		}

		// check string
			if (is_string($dato)) { // Tool Time machine case, dato is string

				// check the dato for determinate the original format and if the $dato is correct.
				$dato_trim				= !empty($dato) ? trim($dato) : $dato;
				$dato_first_character	= substr($dato_trim, 0, 1);
				$dato_last_character	= substr($dato_trim, -1);

				if ($dato_first_character==='[' && $dato_last_character===']') {
					// dato is JSON encoded
					$dato = json_handler::decode($dato_trim);
				}else{
					// dato is string plain value
					$dato = array($dato);
					debug_log(__METHOD__
						." Warning. [$this->tipo,$this->parent] Dato received is a plain string. Support for this type is deprecated. Use always an array to set dato." .PHP_EOL
						.'dato: '. to_string($dato)
						, logger::WARNING
					);
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				if (!is_array($dato)) {
					debug_log(__METHOD__
						." Warning. [$this->tipo, $this->parent]. Received dato is NOT array. Type is '".gettype($dato)."' and dato will be converted to array" .PHP_EOL
						.' dato:' . to_string($dato)
						, logger::WARNING
					);
				}
			}

		$count = is_array($dato)
			? count($dato)
			: 0;

		$safe_dato = array();
		foreach ((array)$dato as $value) {
			if($this->is_empty($value) && $count === 1 ){
				$safe_dato = null;
			}else{
				$safe_dato[] = (!is_string($value))
					? to_string($value)
					: $value;
			}
		}
		$dato = $safe_dato;


		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* IS_EMPTY
	* Check if given value is or not empty considering
	* spaces and '<p></p>' as empty values
	* @param mixed $value
	* @return bool
	*/
	public function is_empty(mixed $value) : bool {

		if(is_null($value)){
			return true;
		}

		$value = is_string($value)
			? trim($value)
			: $value;

		if (empty($value)) {
			return true;
		}

		if ($value==='<p></p>' || $value==='<br data-mce-bogus="1">') {
			return true;
		}

		return false;
	}//end is_empty



	/**
	* GET_GRID_VALUE
	* Get the value of the components.
	* If the mode is "indexation_list", create the fragments of the indexation
	* @param object $ddo = null
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value(object $ddo=null) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// data
			$data = $this->get_dato();

		// procesed_data
			switch ($this->mode) {
				case 'indexation_list':
					// process data to build the indexation custom columns
					$procesed_data	= include 'component_text_area_value.php';
					$cell_type		= null;
					break;

				default:
					$procesed_data = [];
					if (!empty($data)) {
						foreach ($data as $current_value) {
							// $current_value = trim($current_value);
							if (!$this->is_empty($current_value)) {
								$procesed_data[] = TR::add_tag_img_on_the_fly($current_value);
							}
						}
					}
					$cell_type = 'text'; // default
					break;
			}

		// fallback_value
			if (empty($data)) {

				$data = component_common::extract_component_dato_fallback(
					$this, // component instance this
					$this->get_lang(), // string lang
					DEDALO_DATA_LANG_DEFAULT // string main_lang
				);

				switch ($this->mode) {
					case 'indexation_list':
						// process data to build the indexation custom columns
						$procesed_fallback_value	= include 'component_text_area_value.php';
						$cell_type					= null;
						break;

					default:
						$procesed_fallback_value = [];
						if (!empty($data)) {
							foreach ($data as $current_value) {
								// $current_value = trim($current_value);
								if (!$this->is_empty($current_value)) {
									$procesed_fallback_value[] = TR::add_tag_img_on_the_fly($current_value);
								}
							}
						}
						$cell_type = 'text'; // default
						break;
				}
			}else{
				$procesed_fallback_value = []; // unnecessary to calculate
			}

		// label
			$label = $this->get_label();

		// records_separator
			$properties = $this->get_properties();
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// value
			$value = new dd_grid_cell_object();
				$value->set_type('column');
				$value->set_label($label);
				$value->set_ar_columns_obj([$column_obj]);
				if(isset($cell_type)){
					$value->set_cell_type($cell_type);
				}
				if(isset($class_list)){
					$value->set_class_list($class_list);
				}
				$value->set_records_separator($records_separator);
				$value->set_value($procesed_data);
				$value->set_fallback_value($procesed_fallback_value);


		return $value;
	}//end get_grid_value



	/**
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG, $index='all') : ?string {

		$valor = '';

		$dato = $this->get_dato();
		if(empty($dato)) {
			return $valor;
		}

		if ($index==='all') {
			$ar = array();
			foreach ((array)$dato as $value) {
				$value = is_string($value)
					? trim($value)
					: null;
				if (!empty($value)) {
					$ar[] = TR::add_tag_img_on_the_fly($value);
				}
			}
			if (count($ar)>0) {
				$valor = implode(',', $ar);
			}
		}else{
			$index = (int)$index;
			$valor = isset($dato[$index]) ? TR::add_tag_img_on_the_fly($dato[$index]) : null;
		}


		return $valor;
	}//end get_valor



	/**
	* GET_VALUE_FRAGMENT
	* (!) Used by 'component_text_area_value.php' for V5 compatibility only
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* NOTA : El valor a guardar del text area NO es un string sino un objeto que contine los fragmentos en que se divide
	* el texto (1 si no hay fragmentos definidos) limitados a un largo apropiado a los listados (ej. 25 chars)
	*
	* @see class.section.php
	*
	* @param int $max_char = 256
	* @return array $value_fragment
	*/
	public function get_value_fragment(int $max_char=256) : array {

		// value . Get value with images and html tags
		$dato = $this->get_dato();

		if (empty($dato)) {

			// set the fragment
			$value_fragment = [''];

		}else{

			$value = '';
			foreach ($dato as $current_value) {
				$current_value = is_string($current_value)
					? trim($current_value)
					: null;
				if (!empty($current_value)) {
					$value = TR::add_tag_img_on_the_fly($current_value);
				}
			}
			// truncate string
				$text_fragment = common::truncate_html(
					$max_char,
					$value,
					true // bool isUtf8
				);


			// set the fragment
				$value_fragment = [$text_fragment];
		}


		 return $value_fragment;
	}//end get_value_fragment



	/**
	* SAVE
	* Overwrite component_common method
	* @param bool $update_all_langs_tags_state
	* @param bool $clean_text
	*
	* @return int|null $section_id
	*/
	public function Save(bool $update_all_langs_tags_state=false, bool $clean_text=true) : ?int {

		// update_all_langs_tags_state
		// we review the labels to update their status in the other languages
		// to avoid an infinite loop, in the 'Save' order of the updates, we will pass '$update_all_langs_tags_state=false'
			// if ($update_all_langs_tags_state===true) {
			// 	$this->update_all_langs_tags_state();
			// }

		// Dato current assigned
			$dato_current = $this->dato;

		// clean dato
			if ($clean_text && !empty($dato_current)) {
				foreach ($dato_current as $key => $current_value) {
					if (!empty($current_value)) {
						$dato_current[$key] = TR::comform_tr_data($current_value);
					}
				}
			}

		// Set dato again (cleaned)
			$this->dato = $dato_current;

		// From here, we save in the standard way. Expected int $section_id
			$section_id = parent::Save();


		return $section_id;
	}//end Save



	/**
	* GET_LOCATORS_OF_TAGS
	* (!) Called by observer numisdata563 of section_tipo: numisdata41 (legends)
	* Resolve the data from text_area for a mark and get the locators to be used as dato
	* @param object $options
	* @return array $ar_locators
	*/
	public function get_locators_of_tags(object $options) : array {

		// options
			$ar_mark_tag = $options->ar_mark_tag ?? ['svg'];

		// default value
			$ar_locators = [];

		// data
			$data			= $this->get_dato() ?? [];
			$current_data	= reset($data); // (!) Note that only one value is expected in component_text_area but format is array
			if (empty($current_data)) {
				return $ar_locators;
			}

		// ar_mark_tag iteration
			foreach ($ar_mark_tag as $current_tag) {

				$pattern = TR::get_mark_pattern($current_tag);
				preg_match_all($pattern, $current_data, $ar_tag);

				// Array result key 7 is the locator stored in the result of the preg_match_all
				$data_key = 7;

				// The locator inside the tag are with ' and is necessary change to "
				foreach ($ar_tag[$data_key] as $pseudo_locator) {
					$current_locator = str_replace("'", "\"", $pseudo_locator);
					$current_locator = json_decode($current_locator);
					if(!in_array($current_locator, $ar_locators)){
						$ar_locators[] = $current_locator;
					}
				}
			}

		return $ar_locators;
	}//end get_locators_of_tags



	/**
	* GET DATO DEFAULT
	* Overwrite common_function
	* @return string|null $dato
	*/
		// public function get_dato_default_lang() : ?string {

		// 	$dato = parent::get_dato_default_lang();
		// 	$dato = !empty($dato)
		// 		? TR::add_tag_img_on_the_fly($dato)
		// 		: $dato;

		// 	return $dato;
		// }//end get_dato_default_lang



	/**
	* GET_VALOR_EXPORT
	* Return component value sent to export data
	* @return string|null $valor_export
	*/
	public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

		$valor_export = $this->get_valor($lang);
		#$valor_export = br2nl($valor_export);
		#dump($valor_export, ' valor_export ++ '."$this->tipo - $this->parent".to_string());

		#$valor_export = strip_tags($valor_export);
		#$valor_export = htmlspecialchars_decode($valor_export);
		#$valor_export = html_entity_decode($valor_export);

		return $valor_export;
	}//end get_valor_export



	/**
	* DECODE DATO HTML
	* (!) Removed 22-05-2023 because no one calls here
	* @param string $string_value
	* @return string
	*/
		// public static function decode_dato_html(string $string_value) : string {

		// 	return !empty($string_value)
		// 		? htmlspecialchars_decode($string_value)
		// 		: $string_value;
		// }//end decode_dato_html



	/**
	* UPDATE ALL LANGS TAGS STATE
	* (!) Removed 22-05-2023 because no one calls here
	* Actualiza el estado de las etiquetas:
	* Revisa el texto completo, comparando fragmento a fragmento, y si detecta que algún fragmento ha cambiado
	* cambia sus etiquetas a estado 'r'
	* @return $ar_changed_tags (key by lang)
	*/
		// protected function update_all_langs_tags_state() {
		// 	return true;
		// 	// die(__METHOD__." EN PROCESO");
		// 	/*
		// 	$ar_changed_tags 	= array();
		// 	$ar_changed_records = array();

		// 	if (!$this->id) return $ar_changed_tags;

		// 	# Previous dato
		// 	# re-creamos este objeto para obtener el dato previo a las modificaciones
		// 	$previous_obj 		= new component_text_area($this->id, $this->tipo);
		// 	$previous_raw_text	= $previous_obj->get_dato();

		// 	# Current dato
		// 	$current_text 		= $this->dato;
		// 	# Clean current dato
		// 	$current_raw_text 	= TR::limpiezaPOSTtr($current_text);

		// 	# Search tags
		// 	$matches 		= $this->get_ar_relation_tags();
		// 	$key 	 		= 0;
		// 	if (empty($matches[$key])) {
		// 		return $ar_changed_tags ;
		// 	}

		// 	# Eliminamos duplicados (las etiquetas in/out se devuelven igual, como [index-n-1],[index-n-1])
		// 	$ar_tags = array_unique($matches[$key]);

		// 	# iterate all tags comparing fragments
		// 	if(is_array($ar_tags)) foreach ($ar_tags as $tag) {

		// 		# Source fragment
		// 		$source_fragment_text = component_text_area::get_fragment_text_from_tag( $tag_id, $tag_type, $previous_raw_text )[0];
		// 		# Target fragment
		// 		$target_fragment_text = component_text_area::get_fragment_text_from_tag( $tag_id, $tag_type, $current_raw_text )[0];

		// 		if ($source_fragment_text != $target_fragment_text) {
		// 			$ar_changed_tags[] = $tag;
		// 		}

		// 	}
		// 	$ar_final['changed_tags']	= $ar_changed_tags;

		// 	# Ya tenemos calculadas las etiquetas de los fragmentos que han cambiado
		// 	if (count($ar_changed_tags)===0) {
		// 		# no hay etiquetas a cambiar
		// 		$ar_final['changed_records'] = NULL;
		// 	}else{
		// 		# Recorremos los registros del resto de idiomas actualizando el estado de las etiquetas coincidentes a 'r' (para revisar)
		// 		$arguments=array();
		// 		$arguments['parent']	= $this->get_parent();
		// 		$arguments['tipo']		= $this->get_tipo();
		// 		$matrix_table 			= common::get_matrix_table_from_tipo($this->get_section_tipo());
		// 		$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
		// 		$ar_result				= $RecordObj_matrix->search($arguments);

		// 		foreach ($ar_result as $id_matrix) {

		// 			$component_text_area= new component_text_area($id_matrix, $this->get_tipo() );
		// 			$current_lang 		= $component_text_area->get_lang();
		// 			if ($current_lang != $this->lang) {

		// 				$text_raw 			= $component_text_area->get_dato();
		// 				$text_raw_updated 	= self::change_tag_state( $ar_changed_tags, $state='r', $text_raw );
		// 				$component_text_area->set_dato($text_raw_updated);
		// 				$component_text_area->Save(false);	# Important: arg 'false' is mandatory for avoid infinite loop
		// 				$ar_changed_records[] = $id_matrix;
		// 			}
		// 		}
		// 		$ar_final['changed_records']= $ar_changed_records;
		// 	}

		// 	return $ar_final;
		// 	*/
		// }//end update_all_langs_tags_state



	/**
	* CHANGE TAG STATE
	* Changes the tag state from given tag inside the text
	* Sample: [index-n-1] -> [index-r-1]
	* @param string $tag (formatted as tag in, like [index-n-1])
	* @param string $state = 'r'
	* @param string $text_raw = ''
	*
	* @return string $text_raw_updated
	*/
	public static function change_tag_state(string $tag, string $state='r', string $text_raw='') : string {

		// Default unchanged text
		$text_raw_updated = $text_raw;

		$id = TR::tag2value($tag);

		// match. Pattern allow both tags, in and out
		$pattern = TR::get_mark_pattern(
			'index', // string $mark
			true, // bool $standalone
			false, // bool|int $id
			false //bool data
		);
		preg_match_all($pattern, $text_raw, $matches);

		foreach ((array)$matches[3] as $value) {
			if ($value==$id) {

				$type = strpos($tag, '[/index')!==false
					? 'indexOut'
					: (strpos($tag, '[index')!==false
						? 'indexIn'
						: $matches[1][0]);

				$label	= $matches[5][0];
				$data	= $matches[6][0];

				// new tag build
				$new_tag = TR::build_tag($type, $state, $id, $label, $data);

				// replace only the state tag char
				$text_raw_updated = str_replace($tag, $new_tag, $text_raw);

				break; // actually, only first match is parsed
			}
		}


		return $text_raw_updated;
	}//end change_tag_state



	/**
	* GET AR REALATION TAGS
	* We look for occurrences of the indexIn tag pattern (defined in class TR)
	* @return array $matches
	* 	Returns an array with all occurrences, of the type: 'indexIn' formatted
	* 	sample:
	*
	*	pattern: /([index-([a-z])-([0-9]{1,6})])/
	*	result :
	*	[0] => Array
	*		(
	*			[0] => [index-n-5]
	*			[1] => [index-n-4]
	*			[2] => [index-n-3]
	*		)
	*	[1] => Array
	*		(
	*			[0] => [index-n-5]
	*			[1] => [index-n-4]
	*			[2] => [index-n-3]
	*		)
	*	[2] => Array
	*		(
	*			[0] => n
	*			[1] => n
	*			[2] => n
	*		)
	*	[3] => Array
	*		(
	*			[0] => 5
	*			[1] => 4
	*			[2] => 3
	*		)
	*/
		// public function get_ar_relation_tags() : ?array {

		// 	// Get raw dato from Database - We get the raw data from the database
		// 	$dato = $this->get_dato();
		// 	if (empty($dato)) {
		// 		return null;
		// 	}

		// 	$matches = null;

		// 	// We look for occurrences of the indexIn tag pattern (defined in class TR)
		// 	$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=true);

		// 	// Search math pattern tags
		// 	preg_match_all($pattern,  $dato,  $matches, PREG_PATTERN_ORDER);

		// 	return $matches;
		// }//end get_ar_relation_tags



	/**
	* GET FRAGMENT TEXT FROM TAG
	* @param string $tag_id
	* 	Like '1'
	* @param string $tag_type
	* 	Like: 'index'
	* @param string $raw_text
	* @return object|null $fragment_object
	* [
	* 	$fragment_text, // string like 'text enclosed by tags xxx to /xxx'
	*	$tag_in_pos, // int like 1
	*	$tag_out_pos // int like 1234
	* ]
	*/
	public static function get_fragment_text_from_tag(string $tag_id, string $tag_type, string $raw_text) : ?object {

		// check tag_id, tag_type are valid
			if(empty($tag_id) || empty($tag_type)) {
				debug_log(__METHOD__
					. " Error: tag_id is invalid. " . PHP_EOL
					.' tag_id: '   . $tag_id . PHP_EOL
					.' tag_type: ' . $tag_type . PHP_EOL
					.' raw_text: ' . $raw_text
					, logger::ERROR
				);
				if(SHOW_DEBUG) {
					error_log( 'get_fragment_text_from_tag : '.print_r(debug_backtrace(),true) );
				}
				return null;
			}

		// empty $raw_text case
			if (empty($raw_text)) {
				return null;
			}

		// tag build (based on tag_type)
			switch ($tag_type) {

				case 'index':
					$tag_in  = TR::get_mark_pattern(
						'indexIn',
						false, // bool standalone
						$tag_id, // string|bool $id
						false // bool $data
					);
					$tag_out = TR::get_mark_pattern(
						'indexOut',
						false, // bool standalone
						$tag_id, // string|bool $id
						false // bool $data
					);
					break;

				default:
					debug_log(__METHOD__
						." Error: Invalid tag type: $tag_type "
						, logger::ERROR
					);
					return null; // stop here !
					break;
			}

		// Build in/out regex pattern to search
		$regexp = $tag_in ."(.*)". $tag_out;

		// Search fragment_text
			// Dato raw from matrix db
			$dato = $raw_text;
			if( preg_match_all("/$regexp/", $dato, $matches, PREG_SET_ORDER|PREG_OFFSET_CAPTURE) ) {

				$key_fragment = 3;
				foreach($matches as $match) {
					if (isset($match[$key_fragment][0])) {

						$fragment_text = $match[$key_fragment][0];

						// Clean fragment_text
							if (!empty($fragment_text)) {
								$fragment_text	= TR::deleteMarks($fragment_text);
								$fragment_text	= htmlspecialchars_decode($fragment_text);
							}

						// tag in position
						$tag_in_pos = $match[0][1];

						// tag out position
						$tag_out_pos = $tag_in_pos + mb_strlen($match[0][0]);

						// tag_in like "[index-n-9--data::data]"
						$tag_in		= $match[1][0];
						// tag_out like "[/index-n-9--data::data]"
						$tag_out	= $match[4][0];

						$fragment_object = (object)[
							'text'			=> $fragment_text,
							'tag_in_pos'	=> $tag_in_pos,
							'tag_out_pos'	=> $tag_out_pos,
							'tag_in'		=> $tag_in,
							'tag_out'		=> $tag_out
						];

						return $fragment_object;
					}
				}
			}

		return null;
	}//end get_fragment_text_from_tag



	/**
	* GET_PLAIN_TEXT
	* Get only the text without tags or HTML
	* Used in publication to search
	* @return string $text
	*/
	public function get_plain_text() : string {

		$raw_data = $this->get_value();

		// empty text
		$text = '';

		# Clean
		if(!empty($raw_data)) {
			$text	= TR::deleteMarks($raw_data);
			$text	= strip_tags($text);
		}

		return $text;
	}//end get_plain_text




	/**
	* CLEAN_RAW_TEXT_FOR_PREVIEW
	* (!) Removed 22-05-2023 because no one calls here
	* Used when we have a raw text from database and we want show a preview for tool time machine list for example
	* @return string $text
	*/
		// public static function clean_raw_text_for_preview(string $raw_text) : string {

		// 	$text = $raw_text;

		// 	# Clean fragment_text
		// 	if(!empty($text)) {
		// 		$text	= TR::deleteMarks($text);
		// 		$text	= html_entity_decode($text);
		// 	}

		// 	return $text;
		// }//end clean_raw_text_for_preview



	/**
	* GET_FRAGMENTS_TEXT_BY_TC
	* (!) Removed 22-05-2023 because no one calls here
	* Explode text by timecode such as [TC_00:00:23.235_TC]
	* @param string $raw_text (String transcription complete as raw text with all tags)
	* @return array $ar_fragments
	*/
		// public static function get_fragments_text_by_tc(string $raw_text) : array {

		// 	// explode by TC pattern
		// 	$pattern_tc = TR::get_mark_pattern(
		// 		'tc_full',
		// 		true // bool standalone
		// 	);
		// 	$ar_fragments = preg_split($pattern_tc, $raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);

		// 	return $ar_fragments;
		// }//end get_fragments_text_by_tc



	/**
	* GET FRAGMENT TEXT FROM REL LOCATOR
	* (!) Removed 22-05-2023 because no one calls here
	* Resolves the tag from rel_locator and calls component_text_area::get_fragment_text_from_tag($tag, $raw_text)
	* to return the searched fragment
	* Note: A fragment can be called, both from a relation locator and from an indexing one.
	* @param $rel_locator (Object like '{rel_locator:{section_id : "55"}, {section_id : "oh1"},{component_tipo:"oh25"} }')
	*
	* @see static component_text_area::get_fragment_text_from_tag($tag_id, $tag_type, $raw_text)
	* 	Used by section_records/rows/rows.php to display the fragment in listings
	* @return array|null $fragment
	*/
		// public static function get_fragment_text_from_rel_locator(object $rel_locator, int $key=0) : ?array {

		// 	// # INDEXATION TAG
		// 	// if ( preg_match("/dd.{1,32}\.[0-9]{1,32}\.[0-9]{1,32}\.dd.{1,32}\.[0-9]{1,32}/", $rel_locator) ) {
		// 	// 	$tag_obj = component_common::get_locator_as_obj($rel_locator);
		// 	// }
		// 	// # RELATION TAG
		// 	// else if ( preg_match("/[0-9]{1,32}\.dd.{1,32}\.[0-9]{1,32}/", $rel_locator) ) {
		// 	// 	$tag_obj = component_common::get_locator_relation_as_obj($rel_locator);
		// 	// }
		// 	// # INVALID LOCATOR
		// 	// else{

		// 	if (empty($rel_locator)) {
		// 		debug_log(__METHOD__." rel_locator $rel_locator is not valid! ".to_string(), logger::ERROR);
		// 		if(SHOW_DEBUG===true) {
		// 			dump($rel_locator, '$rel_locator');
		// 		}
		// 		return null;
		// 	}

		// 	$section_tipo	= $rel_locator->section_tipo;
		// 	$section_id		= $rel_locator->section_id;
		// 	$component_tipo	= $rel_locator->component_tipo;
		// 	$tag_id			= $rel_locator->tag_id;

		// 	switch ($rel_locator->type) {
		// 		case DEDALO_RELATION_TYPE_INDEX_TIPO:
		// 			$tag_type = 'index';
		// 			break;
		// 		case DEDALO_RELATION_TYPE_STRUCT_TIPO:
		// 			$tag_type = 'struct';
		// 			break;
		// 		default:
		// 			debug_log(__METHOD__." Making fallback to index because rel_locator->type is NOT DEFINED in locator ".to_string($rel_locator), logger::ERROR);
		// 			$tag_type = 'index';
		// 			break;
		// 	}

		// 	$component_text_area = component_common::get_instance(
		// 		'component_text_area',
		// 		$component_tipo,
		// 		$section_id,
		// 		'edit', // string mode
		// 		DEDALO_DATA_LANG, // string lang
		// 		$section_tipo
		// 	);
		// 	$dato					= $component_text_area->get_dato();
		// 	$raw_text				= $dato[$key] ?? ''; // Note that key is zero by default
		// 	$fragment_text_from_tag	= component_text_area::get_fragment_text_from_tag(
		// 		$tag_id,
		// 		$tag_type,
		// 		$raw_text
		// 	);

		// 	return $fragment_text_from_tag;
		// }//end get_fragment_text_from_rel_locator



	/**
	* DELETE_TAG_FROM_ALL_LANGS
	* Search all component data langs and delete tag an update (save) dato on every lang
	* (!) This method Save the result if data changes on each lang
	* @see tool_indexation 'delete_tag'
	*
	* @param string $tag_id
	* 	like '[index-n-2]'
	* @param string $tag_type
	* @return array $ar_langs_changed
	* 	Array of affected langs
	*/
	public function delete_tag_from_all_langs(string $tag_id, string $tag_type) : array {

		$model_name			= get_class($this);
		$component_ar_langs	= (array)$this->get_component_ar_langs();

		$ar_langs_changed = array();
		foreach ($component_ar_langs as $current_lang) {

			$component_text_area = component_common::get_instance(
				$model_name, // component_text_area
				$this->tipo,
				$this->parent,
				$this->mode,
				$current_lang,
				$this->section_tipo,
				false // bool cache
			);
			$dato = $component_text_area->get_dato();
			if (empty($dato)) {
				continue;
			}

			$to_save	= false;
			$new_dato	= [];
			foreach ($dato as $key => $text_raw) {

				$delete_tag_from_text = (object)self::delete_tag_from_text(
					$tag_id, // string tag_id like '1'
					$tag_type, // string tag_type like 'index'
					$text_raw
				);
				$remove_count = (int)$delete_tag_from_text->remove_count;
				if ($remove_count>0) {
					$to_save = true;
				}
				$text_raw_updated = $delete_tag_from_text->result;
				// add
				$new_dato[] = $text_raw_updated;
			}//end foreach ($dato as $key => $current_text_raw)

			if ($to_save===true) {

				$component_text_area->set_dato($new_dato);
				// save
				$component_text_area->Save();
				$ar_langs_changed[] = $current_lang;
				debug_log(__METHOD__
					." Deleted tag ($tag_id, $tag_type, $key) in lang ".to_string($current_lang)
					, logger::WARNING
				);
			}else{
				debug_log(__METHOD__
					. " Ignored (not matches found) deleted tag ($tag_id, $tag_type, $key) in lang: " . PHP_EOL
					. 'current_lang: '.to_string($current_lang)
					, logger::WARNING
				);
			}
		}//end foreach ($component_ar_langs as $current_lang)


		return $ar_langs_changed;
	}//end delete_tag_from_all_langs



	/**
	* DELETE TAG FROM TEXT
	* Removes the tag in the given text returning the modified text
	* @param string $tag_id
	* @param string $tag_type
	* @param string $text_raw
	*
	* @return object $response
	*/
	public static function delete_tag_from_text(string $tag_id, string $tag_type, string $text_raw) : object {

		// Pattern for in and out tags
			$pattern = TR::get_mark_pattern(
				$tag_type,
				true, // bool standalone
				$tag_id, // string|bool $id
				false // bool data
			);

		// Will replace matched tags with a empty string
			$replacement		= '';
			$text_raw_updated	= preg_replace($pattern, $replacement, $text_raw, -1, $remove_count);

		// response
			$response = new stdClass();
				$response->result		= $text_raw_updated;
				$response->remove_count	= $remove_count;
				$response->msg			= 'OK. Request done';


		return $response;
	}//end delete_tag_from_text



	/**
	* FIX_BROKEN_INDEX_TAGS
	* Add missing tags to given raw_text
	* @see component_text_area.json
	* @param string $raw_text
	* @return object $response
	* {
	* 	result : string $raw_text,
	* 	msg : string $msg . Sample: 'Please review position of blue tags'
	* 	total : string $total . Total time in ms
	* }
	*/
	public function fix_broken_index_tags(string $raw_text) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result = false;
			$response->msg 	  = null;

		// short vars
			$index_tag_id	= 3;
			$draw_tag_id	= 3;
			$changed_tags	= 0;

		// matches_indexIn. index in tags
			$pattern = TR::get_mark_pattern(
				'indexIn', // string mark
				false // bool standalone
			);
			preg_match_all($pattern, $raw_text, $matches_indexIn, PREG_PATTERN_ORDER);

		// matches_indexOut. index out tags
			$pattern = TR::get_mark_pattern(
				'indexOut', // string mark
				false // bool standalone
			);
			preg_match_all($pattern,  $raw_text,  $matches_indexOut, PREG_PATTERN_ORDER);

		// matches_draw. Draw tags
			$pattern = TR::get_mark_pattern(
				'draw', // string mark
				false // bool standalone
			);
			preg_match_all($pattern,  $raw_text,  $matches_draw, PREG_PATTERN_ORDER);

		// index in missing
			$ar_missing_indexIn = [];
			foreach ($matches_indexOut[$index_tag_id] as $key => $value) {
				if (!in_array($value, $matches_indexIn[$index_tag_id])) {
					$tag_out				= $matches_indexOut[0][$key];
					$tag_in					= str_replace('[/', '[', $tag_out);
					$ar_missing_indexIn[]	= $tag_in;
					// Add deleted tag
					$tag_in					= self::change_tag_state( $tag_in, $state='d', $tag_in );	// Change state to 'd'
					$pair					= $tag_in.''.$tag_out;	// concatenate in-out
					$raw_text				= str_replace($tag_out, $pair, $raw_text);
					$changed_tags++;
				}
			}

		// index out missing
			$ar_missing_indexOut = [];
			foreach ($matches_indexIn[$index_tag_id] as $key => $value) {
				if (!in_array($value, $matches_indexOut[$index_tag_id])) {
					$tag_in					= $matches_indexIn[0][$key];	// As we only have the in tag, we create out tag
					$tag_out				= str_replace('[', '[/', $tag_in);
					$ar_missing_indexOut[]	= $tag_out;
					# Add deleted tag
					$tag_out				= self::change_tag_state( $tag_out, $state='d', $tag_out );	// Change state to 'd'
					$pair					= $tag_in.''.$tag_out;	// concatenate in-out
					$raw_text				= str_replace($tag_in, $pair, $raw_text);
					$changed_tags++;
				}
			}

		// Index
		// thesaurus indexations integrity verify
			$ar_indexations				= $this->get_component_tags_data('index');
			$ar_indexations_tag_id_raw	= [];
			foreach ($ar_indexations as $locator) {
				if(!property_exists($locator,'tag_id')) continue;
				// add tag_id
				$ar_indexations_tag_id_raw[] = $locator->tag_id;
			}

		// Draw
		// thesaurus draw indexations integrity verify
			$ar_draw_indexations			= $this->get_component_tags_data('draw');
			$ar_draw_indexations_tag_id_raw	= [];
			foreach ($ar_draw_indexations as $locator) {
				if(!property_exists($locator,'tag_id')) continue;
				// add tag_id
				$ar_draw_indexations_tag_id_raw[] = $locator->tag_id;
			}

		// clean index duplicates
			$ar_indexations_tag_id = array_values(
				array_unique($ar_indexations_tag_id_raw)
			);

		// clean draw duplicates
			$ar_draw_indexations_tag_id = array_values(
				array_unique($ar_draw_indexations_tag_id_raw)
			);

		// add tags
			$added_tags = 0;

			// Index
			if (!empty($ar_indexations_tag_id)) {

				$all_text_tags = array_unique(
					array_merge($matches_indexIn[$index_tag_id], $matches_indexOut[$index_tag_id])
				);

				foreach ($ar_indexations_tag_id as $current_tag_id) {
					if (!in_array($current_tag_id, $all_text_tags)) {
						#$new_pair = "[index-d-{$current_tag_id}][/index-d-{$current_tag_id}] ";

						$tag_in		= TR::build_tag('indexIn',  'd', $current_tag_id, '', '');
						$tag_out	= TR::build_tag('indexOut', 'd', $current_tag_id, '', '');
						$new_pair	= $tag_in . $tag_out;

						$raw_text	= $new_pair . $raw_text;
						$added_tags++;
					}
				}
			}//end if (!empty($ar_indexations_tag_id)) {

			// Draw
			if (!empty($ar_draw_indexations_tag_id)) {

				$all_text_tags = array_unique( $matches_draw[$draw_tag_id] );
				foreach ($ar_draw_indexations_tag_id as $current_tag_id) {
					if (!in_array($current_tag_id, $all_text_tags)) {

						$tag_draw	= TR::build_tag('draw', 'd', $current_tag_id, $current_tag_id.':', '');

						$raw_text	= $tag_draw . $raw_text;
						$added_tags++;
					}
				}
			}//end if (!empty($ar_indexations_tag_id)) {

		// response result
			$response->result = $raw_text;

		// response messages
			if ($added_tags>0 || $changed_tags>0) {

				$response->msg 	  = strtoupper(label::get_label('warning')).": ";	// WARNING

				if($added_tags>0) {
					// deleted index tags was created at beginning of text.
					$response->msg .= sprintf(" %s ".label::get_label('index_tags_deleted'),$added_tags);
				}

				if($changed_tags>0) {
					// broken index tags was fixed.
					$response->msg .= sprintf(" %s ".label::get_label('index_tags_fixed'),$changed_tags);
				}

				$response->msg .= ' '.label::get_label('review_tags'); // Please review position of blue tags

				$response->total = round(start_time()-$start_time,4)*1000 .' ms';
			}


		return $response;
	}//end fix_broken_index_tags



	/**
	* PLACE_BROKEN_TAG_IN_APPROXIMATE_POSITION (DES)
	* @return string $raw_text
	*/
		// public function place_broken_tag_in_approximate_position DEPRECATED(string $raw_text, string $tag_in, string $tag_out, string $tag_id, string $source_lang) : string {

		// 	$blank_space = " ";

		// 	# Search existing tag in original lang
		// 	# source_lang is user selected as source lang of current text in edit mode
		// 	if ($this->lang===$source_lang) {
		// 		// Lang is the original. No references exists..
		// 		$raw_text = $tag_in ." Deleted tag $tag_id ". $tag_out . $blank_space . $raw_text;

		// 	}else{
		// 		// Lang is different. Check the source lang for additional data
		// 		$component 		= component_common::get_instance(get_class($this),
		// 														 $this->tipo,
		// 														 $this->parent,
		// 														 $this->mode,
		// 														 $source_lang,
		// 														 $this->section_tipo);
		// 		$source_raw_text = $component->get_dato();

		// 		# INDEX IN
		// 		$pattern = TR::get_mark_pattern('structIn',$standalone=false, $tag_id); //$mark, $standalone=true, $id=false, $data=false, $state=false
		// 		preg_match($pattern,  $source_raw_text,  $matches_indexIn, PREG_OFFSET_CAPTURE);
		// 		if (empty($matches_indexIn[0][0])) {
		// 			// No. tag not found in original lan. Not exists the same tag in the original lang ...
		// 			$raw_text = $tag_in . " Deleted tag $tag_id (tag not exists in original lang $source_lang) " . $tag_out . $blank_space . $raw_text;

		// 		}else{
		// 			// Yes. Founded current broken tag in the original lang. Lets go..
		// 			# GET KNOWED FULL STRUCT TAG DATA FROM SOURCE ;-)
		// 			# Override tag_in and out calculated with real full data locator
		// 			$tag_in_full = $matches_indexIn[0][0];
		// 			preg_match("/data:(.*):data/", $tag_in_full, $output_array);
		// 			$data_locator = $output_array[1];
		// 			if (!empty($output_array[1])) {
		// 				$tag_in  = preg_replace("/(data:.*:data)/", 'data:'.$data_locator.':data', $tag_in);
		// 				$tag_out = preg_replace("/(data:.*:data)/", 'data:'.$data_locator.':data', $tag_out);
		// 			}

		// 			$raw_text = $tag_in ." Deleted tag " . $tag_id . " (tag found in original lang $source_lang) ". $tag_out . $blank_space . $raw_text;


		// 		}//end if (empty($matches_indexIn[0][0]))

		// 	}//end if ($this->lang===$source_lang)


		// 	return $raw_text;
		// }//end place_broken_tag_in_approximate_position



	/**
	* GET_RELATED_COMPONENT_AV_TIPO
	* Search in struct for related component_av tipo
	* @return string|null $related_component_av_tipo
	*/
	public function get_related_component_av_tipo() : ?string {

		$related_component_av = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
			$this->tipo,  // string tipo
			'component_av', // string model
			'termino_relacionado' // string relation_type
		);

		$related_component_av_tipo = $related_component_av[0] ?? null;

		return $related_component_av_tipo;
	}//end get_related_component_av_tipo



	/**
	* GET_RELATED_COMPONENT_select_lang
	* @return string|null $tipo
	*/
	public function get_related_component_select_lang() : ?string {

		$related_component_select_lang = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
			$this->tipo,  // string tipo
			'component_select_lang', // string model
			'termino_relacionado' // string relation_type
		);

		$related_component_select_lang_tipo = $related_component_select_lang[0] ?? null;

		return $related_component_select_lang_tipo;
	}//end get_related_component_select_lang



	/**
	* GET_COMPONENT_TAGS_DATA
	* Indexations, references, draw tags in v6 are direct data from portal configured in
	* component_text_area properties 'tags_index', 'tags_references'
	* Defined in Ontology as (sample from rsc36):
	* {
	*	"tags_index": {
	*		"tipo": "rsc860",		// target component_portal tipo
	*		"section_id": "self",	// auto-solved current section_id
	*		"section_tipo": "self"	// auto-solved current section_tipo
	*	}
	* }
	* @param string $tag_type, used to get the configuration in properties
	* @return array $ar_tags_data
	* 	Array of component_portal dato locators
	*/
	public function get_component_tags_data( string $tag_type='index' ) : array {

		$properties	= $this->get_properties();

		// tags_config
			$tags_name		= 'tags_'.$tag_type;
			$tags_config	= $properties->$tags_name ?? null;
			if(empty($tags_config)) {
				return [];
			}

		// short vars
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;
			$component_tipo	= $tags_config->tipo;

		// component portal where the indexations are stored (v6 are direct instead v5 reverse pointers)
			$model_name		= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
			$componet_index	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

		$ar_tags_data = $componet_index->get_dato() ?? [];


		return $ar_tags_data;
	}//end get_component_tags_data



	/**
	* GET_TAGS_DATA_AS_TERM_ID
	* Used for diffusion global search (temporally??????)
	* @see diffusion global search needs
	* @param string $tag_type // the type of the tag as 'index', 'reference', 'draw'
	* @param string $type
	* @return string $string_ar_term_id
	* 	JSON encoded array
	*/
	public function get_tags_data_as_term_id(string $tag_type='index', string $type=DEDALO_RELATION_TYPE_INDEX_TIPO) : string {  // DEDALO_RELATION_TYPE_INDEX_TIPO

		$ar_term_id = [];

		$locators = $this->get_component_tags_data($tag_type);
		foreach ($locators as $locator) {

			// compound term_id from locator section_tipo and section_id
			$term_id = $locator->section_tipo.'_'.$locator->section_id;

			$ar_term_id[] = $term_id;
		}//end foreach ($locators as $locator)

		// string value JSON encoded array
		$string_ar_term_id = json_encode($ar_term_id);


		return $string_ar_term_id;
	}//end get_tags_data_as_term_id




	/**
	* GET_COMPONENT_INDEXATIONS_TERM_ID
	* Used for diffusion global search (temporally??????)
	* @see diffusion global search needs
	* @param string $type
	* @return string $string_ar_term_id
	* 	JSON encoded array
	*/
	public function get_component_indexations_term_id(string $type) : string {  // DEDALO_RELATION_TYPE_INDEX_TIPO

		return $this->get_tags_data_as_term_id( 'index', $type );
	}//end get_component_indexations_term_id




	/**
	* GET_TAGS_DATA_AS_TERMS
	* Used for diffusion global search
	* @see diffusion global search needs
	* @param string $tag_type // the type of the tag as 'index', 'reference', 'draw'
	* @param array $format array|test // output format
	* @param string $separator, | // when the format is text the  separator to use between values
	* @return array $ar_terms
	*/
	public function get_tags_data_as_terms(string $tag_type='index', string $format='array', string $separator=' | ') : array {  // DEDALO_RELATION_TYPE_INDEX_TIPO
		/*
		# Search relation index in hierarchy tables
		*/
		$tags_data = $this->get_component_tags_data( $tag_type );

		$ar_indexation_terms	= [];
		$ar_indextaion_obj		= [];
		foreach ($tags_data as $key => $current_tag_data) {

			$locator = new locator();
				$locator->set_section_tipo($current_tag_data->section_tipo);
				$locator->set_section_id($current_tag_data->section_id);
				$locator->set_component_tipo($current_tag_data->from_component_tipo);

			#$term_id = $current_tag_data->section_tipo.'_'.$current_tag_data->section_id;
			$term = ts_object::get_term_by_locator($locator);

			$ar_indexation_terms[] = $term;

			$indextaion_obj = new stdClass();
				$indextaion_obj->data	= $current_tag_data;
				$indextaion_obj->label	= $term;
			$ar_indextaion_obj[] = $indextaion_obj;
		}//end foreach ($tags_data as $key => $current_tag_data)
		#dump($ar_indexation_terms, ' ar_indexation_terms ++ '.to_string());

		if ($format==='text') {
			$ar_terms = implode($separator, $ar_indexation_terms);	//json_encode($ar_indexation_terms);
		}else{
			$ar_terms = $ar_indextaion_obj;
		}
		#dump($ar_terms, ' ar_terms ++ '.to_string());

		return $ar_terms;
	}//end get_tags_data_as_terms




	/**
	* GET_COMPONENT_INDEXATIONS_TERMS
	* Used for diffusion global search
	* @see diffusion global search needs
	* @return array $ar_terms
	*/
	public function get_component_indexations_terms(string $format='array', string $separator=' | ') : array {  // DEDALO_RELATION_TYPE_INDEX_TIPO
		/*
		# Search relation index in hierarchy tables
		*/
		$ar_terms = $this->get_tags_data_as_terms('index', $format, $separator);

		return $ar_terms;
	}//end get_component_indexations_terms



	/**
	* GET_ANNOTATIONS
	* Used for diffusion global search annotations
	* @see diffusion global search needs
	* @return array|null $ar_terms
	*/
	public function get_annotations() : ?array {

		$lang		= $this->get_lang();
		$properties	= $this->get_properties();

		// tag notes
			$tags_notes	= $properties->tags_notes ?? null;
			if(empty($tags_notes)) {
				return null;
			}

		// dato
			$dato = $this->get_dato();
			if(empty($dato)){
				return null;
			}

		$ar_annotations = [];
		foreach ($dato as $key => $current_dato) {
			if(empty($current_dato)){
				continue;
			}
			$pattern = TR::get_mark_pattern('note', $standalone=true);
			preg_match_all($pattern,  $current_dato,  $matches, PREG_PATTERN_ORDER);
			if (empty($matches[0])) {
				$ar_annotations[] = null;
				continue;
			}
			// the $mach[7] get the data of the tag, it has the locator of the note
			foreach ($matches[7] as $current_note) {

				// empty note case (current_note must be a locator stringnified and replaced double quotes by single)
				if (empty($current_note)) {
					debug_log(__METHOD__
						." Ignored empty note data " .PHP_EOL
						.' current note:' . to_string($current_note)
						, logger::ERROR
					);
					continue;
				}

				// replace the ' for the standard " to be JSON compatible
				$locator_string = str_replace('\'','"',$current_note);

				// decode de string to object
				$locator					= json_decode($locator_string);
				$section_tipo				= $locator->section_tipo;
				$ar_notes_section_ddo_map	= $tags_notes->$section_tipo;

				$note_obj = new stdClass();
					$note_obj->data	= $locator;
				foreach ($ar_notes_section_ddo_map as $current_ddo) {

					$note_component_tipo	= $current_ddo->component_tipo;
					$note_component_model	= RecordObj_dd::get_modelo_name_by_tipo($note_component_tipo,true);

					$note_section_tipo		= $locator->section_tipo;
					$note_section_id		= $locator->section_id;

					$translatable			= RecordObj_dd::get_translatable($note_component_tipo);
					$current_component		= component_common::get_instance(
						$note_component_model,
						$note_component_tipo,
						$note_section_id,
						'list',
						($translatable) ? $lang : DEDALO_DATA_NOLAN,
						$note_section_tipo
					);
					$dato		= $current_component->get_dato();
					$note_type	= $current_ddo->id;

					if ($current_ddo->type === 'bool') {
						$dato = !empty($dato) && ($dato[0]->section_id === '1')
							? true
							: false;
					}

					$note_obj->$note_type = $dato;
				}

				$ar_annotations[] = $note_obj;
			}//end foreach ($matches[7] as $current_note)
		}//end foreach ($dato as $key => $current_dato)


		return $ar_annotations;
	}//end get_component_indexations_terms



	/**
	* GET_DIFFUSION_OBJ (DEPRECATED)
	* @param object $properties
	* @return object $diffusion_obj
	*/
		// public function get_diffusion_obj(object $properties) : object {

		// 	$diffusion_obj = parent::get_diffusion_obj( $properties );
		// 	/*
		// 	$diffusion_obj->component_name		= get_class($this);
		// 	$diffusion_obj->parent 				= $this->get_parent();
		// 	$diffusion_obj->tipo 				= $this->get_tipo();
		// 	$diffusion_obj->lang 				= $this->get_lang();
		// 	$diffusion_obj->label 				= $this->get_label();
		// 	$diffusion_obj->columns['valor']	= $this->get_valor();
		// 	*/

		// 	$section_tipo = $this->section_tipo;

		// 	if(isset($properties['rel_locator'])) {

		// 		$rel_locator_obj	= $properties['rel_locator'];
		// 		#$rel_locator		= component_common::build_locator_from_obj( $rel_locator_obj );
		// 		$fragment_info		= component_text_area::get_fragment_text_from_rel_locator( $rel_locator_obj );
		// 		$texto				= $this->get_dato()[0];

		// 		# FRAGMENT
		// 		$diffusion_obj->columns['fragment']	= $fragment_info[0];

		// 		# RELATED
		// 		$current_related_tipo 	= RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($rel_locator_obj->component_tipo, $model_name='component_', $relation_type='termino_relacionado');

		// 		# No related term is present
		// 		if(empty($current_related_tipo[0])) return $diffusion_obj;

		// 		$current_related_tipo = $current_related_tipo[0];
		// 		$related_model_name  = RecordObj_dd::get_modelo_name_by_tipo($current_related_tipo,true);

		// 		switch ($related_model_name) {

		// 			case 'component_av':

		// 				// TC
		// 				$tag_in_pos		= $fragment_info[1];
		// 				$tag_out_pos	= $fragment_info[2];

		// 				$tc_in = OptimizeTC::optimize_tc_in(
		// 					$texto, // string text
		// 					null, // string|null indexIN
		// 					(int)$tag_in_pos, // int|null start_position
		// 					0 // int in_margin
		// 				);
		// 				$tc_out = OptimizeTC::optimize_tc_out(
		// 					$texto, // string text
		// 					null, // string|null indexOUT
		// 					(int)$tag_out_pos, // int|null end_position
		// 					100 // int in_margin
		// 				);
		// 				$tcin_secs		= OptimizeTC::TC2seg($tc_in);
		// 				$tcout_secs		= OptimizeTC::TC2seg($tc_out);
		// 				$duracion_secs	= $tcout_secs - $tcin_secs;
		// 				$duracion_tc	= OptimizeTC::seg2tc($duracion_secs);

		// 				$diffusion_obj->columns['related_tipo']	= $current_related_tipo;
		// 				$diffusion_obj->columns['related']		= $related_model_name;
		// 				$diffusion_obj->columns['tc_in']		= $tc_in;
		// 				$diffusion_obj->columns['tc_out']		= $tc_out;
		// 				$diffusion_obj->columns['duracion_tc']	= $duracion_tc;
		// 				$diffusion_obj->columns['tcin_secs']	= $tcin_secs;
		// 				$diffusion_obj->columns['tcout_secs']	= $tcout_secs;

		// 				#$component_av   = new component_av($current_related_tipo, $this->get_parent(), 'edit');
		// 				$component_av   = component_common::get_instance(
		// 					$related_model_name,
		// 					$current_related_tipo,
		// 					$this->get_parent(),
		// 					'list',
		// 					DEDALO_DATA_LANG,
		// 					$section_tipo
		// 				);
		// 				$video_id 		= $component_av->get_video_id();

		// 				$diffusion_obj->columns['video_id']	= $video_id;
		// 				#$diffusion_obj->columns['video_url']	= $duracion_tc;
		// 				break;

		// 			case 'component_image':

		// 				break;

		// 			case 'component_geolocation':

		// 				break;

		// 			default:
		// 				throw new Exception("Error Processing Request. Current related $related_model_name is not valid. Please configure textarea for this media ", 1);
		// 		}
		// 	}

		// 	return $diffusion_obj;
		// }//end get_diffusion_obj



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a MySQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value(?string $lang=null, ?object $option_obj=null) : ?string {

		$dato = $this->get_dato();  # Important: use raw text (!)

		// Decode entities
			$diffusion_value = isset($dato[0]) && !empty($dato[0])
				? html_entity_decode( strval($dato[0]) )
				: null;

		if (!empty($diffusion_value)) {

			// remove empty paragraphs
				if ($diffusion_value==='<p></p>' || $diffusion_value==='<p> </p>') {
					$diffusion_value = '';
				}

			// change p by br to preserve v5 compatibility (ck/tiny)
				$diffusion_value = preg_replace('/(<p>)/i', '<br>', $diffusion_value);
				$diffusion_value = preg_replace('/(<\/p>)/i', '', $diffusion_value);

			// Remove first br
				if(mb_strpos($diffusion_value,'<br />')===0) {
					$diffusion_value = mb_substr($diffusion_value, 6, mb_strlen($diffusion_value));
				}
				if(mb_strpos($diffusion_value,'<br>')===0) {
					$diffusion_value = mb_substr($diffusion_value, 4, mb_strlen($diffusion_value));
				}

			// Remove last br
				if(mb_substr($diffusion_value, mb_strlen($diffusion_value)-6)=='<br />' ) {
					$diffusion_value = mb_substr($diffusion_value, 0, -6);
				}
				if(mb_substr($diffusion_value, mb_strlen($diffusion_value)-4)=='<br>' ) {
					$diffusion_value = mb_substr($diffusion_value, 0, -4);
				}

			// Compatibility of the reference tad in the html_text cases
			// set the references as v5, with tag locator as text
				$legacy_model = RecordObj_dd::get_legacy_model_name_by_tipo($this->tipo);
				if( $legacy_model === 'component_html_text' ){
					// check if the component has a tags_reference component associated
					// if the component has, the references need to be change into a text ref in data-data property.
					$tags_reference_tipo = $this->properties->tags_reference->tipo;
					if( isset($tags_reference_tipo) ){

						$model = RecordObj_dd::get_modelo_name_by_tipo($tags_reference_tipo, true);

						// create the component relation with saved the references
						$reference_tags_component = component_common::get_instance(
							$model,
							$tags_reference_tipo,
							$this->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$this->section_tipo,
							false
						);
						$ar_reference_locators = $reference_tags_component->get_dato();

						// get all references
						$all_reference_tags		= null;
						$pattern_all_reference	= TR::get_mark_pattern(
							'reference', // string mark
							true // bool standalone
						);
						// Search math pattern tags
						preg_match_all($pattern_all_reference, $diffusion_value, $all_reference_tags, PREG_PATTERN_ORDER);

						// in and out references
						$ar_full_references = $all_reference_tags[0];

						// key 6 is the data stored in the result of the preg_match_all
						// key 3 is the id
						// key 5 is the label
						// The locator data are with " and is necessary change to '
						foreach ($all_reference_tags[3] as $match_key => $tag_id) {
							// process only the the in tags
							if ($match_key % 2 == 0) {

								$text = $all_reference_tags[6][$match_key] ?? '';
								// locate the locator associated to the tag
								$tag_locator = array_find($ar_reference_locators, function($locator) use( $tag_id ){
									return ( (int)$locator->tag_id === (int)$tag_id && $locator->tag_type === 'reference');
								});
								if(is_object($tag_locator)){
									// transform to text html compatible.
									$text_locator	= json_encode($tag_locator);
									$data_string	= str_replace('"', '\'',  $text_locator);
									// create reference tag and assign it to the text
									$new_reference_tag	= '[reference-n-'.$tag_id.'-reference '.$tag_id.'-data:['.$data_string.']:data]';
									$search				= '/'.preg_quote($ar_full_references[$match_key], '/').'/';
									$diffusion_value	= preg_replace($search, $new_reference_tag, $diffusion_value, 1);
									// check the out reference
									if (!isset($ar_full_references[$match_key+1]) || strpos($ar_full_references[$match_key+1], '[/reference')!==0) {
										debug_log(__METHOD__
											. " Bad reference tag " . PHP_EOL
											. " match_key " . $match_key . PHP_EOL
											. ' ar_full_references: ' . to_string($ar_full_references)
											, logger::ERROR
										);
									}else{
										// create the out tag reference
										$new_reference_tag	= '[/reference-n-'.$tag_id.'-reference '.$tag_id.'-data:'.$data_string.':data]';
										$search				= '/'.preg_quote($ar_full_references[$match_key+1], '/').'/';
										$diffusion_value	= preg_replace($search, $new_reference_tag, $diffusion_value, 1);
									}// end if (!isset($ar_full_references[$match_key+1])
								}// end if(isset($tag_locator))
							}// end if ($match_key % 2 == 0
						}// end foreach ($all_reference_tags[3] as $match_key => $tag_id)

						// change the reference tag to html equivalent
							$diffusion_value = TR::add_tag_img_on_the_fly($diffusion_value);

					}// end if( isset($tags_reference_tipo)
				}// end if( $legacy_model === 'component_html_text' )
		}


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_DIFFUSION_VALUE_WITH_IMAGES
	* Used in diffusion (see properties) for resolve the links of the svg and images inside the text_area
	* @return string $diffusion_value_with_images
	*/
	public function get_diffusion_value_with_images() : string {

		$valor = $this->get_valor($this->lang);

		$diffusion_value_with_images = $valor;

		// remove empty paragraphs
			if ($diffusion_value_with_images==='<p></p>' || $diffusion_value_with_images==='<p> </p>') {
				$diffusion_value_with_images = '';
			}

		return (string)$diffusion_value_with_images;
	}//end get_diffusion_value_with_images



	/**
	* GET_DESCRIPTORS
	* Return all descriptors associated to index tag of current raw text or fragment
	* looking for index in tags inside
	* @return array $ar_descriptors
	*/
		// public static function get_descriptors_DES( $raw_text, $section_tipo, $section_id, $component_tipo, $type='index' ) {

		// 	$ar_descriptors = array();

		// 	# Search index in locators
		// 	# INDEX IN
		// 	#$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=false);
		// 	$pattern = TR::get_mark_pattern($type.'In', $standalone=true);
		// 	preg_match_all($pattern,  $raw_text,  $matches_indexIn, PREG_PATTERN_ORDER);
		// 	$total_indexIn = 0;
		// 	if (!empty($matches_indexIn[0])) {
		// 		$total_indexIn = count($matches_indexIn[0]);
		// 	}

		// 	if ($total_indexIn===0) {
		// 		return $ar_descriptors;
		// 	}

		// 	$full_tag = $matches_indexIn[0][0];
		// 	$tag_id_key = 4;
		// 	foreach ($matches_indexIn[$tag_id_key] as $key => $tag_id) {

		// 		if ($type==="struct") {
		// 			$ar_index = component_relation_struct::get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id, DEDALO_DATA_LANG);
		// 		}else{
		// 			$ar_index = component_relation_index::get_indexations_from_tag($component_tipo, $section_tipo, $section_id, $tag_id, DEDALO_DATA_LANG);
		// 		}

		// 		$ar_descriptors[$full_tag] = $ar_index;
		// 	}


		// 	return (array)$ar_descriptors;
		// }//end get_descriptors


	/**
	* GET_AR_RELATED_SECTIONS
	* get the ar_related_section object to use for persons tags
	* @return object related_sections
	*/
	public function get_related_sections() : object {

		$current_locator = new locator();
			$current_locator->section_tipo	= $this->section_tipo;
			$current_locator->section_id	= $this->section_id;

		$sqo = new search_query_object();
			$sqo->section_tipo			= ['all'];
			$sqo->mode					= 'related';
			$sqo->full_count			= false;
			$sqo->filter_by_locators	= [$current_locator];

		// sections. Get the related_list of the related sections it include some information component to identify the related section.
		$sections = sections::get_instance(
			null,
			$sqo,
			$this->section_tipo, // string caller_tipo
			'related_list',
			$this->lang
		);
		$related_sections = $sections->get_json();


		return $related_sections;
	}//end get_ar_related_sections



	/**
	* GET_TAGS_PERSONS
	* Get available tags for insert in text area. Interviewed, informants, etc..
	* @param string $related_section_tipo = TOP_TIPO
	* @param  array $ar_related_sections = []
	* @return array $ar_tags_inspector
	*/
	public function get_tags_persons(string $related_section_tipo=TOP_TIPO, array $ar_related_sections=[]) : array {

		$tags_persons = array();

		$section_id			= $this->get_section_id();
		// $section_tipo	= $this->get_section_tipo();

		$properties = $this->get_properties();
		if (!isset($properties->tags_persons)) {
			debug_log(__METHOD__
				." Warning: empty properties for tags_persons [properties->tags_persons] (related_section_tipo: $related_section_tipo)" .PHP_EOL
				.' properties: ' . to_string($properties)
				, logger::WARNING
			);
			return $tags_persons;
		}
		elseif (!isset($properties->tags_persons->$related_section_tipo)) {
			debug_log(__METHOD__
				." Warning: bad top_tipo for tags_persons (related_section_tipo: $related_section_tipo)" .PHP_EOL
				.' properties: ' . to_string($properties)
				, logger::WARNING
			);
			return $tags_persons;
		}

		// Recalculate indirectly
		// ar_references is an array of section_id
			$ar_references = array_filter($ar_related_sections, function($element) use($related_section_tipo){
				return $element->section_tipo === $related_section_tipo;
			}); //$this->get_ar_tag_references($obj_value->section_tipo, $obj_value->component_tipo);

		// Resolve obj value
			$ar_objects = [];
			foreach ((array)$properties->tags_persons->{$related_section_tipo} as $obj_value) {

				// set parent to the section_tipo, the $key of the properties {"oh1":"component_tipo": "oh24",...}
				$obj_value->parent = $related_section_tipo;

				if ($obj_value->section_tipo===$this->section_tipo) {

					$obj_value->section_id = $section_id; // inject current record section id (parent)

					// Add directly
					$ar_objects[] = $obj_value;

				}else{

					if (empty($ar_references)) {

						debug_log(__METHOD__
							.' Warning: empty ar_references on calculate section_id from inverse locators' . PHP_EOL
							.' tipo: ' . $this->tipo . PHP_EOL
							.' section_tipo: ' . $this->section_tipo . PHP_EOL
							.' section_id: ' . $this->section_id . PHP_EOL
							.' ar_related_sections: '.to_string($ar_related_sections) . PHP_EOL
							.' properties: ' . to_string($properties)
							, logger::WARNING
						);

					}else{

						foreach ($ar_references as $reference_locator) {

							$new_obj_value = clone $obj_value;
								$new_obj_value->section_id = $reference_locator->section_id;

							// Add from reference
							$ar_objects[] = $new_obj_value;
						}
					}
				}
			}

		$resolved = [];
		foreach ($ar_objects as $obj_value) {

			$current_section_tipo	= $obj_value->section_tipo;
			$current_section_id		= $obj_value->section_id;
			$current_component_tipo	= $obj_value->component_tipo;
			$current_state			= $obj_value->state;
			$current_tag_id			= !empty($obj_value->tag_id) ? $obj_value->tag_id : 1;

			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$current_component_tipo,
				$current_section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$current_section_tipo
			);
			// TAG
			$dato = $component->get_dato();
			foreach ($dato as $current_locator) {

				$lkey = $current_locator->section_tipo .'_' .$current_locator->section_id;
				if (in_array($lkey, $resolved)) {
					continue;
				}

				# Add current component tipo to locator stored in tag
				#$current_locator->component_tipo = $current_component_tipo;

				$data_locator = new locator();
					$data_locator->set_section_tipo($current_locator->section_tipo);
					$data_locator->set_section_id($current_locator->section_id);
					$data_locator->set_component_tipo($current_locator->from_component_tipo);

				# Label
				$label = (object)component_text_area::get_tag_person_label($data_locator);

				# Tag
				$tag_person = self::build_tag_person(array(
					'state'		=> $current_state,
					'tag_id'	=> $current_tag_id,
					'label'		=> $label->initials,
					'data'		=> $data_locator
				));
				$element = new stdClass();
					$element->type			= 'person';
					$element->section_tipo	= $obj_value->section_tipo;
					$element->section_id	= $obj_value->section_id;
					$element->tag			= $tag_person;
					#$element->tag_image	= TR::add_tag_img_on_the_fly($element->tag);
					$element->role			= $label->role;  // RecordObj_dd::get_termino_by_tipo($current_component_tipo,DEDALO_APPLICATION_LANG,true);
					$element->full_name		= $label->full_name;

					$element->state			= $current_state;
					$element->tag_id		= $current_tag_id;
					$element->label			= $label->initials;
					$element->data			= $data_locator;

				$tags_persons[] = $element;

				$resolved[] = $lkey;
			}
		}


		return $tags_persons; // array
	}//end get_tags_persons



	/**
	* BUILD_PERSON
	* Format like [person-q-Pepe%20lópez%20de%20l'horta%20y%20Martínez-data:{locator}:data]
	* @param array $ar_data
	* [
	* 	tag_id => 1,
	* 	state => n,
	* 	label => tag label
	* 	data => JSON stringify data
	* ]
	* @return string $person_tag
	*/
	public function build_tag_person(array $ar_data) : string {

		// data
			$tag_id			= $ar_data['tag_id'];
			$state			= $ar_data['state'];
			$label			= !empty($ar_data['label'])
				? trim($ar_data['label'])
				: '';
			$locator		= $ar_data['data'];

		// short vars
			$type			= 'person';
			$locator_json	= json_encode($locator);
			$data			= $locator_json;

		// tag
			$person_tag	= TR::build_tag($type, $state, $tag_id, $label, $data); 	// '[person-'.$state.'-'.$label.'-data:'.$locator_json.':data]';
			// $person_tag = '[person-data:'.$section_tipo.'_'.$section_id.':data]';


		return $person_tag;
	}//end build_tag_person



	/**
	* GET_TAG_PERSON_LABEL
	* Build tag label to show in transcriptions tag image of persons
	* @param object locator
	* @return object $label
	*/
	public static function get_tag_person_label(object $locator) : object {

		# Fixes tipos
		$ar_tipos = [
			'name'		=> 'rsc85',
			'surname'	=> 'rsc86'
		];

		$label = new stdClass();
			$label->initials	= '';
			$label->full_name	= '';
			$label->role		= '';

		if (isset($locator->component_tipo)) {
			$label->role = RecordObj_dd::get_termino_by_tipo($locator->component_tipo,DEDALO_APPLICATION_LANG,true);
		}

		foreach ($ar_tipos as $key => $tipo) {

			$model_name	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component		= component_common::get_instance(
				$model_name,
				$tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			$dato = $component->get_valor();

			switch ($key) {

				case 'name':
					$label->initials	.= mb_substr($dato,0,3);
					$label->full_name	.= $dato;
					break;

				case 'surname':
					if (!empty($dato)) {
						$ar_parts = explode(' ', $dato);
						if (isset($ar_parts[0])) {
							$label->initials .= mb_substr($ar_parts[0],0,2);
						}
						if (isset($ar_parts[1])) {
							$label->initials .= mb_substr($ar_parts[1],0,2);
						}
						$label->full_name .= ' '.$dato;
					}
					break;

				default:
					break;
			}
		}


		return (object)$label;
	}//end get_tag_person_label



	/**
	* PERSON_USED
	* (!) Method to disappear. Used in v5 to precalculate
	* if some person is used in current section
	* @param object $locator
	* @return array $ar_section_id
	*/
		// public static function person_used(object $locator) : array {

		// 	$ar_section_id = array();

		// 	// Search in all transcriptions looking tags from this person
		// 	$section_id   = $locator->section_id;
		// 	$section_tipo = $locator->section_tipo;

		// 	// Like '%''section_id'':''137'',''section_tipo'':''rsc194''%'::text
		// 	$search_string = "''section_id'':''$section_id'',''section_tipo'':''$section_tipo''";

		// 	$matrix_table = common::get_matrix_table_from_tipo(DEDALO_SECTION_RESOURCES_AV_TIPO);

		// 	$strQuery = "
		// 	SELECT a.section_id, a.section_tipo
		// 	FROM \"$matrix_table\" a
		// 	WHERE
		// 	 -- audiovisual resource section
		// 	 a.section_tipo = 'rsc167'
		// 	 AND
		// 	 -- search pseudo locator in all langs
		// 	 a.datos#>>'{components, rsc36, dato}' ILIKE '%".$search_string."%'::text;
		// 	";

		// 	$result = JSON_RecordObj_matrix::search_free($strQuery);
		// 	$n_rows = pg_num_rows($result);
		// 	while ($rows = pg_fetch_assoc($result)) {
		// 		$ar_section_id[] = $rows['section_id'];
		// 	}

		// 	return (array)$ar_section_id;
		// }//end person_used



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load dato to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// Force loads dato always !IMPORTANT
		$dato = $this->get_dato();

		if (!empty($dato) && isset($dato[0])) {

			$old_tc_pattern = '/(\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2})_TC\])/';

			$new_dato = [];
			foreach ($dato as $value) {

				if (is_null($value)) {
					continue;
				}

				// Converts old timecodes
				$new_value = preg_replace($old_tc_pattern, "[TC_$2.000_TC]", (string)$value);

				// convert tag paths from ../../../inc/btn.php/[geo-n-1-] to ../component_text_area/tag/?id=[geo-n-1-]
				// <img id="[geo-n-1-]" src="../../../inc/btn.php/[geo-n-1-]" class="geo" data-type="geo" data-tag_id="1" data-state="n" data-label="" data-data="{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[-2.01936392737486,42.645594932190519]}}]}" />
				// @todo

				$new_dato[] = $new_value;
			}

			$this->set_dato($new_dato);
		}


		// Save component data. Defaults arguments: $update_all_langs_tags_state=false, $clean_text=true
		$this->Save(
			false, // bool update_all_langs_tags_state
			true // bool clean_text
		);


		return true;
	}//end regenerate_component



	/**
	* BUILD_GEOLOCATION_DATA
	* This method is v6 rebuilt to mimic v5 version. Note that now, georef data is no longer stored
	* into the tag HTML dataset, but is moved to related component_geolocation
	* @param bool $geojson = false
	* @return array $ar_elements
	*/
	public function build_geolocation_data(bool $geojson=false) : array {

		$ar_elements = [];

		// current component_text_area dato. (!) Its not necessary, only compute component_geolocation
			// $dato = $this->get_dato();
			// // empty dato case
			// 	if (empty($dato)) {
			// 		return [];
			// 	}

		// find data in related component_geolocation
			$component_geolocation_model = 'component_geolocation';
			$ar_related_by_model = component_common::get_ar_related_by_model(
				$component_geolocation_model,
				$this->tipo,
				true
			);

			if (empty($ar_related_by_model[0])) {
				debug_log(__METHOD__
					. " ERROR: Ignored not found component_geolocation related with current " . PHP_EOL
					. ' component_tipo: '. $this->tipo . PHP_EOL
					. ' section_tipo: '. $this->section_tipo . PHP_EOL
					. ' section:id: '. $this->section_id
					, logger::WARNING
				);
				return [];
			}
			$component_geolocation_tipo	= $ar_related_by_model[0];
			$component_geolocation		= component_common::get_instance(
				$component_geolocation_model, // string model
				$component_geolocation_tipo, // string tipo
				$this->section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$this->section_tipo, // string section_tipo
				false
			);

		// component_geolocation data
			$component_geolocation_dato = $component_geolocation->get_dato();
			// empty dato case
			if (empty($component_geolocation_dato)) {
				return [];
			}
			$lib_data = $component_geolocation_dato[0]->lib_data ?? null;
			if (empty($lib_data)) {
				return [];
			}

			// (!) Currently, consistency between component_text_area and component_geolocation cannot be guaranteed.
			// Therefore, the data in component_geolocation will be used
			foreach ($lib_data as $layer) {

				if ($geojson===true) {

					// full GEOJSON case

					$layer_data = $layer->layer_data ?? null;

				}else{

					// simple coordinates case (default)

					// layer data filtered
					$layer_data = [];
					if ($layer->layer_data && $layer->layer_data->features) {
						foreach ($layer->layer_data->features as $feature) {
							if (isset($feature->geometry)) {
								$layer_data[] = (object)[
									'type' => $feature->geometry->type,
									'lon' => $feature->geometry->coordinates[0] ?? null,
									'lat' => $feature->geometry->coordinates[1] ?? null
								];
							}
						}
					}
				}

				$current_value = (object)[
					'layer_id'		=> $layer->layer_id,
					'text'			=> '', // only to maintain v5 diffusion format
					'layer_data'	=> $layer_data
				];

				// add
				$ar_elements[] = $current_value;
			}

		// compare result
			$geo_tags	= [];
			$dato		= $this->get_dato();
			$raw_text	= $dato[0] ?? '';
			// split by pattern
			$pattern_geo_full = TR::get_mark_pattern('geo_full',$standalone=true);
			$result 		  = preg_split($pattern_geo_full, $raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);
			foreach ((array)$result as $geo_tag) {
				if (strpos($geo_tag,'[geo-')===0) {
					$geo_tags[] = $geo_tag;
				}
			}
			if (count($geo_tags)!==count($ar_elements)) {
				debug_log(__METHOD__
					. " ERROR. The number of tags and geodata layers is different! " . PHP_EOL
					. ' component_tipo: ' . $this->tipo . PHP_EOL
					. ' section_tipo: ' . $this->section_tipo . PHP_EOL
					. ' section:id: ' . $this->section_id . PHP_EOL
					. ' geo_tags: ' . json_encode($geo_tags, JSON_PRETTY_PRINT) . PHP_EOL
					. ' layers: '   . json_encode($ar_elements, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
			}


		return $ar_elements;
	}//end build_geolocation_data



	/**
	* BUILD_GEOLOCATION_DATA DES
	* @param array|null $raw_data
	* @param bool $geojson = false
	* @return array $ar_elements
	*/
		// public static function build_geolocation_data(?array $raw_data, bool $geojson=false, string $component_tipo) : array {

		// 	// empty raw_data case
		// 		if (empty($raw_data)) {
		// 			return [];
		// 		}

		// 	// Test data
		// 		// $request_raw_text = '[geo-n-1--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.10389792919159,41.393728914379295]}}]}:data]&nbsp;Texto dos';
		// 		// $request_options->raw_text = '[geo-n-1--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.10389792919159,41.393728914379295]}}]}:data]&nbsp;Texto dos';
		// 		// $request_options->raw_text = 'Hola que tal [geo-n-1--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.097785,41.393268]}}]}:data]Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;[geo-n-2--data:{\'type\':\'FeatureCollection\',\'features\':[{\'type\':\'Feature\',\'properties\':{},\'geometry\':{\'type\':\'Point\',\'coordinates\':[2.10389792919159,41.393728914379295]}}]}:data] Texto dos';

		// 		// $raw_text = str_replace("'", '"', $raw_text);

		// 		// [geo-n-1-data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.097785,41.393268]}}]}:data]
		// 		// "(\[geo-[a-z]-[0-9]{1,6}-[^-]{0,22}?-data:.*?:data\])";

		// 	// only first element of the data
		// 	$raw_text = reset($raw_data);

		// 	// des
		// 		// $response = new stdClass();
		// 		// 	$response->result = false;
		// 		// 	$response->msg 	  = 'Error. Request build_geolocation_data failed';

		// 		// $pattern = TR::get_mark_pattern('geo',false);
		// 		// $result  = free_node::pregMatchCapture($matchAll=true, $pattern, $options->raw_text, $offset=0);

		// 	// split by pattern
		// 	$pattern_geo_full = TR::get_mark_pattern('geo_full',$standalone=true);
		// 	$result 		  = preg_split($pattern_geo_full, $raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);

		// 	//  sample result
		// 		// [0] => [geo-n-1--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.097785,41.393268]}}]}:data]
		// 		//    [1] => Bateria antiaèria de Sant Pere Màrtir. Esplugues de Llobregat&nbsp;
		// 		//    [2] => [geo-n-2--data:{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[2.10389792919159,41.393728914379295]}}]}:data]
		// 		//    [3] => &nbsp;Texto dos

		// 	$format_text = function($text) {
		// 		$text	= str_replace("&nbsp;"," ",$text);
		// 		$text	= trim($text);
		// 		return $text;
		// 	};

		// 	$ar_elements	= array();
		// 	$pattern_geo	= TR::get_mark_pattern('geo',$standalone=true);
		// 	$key_tag_id		= 4;
		// 	$key_data		= 7;
		// 	foreach ((array)$result as $key => $value) {
		// 		if (strpos($value,'[geo-')===0) {

		// 			$tag_string  = $value; // like '[geo-n-1--data:[1]:data]'
		// 			$next_row_id = (int)($key+2);
		// 			$text 		 = '';
		// 			if (isset($result[$next_row_id]) && strpos($result[$next_row_id],'[geo-')!==0 && strpos($result[$next_row_id],'-')!==0 && strpos($result[$next_row_id],'{\'type')!==0) { // && strpos($result[$next_row_id],'{\'type')!==0 && trim($result[$next_row_id])!=='-'
		// 				$text = $format_text( $result[$next_row_id] );
		// 			}elseif (isset($result[$next_row_id+1]) && strpos($result[$next_row_id+1],'[geo-')!==0 && strpos($result[$next_row_id+1],'-')!==0 && strpos($result[$next_row_id+1],'{\'type')!==0) { // {\u0027type
		// 				$text = $format_text( $result[$next_row_id+1] );
		// 			}elseif (isset($result[$next_row_id+2]) && strpos($result[$next_row_id+2],'[geo-')!==0 && strpos($result[$next_row_id+2],'-')!==0 && strpos($result[$next_row_id+2],'{\'type')!==0) { // {\u0027type
		// 				$text = $format_text( $result[$next_row_id+2] );
		// 			}
		// 			// JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES
		// 			if (!empty($text)) {
		// 				$text = json_encode($text, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
		// 			}

		// 			preg_match_all($pattern_geo, $value, $matches);
		// 			$layer_id = (int)$matches[$key_tag_id][0];
		// 			$geo_data = $matches[$key_data][0];

		// 			# Skip empty values
		// 			if (!empty($geo_data)) {

		// 				$geo_data = str_replace('\'', '"', $geo_data);
		// 				$geo_data = json_decode($geo_data);

		// 				if ($geojson===true) {

		// 					$layer_data = $geo_data;

		// 				}else{

		// 					$layer_data = array();
		// 					if(!empty($geo_data->features)){
		// 						foreach ((array)$geo_data->features as $key => $feature) {
		// 							$lon = isset($feature->geometry->coordinates[0]) ? $feature->geometry->coordinates[0] : null;
		// 							$lat = isset($feature->geometry->coordinates[1]) ? $feature->geometry->coordinates[1] : null;

		// 							$object = new stdClass();
		// 								$object->lon	= $lon;
		// 								$object->lat	= $lat;
		// 								$object->type	= $feature->geometry->type;
		// 							$layer_data[] = $object;
		// 						}
		// 					}
		// 				}


		// 				$element = new stdClass();
		// 					$element->layer_id 		= $layer_id;
		// 					$element->text 			= $text;
		// 					$element->layer_data	= $layer_data;

		// 				$ar_elements[] = $element;
		// 			}
		// 		}
		// 	}//end foreach ((array)$result as $key => $value)


		// 	return $ar_elements;
		// }//end build_geolocation_data



	/**
	* RESOLVE_QUERY_OBJECT_SQL
	* @return object $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		# Always set fixed values
		$query_object->type = 'string';

		// Note that $query_object->q v6 is array (before was string) but only one element is expected. So select the first one
		$q = is_array($query_object->q) ? reset($query_object->q) : $query_object->q;
		$q = pg_escape_string(DBi::_getConnection(), stripslashes($q));

		switch (true) {
			# IS NULL
			case ($q==='!*'):
				// old
					// $operator = 'IS NULL';
					// $q_clean  = '';
					// $query_object->operator = $operator;
					// $query_object->q_parsed	= $q_clean;
					// $query_object->unaccent = false;

					// $clone = clone($query_object);
					// 	$clone->operator = '~*';
					// 	$clone->q_parsed = '\'.*""\'';

					// $logical_operator = '$or';
					// $new_query_json = new stdClass;
					// 	$new_query_json->$logical_operator = [$query_object, $clone];
					// # override
					// $query_object = $new_query_json ;

				$operator	= 'IS NULL';
				$q_clean	= '';

				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;
				$query_object->lang		= 'all';

				$logical_operator = '$or';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// Search empty only in current lang
				// Resolve lang based on if is translatable
					$path_end		= end($query_object->path);
					$component_tipo	= $path_end->component_tipo;
					$lang			= RecordObj_dd::get_translatable($component_tipo)===true
						? DEDALO_DATA_LANG
						: DEDALO_DATA_NOLAN;

					$clone = clone($query_object);
						$clone->operator	= '=';
						$clone->q_parsed	= '\'[null]\'';
						$clone->lang		= $lang;

					$new_query_json->$logical_operator[] = $clone;

					// legacy data (set as null instead [])
					$clone = clone($query_object);
						$clone->operator	= 'IS NULL';
						$clone->lang		= $lang;

					$new_query_json->$logical_operator[] = $clone;

				// langs check all
					// $ar_query_object = [];
					// $ar_all_langs 	 = common::get_ar_all_langs();
					// $ar_all_langs[]  = DEDALO_DATA_NOLAN; // Added no lang also
					// foreach ($ar_all_langs as $current_lang) {
					// 	// Empty data is blank array []
					// 	$clone = clone($query_object);
					// 		$clone->operator = '=';
					// 		$clone->q_parsed = '\'""\'';
					// 		$clone->lang 	 = $current_lang;

					// 	$ar_query_object[] = $clone;

					// 	// legacy data (set as null instead [])
					// 	$clone = clone($query_object);
					// 		$clone->operator = 'IS NULL';
					// 		$clone->lang 	 = $current_lang;

					// 	$ar_query_object[] = $clone;
					// }

					// #$new_query_json->$logical_operator = array_merge($new_query_json->$logical_operator, $ar_query_object);
					// $new_query_json->$logical_operator = $ar_query_object;

				// override
				$query_object = $new_query_json;
				break;
			# IS NOT NULL
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator	= $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent	= false;

				$clone = clone($query_object);
					//$clone->operator = '!=';
					$clone->operator = '!~';
					$clone->q_parsed = '\'.*""\'';

				$logical_operator ='$and';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object, $clone];

				// Search empty only in current lang
				// Resolve lang based on if is translatable
					$path_end		= end($query_object->path);
					$component_tipo	= $path_end->component_tipo;
					$lang			= RecordObj_dd::get_translatable($component_tipo)===true
						? DEDALO_DATA_LANG
						: DEDALO_DATA_NOLAN;

					// null data in current lang
					$clone = clone($query_object);
						$clone->operator	= 'IS NOT NULL';
						$clone->lang		= $lang;
					$new_query_json->$logical_operator[] = $clone;

					// empty string
					$clone = clone($query_object);
						$clone->operator	= '!=';
						$clone->q_parsed	= '\'[null]\'';
						$clone->lang		= $lang;
					$new_query_json->$logical_operator[] = $clone;

				# override
				$query_object = $new_query_json ;
				break;
			# IS DIFFERENT
			case (strpos($q, '!=')===0):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '!~';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			# IS SIMILAR
			case (strpos($q, '=')===0):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '~';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = true;
				break;
			# NOT CONTAIN
			case (strpos($q, '-')===0):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# CONTAIN
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
			case (substr($q, 0, 1)==='"' && substr($q, -1)==='"'):
				$operator = '~*';
				$q_clean  = str_replace('"', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			# CONTAIN
			default:
				$operator = '~*';
				$q_clean  = $q;
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
		}//end switch (true) {


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
			'"text"'	=> 'literal'
		];

		return $ar_operators;
	}//end search_operators_info



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


		$update_version = implode('.', $update_version);
		switch ($update_version) {

			case '6.2.5':
				if ( !empty($dato_unchanged) ) {

					$data = $dato_unchanged[0];

					// empty values cases ([''],[null])
					if (empty($data)) {

						$response = new stdClass();
							$response->result	= 1;
							$response->new_dato	= null;
							$response->msg		= "[$reference_id] Data were changed from ".to_string($dato_unchanged)." to null.<br />";

						break;
					}

					$to_be_saved = false;

					// update the label of draw tags
						$pattern_draw_tag = TR::get_mark_pattern(
							'draw', // string mark
							true // bool standalone
						);
						// key 7 is the data stored in the result of the preg_match_all
						// key 4 is the id
						// key 6 is the label
						// The layer data is used as label, add the tag_id to it
						// tag_id:layer_id as 8:2, the label indicate both id to be clear
						$data = preg_replace($pattern_draw_tag, "[$2-$3-$4-$4:$6-data:$7:data]", $data, -1, $count);

						$to_be_saved = ( $count>0 );

					// get the properties of the component
					$RecordObj_dd = new RecordObj_dd($tipo);
					$properties = $RecordObj_dd->get_properties();

					// reference
					if( isset($properties->tags_reference) && isset($properties->tags_reference->tipo) ) {

						$html_references = null;
						$html_regex = '/(\<\/{0,1}reference .*? data-data=\\"(.*?)\\">).*?(<\/reference>)/';
						preg_match_all($html_regex,  $data, $html_references, PREG_PATTERN_ORDER);

						if( !empty($html_references) ){

							// key 0 full html reference with the in text and out tag
							// key 1 is the reference in <reference data-data=[]>
							// key 2 is the locator data
							// key 3 is the reference out </reference>
							foreach ($html_references[2] as $match_key => $text_locator) {

								$ref_in		= '[reference-n-'.$match_key.'-reference '.$match_key.'-data:'.$text_locator.':data]';
								$ref_out	= '[/reference-n-'.$match_key.'-reference '.$match_key.'-data:'.$text_locator.':data]';

								// replace the in HTML tag
								$search	= '/'.preg_quote($html_references[1][$match_key], '/').'/';
								$data	= preg_replace($search, $ref_in, $data, 1);
								// replace the out HTML tag
								$search	= '/'.preg_quote($html_references[3][$match_key], '/').'/';
								$data	= preg_replace($search, $ref_out, $data, 1);
							}
						}

						$tags_reference_tipo = $properties->tags_reference->tipo;

						$model = RecordObj_dd::get_modelo_name_by_tipo($tags_reference_tipo, true);

						// create the component relation for save the layers
						$reference_tags_component = component_common::get_instance(
							$model,
							$tags_reference_tipo,
							$options->section_id,
							'edit',
							DEDALO_DATA_NOLAN,
							$options->section_tipo,
							false
						);
						$previous_dato = $reference_tags_component->get_dato();

						// get all out references
						$all_reference_tags = null;
						$pattern_all = TR::get_mark_pattern(
							'reference', // string mark
							true // bool standalone
						);
						// Search math pattern tags
						preg_match_all($pattern_all, $data, $all_reference_tags, PREG_PATTERN_ORDER);

						// in and out references
						$ar_full_references = $all_reference_tags[0];

						// key 6 is the data stored in the result of the preg_match_all
						// key 3 is the id
						// key 5 is the label
						// The layer data inside the tag are with ' and is necessary change to "
						$all_tags_locators = [];
						$count = 1;
						foreach ($all_reference_tags[3] as $match_key => $layer_id) {

							if ($match_key % 2 == 0) {

								$text = $all_reference_tags[6][$match_key] ?? '';


								$tag_id			= $count;
								$count++;
								$data_string	= str_replace('\'', '"', $text);

								$tag_locator 	= json_decode( $data_string );
								$tag_locator = 	!empty( $tag_locator )
									? reset ($tag_locator)
									: null;
								if(isset($tag_locator)){
									$new_tag_locator = new locator();
										$new_tag_locator->set_tag_id( $tag_id );
										$new_tag_locator->set_tag_type( 'reference' );
										$new_tag_locator->set_section_tipo( $tag_locator->section_tipo );
										$new_tag_locator->set_section_id( $tag_locator->section_id );
										$new_tag_locator->set_from_component_tipo( $tags_reference_tipo );

									$all_tags_locators[] = $new_tag_locator;
								}
								$new_reference_tag	= '[reference-n-'.$tag_id.'-reference '.$tag_id.'-data::data]';
								$search				= '/'.preg_quote($ar_full_references[$match_key], '/').'/';
								$data				= preg_replace($search, $new_reference_tag, $data, 1);

								if (!isset($ar_full_references[$match_key+1]) || strpos($ar_full_references[$match_key+1], '[/reference')!==0) {
									debug_log(__METHOD__
										. " Bad reference tag " . PHP_EOL
										. " match_key " . $match_key . PHP_EOL
										. ' ar_full_references: ' . to_string($ar_full_references)
										, logger::ERROR
									);
								}else{
									$new_reference_tag	= '[/reference-n-'.$tag_id.'-reference '.$tag_id.'-data::data]';
									$search				= '/'.preg_quote($ar_full_references[$match_key+1], '/').'/';
									$data				= preg_replace($search, $new_reference_tag, $data, 1);
								}
							}
						}

						if( !empty($all_tags_locators) ){

							$final_references_locator = array_merge($previous_dato, $all_tags_locators);
							$reference_tags_component->set_dato($final_references_locator);
							$reference_tags_component->Save();
						}

						$to_be_saved = true;
					}

					if($to_be_saved===true){

						// fix final dato with new format as array or null
							$new_dato = [$data];

						$response = new stdClass();
							$response->result	= 1;
							$response->new_dato	= $new_dato;
							$response->msg		= "[$reference_id] Data were changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

					}else{
						$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					}
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			case '6.0.0':
				if ( (!empty($dato_unchanged) || $dato_unchanged==='') && !is_array($dato_unchanged)) {

					//  Change the dato from string to array
					// 	From:
					// 		"some text"
					// 	To:
					// 		["some text"]
					//  	(!) change the img tags to new format into the image related component.

					// new dato
					$dato = $dato_unchanged;

					// trim_dato
					$trim_dato = is_string($dato)
						? trim($dato)
						: $dato;

					// related tipo process (component_image, component_geolocation)
						if (!empty($trim_dato)) {
							$ar_realated_tipo = RecordObj_dd::get_ar_terminos_relacionados($tipo, false, true);
							foreach ($ar_realated_tipo as $current_tipo) {

								$model = RecordObj_dd::get_modelo_name_by_tipo($current_tipo, true);
								switch (true) {

									case $model==='component_image':

										// image_component. Create the component relation for save the layers
											$image_component = component_common::get_instance(
												$model,
												$current_tipo,
												$section_id,
												'edit',
												DEDALO_DATA_NOLAN,
												$section_tipo,
												false
											);

										// image_dato
											$image_dato	= $image_component->get_dato();

										// lib_data
											$lib_data = [];
											if(empty($image_dato[0]->lib_data)){
												$raster_layer = new stdClass();
													$raster_layer->layer_id			= 0;
													$raster_layer->user_layer_name	= 'raster';
													$raster_layer->layer_data		= [];

												$lib_data[] = $raster_layer;
											}else{
												$lib_data = $image_dato[0]->lib_data;
											}

										// draw_tags
											$ar_draw_tags = [];
											// get the draw pattern
											$pattern = TR::get_mark_pattern(
												'draw', // string mark
												true // bool standalone
											);
											// Search math pastern tags
											preg_match_all($pattern,  $dato, $ar_draw_tags, PREG_PATTERN_ORDER);
											if(empty($ar_draw_tags) || empty($ar_draw_tags[0])){
												continue 2;
											}

										// Array result key 7 is the layer into the data stored in the result of the preg_match_all
										// The layer data inside the tag are with ' and is necessary change to "
										foreach ($ar_draw_tags[4] as $match_key => $layer_id) {
											$layer_id	= (int)$layer_id;
											$tag_data	= new stdClass();
												$tag_data->layer_id			= $layer_id;
												$tag_data->user_layer_name	= 'layer_'.$layer_id;
												$tag_data->layer_data		= json_decode( str_replace('\'', '"', $ar_draw_tags[7][$match_key]) );
											$ar_layer_key = array_filter($lib_data, function($layer_item, $layer_key) use($layer_id){
												if(isset($layer_item->layer_id) && $layer_item->layer_id==$layer_id){
													return $layer_key;
												}
											},ARRAY_FILTER_USE_BOTH);
											if(empty($ar_layer_key[0])){
												$lib_data[] = $tag_data;
											}else{
												$lib_data[$ar_layer_key[0]] = $tag_data;
											}
										}

										if (isset($image_dato[0])) {
											$image_dato[0]->lib_data = $lib_data;
										}else{
											$image_dato = [(object)[
												'lib_data'		=> $lib_data, // to preserve lib data even when not file is available
												'section_id'	=> $section_id // (!) only to force update when update_dato_version component_image
											]];
										}

										$image_component->set_dato($image_dato);
										$image_component->save();

										// re-create tags with the new simple format
										$dato = preg_replace($pattern, "[$2-$3-$4--data:[$4]:data]", $dato);
										break;

									case $model==='component_geolocation':

										$lib_data = [];

										// create the component relation for save the layers
										$geo_component = component_common::get_instance(
											$model,
											$current_tipo,
											$options->section_id,
											'edit',
											DEDALO_DATA_NOLAN,
											$options->section_tipo,
											false
										);
										$geo_dato = $geo_component->get_dato();
										if(!empty($geo_dato[0]) && !empty($geo_dato[0]->lib_data)) {
											$lib_data = $geo_dato[0]->lib_data;
										}

										$ar_geo_tags = null;
										$pattern = TR::get_mark_pattern(
											'geo', // string mark
											true // bool standalone
										);
										// Search math pattern tags
										preg_match_all($pattern,  $dato, $ar_geo_tags, PREG_PATTERN_ORDER);
										if(empty($ar_geo_tags) || empty($ar_geo_tags[0])){
											continue 2;
										}

										// Array result key 7 is the layer into the data stored in the result of the preg_match_all
										// The layer data inside the tag are with ' and is necessary change to "
										foreach ($ar_geo_tags[4] as $match_key => $layer_id) {

											$layer_id			= (int)$layer_id;
											$layer_data_string	= str_replace('\'', '"', $ar_geo_tags[7][$match_key]);

											$tag_data = new stdClass();
												$tag_data->layer_id		= $layer_id;
												$tag_data->layer_data	= json_decode( $layer_data_string );

											$ar_layer_key = array_filter($lib_data, function($layer_item, $layer_key) use($layer_id){
												if(isset($layer_item->layer_id) && $layer_item->layer_id==$layer_id){
													return $layer_key;
												}
											}, ARRAY_FILTER_USE_BOTH);
											if(empty($ar_layer_key[0])){
												$lib_data[] = $tag_data;
											}else{
												$lib_data[$ar_layer_key[0]] = $tag_data;
											}
										}

										if (empty($geo_dato) || empty($geo_dato[0])) {
											$geo_dato = [ new stdClass() ];
										}

										$geo_dato[0]->lib_data = $lib_data;

										$geo_component->set_dato($geo_dato);
										$geo_component->save();

										// re-create tags with the new simple format
										$dato = preg_replace($pattern, "[$2-$3-$4--data:[$4]:data]", $dato);
										break;
								}
							}
						}

					// update the <br> tag to <p> and </p>, the new editor, ckeditor, it doesn't use <br> as return. (<br> tags are deprecated)
						if (!empty($trim_dato)) {
							$format_dato	= '<p>'.$dato.'</p>';
							$dato			= preg_replace('/(<\/? ?br>)/i', '</p><p>', $format_dato);
						}

					// fix final dato with new format as array or null
						$new_dato = [$dato];

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Data were changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
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
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to dato. Override in other cases.
	* Note that empty array or string are returned as null
	* A param '$options' is added only to allow future granular control of the output
	* @param object $options = null
	* 	Optional way to modify result. Avoid using it if it is not essential
	* @return array|null $list_value
	*/
	public function get_list_value(object $options=null) : ?array {

		// force change lang when is set in related component (rsc36 case)
			$original_lang = $this->get_original_lang();
			if (!empty($original_lang) && $original_lang!==$this->lang) {
				// overwrite lang
				$this->lang	= $original_lang;
			}

		// dato from component
			$dato = $this->get_dato();
			if (empty($dato)) {
				return null;
			}

		// options
			$max_chars = $options->max_chars ?? 130;

		// list_value
			$list_value = [];
			foreach ($dato as $current_value) {

				// empty case
					if ($this->is_empty($current_value)) {
						$list_value[] = '';
						continue;
					}

				// convert the value tags as [svg:...] to html tags as <img src="file.svg".../>
				// (!) Note that some components are using images in view_mini and they
				// need always render the images. E.g. 'numisdata71' in section Types (numisdata3)
					$html_value = TR::add_tag_img_on_the_fly($current_value);

				// truncate the html to max_chars, ensure that the html is correct and tags will close in correct way
					$list_value[] = !empty($html_value)
						? common::truncate_html(
							$max_chars,
							$html_value,
							true // isUtf8
						  )
						: '';
			}

		// restore lang ?
			// if ($this->lang!==$original_lang) {
			// 	$this->lang = $original_lang;
			// }


		return $list_value;
	}//end get_list_value



	/**
	* GET_FALLBACK_LIST_VALUE
	* Used by component_text_area and component_html_text to
	* generate fallback versions of current empty values
	* @param object $options = null
	* @return array|null $list_value
	*/
	public function get_fallback_list_value(object $options=null) : ?array {

		// options
			$max_chars = $options->max_chars ?? 700;

		// dato_fallback. array of each dato array element using fallback
			$dato_fallback = component_common::extract_component_dato_fallback(
				$this,
				DEDALO_DATA_LANG, // lang
				DEDALO_DATA_LANG_DEFAULT // main_lang
			);

			if (empty($dato_fallback)) {
				return null;
			}

		// list_value. Iterate dato_fallback and truncate long text
			$list_value = [];
			foreach ($dato_fallback as $current_value) {

				$value = null;

				if(!empty($current_value)) {
					// replace Dédalo tags by html image tags
						$html_value	= TR::add_tag_img_on_the_fly($current_value);

					// truncate long text to use in list mode
						$value		= common::truncate_html(
							(int)$max_chars, // int maxLength
							$html_value, // string html
							true // bool isUtf8
						);

					// add final ... when is truncated
						if (!empty($value) && strlen($value)<strlen($html_value)) {
							$value .= ' ...';
						}
				}

				$list_value[] = $value;
			}

		return $list_value;
	}//end get_fallback_list_value



	/**
	* GET_FALLBACK_edit_VALUE
	* Used by component_text_area and component_html_text to
	* generate fallback versions of current empty values
	* @param object $options = null
	* @return array|null $list_value
	*/
	public function get_fallback_edit_value(object $options=null) : ?array {

		// options
			$max_chars = $options->max_chars ?? 700;

		// dato_fallback. array of each dato array element using fallback
			$dato_fallback = component_common::extract_component_dato_fallback(
				$this,
				DEDALO_DATA_LANG, // lang
				DEDALO_DATA_LANG_DEFAULT // main_lang
			);

			if (empty($dato_fallback)) {
				return null;
			}

		// list_value. Iterate dato_fallback and truncate long text
			$edit_value = [];
			foreach ($dato_fallback as $current_value) {

				$value = null;

				if(is_string($current_value)) {
					// delete all Dédalo tags
						$string_value = TR::deleteMarks($current_value);

					// delete every tag as paragraph tags
						$string_value = strip_tags($string_value);

					// truncate long text to be used
						$value = common::truncate_text(
							$string_value, // string html
							(int)$max_chars // int maxLength
						);
				}
				$edit_value[] = $value;
			}

		return $edit_value;
	}//end get_fallback_edit_value



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


		// $normalize_value function to be used in any case, $import_value is an object, array or string
		// values need to be HTML compatible with ck-editor
			$normalize_value = function(array $import_value) : array {

				$value = [];
				foreach ($import_value as $text_value) {

					// ignore empty and null values
						if (empty($text_value)) {
							continue;
						}

					$begins_three	= substr($text_value, 0, 3);
					$ends_four		= substr($text_value, -4);

					if($begins_three !== '<p>'){
						$text_value	= '<p>'.$text_value;
					}
					if($ends_four !== '</p>'){
						$text_value	= $text_value.'</p>';
					}
					// replace the <br> tag to <p> and </p>, the new editor, ckeditor, it doesn't use <br> as return. (<br> tags are deprecated)
					$text_value = preg_replace('/(<\/? ?br>)/i', '</p><p>', $text_value);
					// replace the return \n or windows \r to <p>
					$text_value = preg_replace('/(\r\n|\r|\n)/', '</p><p>', $text_value);

					$value[] = $text_value;
				}

				return $value;
			};


		// object | array case
			// Check if is a JSON string. Is yes, decode
			// if data is a object | array it will be the Dédalo format and it's not necessary processed
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$dato_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				if(is_array($dato_from_json)){
					$value = $normalize_value($dato_from_json);
				}else if (is_object($dato_from_json)) {
					foreach ($dato_from_json as $key => $current_values) {
						$ar_values = is_array($current_values)
							? $current_values
							: [$current_values];

						$value = $normalize_value($ar_values);
						$dato_from_json->$key = $value ;
					}
				}

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

				// inport_value is a string
				$value = !empty($import_value) || $import_value==='0'
				? $normalize_value([$import_value])
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



	/**
	* GET_ORIGINAL_LANG
	* Check if a related component component_select_lang exists like rsc36 case
	* If exists, return the lang value
	* @return string|null
	*/
	public function get_original_lang() : ?string {

		$ar_related_component_lang_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
			$this->tipo, // tipo
			'component_select_lang', // model name
			'termino_relacionado', // relation_type
			true // search_exact
		);
		if (!empty($ar_related_component_lang_tipo)) {
			$related_component_lang_tipo	= reset($ar_related_component_lang_tipo);
			$related_component_lang_model	= RecordObj_dd::get_modelo_name_by_tipo($related_component_lang_tipo, true);
			$related_component_lang			= component_common::get_instance(
				$related_component_lang_model, // string model
				$related_component_lang_tipo, // string tipo
				$this->section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$this->section_tipo // string section_tipo
			);
			$related_component_lang_dato = $related_component_lang->get_dato();
			if (!empty($related_component_lang_dato[0])) {

				$original_lang = lang::get_code_from_locator($related_component_lang_dato[0]);

				// set original lang
				return $original_lang;
			}
		}


		return null;
	}//end get_original_lang



}//end class component_text_area
