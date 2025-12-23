<?php declare(strict_types=1);
/**
* CLASS COMPONENT TEXT AREA
* Manage specific component text area logic
* Common components properties and method are inherited of component_string_common class that are inherited from component_common class
*/
class component_text_area extends component_string_common {



	// arguments
	public $arguments;



	/**
	* IS_EMPTY
	* Check if given value is or not empty considering
	* spaces and '<p></p>' as empty values
	* @param object|null $data_item
	* @return bool
	*/
	public function is_empty( ?object $data_item ) : bool {

		$is_empty = parent::is_empty($data_item);
		if ($is_empty===true) {
			return true;
		}

		$value = $data_item->value;

		// check for specific non empty values that can be considered empty
		// in this component because are garbage form the text editor (ckeditor/tinyMCE)
		$trim_value = is_string($value) ? trim($value) : $value;
		$garbage_values = [
			'<p></p>',
			'<br data-mce-bogus="1">'
		];
		if ( in_array($trim_value, $garbage_values) ) {
			return true;
		}

		return false;
	}//end is_empty



	/**
	* GET_GRID_VALUE
	* Get the grid value of the text area component for use in dd_grid rendering.
	* Processes data differently based on component mode (indexation_list vs default).
	* In indexation_list mode, creates fragments for indexation.
	* In default mode, processes data to build display values with HTML tags.
	*
	* @param object|null $ddo Optional dd_grid configuration object containing:
	*   - records_separator: Custom separator for records (default ' | ')
	*   - class_list: CSS classes to apply to the cell
	* @return dd_grid_cell_object The grid cell object containing:
	*   - type: 'column'
	*   - label: Component label
	*   - cell_type: 'text' (default)
	*   - ar_columns_obj: Array of column objects
	*   - records_separator: Separator for records
	*   - value: Processed data values (HTML formatted)
	*   - fallback_value: Fallback values for other languages
	*   - model: Component class name
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$records_separator	= $ddo->records_separator ?? null;
			$class_list			= $ddo->class_list ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// data
			$data = $this->get_data_lang();

		// processed_data
			switch ($this->mode) {
				case 'indexation_list':
					// process data to build the indexation custom columns
					$processed_data	= include 'component_text_area_value.php';
					$cell_type		= null;
					break;

				default:
					$processed_data = [];
					if (!empty($data)) {
						foreach ($data as $item) {
							// $item = trim($item);
							if (!$this->is_empty($item->value)) {
								$processed_data[] = TR::add_tag_img_on_the_fly($item->value);
							}
						}
					}
					$cell_type = 'text'; // default
					break;
			}

		// fallback_value
			if (empty($data)) {

				$data = $this->get_component_data_fallback(
					$this->get_lang(), // string lang
					DEDALO_DATA_LANG_DEFAULT // string main_lang
				);

				switch ($this->mode) {
					case 'indexation_list':
						// process data to build the indexation custom columns
						$processed_fallback_value	= include 'component_text_area_value.php';
						$cell_type					= null;
						break;

					default:
						$processed_fallback_value = [];
						if (!empty($data)) {
							foreach ($data as $item) {
								// $item = trim($item);
								if (!$this->is_empty($item->value)) {
									$processed_fallback_value[] = TR::add_tag_img_on_the_fly($item->value);
								}
							}
						}
						$cell_type = 'text'; // default
						break;
				}
			}else{
				$processed_fallback_value = []; // unnecessary to calculate
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
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				if(isset($cell_type)){
					$dd_grid_cell_object->set_cell_type($cell_type);
				}
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($processed_data);
				$dd_grid_cell_object->set_fallback_value($processed_fallback_value);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* SAVE
	* Save component data with text sanitization
	* Overwrite component_common method
	* @param bool $update_all_langs_tags_state	Whether to update language tags across all languages
	* @param bool $clean_text					Whether to clean/sanitize text content
	*
	* @return bool $result
	*/
	public function save( bool $clean_text=true) : bool {

		// Store current data for processing
			$current_data = $this->data;

		// clean data
			if ($clean_text && !empty($current_data)) {
				foreach ( $current_data as $key => $item ) {
					$current_value = $item->value ?? '';
					if (!empty($current_value)) {
						 $current_data[$key]->value = TR::conform_tr_data($current_value);
					}
				}
			}

		// Set data again (cleaned)
			$this->data = $current_data;

		// From here, we save in the standard way. Expected int $section_id
			$result = parent::save();


		return $result;
	}//end Save



