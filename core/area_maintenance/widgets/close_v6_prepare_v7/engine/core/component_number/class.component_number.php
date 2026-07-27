<?php declare(strict_types=1);
include_once 'trait.search_component_number.php';
include_once 'trait.search_component_number_tm.php';
/**
* CLASS COMPONENT_NUMBER
* Manages numeric data (integer or floating-point) with configurable type and precision.
*
* This is a **literal-direct** component: it owns and formats its own value without
* referencing any other ontology node. It stores one or more numeric values per record
* inside the matrix `number` column (keyed by the component `tipo`).
*
* Why it exists:
* - Cultural-heritage data frequently contains genuine numeric quantities (measurements,
*   weights, counts, amounts) that must sort numerically and be filterable with comparison
*   and range operators. component_input_text cannot satisfy those requirements.
*
* Data model (storage):
* - Matrix column:   `number`
* - Value shape:     array of v7 value objects  [ {"id":5, "value":31416.2}, … ]
* - Types supported: int | float
* - Default type:    float with precision 2
* - Decimal separator in storage: always '.' — no thousand separator, no locale suffix
* - Not translatable: constructor forces lang = DEDALO_DATA_NOLAN (lg-nolan)
*
* Configuration via ontology node `properties`:
* - "type":      "int" | "float"   (default: "float")
* - "precision": <integer>         (decimal places when type is float; default: 2)
*
* Legacy note:
*   Ontology created before 04/07/2024 used an object form like "type":{"float":2}.
*   The flat form "type":"float" + "precision":2 is correct. Both formats are tolerated
*   in practice but only the flat form is canonical going forward.
*
* Internationalization:
*   Display formatting (e.g. the Spanish/French "1.234,56" for stored "1234.56") is
*   applied exclusively in the render/view layer and is never persisted.
*
* Extends component_common.
* Uses traits: search_component_number, search_component_number_tm.
* Extended by: nothing (concrete leaf class).
*
* @package Dédalo
* @subpackage Core
*/
class component_number extends component_common {



	// traits. Files added to current class file to split the large code.
	use search_component_number;
	use search_component_number_tm;



	/**
	* Decimal separator used when parsing import input strings.
	* Storage always uses '.' as the separator regardless of this value.
	* Set to ',' before calling string_to_number() / conform_import_data() when
	* the import source uses the European comma convention (e.g. Spanish "3,14").
	* @var string $decimal
	*/
	public string $decimal = '.';



	/**
	* __CONSTRUCT
	* Initialises the component and forces the language to DEDALO_DATA_NOLAN (lg-nolan).
	*
	* Numbers are not translatable: regardless of any $lang argument passed by the
	* caller, the lang is always overridden to DEDALO_DATA_NOLAN before the parent
	* constructor runs so that get_data()/set_data() always operate on the single
	* non-translatable partition.
	*
	* Use component_common::get_instance() as the standard factory; this constructor
	* should not be called directly by external code.
	*
	* @param string $tipo          - ontology tipo identifier of this component (e.g. 'dd1234')
	* @param mixed  $section_id    = null - section record id
	* @param string $mode          = 'list' - rendering mode (edit|list|search|tm)
	* @param string $lang          = DEDALO_DATA_NOLAN - ignored; always forced to DEDALO_DATA_NOLAN
	* @param ?string $section_tipo = null - tipo of the parent section
	* @param bool   $cache         = true - whether to use the component instance cache
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Force non-translatable lang before delegating to parent, so parent's
		// cache key and data queries always use lg-nolan regardless of caller intent.
		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_DATA
	* Retrieves stored numeric data and applies type/precision formatting defined by ontology.
	*
	* Calls parent::get_data() to load raw items from the database, then iterates each
	* value object and runs set_format_form_type() to cast and round the stored numeric
	* literal to the configured type (int|float) and precision. This ensures callers
	* always receive values that conform to the ontology definition rather than whatever
	* literal was persisted (useful when the precision property was changed after data entry).
	*
	* Items whose value is null are passed through unchanged (they represent empty slots
	* with dataframe metadata but no numeric data yet). Items with a null object reference
	* (corrupted data) are skipped with an error log.
	*
	* @return ?array - array of value objects with formatted numeric .value, or null if
	*                  no data is stored for this component/section combination
	*/
	public function get_data() : ?array {

		$data = parent::get_data();

		if($data === null){
			return null;
		}

		$format_data = [];
		foreach ( $data as $data_element ) {
			// Wrong data!
			// A null element in the array indicates corrupted storage; log and skip.
			if($data_element === null){
				debug_log(__METHOD__
					. ' WARNING : Invalid data item! removed ' . PHP_EOL
					. ' data: ' . to_string($data)
					, logger::ERROR
				);
				continue;
			}
			// Empty values
			// save it as is.
			// An item with value===null is a valid placeholder (e.g. a dataframe-only
			// row awaiting a number). Preserve it without formatting.
			if($data_element->value === null){
				$format_data[] = $data_element;
				continue;
			}
			// values are not empty, format them.
			// Clone the object so the shared cache copy is not mutated.
			$new_item = clone($data_element);
			$new_item->value = $this->set_format_form_type($data_element->value);
			$format_data[] = $new_item;
		}


		return $format_data;
	}//end get_data



