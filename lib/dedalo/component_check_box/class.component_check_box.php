<?php
/*
* CLASS COMPONENT CHECK BOX
*/


class component_check_box extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	
	/**
	* GET VALOR
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECDIFIC COMPONENT
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {
		
		$valor = '';
		
		$ar_list_of_values	= $this->get_ar_list_of_values($lang);
			#dump($ar_list_of_values,'$ar_list_of_values');
		$dato 				= $this->get_dato();
			#dump($dato,'dato');

		if (is_array($dato)) foreach ($dato as $key => $value) {
			if($value!=2) continue;
			if (array_key_exists($key, $ar_list_of_values)) {
				$valor .= $ar_list_of_values[$key];
				$valor .= ", ";
			}
		}	

		$valor = substr($valor, 0, -2);	
			#dump($valor,'valor');
			
		$this->valor = $valor;
		return $this->valor;
	}



	
}
?>