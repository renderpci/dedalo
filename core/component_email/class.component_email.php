<?php declare(strict_types=1);
/**
* CLASS COMPONENT EMAIL
* Manages e-mail addresses data.
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
	* SET_DATA
	* @param array|null $data
	* @return bool
	*/
	public function set_data( ?array $data ) : bool {

		if (empty($data)) {

			// null case

			$data = null;

		}else{

			// array case

			$safe_data = [];
			foreach ($data as $data_item) {

				if( is_object($data_item) ) {
					$data_item->value = component_email::clean_email($data_item->value);
				}else{
					if( empty($data_item) ) {
						$data_item = null;
					}else{
						// wrong data item format
						debug_log(__METHOD__
							. " Error. Wrong data item format "
							. ' data_item:' . to_string($data_item)
							, logger::ERROR
						);
						continue;
					}
				}
				$safe_data[] = $data_item;
			}
			// Replace data with safe data
			$data = $safe_data;
		}


		return parent::set_data( $data );
	}//end set_data



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to check data before save:
	* E-mail format validation.
	* @return bool
	*/
	public function save() : bool {

		// Optionally, the data could be validated here... although it has already been done in javascript
		$data = $this->get_data();
		if (!empty($data)) {
			foreach ($data as $data_item) {
				if (!empty($data_item->value) && !component_email::is_valid_email($data_item->value)) {
					debug_log(__METHOD__
						. " Data is NOT saved. Invalid email !"
						. ' value:' . to_string($data_item->value)
						, logger::ERROR
					);
					return false;
				}
			}
		}

		return parent::save();
	}//end save



	/**
	* IS_VALID_EMAIL
	* Validate email format
	* @param string $email
	* @return bool
	*/
	public static function is_valid_email( string $email ) : bool {

		return filter_var($email, FILTER_VALIDATE_EMAIL)
        	&& preg_match('/@.+\./', $email);
	}//end is_valid_email



	/**
	* CLEAN_EMAIL
	* Clean email from special characters
	* @param ?string $email
	* @return ?string $email
	*/
	public static function clean_email(?string $email) : ?string {

		if (!empty($email)) {
			$email = trim(
				preg_replace('=((<CR>|<LF>|0x0A/%0A|0x0D/%0D|\\n|\\r|\'|\")\S).*=i', '', $email)
			);
		}

		return $email;
	}//end clean_email



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
				$data_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				$response->result	= $data_from_json;
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
