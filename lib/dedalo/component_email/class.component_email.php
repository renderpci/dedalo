<?php
/*
* CLASS COMPONENT EMAIL
*/


class component_email extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Opcionalmente se podría validar mediante aquí el dato.. aunque ya se ha hecho en javascript

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

}

?>