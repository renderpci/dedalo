<?php


/*
* CLASS COMPONENT_INPUT_TEXT_MULTI
*/
class component_input_text_multi extends component_common {
	

	/**
	* GET DATO
	*/
	public function get_dato() {				
		$dato = parent::get_dato();			

		if(SHOW_DEBUG) {
			if ( !is_null($dato) && !is_array($dato)  ) {
				dump(parent::get_dato(), 'WRONG TYPE dato: '.$this->tipo);
				debug_log(__METHOD__." WRONG TYPE dato: $this->tipo is received : ".to_string($dato), logger::WARNING);
			}
		}
		return (array)$dato;
	}



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {
		parent::set_dato( (array)$dato );			
	}
	


	/**
	* SAVE [OVERRIDE]
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {		

		# From here, save as standar way
		return parent::Save();
		
	}



};//end class
?>