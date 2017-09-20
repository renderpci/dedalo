<?php
/*
* CLASS COMPONENT PASSWORD
*/


class component_password extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	
	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		return (string)$dato;
	}

	# SET_DATO (NO ENCRYTP THIS VAR !)
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		if(isset($this->updating_dato) && $this->updating_dato===true) {
			# Dato is saved plain (unencrypted) only for updates
		}else{
			# Encrypt dato with md5 etc..
			$this->dato = component_password::encrypt_password($this->dato);		#dump($dato,'dato md5');
		}		
		

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

	# GET EJEMPLO
	protected function get_ejemplo() {
		
		if($this->ejemplo===false) return "example: 'Kp3Myuser9Jt1'";
		return parent::get_ejemplo();
	}


	/**
	* ENCRYPT_PASSWORD
	*
	* Crypto password
	# Change the mycript lib to OpenSSL in the 4.0.22 update
	# we need the to encriptors for sustain the login of the user before the update to 4.0.22
	# this function will be change to only Open SSl in the 4.5.
	*/
	public static function encrypt_password($stringArray) {

		$encryption_mode = encryption_mode();
		
		if( $encryption_mode==='openssl' ) {
			return dedalo_encrypt_openssl($stringArray, DEDALO_INFORMACION);
		}else if($encryption_mode==='mcrypt') {
			return dedalo_encryptStringArray($stringArray, DEDALO_INFORMACION);
		}else{
			debug_log(__METHOD__." UNKNOW ENCRYPT MODE !! ".to_string(), logger::ERROR);
		}

		return false;	
	}



	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		#unset($this->ar_tools_name);
		$this->ar_tools_name = array();

		# Add tool_time_machine
		$this->ar_tools_name[] = 'tool_time_machine';
		
		return parent::get_ar_tools_obj();
	}
	/**
	* UPDATE_DATO_VERSION
	* @return 
	*/
	public static function update_dato_version($update_version, $dato_unchanged, $reference_id) {

		$update_version = implode(".", $update_version);

		switch ($update_version) {
			case '4.0.22':
				#$dato = $this->get_dato_unchanged();

				$section_id = explode('.', $reference_id)[1];
				if((int)$section_id === -1){

					$default = dedalo_decryptStringArray($dato_unchanged, DEDALO_INFORMACION);

					$section = section::get_instance( -1, DEDALO_SECTION_USERS_TIPO );
					$dato = $section->get_dato();
					$tipo = DEDALO_USER_PASSWORD_TIPO;
					$lang = DEDALO_DATA_NOLAN;
					#dump($dato->components->$tipo->dato->$lang, ' dato');
					$dato->components->$tipo->dato->$lang = $dato->components->$tipo->valor->$lang = dedalo_encrypt_openssl($default);

					$strQuery 	= "UPDATE matrix_users SET datos = $1 WHERE section_id = $2 AND section_tipo = $3";
					$result 	= pg_query_params(DBi::_getConnection(), $strQuery, array( json_handler::encode($dato), -1, DEDALO_SECTION_USERS_TIPO ));
					if(!$result) {
						if(SHOW_DEBUG) {
							dump($strQuery,"strQuery");
						}
						throw new Exception("Error Processing Save Update Request ". pg_last_error(), 1);;
					}

					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Dato change for root.<br />";	// to_string($dato_unchanged)." 
					return $response;
				}
					
				# Compatibility old dedalo instalations
				if (!empty($dato_unchanged) && is_string($dato_unchanged)) {

					$old_pw = dedalo_decryptStringArray($dato_unchanged, DEDALO_INFORMACION);
					$new_dato = dedalo_encrypt_openssl($old_pw, DEDALO_INFORMACION);

					debug_log(__METHOD__." changed pw from $dato_unchanged - $new_dato ".to_string($old_pw), logger::DEBUG);

					$response = new stdClass();
					$response->result =1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";
					return $response;
					
				}else{
					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)." 
					return $response;
				}
		}
	}

};
?>