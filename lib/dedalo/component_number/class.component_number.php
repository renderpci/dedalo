
<?php
/*
* CLASS COMPONENT INPUT TEXT
*/


class component_number extends component_common {
	
	# GET DATO
	public function get_dato() {
		$dato = parent::get_dato();
		$format_dato = $this->set_format_form_type($dato);

		return $format_dato;
	}

	# SET_DATO
	public function set_dato($dato) {

		$format_dato = $this->set_format_form_type($dato);

		parent::set_dato( $format_dato );			
	}
	
	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save() {

		# Dato candidate to save
		$dato = $this->dato;	
		

		switch (true) {

			case ($this->section_tipo===DEDALO_SECTION_USERS_TIPO) :
				
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
	public function set_format_form_type( $dato ) {

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
				}

			}//end foreach ($propiedades->type as $key => $value)
		}//end if(empty($propiedades->type))

		return $dato;
	}//end set_format_form_type


	/**
	* RENDER_LIST_VALUE
	* Overwrite for non default behaviour
	* Receive value from section list and return proper value to show in list
	* Sometimes is the same value (eg. component_input_text), sometimes is calculated (e.g component_portal)
	* @param string $value
	* @param string $tipo
	* @param int $parent
	* @param string $modo
	* @param string $lang
	* @param string $section_tipo
	* @param int $section_id
	*
	* @return string $list_value
	*/
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null) {
	

		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
												 	 $parent,
												 	 $modo,
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);
		
		# Use already query calculated values for speed
		#$dato = json_handler::decode($value);
		#$component->set_dato($dato);

		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo); // Set unic id for build search_options_session_key used in sessions
		
		$value = $component->get_html();
		#$value = $component->get_valor();


		return $value;		
	}//end render_list_value


}
?>