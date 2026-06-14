<?php declare(strict_types=1);
/**
* CLASS COMPONENT_TEXT_AREA
* Manages rich text content with embedded tags and annotations in Dédalo.
*
* Provides WYSIWYG text editing with support for semantic markup, internal
* references, and multimedia integration. Handles complex text structures
* used in oral history, transcription, and scholarly editing workflows.
*
* Key features:
* - Rich HTML text editing via WYSIWYG editors (CKEditor)
* - Semantic tag system for:
*   - Indexation: Links to thesaurus descriptors
*   - References: Links to other section records
*   - Persons: Interviewees, informants, speakers
*   - Languages: Multilingual content markup
*   - Geolocation: Spatial references (deprecated, now uses component_geolocation)
*   - Notes/Annotations: Inline comments and editorial notes
*   - Multimedia: Embedded images and timecode references
* - Tag sanitization, validation, and repair utilities
* - Multi-language content with fallback to default language
* - Time-based indexing for audiovisual transcription
*
* Extends component_string_common for text handling capabilities.
*
* @package Dédalo
* @subpackage Core
*/
class component_text_area extends component_string_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Optional arguments object for component processing configuration.
		 * Used to pass additional parameters for tag processing or display modes.
		 * @var ?object $arguments
		 */
		public ?object $arguments = null;



	/**
	* IS_EMPTY
	* Check whether a data item is effectively empty for this component.
	*
	* Extends the parent check to treat WYSIWYG editor artefacts as empty.
	* CKEditor and TinyMCE sometimes leave behind ghost markup such as
	* '<p></p>' or '<br data-mce-bogus="1">' that is visually blank but
	* non-empty as a raw string; this method recognises those cases.
	* @param mixed $data_item - Data item object with a 'value' property
	* @return bool - true when the item is empty or contains only editor garbage
	*/
	public function is_empty( mixed $data_item ) : bool {

		$is_empty = parent::is_empty($data_item);
		if ($is_empty===true) {
			return true;
		}

		$value = $data_item->value ?? '';

		// check for specific non empty values that can be considered empty
		// in this component because are garbage form the text editor (ckeditor/tinyMCE)
		$trim_value = trim($value);
		$garbage_values = [
			'<p></p>',
			'<p> </p>',
			'<br data-mce-bogus="1">'
		];
		if ( in_array($trim_value, $garbage_values) ) {
			return true;
		}

		return false;
	}//end is_empty



	/**
	* GET_GRID_VALUE
	* Produce the dd_grid_cell_object for tabular / list rendering.
	*
	* Two rendering paths exist:
	* - 'indexation_list' mode: builds interactive tag-fragment cells by delegating
	*   to the component_text_area_value.php include. These cells carry per-cell
	*   class_list and action objects that the atoms contract cannot express.
	* - all other modes: delegates to component_common::get_grid_value() which uses
	*   the standard scalar-atoms adapter (get_export_value).
	*
	* The fallback is computed only when the main-lang data is empty, sparing a
	* second include for the common case.
	* @param ?object $ddo = null - dd_grid display-descriptor; recognised keys:
	*   class_list (string), format_columns (mixed), fields_separator (string),
	*   records_separator (string)
	* @return dd_grid_cell_object - fully populated grid cell
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// indexation_list mode keeps the legacy custom-columns grid: tag
		// fragments rendered as interactive record_link/button cells with
		// per-cell class_list and action objects (component_text_area_value.php)
		// — structural/interactive shapes the scalar atoms contract does not
		// carry by design. Every other mode uses the generic atoms adapter
		// (component_common::get_grid_value).
		if ($this->mode!=='indexation_list') {
			return parent::get_grid_value($ddo);
		}

		// ddo customs
			$class_list		= $ddo?->class_list ?? null;
			// read inside the component_text_area_value.php include
			$format_columns	= $ddo?->format_columns ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// data
			$data = $this->get_data_lang();

		// processed_data. indexation custom columns
			$processed_data = include 'component_text_area_value.php';
			$cell_type      = null;

		// fallback_value
			if (empty($data)) {
				$data = $this->get_component_data_fallback(
					$this->get_lang(), // string lang
					DEDALO_DATA_LANG_DEFAULT // string main_lang
				);
				$processed_fallback_value = include 'component_text_area_value.php';
			}else{
				$processed_fallback_value = []; // unnecessary to calculate
			}

		// label
			$label = $this->get_label();

		// properties
			$properties = $this->get_properties();

		// fields_separator
			$fields_separator = $ddo?->fields_separator
				?? $properties?->fields_separator
				?? ', ';

		// records_separator
			$records_separator = $ddo?->records_separator
				?? $properties?->records_separator
				?? ' | ';

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
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($processed_data); // array
				$dd_grid_cell_object->set_fallback_value($processed_fallback_value);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract; see component_common::get_export_value.
	*
	* Produces one export_atom per non-empty data item. Dédalo [svg:…] tags are
	* resolved to <img> HTML on the fly (TR::add_tag_img_on_the_fly) to match
	* the values the legacy grid carried. Paragraph cleanup and HTML-entity
	* decoding are left to the tabulator layer (flat_table.js / export_tabulator)
	* so the atoms are usable by callers that do not want stripped text.
	*
	* Falls back to the default language when the active language has no data.
	* The 'indexation_list' mode is never reached by this path; that mode's
	* interactive custom columns remain on the legacy grid path.
	* @param ?export_context $context = null
	* @return export_value - container holding zero or more atoms
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// own segment (base resolution: ddo > properties > joiner defaults)
			$segment	= $this->build_export_path_segment($context);
			$path		= [...$context->path_prefix, $segment];

		// export_value
			$export_value = new export_value([], $this->get_label(), get_called_class());

		// data items. main lang first, fallback when empty
			$data			= $this->get_data_lang();
			$is_fallback	= false;
			if (empty($data)) {
				$data = $this->get_component_data_fallback(
					$this->get_lang(), // string lang
					DEDALO_DATA_LANG_DEFAULT // string main_lang
				);
				$is_fallback = true;
			}
			if (empty($data)) {
				return $export_value;
			}

			$value_index = 0;
			foreach ($data as $item) {
				if ($this->is_empty($item)) {
					continue;
				}
				$export_value->add_atom( new export_atom($path, TR::add_tag_img_on_the_fly($item->value), (object)[
					'value_index'	=> $value_index++,
					'lang'			=> $item->lang ?? $this->lang,
					'is_fallback'	=> $is_fallback
				]) );
			}


		return $export_value;
	}//end get_export_value



	/**
	* SAVE
	* Sanitize text content then persist via parent::save().
	*
	* Overrides component_common::save() to run the text through
	* sanitize_text() before storage. Sanitization strips disallowed HTML,
	* normalises encoding, and removes editor artefacts. It is skipped when
	* $clean_text is false (e.g. when importing raw HTML that is already safe).
	*
	* (!) Data must be loaded (get_data()) before calling this method;
	* otherwise set_data() will overwrite with an empty array.
	* @param bool $clean_text = true - pass false to skip sanitize_text()
	* @return bool - true on success, false on database error
	*/
	public function save( bool $clean_text=true) : bool {

		// Store current data for processing
			$current_data = $this->get_data();

		// clean data
			if ($clean_text && !empty($current_data)) {
				foreach ( $current_data as $key => $item ) {
					$current_value = $item->value ?? '';
					if (!empty($current_value)) {
						 $current_data[$key]->value = $this->sanitize_text($current_value);
					}
				}
			}

		// Set data again (cleaned)
			$this->set_data( $current_data );

		// From here, we save in the standard way. Expected int $section_id
			$result = parent::save();


		return $result;
	}//end save



	/**
	* GET_LOCATORS_OF_TAGS
	* Extract locators embedded in Dédalo markup tags within the component's text.
	*
	* Iterates each tag type listed in $options->ar_mark_tag, applies TR::get_mark_pattern()
	* to the raw text value, and collects the JSON-encoded locator objects stored in
	* capture group 7 of each match. Single quotes in the tag data are normalised to
	* double quotes before JSON decoding.
	*
	* (!) Called by observer numisdata563 of section_tipo numisdata41 (legends).
	* Only the first data item value is inspected; component_text_area stores a single
	* value per language row by convention.
	* @param object $options - configuration object; recognised keys:
	*   ar_mark_tag (string[]) tag types to scan (default ['svg'])
	* @return array $ar_locators - deduplicated array of decoded locator objects
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



	/**
	* CHANGE_TAG_STATE
	* Replace a specific tag's state character in raw text.
	*
	* Dédalo tags encode their state as a single letter between the tag-type name
	* and the numeric id: [index-{state}-{id}]. This method locates the tag by id
	* and rebuilds it with the new state, leaving all other tag content unchanged.
	* Example: change_tag_state('[index-n-1]', 'r', $text) turns '[index-n-1]' into
	* '[index-r-1]' everywhere it appears, but only replaces the first match (break
	* is called after the first processed id).
	*
	* State codes in common use: 'n' (new/normal), 'r' (reviewed), 'd' (deleted).
	* @param string $tag - full tag string to locate, e.g. '[index-n-1]' or '[/index-n-1]'
	* @param string $state = 'r' - single-character new state to inject
	* @param string $text_raw = '' - raw text containing the tag
	* @return string $text_raw_updated - text with the state character replaced; unchanged if tag not found
	*/
	public static function change_tag_state(string $tag, string $state='r', string $text_raw='') : string {

		// Default unchanged text
		$text_raw_updated = $text_raw;

		$id = TR::get_tag_id($tag);

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
	* GET_FRAGMENT_TEXT_FROM_TAG
	* Extract the text enclosed between a matching in/out tag pair.
	*
	* Given a tag id and type, builds the combined regex (tag_in)(.*)(tag_out) and
	* searches $raw_text. The captured text between the tags is stripped of all
	* Dédalo marks (TR::deleteMarks) and HTML-entity decoded.
	*
	* Only the 'index' tag type is currently supported; any other type logs an error
	* and returns null. Null is also returned for empty or invalid inputs.
	*
	* The returned object encodes character-level positions for the caller to
	* reconstruct or splice the text around the fragment.
	* @param string $tag_id - numeric id as string, e.g. '1'
	* @param string $tag_type - Dédalo tag type; currently only 'index' is handled
	* @param string $raw_text - full raw text to search within
	* @return ?object $fragment_object - null when not found or on invalid input; on success:
	*   {text: string, tag_in_pos: int, tag_out_pos: int, tag_in: string, tag_out: string}
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
	* Return all language data values as a single plain-text string.
	*
	* Strips all Dédalo markup tags (TR::deleteMarks) and HTML elements
	* (strip_tags), joining multiple data items with the component's
	* default_records_separator. Used by the publication layer for
	* full-text search indexing.
	* @return string - plain text content; empty string when data is absent
	*/
	public function get_plain_text() : string {

		$data = $this->get_data();

		$ar_values = [];
		foreach($data as $data_item){
			if(empty($data_item->value)){
				continue;
			}
			$ar_values[] = $data_item->value;
		}

		$raw_data = implode($this->default_records_separator, $ar_values);

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
	* Remove a tag from the component text across every stored language and persist.
	*
	* Iterates all data items regardless of language, delegates per-item removal
	* to delete_tag_from_text(), and accumulates which languages were modified.
	* If at least one item changed, calls save() to write the updated data.
	*
	* (!) This method writes to the database when any change is found.
	* @see tool_indexation 'delete_tag' action
	* @param string $tag_id - tag id to remove, e.g. '2'
	* @param string $tag_type - Dédalo tag type, e.g. 'index'
	* @return array $ar_langs_changed - language codes of the data items that were modified
	*/
	public function delete_tag_from_all_langs(string $tag_id, string $tag_type) : array {

		$data = $this->get_data();

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
			$this->set_data($new_data);
			// save
			$this->save();

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
	* DELETE_TAG_FROM_TEXT
	* Remove all occurrences of a given tag (both in and out forms) from raw text.
	*
	* Uses TR::get_mark_pattern() in standalone mode so that the pattern matches
	* both '[tag-state-id]' and '[/tag-state-id]' forms in a single pass.
	* The number of removed tags is tracked via preg_replace's $count parameter.
	*
	* Returns null when the tag_id/tag_type arguments are empty or when $raw_text
	* is empty. Also returns null when $tag_type is not a member of TR::$tag_types.
	* @param string $tag_id - numeric id as string, e.g. '2'
	* @param string $tag_type - Dédalo tag type, must be in TR::$tag_types
	* @param string $raw_text - full text to process
	* @return ?object $response - null on invalid input; on success:
	*   {result: string, remove_count: int, msg: string}
	*/
	public static function delete_tag_from_text(string $tag_id, string $tag_type, string $raw_text) : ?object {

		// check tag_id, tag_type are valid
			if(empty($tag_id) || empty($tag_type)) {
				debug_log(__METHOD__
					. " Error: tag_id is invalid. " . PHP_EOL
					.' tag_id: '   . $tag_id . PHP_EOL
					.' tag_type: ' . $tag_type . PHP_EOL
					.' raw_text: ' . $raw_text
					, logger::ERROR
				);
				return null;
			}

		// empty $raw_text case
			if (empty($raw_text)) {
				return null;
			}

		// invalid tag type
		$valid = in_array( $tag_type, TR::$tag_types);
		if($valid === false){
			return null;
		}

		// Pattern for in and out tags
			$pattern = TR::get_mark_pattern(
				$tag_type,
				true, // bool standalone
				$tag_id, // string|bool $id
				false // bool data
			);

		// Will replace matched tags with a empty string
			$replacement		= '';
			$raw_text_updated	= preg_replace($pattern, $replacement, $raw_text, -1, $remove_count);

		// response
			$response = new stdClass();
				$response->result		= $raw_text_updated;
				$response->remove_count	= $remove_count;
				$response->msg			= 'OK. Request done';


		return $response;
	}//end delete_tag_from_text



	/**
	* FIX_BROKEN_INDEX_TAGS
	* Repair index-tag integrity problems in raw text.
	*
	* Two categories of defect are corrected:
	*
	* 1. Mismatched in/out pairs: a '[/index-…]' out-tag with no matching in-tag
	*    gets a synthetic in-tag prepended with state 'd' (deleted), and vice-versa.
	*    Only the first match per id is processed (see change_tag_state break).
	*
	* 2. Orphaned indexation locators: tags stored in the associated index portal
	*    (get_component_tags_data) that have no corresponding pair in the text at all
	*    receive a new '[index-d-id][/index-d-id]' pair prepended to the text.
	*
	* The same repair is applied to 'draw' (SVG annotation) tags.
	*
	* The $response->msg is populated (and localised via label::get_label) only when
	* changes were made, prompting the user to review the positions of altered tags.
	* @see component_text_area.json (tool_fix_broken_index_tags action)
	* @param string $raw_text - raw HTML text to inspect and repair
	* @return object $response - always set; structure:
	*   {result: string (repaired text), msg: string|null, total: string|null (ms)}
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
					[...$matches_indexIn[$index_tag_id], ...$matches_indexOut[$index_tag_id]]
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
	* Look up the ontology for the first component_av tipo related to this component.
	*
	* Used to discover the audio/video component paired with this transcription text area
	* (e.g. to synchronise timecode navigation between text and media player).
	* @return ?string - the ontology tipo of the related component_av, or null if none exists
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
	* Look up the ontology for the first component_select_lang tipo related to this component.
	*
	* A component_select_lang sibling records the original language of a transcription
	* (e.g. the language spoken by an interviewee). When present it drives the
	* get_original_lang() / get_list_value() override that switches the active
	* language to the one declared by that selector (see the rsc36 case).
	* @return ?string - tipo of the related component_select_lang, or null if none
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
	* Return the locator data stored in the associated tag-portal component.
	*
	* In v6/v7 the indexation, reference, and draw tag metadata (who points to what)
	* is stored in a companion portal component (e.g. component_portal rsc860) rather
	* than inside the text itself. The portal's tipo is declared in the ontology
	* properties of this component_text_area under 'tags_{tag_type}':
	*
	*   { "tags_index": { "tipo": "rsc860", "section_id": "self", "section_tipo": "self" } }
	*
	* This method resolves that configuration, instantiates the portal component at the
	* current section_id, and returns its raw data (an array of locator objects).
	* @param string $tag_type = 'index' - property key suffix; must be 'index', 'references', or 'draw'
	* @return array - array of locator objects from the portal, or [] when no config or no data
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
	* Build a JSON-encoded array of compound term identifiers for tag locators.
	*
	* Each locator is reduced to the string '{section_tipo}_{section_id}' —
	* the canonical term_id format used by the diffusion global-search index.
	* Used to populate a searchable column in the diffusion target database.
	*
	* (!) The '??????' note in the original source reflects that this method's
	* long-term home (component vs. diffusion layer) is still under discussion;
	* do not remove it without resolving that architectural question.
	* @param string $tag_type = 'index' - tag type to resolve via get_component_tags_data()
	* @param string $type = DEDALO_RELATION_TYPE_INDEX_TIPO - relation type constant (currently unused in body)
	* @return string - JSON-encoded string array, e.g. '["th1_42","th1_99"]'
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
	* Convenience wrapper: return indexation tag term ids as a JSON string.
	*
	* Delegates to get_tags_data_as_term_id() with tag_type fixed to 'index'.
	* Used by the diffusion global-search pipeline to obtain the list of
	* thesaurus term identifiers associated with this text area record.
	* @param string $type - relation type constant (forwarded to get_tags_data_as_term_id)
	* @return string - JSON-encoded array of '{section_tipo}_{section_id}' strings
	*/
	public function get_component_indexations_term_id(string $type) : string {  // DEDALO_RELATION_TYPE_INDEX_TIPO

		return $this->get_tags_data_as_term_id( 'index', $type );
	}//end get_component_indexations_term_id




	/**
	* GET_TAGS_DATA_AS_TERMS
	* Resolve tag locators to human-readable term labels.
	*
	* Calls get_component_tags_data() to get locators, then resolves each via
	* ts_object::get_term_by_locator(). When $format is 'text', the labels are
	* joined into a single string with $separator. Otherwise an array of objects
	* {data: locator, label: string} is returned.
	*
	* Used by the diffusion global-search pipeline and by display helpers that
	* need to show indexation labels alongside the text.
	* @param string $tag_type = 'index' - tag type to resolve, e.g. 'index', 'draw'
	* @param string $format = 'array' - 'text' for a joined string, any other value for an array
	* @param string $separator = ' | ' - separator string used when $format is 'text'
	* @return array|string - array of {data, label} objects (format≠'text') or a plain
	*   string (implode result) when format is 'text' (note: return type declared as array)
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
	* Convenience wrapper: resolve 'index' tag locators to term label objects or text.
	*
	* Delegates to get_tags_data_as_terms() with tag_type fixed to 'index'.
	* @param string $format = 'array' - 'text' for a joined string, other values for an object array
	* @param string $separator = ' | ' - separator used in text format
	* @return array - see get_tags_data_as_terms() return description
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
	* Extract note-tag annotation objects from all language data items.
	*
	* Scans each data item's text for Dédalo 'note' tags using TR::get_mark_pattern().
	* Each note tag carries a JSON-encoded locator (with single quotes instead of
	* double quotes) pointing to a separate section record that holds the annotation
	* content. This method decodes those locators, instantiates the referenced
	* components using the DDO map in properties->tags_notes, and returns a structured
	* array where each element is an object containing the locator (data) plus the
	* resolved component data keyed by the DDO id.
	*
	* Boolean DDO types (type === 'bool') are normalised: section_id '1' → true,
	* everything else → false.
	*
	* Returns null when the component has no tags_notes configuration or no data.
	* @return ?array - null when no configuration; array of annotation objects otherwise
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
	}//end get_annotations



	/**
	* GET_RELATED_SECTIONS
	* Return the related-sections result set for the current record.
	*
	* Builds a 'related' SQO (search_query_object) targeting all section types,
	* filtered by a locator pointing to the current section record. The result
	* includes the identifying component data of each related section (via
	* sections::get_instance in 'related_list' mode) and is used to locate
	* interviewee/informant/person records for person tag resolution.
	* @return object - decoded sections JSON response object
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
	}//end get_related_sections



	/**
	* GET_TAGS_PERSONS
	* Build the list of person tag objects available for insertion in this text area.
	*
	* Reads properties->tags_persons to find all participant roles (interviewees,
	* informants, speakers, etc.) configured for this component. For each role whose
	* section_tipo matches the current section, the section_id is used directly;
	* for related sections, the matching entries from $ar_related_sections are used.
	*
	* Each person record is resolved to initials + full_name + role via
	* get_tag_person_label(), and the ready-to-insert tag string is built via
	* build_tag_person(). Duplicate locators (same section_tipo + section_id) are
	* deduplicated via the $resolved array.
	* @param string $related_section_tipo - ontology tipo of the related person section
	* @param array $ar_related_sections = [] - pre-fetched related-section locator objects
	*   (from get_related_sections()); avoids a second query
	* @return array - array of person tag element objects:
	*   {type, section_tipo, section_id, tag, role, full_name, state, tag_id, label, data}
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
			// if empty data, skip
			if(empty($data)) {
				continue;
			}
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
	* BUILD_TAG_PERSON
	* Construct a person tag string in Dédalo markup format.
	*
	* The resulting tag format is:
	*   [person-{state}-{tag_id}-{label}-data:{locator_json}:data]
	* where $label is trimmed before insertion and the locator is JSON-encoded.
	* Delegates final tag construction to TR::build_tag().
	* @param array $ar_data - associative array with keys:
	*   tag_id (int|string), state (string), label (string), data (object locator)
	* @return string - the complete formatted person tag string
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
	* Resolve a person locator to display strings for use in tag rendering.
	*
	* Reads the name (rsc85) and surname (rsc86) components of the referenced person
	* record and builds:
	*   - initials: up to 3 chars of the first name + up to 2 chars of each
	*     surname word (split on space), concatenated without separator
	*   - full_name: first name + space + surname verbatim
	*   - role: ontology term of the component_tipo (the relationship role label)
	*
	* The tipo constants rsc85/rsc86 are hardcoded in $ar_tipos; this method will
	* not work correctly for person sections whose name/surname components use
	* different tipos.
	* @param object $locator - locator object with section_tipo, section_id, component_tipo
	* @return object $label - {initials: string, full_name: string, role: string}
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
	* Re-save the component data after applying migration patches.
	*
	* Performs lightweight in-memory migrations before delegating to save():
	* - Converts legacy timecode format '[TC_mm:ss:ff_TC]' to
	*   '[TC_mm:ss:ff.000_TC]' (millisecond-precision normalisation).
	*
	* (!) Data must be loaded first to avoid overwriting existing content
	* with an empty array. A TODO note marks the geo-tag URL migration as
	* deferred (@todo).
	* @see class.tool_update_cache.php (tool_update_cache calls this on every record)
	* @return bool - always true; errors are logged inside save()
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

			$this->set_data($new_data);
		}

		// Save component data. Defaults arguments: $clean_text=true
		$this->save(
			true // bool clean_text
		);


		return true;
	}//end regenerate_component



	/**
	* GET_GEOJSON_DATA
	* Return GeoJSON feature data for this text area's spatial annotations.
	*
	* Tries build_geolocation_data() first. If that returns empty (e.g. the
	* component has no geo tags or the associated component_geolocation has no
	* data), falls back to reading the first related component_geolocation and
	* calling its get_diffusion_value_as_geojson() directly.
	*
	* Returns an empty array when no geolocation data can be found and logs
	* a WARNING when the related component_geolocation cannot be located in
	* the ontology.
	* @see ontology publication use in mdcat4091
	* @return array - array of GeoJSON feature layer objects, or [] when absent
	*/
	public function get_geojson_data() : array {

		// geolocation_data
			$ar_elements = $this->build_geolocation_data();

		// fallback optional
			if ( empty($ar_elements) ) {

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
				$geolocation_data = $component_geolocation->get_diffusion_value_as_geojson();
				if (!empty($geolocation_data)) {
					$ar_elements = json_decode($geolocation_data, true) ?? [];
				}
			}

		return $ar_elements; // array
	}//end get_geojson_data




	/**
	* BUILD_GEOLOCATION_DATA
	* Build the per-layer geolocation array from the paired component_geolocation.
	*
	* In v5 geolocation coordinates were embedded in the tag's HTML dataset
	* attribute. In v6/v7 they are stored in a separate component_geolocation.
	* This method reads the component_geolocation's lib_data layers and enriches
	* each layer with the text fragment that follows the corresponding geo tag in
	* the raw text, providing spatial context labels for map rendering.
	*
	* Consistency is verified: if the count of geo tags in the text does not equal
	* the count of layers in component_geolocation, an ERROR is logged (but only
	* for the main language to avoid flood on multilingual diffusion runs).
	*
	* Returns [] when the related component_geolocation is not found in the ontology,
	* when it has no data, or when lib_data is absent.
	* @return array - array of objects {layer_id, text, layer_data}, one per geo layer
	*/
	public function build_geolocation_data() : array {

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
			// empty data case
			if (empty($component_geolocation_data)) {
				return [];
			}
			$lib_data = $component_geolocation_data[0]->lib_data ?? null;
			if (empty($lib_data)) {
				return [];
			}

		// extract text from raw text_area data per geo tag layer_id
			$text_map = [];
			$data		= $this->get_data();
			$raw_text	= $data[0]->value ?? '';
			if (!empty($raw_text)) {
				$pattern_geo = TR::get_mark_pattern('geo', false);
				// Capture group 4 = layer_id (numeric id from geo tag)
				// Append ([^<]*) to capture text after the tag
				$pattern_geo_text = '/' . $pattern_geo . '([^<]*)/u';
				if (preg_match_all($pattern_geo_text, $raw_text, $matches, PREG_SET_ORDER)) {
					foreach ($matches as $match) {
						$layer_id	= (int) $match[4];
						$text		= end($match) ?? '';
						$text		= str_replace('&nbsp;', ' ', $text);
						$text		= strip_tags($text);
						$text		= trim($text);
						$text_map[$layer_id] = $text;
					}
				}
			}

			// (!) Currently, consistency between component_text_area and component_geolocation cannot be guaranteed.
			// Therefore, the data in component_geolocation will be used
			foreach ($lib_data as $layer) {

				$layer_data = $layer->layer_data ?? null;
				$layer_id	= $layer->layer_id ?? null;

				// create a new value for the layer
				$current_value = (object)[
					'layer_id'		=> $layer_id,
					'text'			=> $text_map[$layer_id] ?? '',
					'layer_data'	=> $layer_data
				];

				// add
				$ar_elements[] = $current_value;
			}

		// compare result
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
	* Data migration hook called by tool_update_data_version.
	*
	* No versions are currently handled for component_text_area; the switch
	* always hits the default case and returns result = 0 (not handled).
	* Add case branches here when future data-format migrations are needed.
	*
	* Result codes: 0 = not handled, 1 = updated, 2 = no change needed.
	* @param object $options - migration context; expected keys:
	*   update_version (array), data_unchanged (mixed), reference_id (mixed),
	*   tipo (string), section_id (string), section_tipo (string),
	*   context (string = 'update_component_data')
	* @return object $response - {result: int, msg: string}
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
	* Build the truncated, tag-resolved data array for list/thumbnail display.
	*
	* Overrides the generic component_common implementation to:
	* 1. Respect an original-language override: when a sibling component_select_lang
	*    declares that the content was recorded in a specific language (see rsc36),
	*    this method switches $this->lang to that language before fetching data.
	* 2. Resolve Dédalo [svg:…] tags to <img> HTML via TR::add_tag_img_on_the_fly(),
	*    so inline drawings are visible in list thumbnails.
	* 3. Truncate to $options->max_chars (default 130) using
	*    component_string_common::truncate_html() which closes open HTML tags at the
	*    cut-point to prevent broken markup.
	*
	* Returns null when the active language has no data (no fallback is applied here;
	* see get_fallback_list_value() for the separate fallback path).
	* @param ?object $options = null - recognised key: max_chars (int, default 130)
	* @return ?array - array of data-item objects with truncated HTML values, or null
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
						? component_string_common::truncate_html(
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
	* Return truncated HTML values from the fallback language for list display.
	*
	* Called when get_list_value() finds no data in the active language.
	* Resolves Dédalo tags to <img> HTML (TR::add_tag_img_on_the_fly) and
	* truncates to max_chars (default 700, larger than the edit truncation
	* to give context in read-only list rows) via truncate_html().
	*
	* Shared implementation used by component_text_area and component_html_text.
	* @param ?object $options = null - recognised key: max_chars (int, default 700)
	* @return ?array - array of data-item objects with truncated HTML values, or null
	*/
	public function get_fallback_list_value( ?object $options=null ) : ?array {

		// options
			$max_chars = $options->max_chars ?? 700;

		// data_fallback. array of each data array element using fallback
			$data_fallback = $this->get_component_data_fallback(
				$this->lang, // lang
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
						$value		= component_string_common::truncate_html(
							(int)$max_chars, // int maxLength
							$html_value, // string html
							true // bool isUtf8
						);

					// add final ... when is truncated
						// if (!empty($value) && strlen($value)<strlen($html_value)) {
						// 	$value .= ' ...';
						// }
				}

				$data_item->value = $value;

				$list_value[] = $data_item;
			}

		return $list_value;
	}//end get_fallback_list_value



	/**
	* GET_FALLBACK_EDIT_VALUE
	* Return stripped, truncated plain-text values from the fallback language for edit display.
	*
	* Unlike get_fallback_list_value(), this method strips all Dédalo markup
	* (TR::deleteMarks) and HTML tags (strip_tags) before truncating. The result
	* is a plain-text hint shown inside the editor when the current language has
	* no content, so users can see the fallback without interactive tags interfering.
	*
	* Truncation uses truncate_text() (plain text, not HTML-aware) at max_chars
	* (default 700).
	*
	* Shared implementation used by component_text_area and component_html_text.
	* @param ?object $options = null - recognised key: max_chars (int, default 700)
	* @return ?array - array of data-item objects with plain-text truncated values, or null
	*/
	public function get_fallback_edit_value( ?object $options=null ) : ?array {

		// options
			$max_chars = $options->max_chars ?? 700;

		// data_fallback. array of each data array element using fallback
			$data_fallback = $this->get_component_data_fallback(
				$this->lang, // lang
				DEDALO_DATA_LANG_DEFAULT // main_lang
			);

			if (empty($data_fallback)) {
				return null;
			}

		// list_value. Iterate data_fallback and truncate long text
			$edit_value = [];
			foreach ($data_fallback as $data_item) {

				$value = null;

				if(!empty($data_item->value)) {
					// delete all Dédalo tags
						$string_value = TR::deleteMarks($data_item->value);

					// delete every tag as paragraph tags
						$string_value = strip_tags($string_value);

					// truncate long text to be used
						$value = component_string_common::truncate_text(
							$string_value, // string html
							(int)$max_chars // int maxLength
						);
				}
				$data_item->value = $value;

				$edit_value[] = $data_item;
			}

		return $edit_value;
	}//end get_fallback_edit_value



	/**
	* CONFORM_IMPORT_DATA
	* Validate and normalise a raw CSV import value into the v7 data format.
	*
	* Handles three input shapes:
	* 1. JSON string (array): each element is wrapped to ensure it is a v7
	*    object with a 'value' property; already-wrapped objects have their
	*    'value' string normalised via the inner $normalize_value closure.
	* 2. JSON string (multi-language object keyed 'lg-*'): each language's
	*    values are normalised to an array of v7 items and the multi-lang
	*    object is preserved for the import tool's per-language iteration.
	* 3. Plain string: wrapped in paragraph tags and returned as a single-element
	*    v7 array if is_plain_bracket_string() confirms it is not malformed JSON.
	*
	* The $normalize_value closure ensures every text value is wrapped in
	* <p>…</p> and converts legacy <br>/<br> line-break markup to paragraph
	* pairs (CKEditor v5 no longer emits <br> as a line separator).
	*
	* Returns $response->result = null (with an error appended to errors[]) when
	* the value looks like malformed JSON (begins with [" or ends with "]).
	* @param string $import_value - raw value from the CSV import column
	* @param string $column_name - CSV column header (currently unused; reserved for future validation)
	* @return object $response - {result: array|object|null, errors: array, msg: string}
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// $normalize_value function to be used in any case, $import_value is an object, array or string
		// values need to be HTML compatible with ck-editor
		// Returns array of objects with 'value' property (v7 format) instead of plain strings
		// to prevent silent data loss in set_data_lang() which skips non-object items
			$normalize_value = function(array $import_value) : array {

				$value = [];
				foreach ($import_value as $text_value) {

					// numeric scalar values are admitted as text
						if (is_int($text_value) || is_float($text_value)) {
							$text_value = (string)$text_value;
						}

					// ignore non string values (objects, arrays, bool) to prevent substr TypeError
						if (!is_string($text_value)) {
							continue;
						}

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

					// Wrap into v7 format object with 'value' property
					$value[] = (object)['value' => $text_value];
				}

				return $value;
			};

		// object | array case
			// Check if is a JSON string. Is yes, decode
			// if data is a object | array it will be the Dédalo format and it's not necessary processed
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$data_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				if(is_array($data_from_json)){
					// Normalize: ensure all items are v7 objects with 'value' property
					$normalized = [];
					foreach ($data_from_json as $val) {
						if (is_object($val) && property_exists($val, 'value')) {
							// Already v7 format, normalize the text value inside
							$val->value = $normalize_value([$val->value])[0]->value ?? $val->value;
							$normalized[] = $val;
						}else if (is_object($val)) {
							// Object without 'value' (e.g. locator), pass through
							$normalized[] = $val;
						}else{
							// Plain string, wrap into v7 format
							$wrapped = $normalize_value([$val]);
							$normalized = [...$normalized, ...$wrapped];
						}
					}
					$data_from_json = $normalized;
				}else if (is_object($data_from_json)) {

					$first_key = array_key_first( (array)$data_from_json );
					if ($first_key!==null && strpos($first_key, 'lg-')===0) {
						// Multi-language object as {"lg-eng": "<p>My value</p>"}
						// Keep it as object so the import tool can iterate languages calling set_data_lang(),
						// but normalize every lang value into an array of v7 items
						foreach ($data_from_json as $key => $current_values) {
							$ar_values = is_array($current_values)
								? $current_values
								: [$current_values];

							$normalized = [];
							foreach ($ar_values as $val) {
								if (is_object($val) && property_exists($val, 'value')) {
									$val->value = $normalize_value([$val->value])[0]->value ?? $val->value;
									$normalized[] = $val;
								}else if (is_object($val)) {
									$normalized[] = $val;
								}else{
									$wrapped = $normalize_value([$val]);
									$normalized = [...$normalized, ...$wrapped];
								}
							}
							$data_from_json->$key = $normalized;
						}
					}else{
						// Single object item as {"value":"<p>x</p>"}. Wrap into an array
						if (property_exists($data_from_json, 'value')) {
							$data_from_json->value = $normalize_value([$data_from_json->value])[0]->value ?? $data_from_json->value;
						}
						$data_from_json = [$data_from_json];
					}
				}

				$response->result	= $data_from_json;
				$response->msg		= 'OK';

				return $response;
			}

		// string case
			// check the begin and end of the value string, if it has a [] or other combination that seems array
			// sometimes the value text could be [Ac], as numismatic legends, it's admit, but if the text has [" or "] it's not admitted.
			if (self::is_plain_bracket_string($import_value)) {

				// import_value is a string
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
	* Resolve the original recording language from a related component_select_lang.
	*
	* Some transcription text areas have a sibling component_select_lang that
	* records what language the source material (e.g. oral history interview) was
	* in. This method looks up that sibling in the ontology, reads its stored
	* locator, and converts it to a BCP-47-style lang code via
	* lang::get_code_from_locator().
	*
	* Returns null when no component_select_lang is related, when no data is
	* stored in it, or when the lang code cannot be resolved.
	* @return ?string - lang code string (e.g. 'lg-spa'), or null when unavailable
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
			$related_component_data = $related_component->get_data();
			if (!empty($related_component_data[0])) {

				$original_lang = lang::get_code_from_locator($related_component_data[0]);

				// set original lang
				return $original_lang;
			}
		}


		return null;
	}//end get_original_lang



	/**
	* GET_DIFFUSION_V5_REFERENCES_HTML
	* Produce HTML text with reference tags converted to the v5-compatible format.
	*
	* In v5/v6 reference tags embedded the locator in the tag's data attribute. In
	* v7 the locator is stored in a companion portal (tags_reference). This method
	* reads the reference portal data, matches each in-tag by numeric id against the
	* stored locators, rebuilds both the in- and out-reference tags with the locator
	* encoded as single-quoted JSON in the data field, then converts all tags to
	* their HTML <img> equivalents via TR::add_tag_img_on_the_fly().
	*
	* Only even-indexed matches are processed (every other match is an in-tag;
	* odd-indexed matches are out-tags handled as pairs). A logged ERROR is emitted
	* when an out-tag is missing for a matched in-tag.
	*
	* Returns null when data is absent. Returns the raw value (with only
	* add_tag_img_on_the_fly applied) when no tags_reference portal is configured.
	*
	* Used by component_html_text to generate publication output.
	* @return ?string - HTML string with resolved reference tags, or null when no data
	*/
	public function get_diffusion_v5_references_html() : ?string {

		$data = $this->get_data(); // Important: use raw text (!)

		// Get diffusion value
			$diffusion_value =  $data[0]->value ?? null;

		// empty diffusion value data case
			if (empty($diffusion_value)) {
				return null;
			}

		// Compatibility of the reference tag
		// set the references as v5, with tag locator as text

		// check if the component has a tags_reference component associated
		// if the component has, the references need to be changed into a text ref in data-data property.
		$tags_reference_tipo = $this->properties->tags_reference->tipo ?? null;
		if( !empty($tags_reference_tipo) ){

			$model = RecordObj_dd::get_modelo_name_by_tipo($tags_reference_tipo, true);

			// create the component relation with saved references
			$reference_tags_component = component_common::get_instance(
				$model,
				$tags_reference_tipo,
				$this->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$this->section_tipo,
				false
			);
			$ar_reference_locators = $reference_tags_component->get_data() ?? [];

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

					// find the locator associated to the tag
					$tag_locator = array_find($ar_reference_locators, function($locator) use( $tag_id ){
						return ( (int)$locator->tag_id === (int)$tag_id && $locator->tag_type === 'reference' );
					});
					if(is_object($tag_locator)){

						// transform to text HTML compatible.
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
							$new_reference_tag	= '[/reference-n-'.$tag_id.'-reference '.$tag_id.'-data:['.$data_string.']:data]';
							$search				= '/'.preg_quote($ar_full_references[$match_key+1], '/').'/';
							$diffusion_value	= preg_replace($search, $new_reference_tag, $diffusion_value, 1);
						}//end if (!isset($ar_full_references[$match_key+1])
					}//end if(isset($tag_locator))
				}//end if ($match_key % 2 == 0
			}//end foreach ($all_reference_tags[3] as $match_key => $tag_id)


			// change the reference tag to html equivalent
			$diffusion_value = TR::add_tag_img_on_the_fly($diffusion_value);

		}//end if( isset($tags_reference_tipo)


		return $diffusion_value;
	}//end get_diffusion_v5_references_html



}//end class component_text_area
