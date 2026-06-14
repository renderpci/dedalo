<?php declare(strict_types=1);
/**
* CLASS COMPONENT_EMAIL
* Manages email address components in Dédalo.
*
* Handles email data with automatic validation, sanitization, and format checking.
* Email addresses are always stored language-neutral (DEDALO_DATA_NOLAN).
*
* Key features:
* - Email format validation on save with regex pattern checking
* - Automatic email address cleaning and normalization
* - Sanitization of input data to prevent injection
* - Validation both client-side (JavaScript) and server-side
*
* Data format: Objects with 'value' property containing the email address string.
*
* Extends component_string_common for string-based component functionality.
*
* @package Dédalo
* @subpackage Core
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

		// Handle null or empty array case
		if (empty($data)) {
			return parent::set_data(null);
		}

		// array case
		$safe_data = [];
		foreach ($data as $data_item) {

			// 1. Normalize non-objects into objects
			if (!is_object($data_item)) {
				if ($data_item === null || $data_item === '') {
					$data_item = null;
				} else {
					$data_item = (object)[
						'value' => $data_item,
						'lang'  => DEDALO_DATA_NOLAN
					];
				}
			}

			// 2. Process objects (either newly created or passed in)
			if (is_object($data_item)) {
				// Ensure the value property exists or is null
				$current_val = $data_item->value ?? null;
				$data_item->value = component_email::clean_email($current_val);
			}

			$safe_data[] = $data_item;
		}

		return parent::set_data($safe_data);
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

				// Normalize: ensure array items are objects with 'value' property (v7 format)
				if (is_array($data_from_json)) {
					$normalized = [];
					foreach ($data_from_json as $val) {
						if (!is_object($val)) {
							$normalized[] = (object)['value' => $val];
						}else if (!property_exists($val, 'value')) {
							$normalized[] = (object)['value' => $val];
						}else{
							$normalized[] = $val;
						}
					}
					$data_from_json = $normalized;
				}else if (is_object($data_from_json)) {

					$first_key = array_key_first( (array)$data_from_json );
					if ($first_key!==null && strpos($first_key, 'lg-')===0) {
						// Lang keyed object as {"lg-nolan":["user@example.com"]} (legacy raw export)
						// component_email is non translatable: extract the first lang value
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
						// Single object item as {"value":"user@example.com"}. Wrap into an array
						$data_from_json = [$data_from_json];
					}else{
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

		// string case

		// empty
			if(empty($import_value)) {

				$response->result	= null;
				$response->msg		= 'OK';

				return $response;
			}

		// convert value
			// multiple emails can be imported using the ' | ' separator
			// as 'user@example.com | admin@example.com'
			$ar_values = explode(' | ', $import_value);
			$result = [];
			foreach ($ar_values as $current_value) {
				$current_value = trim($current_value);
				if ($current_value==='') {
					continue;
				}
				$result[] = (object)['value' => $current_value];
			}

		// response OK
			$response->result	= !empty($result) ? $result : null;
			$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class email