	/**
	* GET_LOCATORS_OF_TAGS
	* (!) Called by observer numisdata563 of section_tipo: numisdata41 (legends)
	* Resolve the data from text_area for a mark and get the locators to be used as data
	* @param object $options
	* @return array $ar_locators
	*/
	public function get_locators_of_tags(object $options) : array {

		// options
			$ar_mark_tag = $options->ar_mark_tag ?? ['svg'];

		// default value
			$ar_locators = [];

		// data
			$data			= $this->get_data_lang() ?? [];
			$current_data	= $data[0]->value ?? ''; // (!) Note that only one value is expected in component_text_area but format is array
			if ( empty($current_data) ) {
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




	// /**
	// * GET_VALOR_EXPORT
	// * Return component value sent to export data
	// * @return string|null $valor_export
	// */
	// public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

	// 	$valor_export = $this->get_valor($lang);

	// 	return $valor_export;
	// }//end get_valor_export




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
			}

		// Build in/out regex pattern to search
		$regexp = $tag_in ."(.*)". $tag_out;

		// Search fragment_text
			// Data raw from matrix db
			$data = $raw_text;
			if( preg_match_all("/$regexp/", $data, $matches, PREG_SET_ORDER|PREG_OFFSET_CAPTURE) ) {

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
						$tag_in	= $match[1][0];
						// tag_out like "[/index-n-9--data::data]"
						$tag_out = $match[4][0];

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
	* DELETE_TAG_FROM_ALL_LANGS
	* Search all component data langs and delete tag an update (save) dato on every lang
	* (!) This method will save the result if data changes on each language
	* @see tool_indexation 'delete_tag'
	*
	* @param string $tag_id
	* 	like '[index-n-2]'
	* @param string $tag_type
	* @return array $ar_langs_changed
	* 	Array of affected langs
	*/
	public function delete_tag_from_all_langs(string $tag_id, string $tag_type) : array {

		// model of the component text area
		$model_name			= get_class($this);

		// create the component and get its data
		$component_text_area = component_common::get_instance(
				$model_name, // component_text_area
				$this->tipo,
				$this->parent,
				$this->mode,
				DEDALO_DATA_LANG,
				$this->section_tipo,
				false // bool cache
			);
		$data = $component_text_area->get_data();

		// return if data doesn't exists
		if ( empty($data) ) {
			return [];
		}

		// storage variables
		$new_data			= [];	
		$to_save			= false;
		$ar_langs_changed 	= [];

		// loop through the data and delete the tag
		foreach ($data as $item) {
			$current_lang = $item->lang;
			$text_raw = $item->value;
			$new_item = clone($item);

			// delete the tag from text
			$delete_tag_from_text = self::delete_tag_from_text(
				$tag_id, // string tag_id like '1'
				$tag_type, // string tag_type like 'index'
				$text_raw
			);

			// count the number of tags removed from text
			$remove_count = (int)$delete_tag_from_text->remove_count;
			if ($remove_count>0) {
				$to_save = true;
				$ar_langs_changed[] = $current_lang;
				// inform that the data item will be deleted from data
				debug_log(__METHOD__
					." Deleted tag ($tag_id, $tag_type) in lang ".to_string($current_lang)
					, logger::WARNING
				);
			}

			// set the new value to data item
			$new_item->value = $delete_tag_from_text->result;
			// add the new item to the data array
			$new_data[] = $new_item;	
		}// end foreach $data as $item

		// save the data if there are tags removed from text
		if ($to_save===true) {
			// set the new data to component text area
			$component_text_area->set_data($new_data);
			// save
			$component_text_area->save();
			
		}else{
			// inform that the data item will be not deleted from data
			debug_log(__METHOD__
				. " Ignored (not matches found) deleted tag ($tag_id, $tag_type) in lang: "
				, logger::WARNING
			);
		}// end if ($to_save===true)

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
	* GET_RELATED_COMPONENT_AV_TIPO
	* Search in struct for related component_av tipo
	* @return string|null $related_component_av_tipo
	*/
	public function get_related_component_av_tipo() : ?string {

		$related_component_av = ontology_node::get_ar_tipo_by_model_and_relation(
			$this->tipo,  // string tipo
			'component_av', // string model
			'related' // string relation_type
		);

		$related_component_av_tipo = $related_component_av[0] ?? null;

		return $related_component_av_tipo;
	}//end get_related_component_av_tipo



	/**
	* GET_RELATED_COMPONENT_SELECT_LANG
	* Search in ontology for related component_select_lang
	* @return string|null $tipo
	*/
	public function get_related_component_select_lang() : ?string {

		$related_component_select_lang = ontology_node::get_ar_tipo_by_model_and_relation(
			$this->tipo,  // string tipo
			'component_select_lang', // string model
			'related' // string relation_type
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
	* 	Array of component_portal data locators
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
			$model_name         = ontology_node::get_model_by_tipo($component_tipo,true);
			$component_index    = component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$section_tipo
			);

		$ar_tags_data = $component_index->get_data() ?? [];


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
		$ar_indexation_obj		= [];
		foreach ($tags_data as $key => $current_tag_data) {

			$locator = new locator();
				$locator->set_section_tipo($current_tag_data->section_tipo);
				$locator->set_section_id($current_tag_data->section_id);
				$locator->set_component_tipo($current_tag_data->from_component_tipo);

			#$term_id = $current_tag_data->section_tipo.'_'.$current_tag_data->section_id;
			$term = ts_object::get_term_by_locator($locator);

			$ar_indexation_terms[] = $term;

			$indexation_obj = new stdClass();
				$indexation_obj->data	= $current_tag_data;
				$indexation_obj->label	= $term;
			$ar_indexation_obj[] = $indexation_obj;
		}//end foreach ($tags_data as $key => $current_tag_data)

		if ($format==='text') {
			$ar_terms = implode($separator, $ar_indexation_terms);	//json_encode($ar_indexation_terms);
		}else{
			$ar_terms = $ar_indexation_obj;
		}

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
	* Locate the note tags in the component text data and return them as an array
	* @see diffusion global search needs
	* @return array|null $ar_annotations
	*/
	public function get_annotations() : ?array {

		$lang		= $this->get_lang();
		$properties	= $this->get_properties();

		// tag notes
			$tags_notes	= $properties->tags_notes ?? null;
			if(empty($tags_notes)) {
				return null;
			}

		// data
			$data = $this->get_data();
			if(empty($data)){
				return null;
			}

		$ar_annotations = [];
		foreach ($data as $item) {
			$value = $item->value ?? '';
			if( empty($value) ){
				continue;
			}
			$pattern = TR::get_mark_pattern('note', $standalone=true);
			preg_match_all($pattern,  $value,  $matches, PREG_PATTERN_ORDER);
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

				// create a new note object to be filled with the information
				$note_obj = new stdClass();
					$note_obj->data	= $locator;
				foreach ($ar_notes_section_ddo_map as $current_ddo) {
					// get the note component
					$note_component_tipo	= $current_ddo->component_tipo;
					$note_component_model	= ontology_node::get_model_by_tipo($note_component_tipo,true);
					// set the note section record
					$note_section_tipo		= $locator->section_tipo;
					$note_section_id		= $locator->section_id;
					// create the component
					$translatable			= ontology_node::get_translatable($note_component_tipo);
					$current_component		= component_common::get_instance(
						$note_component_model,
						$note_component_tipo,
						$note_section_id,
						'list',
						($translatable) ? $lang : DEDALO_DATA_NOLAN,
						$note_section_tipo
					);
					// get the note data
					$note_data	= $current_component->get_data();
					$note_type	= $current_ddo->id;

					// set the type of the note data
					// for bool types set it as 1 = true/ 2 = false equivalent
					if ($current_ddo->type === 'bool') {
						$note_data = !empty($note_data) && ($note_data[0]->section_id === '1')
							? true
							: false;
					}
					
					$note_obj->$note_type = $note_data;
				}

				$ar_annotations[] = $note_obj;
			}//end foreach ($matches[7] as $current_note)
		}//end foreach ($data as $key => $current_data)


		return $ar_annotations;
	}//end get_component_indexations_terms
	


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
			$sqo->limit					= 0;
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
	* @param string $related_section_tipo
	* @param array $ar_related_sections = []
	* @return array $ar_tags_inspector
	*/
	public function get_tags_persons(string $related_section_tipo, array $ar_related_sections=[]) : array {

		$tags_persons = array();

		$section_id	= $this->get_section_id();

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

			$model_name	= ontology_node::get_model_by_tipo($current_component_tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$current_component_tipo,
				$current_section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$current_section_tipo
			);
			// TAG
			$data = $component->get_data();
			foreach ($data as $current_locator) {

				$lkey = $current_locator->section_tipo .'_' .$current_locator->section_id;
				if (in_array($lkey, $resolved)) {
					continue;
				}

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
					$element->role			= $label->role;  // ontology_node::get_term_by_tipo($current_component_tipo,DEDALO_APPLICATION_LANG,true);
					$element->full_name		= $label->full_name;

					$element->state			= $current_state;
					$element->tag_id		= $current_tag_id;
					$element->label			= $label->initials;
					$element->data			= $data_locator;

				$tags_persons[] = $element;

				$resolved[] = $lkey;
			}// end foreach($data as $current_locator)
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

		// tag like '[person-'.$state.'-'.$label.'-data:'.$locator_json.':data]';
			$person_tag	= TR::build_tag($type, $state, $tag_id, $label, $data);


		return $person_tag;
	}//end build_tag_person



	/**
	* GET_TAG_PERSON_LABEL
	* Build tag label to show in transcriptions tag image of persons
	* @param object locator
	* @return object $label
	* {
	* 	"initials"	: "ricsa",
	* 	"full_name"	: "Ricardo Sánchez",
	* 	"role"		: "Interviewer"
	* }
	*/
	public static function get_tag_person_label(object $locator) : object {

		// Fixes tipos
		$ar_tipos = [
			'name'		=> 'rsc85', // name
			'surname'	=> 'rsc86' // surname
		];
		// create the label object
		$label = new stdClass();
			$label->initials	= '';
			$label->full_name	= '';
			$label->role		= '';

		if (isset($locator->component_tipo)) {
			$label->role = ontology_node::get_term_by_tipo($locator->component_tipo, DEDALO_APPLICATION_LANG, true);
		}

		foreach ($ar_tipos as $key => $tipo) {
			// get the model of the component, expected component_input_text for the name and surname
			$model_name	= ontology_node::get_model_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model_name,
				$tipo,
				$locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			// get its data and extract the first value to add it to the label
			$data 	= $component->get_data();
			$value 	= $data[0]->value ?? '';
			// Reduce the name of the person into the tag label
			// and use the full name into the tooltip
			switch ($key) {

				case 'name':
					// Get only the 3 first letters of the name 
					$label->initials	.= mb_substr($value,0,3);
					$label->full_name	.= $value;
					break;

				case 'surname':
					// get only the 2 first letters of the surname 
					if (!empty($value)) {
						$ar_parts = explode(' ', $value);
						if (isset($ar_parts[0])) {
							$label->initials .= mb_substr($ar_parts[0],0,2);
						}
						if (isset($ar_parts[1])) {
							$label->initials .= mb_substr($ar_parts[1],0,2);
						}
						$label->full_name .= ' '.$value;
					}
					break;

				default:
					break;
			}
		}// end foreach($ar_tipos as $key => $tipo)


		return $label;
	}//end get_tag_person_label



	/**
	* REGENERATE_COMPONENT
	* Force the current component to re-save its data
	* Note that the first action is always load data to avoid save empty content
	* @see class.tool_update_cache.php
	* @return bool
	*/
	public function regenerate_component() : bool {

		// Force loads data always !IMPORTANT
		$data = $this->get_data();

		if ( !empty($data) ) {

			$old_tc_pattern = '/(\[TC_([0-9]{1,2}:[0-9]{1,2}:[0-9]{1,2})_TC\])/';

			$new_data = [];
			foreach ($data as $item) {
				$value = $item->value ?? null;

				// avoid empty values
				if ($value===null) {
					continue;
				}

				$new_item = clone( $item );

				// Converts old timecodes
				$new_item->value = preg_replace($old_tc_pattern, "[TC_$2.000_TC]", (string)$value);

				// convert tag paths from ../../../inc/btn.php/[geo-n-1-] to ../component_text_area/tag/?id=[geo-n-1-]
				// <img id="[geo-n-1-]" src="../../../inc/btn.php/[geo-n-1-]" class="geo" data-type="geo" data-tag_id="1" data-state="n" data-label="" data-data="{'type':'FeatureCollection','features':[{'type':'Feature','properties':{},'geometry':{'type':'Point','coordinates':[-2.01936392737486,42.645594932190519]}}]}" />
				// @todo

				$new_data[] = $new_item;
			}

			$this->set_dato($new_data);
		}

		// Save component data. Defaults arguments: $clean_text=true
		$this->save(
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

		// find data in related component_geolocation
			$component_geolocation_model = 'component_geolocation';
			$ar_related_by_model = component_common::get_ar_related_by_model(
				$component_geolocation_model,
				$this->tipo,
				true
			);
		// inform when no related component_geolocation is found
		// and return empty array to avoid any further operations
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
		// create the component geolocation
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
			$component_geolocation_data = $component_geolocation->get_data();
			// empty dato case
			if (empty($component_geolocation_data)) {
				return [];
			}
			$lib_data = $component_geolocation_data[0]->lib_data ?? null;
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
				// create a new value for the layer
				$current_value = (object)[
					'layer_id'		=> $layer->layer_id,
					'text'			=> '', // only to maintain v5 diffusion format
					'layer_data'	=> $layer_data
				];

				// add
				$ar_elements[] = $current_value;
			}

		// compare result
			$data		= $this->get_data();
			$raw_text	= $data[0]->value ?? '';
			// split by pattern
			$pattern_geo_full	= TR::get_mark_pattern('geo_full', true);
			$ar_geo_tag			= preg_split($pattern_geo_full, $raw_text, -1, PREG_SPLIT_NO_EMPTY | PREG_SPLIT_DELIM_CAPTURE);
		// get geo tags from array
			$geo_tags			= [];
			if ($ar_geo_tag) {
				$geo_tags = array_filter($ar_geo_tag, function($el){
					return strpos($el,'[geo-')===0;
				});
			}
			if (count($geo_tags)!==count($ar_elements)) {
				// note that diffusion in multiple langs could generate unwanted error notifications
				if ($this->lang===DEDALO_DATA_LANG) {
					debug_log(__METHOD__
						. " ERROR. The number of tags and geodata layers is different! " . PHP_EOL
						. ' component_tipo: ' . $this->tipo . PHP_EOL
						. ' section_tipo: ' . $this->section_tipo . PHP_EOL
						. ' section:id: ' . $this->section_id . PHP_EOL
						. ' geo_tags (' . count($geo_tags) . '): ' . json_encode($geo_tags, JSON_PRETTY_PRINT) . PHP_EOL
						. ' layers ('   . count($ar_elements) . '): ' . json_encode($ar_elements, JSON_PRETTY_PRINT)
						, logger::ERROR
					);
				}
			}


		return $ar_elements;
	}//end build_geolocation_data



	/**
	* UPDATE_DATA_VERSION
	* @param object $options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version(object $options) : object {

		// options
			$update_version	= $options->update_version ?? null;
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? null;
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';


		$update_version = implode('.', $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to data. Override in other cases.
	* Note that empty array or string are returned as null
	* A param '$options' is added only to allow future granular control of the output
	* @param object|null $options = null
	* 	Optional way to modify result. Avoid using it if it is not essential
	* @return array|null $list_value
	*/
	public function get_list_value( ?object $options=null ) : ?array {

		// force change lang when is set in related component (rsc36 case)
			$original_lang = $this->get_original_lang();
			if (!empty($original_lang) && $original_lang!==$this->lang) {
				// overwrite lang
				$this->lang	= $original_lang;
			}

		// data from component
			$data = $this->get_data_lang();
			if (empty($data)) {
				return null;
			}

		// options
			$max_chars = $options->max_chars ?? 130;

		// list_value
			$list_value = [];
			foreach ($data as $item) {

				// empty case
					if ($this->is_empty($item)) {
						$list_value[] = '';
						continue;
					}

				// value
					$current_value = $item->value;
				// convert the value tags as [svg:...] to html tags as <img src="file.svg".../>
				// (!) Note that some components are using images in view_mini and they
				// need always render the images. E.g. 'numisdata71' in section Types (numisdata3)
					$html_value = TR::add_tag_img_on_the_fly( $current_value );

				// truncate the html to max_chars, ensure that the html is correct and tags will close in correct way
					$truncate_value = !empty($html_value)
						? common::truncate_html(
							$max_chars,
							$html_value,
							true // isUtf8
						  )
						: '';

				// set the new value item with truncate value
					$new_item = clone($item);
					$new_item->value = $truncate_value;

					$list_value[] = $new_item;
			}


		return $list_value;
	}//end get_list_value



	/**
	* GET_FALLBACK_LIST_VALUE
	* Used by component_text_area and component_html_text to
	* generate fallback versions of current empty values
	* @param object|null $options = null
	* @return array|null $list_value
	*/
	public function get_fallback_list_value( ?object $options=null ) : ?array {

		// options
			$max_chars = $options->max_chars ?? 700;

		// data_fallback. array of each data array element using fallback
			$data_fallback = $this->get_component_data_fallback(
				DEDALO_DATA_LANG, // lang
				DEDALO_DATA_LANG_DEFAULT // main_lang
			);

			if (empty($data_fallback)) {
				return null;
			}

		// list_value. Iterate data_fallback and truncate long text
			$list_value = [];
			foreach ($data_fallback as $data_item) {

				$value = null;

				if(!empty($data_item->value)) {
					// replace Dédalo tags by html image tags
						$html_value	= TR::add_tag_img_on_the_fly($data_item->value);

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

				$data_item->value = $value;

				$list_value[] = $data_item;
			}

		return $list_value;
	}//end get_fallback_list_value



	/**
	* GET_FALLBACK_EDIT_VALUE
	* Used by component_text_area and component_html_text to
	* generate fallback versions of current empty values
	* @param object|null $options = null
	* @return array|null $list_value
	*/
	public function get_fallback_edit_value( ?object $options=null ) : ?array {

		// options
			$max_chars = $options->max_chars ?? 700;

		// dato_fallback. array of each dato array element using fallback
			$dato_fallback = $this->get_component_data_fallback(
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
	* @return string|null $original_lang
	*/
	public function get_original_lang() : ?string {

		$ar_related_component_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
			$this->tipo, // tipo
			'component_select_lang', // model name
			'related', // relation_type
			true // search_exact
		);
		if (!empty($ar_related_component_tipo)) {

			$related_component_tipo		= reset($ar_related_component_tipo);
			$related_component_model	= ontology_node::get_model_by_tipo($related_component_tipo, true);
			$related_component			= component_common::get_instance(
				$related_component_model, // string model
				$related_component_tipo, // string tipo
				$this->section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$this->section_tipo // string section_tipo
			);
			$related_component_dato = $related_component->get_dato();
			if (!empty($related_component_dato[0])) {

				$original_lang = lang::get_code_from_locator($related_component_dato[0]);

				// set original lang
				return $original_lang;
			}
		}


		return null;
	}//end get_original_lang



}//end class component_text_area
