<?php
/*
* CLASS COMPONENT EMAIL
*/


class component_email extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	# GET DATO : Format "user@domain.com"
	public function get_dato() {
		$dato = parent::get_dato();
		$dato = trim($dato);
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}

	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Opcionalmente se podría validar mediante aquí el dato.. aunque ya se ha hecho en javascript

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

}

?>