<?php
/*
* CLASS COMPONENT RADIO BUTTON
*/


class component_radio_button extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	
	
	
	# GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	public function get_valor( $format='html' ) {

		switch ($this->modo) {
			case 'diffusion':
				$dato = $this->get_dato();
				if ($dato==1) {
					return 'si';
				}else{
					return 'no';
				}
				break;
			
			default:				
				$ar_list_of_values	= $this->get_ar_list_of_values();
				$dato_string 		= $this->get_dato();
					#dump($dato,'dato '.$this->id);
				
				if (is_array ($ar_list_of_values)) foreach ($ar_list_of_values as $value => $rotulo) {								
					if( $value == $dato_string ) {						
						$this->valor = $rotulo;						
						return $this->valor;
					}
				}
				break;
		}#end switch
		

	}#end get_valor

	


}
?>