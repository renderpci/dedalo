<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INPUT_TEXT
* Manages single-line text input components in Dédalo.
*
* Provides a simple text field for short string values with support for:
* - Multi-language content with fallback to the default language
* - Grid display with configurable record separators
* - Data resolution for list views and exports
* - Type-ahead/autocomplete integration via search
*
* Stores text data as simple string values wrapped in v7 item objects
* ({ value: string, lang: string }). For rich text or multi-line content,
* use component_text_area instead.
*
* Data format: Arrays of objects with a 'value' property containing the text string
* (e.g. [{"value":"My text","lang":"lg-eng"}]).
*
* Extends component_string_common for string-based component functionality.
* component_string_common in turn extends component_common (the root component base).
*
* Known direct callers / extension points:
* - tool_export calls get_export_value() via the export tabulator pipeline.
* - The import tool calls conform_import_data() before set_data_lang().
* - The Time Machine inspector calls get_list_value() for display in the history panel.
*
* @package Dédalo
* @subpackage Core
*/
class component_input_text extends component_string_common {



	/**
	* GET_EXPORT_VALUE
	* Atoms-based export contract implementation (see component_common::get_export_value).
	*
	* Produces an export_value containing one export_atom per data item in the
	* current language. When the current language slice is empty, the method
	* falls back to another available language via get_component_data_fallback()
	* and marks every atom with is_fallback=true so the tabulator can style or
	* filter untranslated content.
	*
	* records_separator resolution order (first wins):
	*   1. $context->ddo->records_separator (caller override via ddo_map entry)
	*   2. $this->get_properties()->records_separator (component definition in ontology)
	*   3. ' | ' (hardcoded default, matching legacy get_grid_value behaviour)
	*
	* Note: fields_separator is deliberately set to the same value as
	* records_separator on the leaf segment. This preserves flat-output parity
	* with the legacy get_grid_value() which pre-joined items with records_separator
	* before returning a single string.
	*
	* @param export_context|null $context = null - Export context; a default context is
	*   created when null, which uses the instance's own lang and no path prefix.
	* @return export_value - Container holding one atom per text item (empty when no data).
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
	* Returns the component data for list-view display, with a special-case
	* override for the Root user (-1) in Time Machine ('tm') mode.
	*
	* Delegates to parent::get_list_value() (component_common), which returns
	* the current-language data slice. The override is needed because the Root
	* user record has section_id === -1 and typically has no stored name value;
	* without this guard the inspector's 'Component history' panel would show
	* an empty cell for the user column.
	*
	* @return array|null - Language-filtered data items for list display, or null when empty.
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
	* Migration hook called by tool_update_cache and similar batch scripts when
	* the stored data format for this component type needs to be upgraded.
	*
	* component_input_text currently has no known versioned migration; the
	* switch has no matching case and always falls through to the default,
	* returning result=0 (no update available for the requested version).
	*
	* Result codes (documented here and in parent component_common::update_data_version):
	*   0 - Component does not implement an update for this version (no-op, safe to ignore).
	*   1 - Data was updated and persisted.
	*   2 - Data was inspected but required no change (already at target version).
	*
	* Recognised keys in $request_options (unknown keys are silently ignored):
	*   update_version  array   Version tuple, e.g. [7,4,0]; joined to "7.4.0" for the switch.
	*   data_unchanged  mixed   Passed by the caller; available for comparison if needed.
	*   reference_id    mixed   Caller-side reference for log correlation.
	*   tipo            string  Ontology tipo of the component being migrated.
	*   section_id      int     Section row being migrated.
	*   section_tipo    string  Section ontology tipo.
	*   context         string  Calling context tag (default 'update_component_data').
	*
	* @param object $request_options - Migration options; see recognised keys above.
	* @return object $response - {result: int, msg: string}
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

		// version string. $update_version is an array tuple (e.g. [7,4,0])
		// imploded to "7.4.0" so the switch can match readable version strings
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
	* Validates and transforms a raw import cell value into the v7 data format
	* expected by set_data_lang() (an array of item objects with a 'value' property,
	* or a lang-keyed object for multi-language imports).
	*
	* Handles three input shapes (detected in order):
	*
	* 1. JSON string — decoded, then normalised per its decoded type:
	*    - array    → each element is wrapped in {value:...} if not already an object
	*                 with 'value' or 'section_id'.
	*    - object keyed by 'lg-*' (multi-language map) → each lang value is expanded
	*                 to an array of normalised items so the import tool can call
	*                 set_data_lang() once per language key.
	*    - plain object (single item) → wrapped into a single-element array.
	*
	* 2. Plain bracket string (non-JSON starting with '[' but not '["') — treated
	*    as literal text (e.g. numismatic legend '[Ac]'); wrapped into
	*    [{value: $import_value}].
	*
	* 3. Malformed bracket string (starts with '["' or ends with '"]') — rejected as
	*    likely corrupted JSON; logs an error and returns result=null with errors populated.
	*
	* Result contract (mirrors component_common::conform_import_data):
	*   result  array|object|null   The normalised v7 data, or null on failure.
	*   errors  array               Non-fatal error descriptors (empty on success).
	*   msg     string              'OK' on success, error description on failure.
	*
	* @param string $import_value - Raw cell value from the import file (CSV or JSON).
	* @param string $column_name  - Column name from the import file (used for error context).
	* @return object $response - {result: array|object|null, errors: array, msg: string}
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
