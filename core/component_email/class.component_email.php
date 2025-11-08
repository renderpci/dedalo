<?php declare(strict_types=1);
/**
* CLASS COMPONENT EMAIL
*
*
*/
class component_email extends component_string_common {



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// fix lang (email always is DEDALO_DATA_NOLAN)
		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* SET_DATO
	* @param array|null $dato
	* @return bool
	*/
	public function set_dato($dato) : bool {

		if (empty($dato)) {

			// null case

			$dato = null;

		}else{

			// array case

			$safe_dato = [];
			foreach ((array)$dato as $value) {
				$safe_dato[] = empty($value)
					? null
					: component_email::clean_email($value);
			}
			$dato = $safe_dato;
		}


		return parent::set_dato( $dato );
	}//end set_dato



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	* @return bool
	*/
	public function save() : bool {

		// Optionally, the data could be validated here... although it has already been done in javascript
			$email = $this->get_dato();
			foreach ((array)$email as $value) {
				if (!empty($value) && false===component_email::is_valid_email($value)) {
					debug_log(__METHOD__
						. " No data is saved. Invalid email "
						. ' value:' . to_string($value)
						, logger::ERROR
					);
					return false;
				}
			}

		// from here, we save as standard
			$result = parent::save();

		return $result;
	}//end save



	/**
	* IS_VALID_EMAIL
	* @return bool
	*/
	public static function is_valid_email( string $email ) : bool {

		return filter_var($email, FILTER_VALIDATE_EMAIL)
        	&& preg_match('/@.+\./', $email);
	}//end is_valid_email



	/**
	* CLEAN_EMAIL
	* @return string|null $email
	*/
	public static function clean_email(string $email) : string {

		if (!empty($email)) {
			$email = trim(
				preg_replace('=((<CR>|<LF>|0x0A/%0A|0x0D/%0D|\\n|\\r|\'|\")\S).*=i', '', $email)
			);
		}

		return $email;
	}//end clean_email



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component_common method
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value(?string $lang=null, ?object $option_obj=null) : ?string {

		return $this->get_value(
			($lang ?? DEDALO_DATA_LANG)
		);
	}//end get_diffusion_value



	/**
	* CONFORM_IMPORT_DATA
	* @param string $import_value
	* import data format options:
	* 1 a string like 'myemail@mydomain.org'
	* 2 an array of values like ["myemail@mydomain.org","myemail2@mydomain.org"]
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

		// string case

		// empty
			if(empty($import_value)) {

				$response->result	= null;
				$response->msg		= 'OK';

				return $response;
			}

		// convert value
			$value = trim($import_value);

		// response OK
			$response->result	= [$value];
			$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class email
