<?php
/*
* CLASS COMPONENT EMAIL
*
*
*/
class component_email extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	/**
	* GET DATO : Format "user@domain.com"
	*/
	public function get_dato() {
		$dato = parent::get_dato();
		
		return (string)$dato;
	}//end get_dato


	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		# Clean email
		$dato = component_email::clean_email($dato);

		return parent::set_dato( (string)$dato );
	}//end set_dato



	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Opcionalmente se podría validar mediante aquí el dato.. aunque ya se ha hecho en javascript
		$email = $this->get_dato();
		if (!empty($email) && false===component_email::is_valid_email($email)) {
			debug_log(__METHOD__." No data is saved. Invalid email ".to_string($email), logger::ERROR);
			return false;
		}

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}//end Save



	/**
	* IS_VALID_EMAIL
	* @return bool
	*/
	public static function is_valid_email( $email ) {

		return filter_var($email, FILTER_VALIDATE_EMAIL) 
        	&& preg_match('/@.+\./', $email);
	}//end is_valid_email



	/**
	* CLEAN_EMAIL
	* @return string $email
	*/
	public static function clean_email($email) {
		
		$email = trim($email);

		if (!empty($email)) {
			$email = preg_replace('=((<CR>|<LF>|0x0A/%0A|0x0D/%0D|\\n|\\r|\'|\")\S).*=i', null, $email);
		}
		

		return $email;
	}//end clean_email



}
?>