<?php
/*
* CLASS COMPONENT INPUT TEXT
*/


class component_input_text_large extends component_common {


	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		#$dato = str_replace("<br />", "\n", $dato);
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		#$dato = str_replace( array("\n","\r"), "<br />", $dato);
		parent::set_dato( (string)$dato );
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