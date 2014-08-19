<?php
/*
* CLASS COMPONENT INPUT TEXT
*/


class component_input_text_large extends component_common {
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		
		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}


	public function set_dato($dato) {
		#dump($dato,'pre');
		$dato = str_replace( array("\n","\r"), "<br />", $dato);
		#dump($dato,'post');
		$this->dato = $dato;
	}
	public function get_dato() {
		$dato=parent::get_dato();
		$dato = str_replace("<br />", "\n", $dato);
		return $dato;
	}


	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		
		$valor = self::get_dato();		
			
		return $valor;		
	}



}

?>