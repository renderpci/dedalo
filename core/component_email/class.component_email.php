<?php
declare(strict_types=1);
/**
* CLASS COMPONENT EMAIL
*
*
*/
class component_email extends component_common {



	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// fix lang (email always is DEDALO_DATA_NOLAN)
		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET DATO
	* @return array|null $dato
	* Format ["user@domain.com"]
	*/
	public function get_dato() {

		$dato = parent::get_dato();


		return $dato;
	}//end get_dato



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
	* @return int|null $section_id
	*/
	public function Save() : ?int {

		// Optionally, the data could be validated here... although it has already been done in javascript
			$email = $this->get_dato();
			foreach ((array)$email as $value) {
				if (!empty($value) && false===component_email::is_valid_email($value)) {
					debug_log(__METHOD__
						. " No data is saved. Invalid email "
						. ' value:' . to_string($value)
						, logger::ERROR
					);
					return null;
				}
			}

		// from here, we save as standard
			$result = parent::Save();

		return $result;
	}//end Save



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
	* RESOLVE_QUERY_OBJECT_SQL
	* @param object $query_object
	* @return object $query_object
	*	Edited/parsed version of received object
	*/
	public static function resolve_query_object_sql(object $query_object) : object {
		// debug_log(__METHOD__." query_object ".to_string($query_object), logger::DEBUG);

		// q
			$q = is_array($query_object->q)
				? reset($query_object->q)
				: $query_object->q;
			$q = pg_escape_string(DBi::_getConnection(), stripslashes($q));

		// q_operator
			$q_operator = $query_object->q_operator ?? null;

		// type. Always set fixed values
			$query_object->type = 'string';

		// variants switch
		switch (true) {
			// EMPTY VALUE (in current lang data)
			case ($q==='!*'):
				$operator = 'IS NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent = false;
				$query_object->lang 	= 'all';

				$logical_operator = '$or';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// Search empty only in current lang
				// Resolve lang based on if is translatable
					$path_end 		= end($query_object->path);
					$component_tipo = $path_end->component_tipo;
					$RecordObj_dd   = new RecordObj_dd($component_tipo);
					$lang 			= $RecordObj_dd->get_traducible()!=='si' ? DEDALO_DATA_NOLAN : DEDALO_DATA_LANG;

					#$clone = clone($query_object);
					#	$clone->operator = '=';
					#	$clone->q_parsed = '\'[]\'';
					#	$clone->lang 	 = $lang;
					#$new_query_json->$logical_operator[] = $clone;

					$clone = clone($query_object);
						$clone->operator = '=';
						$clone->q_parsed = '\'\'';
						$clone->lang 	 = $lang;
					$new_query_json->$logical_operator[] = $clone;

					// legacy data (set as null instead '')
					$clone = clone($query_object);
						$clone->operator = 'IS NULL';
						$clone->lang 	 = $lang;
					$new_query_json->$logical_operator[] = $clone;

				// override
				$query_object = $new_query_json ;
				break;
			// NOT EMPTY (in any project lang data)
			case ($q==='*'):
				$operator = 'IS NOT NULL';
				$q_clean  = '';
				$query_object->operator = $operator;
				$query_object->q_parsed	= $q_clean;
				$query_object->unaccent = false;

				$logical_operator ='$and';
				$new_query_json = new stdClass;
					$new_query_json->$logical_operator = [$query_object];

				// langs check
					$ar_query_object = [];

						#$clone = clone($query_object);
						#	$clone->operator = '!=';
						#	$clone->q_parsed = '\'[]\'';
						#	$clone->lang 	 = DEDALO_DATA_NOLAN;
						#$ar_query_object[] = $clone;

						$clone = clone($query_object);
							$clone->operator = '!=';
							$clone->q_parsed = '\'\'';
							$clone->lang 	 = DEDALO_DATA_NOLAN;
						$ar_query_object[] = $clone;


					$logical_operator ='$or';
					$langs_query_json = new stdClass;
						$langs_query_json->$logical_operator = $ar_query_object;

				# override
				$query_object = [$new_query_json, $langs_query_json];
				break;
			// IS DIFFERENT
			case (strpos($q, '!=')===0 || $q_operator==='!='):
				$operator = '!=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '!~';
				$query_object->q_parsed = '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			// IS SIMILAR
			case (strpos($q, '=')===0 || $q_operator==='='):
				$operator = '=';
				$q_clean  = str_replace($operator, '', $q);
				$query_object->operator = '~*';
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = true;
				break;
			// NOT CONTAIN
			case (strpos($q, '-')===0 || $q_operator==='-'):
				$operator = '!~*';
				$q_clean  = str_replace('-', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			// CONTAIN EXPLICIT
			case (substr($q, 0, 1)==='*' && substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			// ENDS WITH
			case (substr($q, 0, 1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'".*\'';
				$query_object->unaccent = true;
				break;
			// BEGINS WITH
			case (substr($q, -1)==='*'):
				$operator = '~*';
				$q_clean  = str_replace('*', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'.*\'';
				$query_object->unaccent = true;
				break;
			// LITERAL
			case (substr($q, 0, 1)==="'" && substr($q, -1)==="'"):
				$operator = '~';
				$q_clean  = str_replace("'", '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*"'.$q_clean.'".*\'';
				$query_object->unaccent = false;
				break;
			// DEFAULT CONTAIN
			default:
				$operator = '~*';
				$q_clean  = str_replace('+', '', $q);
				$query_object->operator = $operator;
				$query_object->q_parsed	= '\'.*".*'.$q_clean.'.*\'';
				$query_object->unaccent = true;
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
			'*' 	 => 'no_empty', // not null
			'!*' 	 => 'empty', // null
			'=' 	 => 'similar_to',
			'!=' 	 => 'different_from',
			'-' 	 => 'does_not_contain',
			'*text*' => 'contains',
			'text*'  => 'begins_with',
			'*text'  => 'end_with',
			'\'text\'' => 'literal',
		];

		return $ar_operators;
	}//end search_operators_info



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
