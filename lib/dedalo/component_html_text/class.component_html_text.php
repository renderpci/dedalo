<?php
/*
* CLASS COMPONENT_HTML_TEXT
*/


class component_html_text extends component_common {


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save( $update_all_langs_tags_state=true ) {
		
		# Dato current assigned
		$dato_current 	= $this->dato;

		# Clean dato 
		$dato_clean 	= $this->clean_text($dato_current);

		# Set dato again (cleaned)
		$this->dato 	= $dato_clean;

			#dump($this->dato,'$this->dato');

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {		
		return parent::get_ar_tools_obj();
	}	
	

	/**
	* GET DATO 
	* Overwrite common_function
	*/
	public function get_dato() {

		$dato = parent::get_dato();
		return $dato;
	}

	/**
	* GET DATO DEFAULT 
	* Overwrite common_function
	*/
	public function get_dato_default_lang() {

		$dato = parent::get_dato_default_lang();
		return $dato;
	}

	/**
	* GET VALOR
	* Overwrite common_function
	*/
	public function get_valor() {			
		
		switch ($this->modo) {
			case 'dummy':
			case 'diffusion':
				#$dato = $this->get_dato();
				$dato = parent::get_dato();		
				break;
			
			default:
				$dato = parent::get_dato();	
				#dump($dato,'dato');

				$dato = $this->clean_text($dato);
					#dump($dato ,'$dato ');				
				break;
		}		

		return $dato;
	}


	/**
	* CLEAN_TEXT
	* Anclaje para futuros preprocesados del texto. De momento sólo haremos un trim
	*/
	public function clean_text($string){

		# Desactivo porque elimina el '<mar>'
		#$string = filter_var($string, FILTER_UNSAFE_RAW );	# FILTER_SANITIZE_STRING
		#$string = stripslashes($string);

		return trim($string);
	}
	



	

	
};
?>