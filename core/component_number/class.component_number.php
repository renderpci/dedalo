<?php declare(strict_types=1);
/**
* CLASS COMPONENT_NUMBER
* Manage numbers with specific precision
* types supported : int|float
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



	public $decimal = '.';



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* IS_EMPTY
	* Check given value to determine is is really a empty numeric value
	* @param mixed $value
	* @return bool
	*/
	public function is_empty(mixed $value) : bool {

		// null|string cases
		if (is_null($value) || $value==='') {
			return true;
		}

		if (is_array($value)) {
			// one empty element case
			if ( empty($value) || (count($value)===1 && $this->is_empty($value[0])) ) {
				return true;
			}
			// if any of the values is not empty, return false
			foreach ($value as $current_value) {
				if ($this->is_empty($current_value)===false) {
					return false;
				}
			}
		}else{

			if (!is_numeric($value)) {
				debug_log(__METHOD__
					. ' WARNING : Checking invalid type ! ' . PHP_EOL
					. ' type: ' . gettype($value) . PHP_EOL
					. ' value: ' . to_string($value)
					, logger::WARNING
				);
			}
		}


		return false;
	}//end is_empty



	/**
	* GET_DATO
	* @return array|null
	*/
	public function get_dato() {

		$dato = parent::get_dato();

		$format_dato = [];
		$count = is_array($dato)
			? count($dato)
			: 0;

		foreach ((array)$dato as $value) {
			if($count === 1 && $value === null){
				continue;
			}
			$format_dato[] = $this->set_format_form_type($value);
		}

		// empty data case
		if ($this->is_empty($format_dato)) {
			$format_dato = null;
		}


		return $format_dato;
	}//end get_dato



	/**
	* SET_DATO
	* @return bool
	*/
	public function set_dato( $dato ) : bool {

		if ($this->is_empty($dato)) {

			$safe_dato = null;

		}else{

			$safe_dato = array();
			foreach ((array)$dato as  $value) {
				if (is_null($value) || $value==='') {
					$safe_dato[] = null;
				}elseif (is_numeric($value)) {
					$safe_dato[] = $this->set_format_form_type($value);
				}else{
					// trigger_error("Invalid value! [component_number.set_dato] value: ".json_encode($value));
					debug_log(__METHOD__
						." Invalid value! [component_number.set_dato] value: "
						.to_string($value)
						, logger::ERROR
					);
				}
			}

			// empty dato case
			if ($this->is_empty($safe_dato)) {
				$safe_dato = null;
			}
		}


		return parent::set_dato( $safe_dato );
	}//end set_dato



	/**
	* GET_VALOR
	* Returns int or float number as string formatted
	* @return string|null $valor
	*/
	public function get_valor($index='all') {

		$valor = '';

		$dato = $this->get_dato();

		if(empty($dato)) {
			return (string)$valor;
		}

		if ($index==='all') {
			$ar = array();
			foreach ($dato as $key => $value) {
				$value = component_number::number_to_string($value);
				if (!empty($value)) {
					$ar[] = $value;
				}
			}
			if (count($ar)>0) {
				$valor = implode(',',$ar);
			}
		}else{
			$index = (int)$index;
			$valor = isset($dato[$index]) ? $dato[$index] : null;
		}

		return $valor;
	}//end get_valor



	/**
	* SET_FORMAT_FORM_TYPE
	* Format the dato into the standard format or the properties format of the current instance of the component
	* @param mixed $dato_value
	* @return int|float|null $dato_value
	*/
	public function set_format_form_type( mixed $dato_value ) : int|float|string|null {

		if( $this->is_empty($dato_value) ) {
			return null;
		}

		$properties = $this->get_properties();
		if(empty($properties->type)) {

			// default format is float
			return (float)$dato_value;

		}else{

			switch ($properties->type) {

				case 'int':
					return (int)$dato_value;

				case 'float':
				default:
					if (gettype($dato_value)==='string' && strpos($dato_value,',')===false && strpos($dato_value,'.')===false) {
						$dato_value = (int)$dato_value;
					}
					if (gettype($dato_value)!=='integer' && gettype($dato_value)!=='double') {
						debug_log(__METHOD__
							. " Converting unexpected type. Forced to integer to prevent issues " . PHP_EOL
							. ' type: ' . gettype($dato_value) . PHP_EOL
							. ' value: ' . to_string($dato_value)
							, logger::ERROR
						);
						$dato_value = (int)$dato_value;
					}
					$precision	= $properties->precision ?? 2;
					$dato_value	= is_numeric($dato_value)
						? (float)round($dato_value, $precision)
						: (float)$dato_value;
					break;
			}
		}//end if(empty($properties->type))


		return $dato_value;
	}//end set_format_form_type



	/**
	* NUMBER_TO_STRING
	* Format the dato into the standard format or the properties format of the current instance of the component
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
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {

		// q
		$q = is_array($query_object->q)
			? reset($query_object->q)
			: $query_object->q;

		// force to string
		if (!is_string($q)) {
			$q = to_string($q);
		}

		// q_operator
		$q_operator = $query_object->q_operator ?? null;

		// Always set fixed values
		$query_object->type = 'number';

		// Always without unaccent
		$query_object->unaccent = false;

		// path
		$query_object->component_path[] = 'lg-nolan';

		$between_separator  = '...';
		//$sequence_separator = ',';

		#$q_operator = isset($query_object->q_operator) ? $query_object->q_operator : null;

		switch (true) {

			// EMPTY VALUE
			case ($q_operator==='!*'):

				$query_object->operator	= 'IS NULL';
				$query_object->q_parsed	= '';

				$logical_operator = '$or';
				$new_query_json = new stdClass;
					$new_query_json->{$logical_operator} = [$query_object];

				$clone = clone($query_object);
					$clone->operator	= '=';
					$clone->q_parsed	= '\'[]\'';
				$new_query_json->$logical_operator[] = $clone;

				// legacy data (set as null instead [])
				$clone = clone($query_object);
					$clone->operator = 'IS NULL';
				$new_query_json->$logical_operator[] = $clone;

				// override
				$query_object = $new_query_json;
				break;

			// NOT EMPTY (in any project lang data)
			case ($q_operator==='*'):

				$query_object->operator	= 'IS NOT NULL';
				$query_object->q_parsed	= '';

				$logical_operator = '$and';
				$new_query_json = new stdClass;
					$new_query_json->{$logical_operator} = [$query_object];

				$clone = clone($query_object);
					$clone->operator	= '!=';
					$clone->q_parsed	= '\'[]\'';
				$new_query_json->$logical_operator[] = $clone;

				$clone = clone($query_object);
					$clone->operator	= '!=';
					$clone->q_parsed	= '\'[null]\'';
				$new_query_json->$logical_operator[] = $clone;

				$clone = clone($query_object);
					$clone->operator	= '!=';
					$clone->q_parsed	= '\'null\'';
				$new_query_json->$logical_operator[] = $clone;

				// override
				$query_object = $new_query_json;
				break;

			// BETWEEN
			case (strpos($q, $between_separator)!==false):
				// Transform "12...25" to "12 AND 25"
				$ar_parts 	= explode($between_separator, $q);
				$first_val  = !empty($ar_parts[0]) ? intval($ar_parts[0]) : 0;
				$second_val = !empty($ar_parts[1]) ? intval($ar_parts[1]) : $first_val;

				// @@ '$[*] >= 1'
				$query_object_one = clone $query_object;
					$query_object_one->operator = '@@';
					$first_val  = str_replace(',', '.', (string)$first_val);
					$query_object_one->q_parsed	= '\'$[*] >='.(string)$first_val.'\'';

				// @@ '$[*] <= 1'
				$query_object_two = clone $query_object;
					$query_object_two->operator = '@@';
					$second_val  = str_replace(',', '.', (string)$second_val);
					$query_object_two->q_parsed	= '\'$[*] <='.(string)$second_val.'\'';

				// Group in a new "AND"
				$current_op = '$and';
				$new_query_object = new stdClass();
					$new_query_object->{$current_op} = [$query_object_one, $query_object_two];

				$query_object = $new_query_object;
				break;
			# SEQUENCE
			/*case (strpos($q, $sequence_separator)!==false):
				// Transform "12,25,36" to "(12 OR 25 OR 36)"
				$ar_parts 	= explode($sequence_separator, $q);
				$ar_result  = [];
				foreach ($ar_parts as $key => $value) {
					$value = (int)$value;
					if ($value<1) continue;
					$query_object_current = clone $query_object;
						$query_object_current->operator = '=';
						$query_object_current->q_parsed	= '\''.$value.'\'';
					$ar_result[] = $query_object_current;
				}
				// Return an subquery instead object
				$cop = '$or';
				$new_object = new stdClass();
					$new_object->{$cop} = $ar_result;
				$query_object = $new_object;
				break;
				*/
			// BIGGER OR EQUAL THAN
			case (substr($q, 0, 2)==='>='):
				$operator = '>=';
				$q_clean  = str_replace($operator, '', $q);
				$q_clean  = str_replace(',', '.', $q_clean);
				// $query_object->operator = $operator;
				// $query_object->q_parsed	= '\''.$q_clean.'\'';
				$query_object->operator = '@@';
				$query_object->q_parsed	= '\'$[*] >='.$q_clean.'\'';
				break;
			// SMALLER OR EQUAL THAN
			case (substr($q, 0, 2)==='<='):
				$operator = '<=';
				$q_clean  = str_replace($operator, '', $q);
				$q_clean  = str_replace(',', '.', $q_clean);
				// $query_object->operator = $operator;
				// $query_object->q_parsed	= '\''.$q_clean.'\'';
				$query_object->operator = '@@';
				$query_object->q_parsed	= '\'$[*] <='.$q_clean.'\'';
				break;
			# BIGGER THAN
			case (substr($q, 0, 1)==='>'):
				$operator = '>';
				$q_clean  = str_replace($operator, '', $q);
				$q_clean  = str_replace(',', '.', $q_clean);
				// $query_object->operator = $operator;
				// $query_object->q_parsed	= '\''.$q_clean.'\'';
				$query_object->operator = '@@';
				$query_object->q_parsed	= '\'$[*] >'.$q_clean.'\'';
				break;
			# SMALLER THAN
			case (substr($q, 0, 1)==='<'):
				$operator = '<';
				$q_clean  = str_replace($operator, '', $q);
				$q_clean  = str_replace(',', '.', $q_clean);
				// $query_object->operator = $operator;
				// $query_object->q_parsed	= '\''.$q_clean.'\'';
				$query_object->operator = '@@';
				$query_object->q_parsed	= '\'$[*] <'.$q_clean.'\'';
				break;
			// EQUAL DEFAULT
			default:
				$operator = '=';
				$q_clean  = str_replace('+', '', $q);
				$q_clean  = str_replace(',', '.', $q_clean);
				$query_object->operator = '@>';
				$query_object->q_parsed	= '\''.$q_clean.'\'';
				// $query_object->operator = '@@';
				// $query_object->q_parsed	= '\'$[*] =='.$q_clean.'\'';
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
			'*'		=> 'no_empty', // not null
			'!*'	=> 'empty', // null
			'...'	=> 'between',
			'>='	=> 'greater_than_or_equal',
			'<='	=> 'less_than_or_equal',
			'>' 	=> 'greater_than',
			'<'		=> 'less_than'
		];

		return $ar_operators;
	}//end search_operators_info



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$dato				= parent::get_dato();
		$value				= is_array($dato) ? reset($dato) : $dato;
		$diffusion_value	= !empty($value)
			? (string)$value
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

		$update_version_string = implode('.', $update_version);
		switch ($update_version_string) {

			case '6.0.0':
				if ( (!empty($dato_unchanged) || $dato_unchanged==='') && !is_array($dato_unchanged) ) {

					//  Change the dato from int|float to array
					// 	From:
					// 		487
					// 	To:
					// 		[487]

					// new dato
						$dato = $dato_unchanged;

					// fix final dato with new format as array
						$new_dato = [$dato];

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version_string). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



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
				$dato_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				$response->result	= $dato_from_json;
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

		$response->result	= [$value];
		$response->msg		= 'OK';

		return $response;
	}//end conform_import_data



}//end class component_number
