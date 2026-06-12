<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INPUT_TEXT
* Manages single-line text input components in Dédalo.
*
* Provides a simple text field for short string values with support for:
* - Multi-language content with fallback to default language
* - Grid display with configurable record separators
* - Data resolution for list views and exports
* - Type-ahead/autocomplete integration via search
*
* Stores text data as simple string values. For rich text or multi-line content,
* use component_text_area instead.
*
* Data format: Objects with 'value' property containing the text string.
*
* Extends component_string_common for string-based component functionality.
*
* @package Dédalo
* @subpackage Core
*/
class component_input_text extends component_string_common {



	/**
	* GET_EXPORT_VALUE
	* Atoms based export contract (see component_common::get_export_value).
	* One atom per data item in the current lang; when the current lang is
	* empty, fallback items are emitted flagged as is_fallback.
	* Note that the leaf segment fields_separator is set to the resolved
	* records_separator because the legacy grid pre-joined the items with
	* records_separator (flat output parity).
	* @param export_context|null $context = null
	* @return export_value
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// records_separator. resolved as the legacy get_grid_value
			$properties			= $this->get_properties();
			$records_separator	= $context->ddo?->records_separator
				?? $properties?->records_separator
				?? ' | ';

		// own segment. items join with records_separator (legacy pre-join parity)
			$segment = new export_path_segment($this->section_tipo, $this->tipo, (object)[
				'model'				=> $this->get_model(),
				'fields_separator'	=> $records_separator,
				'records_separator'	=> $records_separator,
				// relation traversal position (set by the calling relation via descend)
				'item_index'		=> $context->item_index,
				'section_id'		=> $context->item_section_id
			]);
			$path = [...$context->path_prefix, $segment];

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
				$item_value = $item->value ?? '';
				// Handle case where value is an object (convert to JSON string)
				if (is_object($item_value)) {
					$item_value = json_encode($item_value);
				}
				$export_value->add_atom( new export_atom($path, $item_value, (object)[
					'value_index'	=> $value_index++,
					'lang'			=> $item->lang ?? $this->lang,
					'is_fallback'	=> $is_fallback
				]) );
			}


		return $export_value;
	}//end get_export_value



	/**
	* GET_LIST_VALUE
	* Overwrites the component_common method adding a special case
	* resolution for time machine mode ('tm') and user Root (-1)
	* @return array
	*/
	public function get_list_value() : ?array {

		$value = parent::get_list_value();

		// Root user special resolution in 'tm' mode.
		// In inspector's 'Component history' the root user is not displayed if not force hard resolution.
		if($this->section_tipo===DEDALO_SECTION_USERS_TIPO && empty($value) && $this->section_id==-1) {
			$value = [(object)[
				'value' => 'Root',
				'lang' => $this->lang
			]];
		}

		return $value;
	}//end get_list_value



	/**
	* UPDATE_DATA_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->data_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
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
				$data_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				// normalize_items: ensure array items are objects with 'value' property (v7 format)
				$normalize_items = function(array $items) : array {
					$normalized = [];
					foreach ($items as $val) {
						if (!is_object($val)) {
							$normalized[] = (object)['value' => $val];
						}else if (!property_exists($val, 'value') && !property_exists($val, 'section_id')) {
							// Object without 'value' property and not a locator: wrap it
							$normalized[] = (object)['value' => $val];
						}else{
							$normalized[] = $val;
						}
					}
					return $normalized;
				};

				if (is_array($data_from_json)) {

					$data_from_json = $normalize_items($data_from_json);

				}else if (is_object($data_from_json)) {

					$first_key = array_key_first( (array)$data_from_json );
					if ($first_key!==null && strpos($first_key, 'lg-')===0) {
						// Multi-language object as {"lg-eng": "My value", "lg-spa": "Mi valor"}
						// Keep it as object so the import tool can iterate languages calling set_data_lang(),
						// but normalize every lang value into an array of v7 items
						foreach ($data_from_json as $lang => $lang_value) {
							$ar_lang_value = is_array($lang_value)
								? $lang_value
								: [$lang_value];
							$data_from_json->$lang = $normalize_items($ar_lang_value);
						}
					}else{
						// Single object item as {"value":"x"}. Wrap into an array
						$data_from_json = $normalize_items([$data_from_json]);
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
				// Wrap plain string into v7 format: [(object)['value' => $import_value]]
				// set_data_lang() requires object items; plain strings would be silently dropped
				$value = !empty($import_value) || $import_value==='0'
					? [(object)['value' => $import_value]]
					: null;
			}else{
				// import value seems to be a JSON malformed.
				// it begin [" or end with "]
				// log JSON conversion error
				debug_log(__METHOD__
					." Invalid JSON value, seems a syntax error: ". PHP_EOL
					.' import_value: ' . json_encode($import_value, JSON_PRETTY_PRINT)
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
