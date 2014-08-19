<?php
/*
* CLASS COMPONENT SELECT
*/


class component_select extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	
	# GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	public function get_valor() {
		
		$ar_list_of_values	= $this->get_ar_list_of_values();
		$dato 				= $this->get_dato();
		
		if (is_array ($ar_list_of_values)) foreach ($ar_list_of_values as $value => $rotulo) {
									
			if( $dato == $value ) {
				
				$this->valor = $rotulo; 
				
				return $this->valor;
			}
			#echo "<br> - $dato - $value => $rotulo ";
		}					
	}

}
?>