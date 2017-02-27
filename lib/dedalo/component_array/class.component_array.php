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



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffsuion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null ) {
		
		$diffusion_value = implode(',', $this->get_dato());


		return (string)$diffusion_value;
	}//end get_diffusion_value


	


}
?>