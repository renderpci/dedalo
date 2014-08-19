<?php
/*
* CLASS COMPONENT INPUT TEXT
*/


class component_input_text extends component_common {
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Dato candidate to save
		$dato = $this->dato;
		
	
		# Username field test for duplicates
		$matrix_table 	= common::get_matrix_table_from_tipo($this->tipo);
		$section_tipo 	= common::get_tipo_by_id($this->parent, $matrix_table);
		
		switch (true) {

			case ($section_tipo==DEDALO_SECTION_USERS_TIPO) :
				
					# Test is dato already exists
			 		$dato_already_exists = component_common::dato_already_exists($dato, $this->tipo);
			 			#dump($dato_already_exists,'$dato_already_exists');

			 		# Error trigger
			 		if($dato_already_exists) {
			 			$msg = "Error: ".label::get_label('usuario_ya_existe')." [$dato]";		 			
			 			return $msg;
			 		}
					break;
			
			default:
					# Nothing to do
					break;
		}

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}


	



	/**
	* GET VALOR
	* LIST:
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	*/
	public function get_valor() {
		
		$valor = self::get_dato();

		$separator = ' ,  ';
		if($this->modo=='list') $separator = '<br>';

		if (is_array($valor)) {
			# return "Not string value";
			$string  	= '';
			$n 			= count($valor);
			foreach ($valor as $key => $value) {

				if(is_array($value)) $value = print_r($value,true);
				$string .= "$key : $value".$separator;
			}
			$string = substr($string, 0,-4);
			return $string;

		}else{
			
			return $valor;
		}			
		
	}



}

?>