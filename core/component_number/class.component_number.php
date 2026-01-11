<?php declare(strict_types=1);
include 'trait.search_component_number.php';
/**
* CLASS COMPONENT_NUMBER
* Manage numbers with specific precision
* types supported : int|float
* data_column_name = 'number'
* (!) Note that Ontology previous to 04/07/2024 used a wrong object format like "type":{"float":2}
* data format : [number,xx]
* data example : [6.12]
* example multiple : [6.12,88]
* Default type : float
* Default precision: 2
* Default decimal separator: . used as $decimal public variable
* Properties can define the type and precision as "type":"float", "precision":4
* Notes: Data storage format does not support internationalization for numbers the float point is always . and does not use thousand separator
* but is possible format it in render->view to accommodate to specific formats as Spanish format 1.234,56 from data 1234.56
*/
class component_number extends component_common {


	// traits. Files added to current class file to split the large code.
	use search_component_number;

	// decimal separator

	public $decimal = '.';

	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = false;



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_DATA
	* Obtain the data from DB and format as ontology defines
	* @return array|null
	*/
	public function get_data() : ?array {

		$data = parent::get_data();

		if($data === null){
			return null;
		}

		$format_data = [];
		foreach ( $data as $data_element ) {
			// Wrong data!
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
			if($data_element->value === null){
				$format_data[] = $data_element;
				continue;
			}
			// values are not empty, format them.
			$new_item = clone($data_element);
			$new_item->value = $this->set_format_form_type($data_element->value);
			$format_data[] = $new_item;
		}


		return $format_data;
	}//end get_data



	/**
	* SET_DATA
	* Format the given data with the properties set in ontology
	* Format could be 'int' or 'float'.
	* @return bool
	*/
	public function set_data( ?array $data ) : bool {

		// Empty data
		if ($this->is_empty_data($data)) {

			$safe_data = null;

		}else{

			$safe_data = [];
			foreach ( $data as $data_element ) {
				// Wrong data!
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
				if($data_element->value === null){
					$safe_data[] = $data_element;
					continue;
				}
				// values are not empty, format them.
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
			if ($this->is_empty_data($safe_data)) {
				$safe_data = null;
			}
		}


		return parent::set_data( $safe_data );
	}//end set_data



	/**
	* SET_FORMAT_FORM_TYPE
	* Format the data into the standard format or the properties format of the current instance of the component
	* @param mixed $value
	* @return int|float|null $value
	*/
	public function set_format_form_type( mixed $value ) : int|float|string|null {

		if( empty($value) && $value!==0 ) {
			return null;
		}

		$properties = $this->get_properties();
		if(empty($properties->type)) {

			// default format is float
			return (float)$value;

		}else{

			switch ($properties->type) {

				case 'int':
					return (int)$value;

				case 'float':
				default:
					if (gettype($value)==='string' && strpos($value,',')===false && strpos($value,'.')===false) {
						$value = (int)$value;
					}
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
	* Format the data into the standard format or the properties format of the current instance of the component
	* @return string $string_value
	*/
	public function number_to_string( $value ) : string {

		$properties = $this->get_properties();

		// default value
		$string_value = $value;

		if (!empty($value) && !empty($properties->type)) {

			switch ($properties->type ) {
				case 'int':
					// nothing to do
					break;

				case 'float':
				default:
					$precision		= $properties->precision ?? 2;
					$string_value	= is_numeric($value)
						? number_format($value, $precision, '.', '')
						: $value;
					break;
			}
		}//end if (!empty($value))

		$string_value = str_replace(',', '.', (string)$string_value);


		return (string)$string_value;
	}//end number_to_string



	/**
	* STRING_TO_NUMBER
	* Parse a string as number
	* Used to import data from other systems
	* @param string $string_value
	* @return int|float|null $number
	*/
	public function string_to_number( string $string_value ) : int|float|null {

		// get the properties of the component, to assign the specific type defined.
		// by default component_number use float numbers but in some case it can be set to int
		$properties	= $this->get_properties();
		$type 		= !empty($properties->type)
			? $properties->type
			: 'float';

		// decimal defines if the string use point '.' or comma ',' as decimal separator
		// users can define it into the tool_import_csv or other tools interfaces
		$decimal = $this->decimal;
		if($decimal===',') {
			$string_value = str_replace('.', '', (string)$string_value);
			$string_value = str_replace(',', '.', (string)$string_value);
		}else{
			$string_value = str_replace(',', '', (string)$string_value);
		}

		// TODO
		// exception to scientific notation: 9 x 2^10
		// this will be set new type and component_number behavior

		// if the string has a letter or other characters, remove it.
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
	* @param string $import_value
	* import data format options:
	* 1 a stringify version of number data, array of numbers:
	* 	'"[9.76, 10, 0.22]"'
	* 2 a flat string number:
	* 	5.87
	* 	optional the number can had a comma as decimal separator as Spanish or French use
	* 	5,87
	* 	in these cases the user need to define it into the tool import interface as it will set as $decimal variable
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
				$data_from_json	= json_handler::decode($import_value);

				// Normalize: ensure it is an array of objects with 'value' property
				if (is_array($data_from_json)) {
					foreach ($data_from_json as $key => $val) {
						if (!is_object($val)) {
							$data_from_json[$key] = (object)['value' => $val];
						}
					}
				}

				$response->result	= $data_from_json;
				$response->msg		= 'OK';

				return $response;
			}

		// string case (all data become as string)
			if(empty($import_value) && $import_value !== '0'){

				$response->result	= null;
				$response->msg		= 'OK';

				return $response;
			}

		// convert value
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

		$response->result	= [(object)['value' => $value]];
		$response->msg		= 'OK';

		return $response;
	}//end conform_import_data



}//end class component_number