	/**
	* SET_DATA
	* Validates, formats, and persists incoming numeric data to the database.
	*
	* Before delegating to parent::set_data(), each value object goes through two gates:
	* 1. Non-numeric values are rejected with an error log and silently dropped from the
	*    saved payload — they are never written to the database.
	* 2. Valid numeric values are formatted by set_format_form_type() (type-cast + precision
	*    rounding) before the clone is added to $safe_data.
	*
	* After filtering, if the resulting array is empty (all items were null or non-numeric),
	* $safe_data is set to null so that parent::set_data() correctly marks the field as empty
	* rather than persisting an empty array.
	*
	* @param ?array $data - array of value objects from the client; null means "clear the field"
	* @return bool        - true on successful save, false on database write failure
	*/
	public function set_data( ?array $data ) : bool {

		// Empty data
		// Bypass the iteration if the entire incoming array is already logically empty.
		if ($this->is_empty_data($data)) {

			$safe_data = null;

		}else{

			$safe_data = [];
			foreach ( $data as $data_element ) {
				// Wrong data!
				// Null element object (corrupted payload); log and skip.
				if($data_element === null){
					debug_log(__METHOD__
						. ' WARNING : Invalid data item! removed ' . PHP_EOL
						. ' data: ' . to_string($data)
						, logger::ERROR
					);
					continue;
				}
				// Empty values
				// save it as is.
				// Preserve null-valued items (dataframe placeholders) without casting.
				if($data_element->value === null){
					$safe_data[] = $data_element;
					continue;
				}
				// values are not empty, format them.
				// Only numeric values are accepted; non-numeric strings (e.g. user entry error)
				// are logged and dropped so garbage is never persisted.
				if ( is_numeric($data_element->value) ) {
					$new_item = clone($data_element);
					$new_item->value = $this->set_format_form_type($data_element->value);
					$safe_data[] = $new_item;
				}else{
					// trigger_error
					debug_log(__METHOD__
						." Invalid value! [component_number.set_data] value: "
						.'data_element: ' . to_string($data_element)
						, logger::ERROR
					);
				}
			}

			// empty data case
			// All incoming items were invalid; treat the result as an explicit clear.
			if ($this->is_empty_data($safe_data)) {
				$safe_data = null;
			}
		}


		return parent::set_data( $safe_data );
	}//end set_data



	/**
	* SET_FORMAT_FORM_TYPE
	* Casts and rounds a single numeric value to the type/precision defined by this
	* component's ontology properties.
	*
	* Called by both get_data() (on read) and set_data() (on write) so that every value
	* that passes through the component conforms to the configured format.
	*
	* Formatting rules:
	* - No properties->type set  → cast to float (safe default).
	* - type = "int"             → cast to int (decimals discarded).
	* - type = "float" (default)
	*     a) A string with no '.' or ',' is treated as an integer literal first (avoids
	*        PHP float precision noise from casting "42" directly to float).
	*     b) Non-integer / non-double PHP types are logged as unexpected and forced to int
	*        as a safe fallback before rounding.
	*     c) round($value, $precision) with precision defaulting to 2.
	*
	* Returns null for falsy values that are not the integer 0, so that empty strings and
	* null literals are not silently stored as 0.
	*
	* (!) The return type hint includes string only because PHP's type system does not
	* let the method guarantee int|float after all code paths; in practice the returned
	* value is always int, float, or null when the input was numeric.
	*
	* @param mixed $value - raw value to format (string, int, float, or null expected)
	* @return int|float|string|null - formatted value, or null when $value is empty/falsy
	*/
	public function set_format_form_type( mixed $value ) : int|float|string|null {

		if( empty($value) && $value!==0 ) {
			return null;
		}

		$properties = $this->get_properties();
		if(empty($properties->type)) {

			// default format is float
			// No type property in ontology: apply the safe float default.
			return (float)$value;

		}else{

			switch ($properties->type) {

				case 'int':
					return (int)$value;

				case 'float':
				default:
					// String with no decimal separator: treat as plain integer first to avoid
					// PHP float precision artefacts when casting "42" → 42.0 → round(42.0, 2).
					if (gettype($value)==='string' && strpos($value,',')===false && strpos($value,'.')===false) {
						$value = (int)$value;
					}
					// Guard: only integer and double PHP types are safe to pass to round().
					// Any other type (e.g. an unexpected array or object) is logged and coerced
					// to int before rounding to prevent a fatal TypeError from round().
					if (gettype($value)!=='integer' && gettype($value)!=='double') {
						debug_log(__METHOD__
							. " Converting unexpected type. Forced to integer to prevent issues " . PHP_EOL
							. ' type: ' . gettype($value) . PHP_EOL
							. ' value: ' . to_string($value)
							, logger::ERROR
						);
						$value = (int)$value;
					}
					$precision = $properties->precision ?? 2;
					$value = is_numeric($value)
						? (float)round($value, $precision)
						: (float)$value;
					break;
			}
		}//end if(empty($properties->type))


		return $value;
	}//end set_format_form_type



