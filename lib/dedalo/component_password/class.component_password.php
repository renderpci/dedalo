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

		# Encript dato with md5 etc..
		$this->dato = component_password::encrypt_password($this->dato);		#dump($dato,'dato md5');

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

	# GET EJEMPLO
	protected function get_ejemplo() {
		
		if($this->ejemplo===false) return "example: 'Kp3Myuser9Jt1'";		
		return parent::get_ejemplo();
	}


	# CRIPTO PASSWORD
	public static function encrypt_password($stringArray) {
		return dedalo_encryptStringArray($stringArray, DEDALO_INFORMACION);
	}



	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		
		# Remove common tools (time machine and lang)
		unset($this->ar_tools_name);

		# Add tool_time_machine
		$this->ar_tools_name[] = 'tool_time_machine';
		
		return parent::get_ar_tools_obj();
	}


};
?>