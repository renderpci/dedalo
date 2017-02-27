<?php
/*
* CLASS COMPONENT INPUT TEXT
*/


class component_input_text_large extends component_common {


	/**
	* GET DATO
	*/
	public function get_dato() {

		$dato = parent::get_dato();		

		if(SHOW_DEBUG) {
			if ( !is_null($dato) && !is_string($dato)  ) {
				dump(parent::get_dato(), 'WRONG TYPE dato: '.$this->tipo);
			}
		}

		return (string)$dato;
	}//end get_dato



	/**
	*  SET_DATO
	*/
	public function set_dato($dato) {
		if($dato==='""') $dato = ''; // empty dato json encoded
		
		parent::set_dato( (string)$dato );
	}//end set_dato
	
	
	
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