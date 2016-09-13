<?php
/*
* class component_order
*/


class component_order extends component_common {
	
	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		$format_dato = $this->set_format_form_type($dato);

		return $format_dato;
	}//end get_dato



	# SET_DATO
	public function set_dato($dato) {

		$format_dato = $this->set_format_form_type($dato);

		parent::set_dato( $format_dato );			
	}//end set_dato
	


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Dato candidate to save
		$dato = $this->dato;	
		

		switch (true) {

			case ($this->section_tipo==DEDALO_SECTION_USERS_TIPO) :
				
					# Test is dato already exists
			 		$dato_already_exists = component_common::dato_already_exists($dato, $this->tipo, DEDALO_DATA_NOLAN, $this->section_tipo);
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
	}#end Save



	/*
	* SET_FORMAT_FORM_TYPE
	* Format the dato into the standar format or the propiedades format of the current intance of the component
	*/
	public function set_format_form_type ($dato){

		$propiedades = $this->get_propiedades();
	
		if(empty($propiedades->type)){
			return (float)$dato;
		}else{
			foreach ($propiedades->type as $key => $value) {

				switch ($key) {
					case 'int':
						if($value === 0 || empty($value)){
							return (int)$dato;
						}
						if ( strpos($dato, '-')===0 )  {
							$dato = '-'.substr($dato,1,$value);
							$dato = (int)$dato;

						}else{
							$dato = (int)substr($dato,0,$value);
						}
						
						break;
					
					default:
						$dato = (float)number_format($dato,$value);
						break;
				};

			};

		}

		return $dato;
	}//end set_format_form_type


	
}//end component_order
?>