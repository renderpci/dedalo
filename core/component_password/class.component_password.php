<?php
/**
* CLASS COMPONENT PASSWORD
*
*
*/
class component_password extends component_common {



	/**
	* __CONSTRUCT
	*/
	protected function __construct(string $tipo=null, $parent=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, string $section_tipo=null) {

		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $parent, $mode, $this->lang, $section_tipo);
	}//end __construct



	/**
	* GET_DATO
	* @return array|null $dato
	*/
	public function get_dato() {

		$dato = parent::get_dato();
		if (!empty($dato) && !is_array($dato)) {
			$dato = [$dato];
		}

		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	* @param array|null $dato
	* (!) do not encrypt this var
	* @return bool
	*/
	public function set_dato($dato) : bool {

		return parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string $valor
	*/
	public function get_valor($index='all' ) {

		$valor ='';

		$dato = $this->get_dato();
		if(empty($dato)) {
			return (string)$valor;
		}

		if ($index==='all') {
			$ar = array();
			foreach ($dato as $key => $value) {
				$value = trim($value);
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

		return (string)$valor;
	}//end get_valor



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	public function get_grid_value(object $ddo=null) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

			if(isset($this->column_obj)){
				$column_obj = $this->column_obj;
			}else{
				$column_obj = new stdClass();
					$column_obj->id = $this->section_tipo.'_'.$this->tipo;
			}

		// short vars
			$label		= $this->get_label();
			$properties	= $this->get_properties();

		// data
			$data = ['***************'];

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// dd_grid_cell_object
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($data);


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	* @return int|null
	*/
	public function Save() : ?int {

 		if(isset($this->updating_dato) && $this->updating_dato===true) {
			# Dato is saved plain (unencrypted) only for updates
		}else{
			# Encrypt dato with md5 etc..
			$dato = $this->dato;
			foreach ((array)$dato as $key => $value) {
				# code...
				$this->dato[$key] = component_password::encrypt_password($value);		#dump($dato,'dato md5');
			}
		}

		// From here, we save as standard
		return parent::Save();
	}//end Save



	// GET EJEMPLO
		// protected function get_ejemplo() {
		//
		// 	if($this->ejemplo===false) return "example: 'Kp3Myuser9Jt1'";
		// 	return parent::get_ejemplo();
		// }



	/**
	* ENCRYPT_PASSWORD
	*
	* Crypto password
	# Change the mycript lib to OpenSSL in the 4.0.22 update
	# we need the to encryptors for sustain the login of the user before the update to 4.0.22
	# this function will be change to only Open SSl in the 4.5.
	*/
	public static function encrypt_password($stringArray) {

		$encryption_mode = encryption_mode();

		if( $encryption_mode==='openssl' ) {
			return dedalo_encrypt_openssl($stringArray, DEDALO_INFORMATION);
		}else if($encryption_mode==='mcrypt') {
			return dedalo_encryptStringArray($stringArray, DEDALO_INFORMATION);
		}else{
			debug_log(__METHOD__." UNKNOW ENCRYPT MODE !! ".to_string(), logger::ERROR);
		}

		return false;
	}//end encrypt_password



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
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;


		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '4.0.22':
				#$dato = $this->get_dato_unchanged();

				$section_id = explode('.', $reference_id)[1];
				if((int)$section_id === -1){

					$default = dedalo_decryptStringArray($dato_unchanged, DEDALO_INFORMATION);

					$section = section::get_instance( -1, DEDALO_SECTION_USERS_TIPO );
					$dato = $section->get_dato();
					$tipo = DEDALO_USER_PASSWORD_TIPO;
					$lang = DEDALO_DATA_NOLAN;

					$dato->components->$tipo->dato->$lang = $dato->components->$tipo->valor->$lang = dedalo_encrypt_openssl($default);

					$strQuery 	= "UPDATE matrix_users SET datos = $1 WHERE section_id = $2 AND section_tipo = $3";
					$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( json_handler::encode($dato), -1, DEDALO_SECTION_USERS_TIPO ));
					if(!$result) {
						if(SHOW_DEBUG) {
							dump($strQuery,"strQuery");
						}
						throw new Exception("Error Processing Save Update Request ". pg_last_error(DBi::_getConnection()), 1);;
					}

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Dato change for root.<br />";	// to_string($dato_unchanged)."

					return $response;
				}

				# Compatibility old dedalo instalations
				if (!empty($dato_unchanged) && is_string($dato_unchanged)) {

					$old_pw = dedalo_decryptStringArray($dato_unchanged, DEDALO_INFORMATION);
					$new_dato = dedalo_encrypt_openssl($old_pw, DEDALO_INFORMATION);

					debug_log(__METHOD__." changed pw from $dato_unchanged - $new_dato ".to_string($old_pw), logger::DEBUG);

					$response = new stdClass();
						$response->result	=1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

					return $response;
				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."

					return $response;
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



	/**
	* EXTRACT_COMPONENT_DATO_FALLBACK
	* Catch extract_component_dato_fallback common method calls
	* @return array $dato_fb
	*/
	public static function extract_component_dato_fallback(object $component, string $lang=DEDALO_DATA_LANG, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : array {
		return [];
	}



	/**
	* EXTRACT_COMPONENT_VALUE_FALLBACK
	* Catch common method calls
	* @return string $value
	*/
	public static function extract_component_value_fallback(object $component, string $lang=DEDALO_DATA_LANG, bool $mark=true, string $main_lang=DEDALO_DATA_LANG_DEFAULT) : string {
		return '';
	}



}//end class component_password