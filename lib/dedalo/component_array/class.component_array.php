<?php
/*
* CLASS COMPONENT_ARRAY
*/


class component_array extends component_common {
	
	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (array)$dato );			
	}
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {
		
		# ...	

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}


	


}
?>