	/**
	* NUMBER_TO_STRING
	* Converts a numeric value to a canonical string representation suitable for
	* export, diffusion, or round-trip import.
	*
	* The resulting string always uses '.' as the decimal separator (commas are
	* replaced) and applies the component's precision for float types via
	* number_format() — e.g. 3.14159 with precision 2 becomes "3.14".
	*
	* Used by export/diffusion layers that require a string form of the stored number
	* (e.g. CSV export, RDF literal generation).  Not intended for display: the view
	* layer applies its own locale-aware formatting independently.
	*
	* Note: the $value parameter has no type hint in the signature. Callers are
	* expected to pass a numeric value (int|float|string); non-numeric input is
	* returned as-is after the comma→dot replacement.
	*
	* @param mixed  $value - numeric value to stringify
	* @return string       - canonical string form of the number
	*/
	public function number_to_string( $value ) : string {

		$properties = $this->get_properties();

		// default value
		$string_value = $value;

		if (!empty($value) && !empty($properties->type)) {

			switch ($properties->type ) {
				case 'int':
					// nothing to do
					// Integer type: the value is already an integer literal; no formatting needed.
					break;

				case 'float':
				default:
					// Apply fixed-point formatting to guarantee the correct number of decimal
					// places in the exported string (e.g. "3.10" not "3.1" with precision 2).
					$precision		= $properties->precision ?? 2;
					$string_value	= is_numeric($value)
						? number_format($value, $precision, '.', '')
						: $value;
					break;
			}
		}//end if (!empty($value))

		// Normalise any locale-style comma decimal separator that may have leaked
		// in from the raw value before returning.
		$string_value = str_replace(',', '.', (string)$string_value);


		return (string)$string_value;
	}//end number_to_string



	/**
	* STRING_TO_NUMBER
	* Parses an import string into a typed numeric value (int or float).
	*
	* Intended for import paths: CSV import, external data ingestion, and
	* conform_import_data(). The caller is responsible for setting $this->decimal
	* to ',' when the import source uses the European comma convention before
	* calling this method.
	*
	* Parsing steps:
	* 1. Determine the target PHP type from ontology properties->type (default float).
	* 2. Normalise the decimal separator according to $this->decimal:
	*    - decimal ',' (European): strip thousand-separator dots first, then replace
	*      comma with dot so PHP can parse the result ("1.234,56" → "1234.56").
	*    - decimal '.' (default):  strip thousand-separator commas ("1,234.56" → "1234.56").
	* 3. Strip any remaining non-numeric characters except '-', '.', ',' (currency
	*    symbols, unit suffixes, etc.) via preg_replace.
	* 4. Return null for strings that become empty after stripping (truly unparseable).
	* 5. Cast and return using intval() or floatval().
	*
	* Known limitation (TODO):
	*   Scientific notation (e.g. "9 x 2^10", "1.5e3") is not yet supported.
	*   A dedicated type / parsing branch is planned.
	*
	* @param string $string_value - raw import string (e.g. "3,14", "1.234.567,89", "$42")
	* @return int|float|null      - parsed number, or null when the string cannot be parsed
	*/
	public function string_to_number( string $string_value ) : int|float|null {

		// Resolve type: reads ontology properties->type so the imported value is coerced
		// to the same type as values entered through the edit UI.
		$properties	= $this->get_properties();
		$type 		= !empty($properties->type)
			? $properties->type
			: 'float';

		// Decimal separator normalisation.
		// $this->decimal is set by the import tool's UI (default '.').
		// Users can define it into the tool_import_csv or other tools interfaces.
		$decimal = $this->decimal;
		if($decimal===',') {
			// European format: "1.234,56" → remove thousand-separator dots → "1234,56"
			// then replace comma decimal → "1234.56" so PHP functions can parse it.
			$string_value = str_replace('.', '', (string)$string_value);
			$string_value = str_replace(',', '.', (string)$string_value);
		}else{
			// Anglo format: "1,234.56" → remove thousand-separator commas → "1234.56".
			$string_value = str_replace(',', '', (string)$string_value);
		}

		// TODO
		// exception to scientific notation: 9 x 2^10
		// this will be set new type and component_number behavior

		// Strip non-numeric characters (units, currency symbols, whitespace, etc.)
		// keeping only digits, minus sign, and the dot decimal separator.
		$clean_string_value = preg_replace('/[^-.,0-9]/', '', $string_value);

		if($clean_string_value===''){
			return null;
		}

		// parse it into number
		switch ($type ) {
			case 'int':
				$number = intval($clean_string_value);
				break;

			case 'float':
			default:
				$number = floatval($clean_string_value);
				break;
		}

		return $number;
	}//end string_to_number







	/**
	* UPDATE_DATA_VERSION
	* Migration hook called by the data-version update tool when the stored data shape
	* must be transformed to a newer format.
	*
	* component_number currently has no version-specific migrations: the switch falls
	* through to the default case and returns result = 0 (no update applied), which the
	* update tool treats as "this component does not handle this version — skip".
	*
	* Possible result codes (shared contract across all components):
	*   0 — component has no update handler for the requested version (ignored).
	*   1 — component successfully applied the migration.
	*   2 — component attempted the migration but data was already in the new format.
	*
	* @param object $request_options - options bag; recognised keys:
	*   ->update_version  array   - version tuple, e.g. [7, 2, 1]
	*   ->data_unchanged  mixed   - original data snapshot for comparison
	*   ->reference_id    mixed   - migration reference identifier
	*   ->tipo            string  - component tipo
	*   ->section_id      mixed   - section record id
	*   ->section_tipo    string  - section tipo
	*   ->context         string  - caller context tag (default: 'update_component_data')
	* @return object $response - stdClass with ->result (int) and ->msg (string)
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

		$update_version_string = implode('.', $update_version);
		switch ($update_version_string) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version_string). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* CONFORM_IMPORT_DATA
	* Parses an import cell value into the v7 array-of-value-objects format expected
	* by set_data(), reporting structural errors without throwing exceptions.
	*
	* Called by the CSV import tool (tool_import_dedalo_csv) and any other import path
	* that feeds raw cell strings into a component. The caller must set $this->decimal
	* beforehand when the source file uses a comma as the decimal separator.
	*
	* Accepted input formats (in priority order):
	* 1. JSON string encoding a v7 array of value objects:
	*      '[{"value":9.76},{"value":10},{"value":0.22}]'
	*    Array items that are bare numbers are normalised to {"value":<n>} objects.
	* 2. JSON string encoding a bare array of numbers (v6 form):
	*      '[9.76, 10, 0.22]'
	*    Each element is wrapped into a {"value":<n>} object.
	* 3. JSON string encoding a lang-keyed object (legacy raw export):
	*      '{"lg-nolan":[104]}'
	*    Since the component is non-translatable, the first lg-* partition is extracted
	*    and its items are normalised to {"value":<n>} objects.
	* 4. JSON string encoding a single value object:
	*      '{"value":5}'
	*    Wrapped into a one-element array.
	* 5. Plain numeric string (simplest CSV form):
	*      '5.87'  or  '5,87'  (if $this->decimal === ',')
	*    Parsed by string_to_number() and wrapped into [{"value":<n>}].
	* 6. Empty string (no value) → returns result = null (field cleared).
	*
	* On success:  $response->result holds the array of value objects; ->msg is 'OK'.
	* On failure:  $response->result is null; a $failed descriptor is appended to
	*              $response->errors and the method returns early.
	*
	* @param string $import_value - raw cell string from the import source
	* @param string $column_name  - name of the CSV column (unused here; part of the shared contract)
	* @return object $response    - stdClass with ->result (?array), ->errors (array), ->msg (string)
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// object | array case
			// Check if is a JSON string. If yes, decode.
			// If the value is already a Dédalo-format object or array it does not need
			// further string parsing; just normalise and return it.
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$data_from_json	= json_handler::decode($import_value);

				// Normalize: ensure it is an array of objects with 'value' property
				if (is_array($data_from_json)) {
					// Array of bare numbers (v6 form) or mixed: wrap plain scalars.
					foreach ($data_from_json as $key => $val) {
						if (!is_object($val)) {
							$data_from_json[$key] = (object)['value' => $val];
						}
					}
				}else if (is_object($data_from_json)) {

					$first_key = array_key_first( (array)$data_from_json );
					if ($first_key!==null && strpos($first_key, 'lg-')===0) {
						// Lang keyed object as {"lg-nolan":[104]} (legacy raw export)
						// component_number is non translatable: extract the first lang value
						// and normalize it into an array of v7 items
						$lang_value = $data_from_json->{$first_key};
						$ar_lang_value = is_array($lang_value)
							? $lang_value
							: [$lang_value];
						$normalized = [];
						foreach ($ar_lang_value as $val) {
							$normalized[] = (is_object($val))
								? $val
								: (object)['value' => $val];
						}
						$data_from_json = $normalized;
					}else if (property_exists($data_from_json, 'value')) {
						// Single object item as {"value":5}. Wrap into an array
						$data_from_json = [$data_from_json];
					}else{
						// JSON object with an unrecognised shape (no lg-* key, no 'value').
						// Cannot safely extract a number; report as ignored error.
						$failed = new stdClass();
							$failed->section_id		= $this->section_id;
							$failed->data			= stripslashes( $import_value );
							$failed->component_tipo	= $this->get_tipo();
							$failed->msg			= 'IGNORED: object without value property '. to_string($import_value);
						$response->errors[] = $failed;

						return $response;
					}
				}

				$response->result	= $data_from_json;
				$response->msg		= 'OK';

				return $response;
			}

		// string case (all data become as string)
			// '0' is a legitimate value; empty() alone would incorrectly classify it as empty.
			if(empty($import_value) && $import_value !== '0'){

				$response->result	= null;
				$response->msg		= 'OK';

				return $response;
			}

		// convert value
			// Delegate to string_to_number() which handles decimal separator and type coercion.
			$value = $this->string_to_number($import_value);

		// if the value cannot be converted to number show error with the value.
			if($value === null){

				// log JSON conversion error
				debug_log(__METHOD__
					."import value is not numeric: ".PHP_EOL
					."value: ".$import_value.PHP_EOL
					."decimal: ".$this->decimal
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

		// Successful plain-string parse: wrap the single number in the standard v7 shape.
		$response->result	= [(object)['value' => $value]];
		$response->msg		= 'OK';

		return $response;
	}//end conform_import_data



	/**
	* GET_ORDER_PATH
	* Calculates the sort path descriptor used by the list view to order records by
	* this component's value column in the PostgreSQL JSONB matrix.
	*
	* The parent implementation resolves the standard JSONB path via the ddo_map
	* (e.g. `->>'number'->'dd1234'`). component_number overrides it to handle the two
	* Time Machine pseudo-columns that are stored as literal SQL columns rather than
	* JSONB keys, so that the ORDER BY clause targets the real column directly.
	*
	* Time Machine special cases:
	*   - DEDALO_TIME_MACHINE_COLUMN_SECTION_ID ('dd1212'):  maps to SQL column `section_id`
	*   - DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID ('dd1371'): maps to SQL column `bulk_process_id`
	*
	* When $path[0]->column is set, the sort builder uses it as a literal column name
	* instead of constructing a JSONB path expression.
	*
	* @see https://habr.com/en/company/postgrespro/blog/500440/
	* @see https://www.postgresql.org/docs/current/functions-json.html
	* @see https://www.postgresql.org/docs/current/datatype-json.html#TYPE-JSONPATH-ACCESSORS
	*
	* @param string $component_tipo - tipo of the component being sorted
	* @param string $section_tipo   - tipo of the parent section
	* @return array                 - path descriptor array (see parent::get_order_path())
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		// self path
		// Build the standard JSONB sort path via the parent implementation.
		$path = parent::get_order_path($component_tipo, $section_tipo);

		// time machine cases. Do not resolve ddo_map. Tipo 'dd1212' is column `section_id`
		// These tipos represent dedicated integer columns in matrix_time_machine, not JSONB.
		// Setting ->column overrides the JSONB path so the sort builder emits e.g.
		// "ORDER BY section_id::integer" instead of a jsonpath expression.
		if($this->tipo===DEDALO_TIME_MACHINE_COLUMN_SECTION_ID) {
			// When `column` property is set, it will be used literally instead of parsing the path.
			$path[0]->column = 'section_id';
		}else if($this->tipo===DEDALO_TIME_MACHINE_COLUMN_BULK_PROCESS_ID) {
			$path[0]->column = 'bulk_process_id';
		}


		return $path;
	}//end get_order_path



}//end class component_number
