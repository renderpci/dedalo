<?php
/*
* CLASS COMPONENT LAYOUT
*
*
*/
class component_json extends component_common {


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	
	# CONSTRUCT
	public function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {
		
		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);
	}//end __construct



	/**
	* GET_DATO
	*/
	public function get_dato() {
		// Compressed dato to avoid postgresql change index order
		$dato = parent::get_dato();

		// De-Compress dato 
		#if(!empty($dato)) $dato = json_decode( base64_encode($dato) );
		$dato = json_decode($dato);
		#$dato = unserialize($dato);
		#dump($dato, ' dato ++ '.to_string());

		if(!empty($dato) && !is_object($dato) && !is_array($dato)) {			
			trigger_error("Error. dato converted to empty object because is not as expected object. ". gettype($dato));			
			$dato = new stdClass();
		}

		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		if (!empty($dato)) {

			if (is_string($dato)) {
				if (!$dato = json_decode($dato)) {
					trigger_error("Error. Only valid JSON is accepted as dato");
					return false;
				}			
			}

			if(!is_object($dato) && !is_array($dato)) {
				trigger_error("Error. Stopped set_dato because is not as expected object. ". gettype($dato));
				return false;
			}
		}

		// Compress dato to avoid postgresql change index order
		$dato = json_encode($dato);
		#$dato = serialize($dato);
		//error_log( print_r($dato, true) );
		
		parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_VALOR
	* @return 
	*/
	public function get_valor() {
		$dato  = $this->get_dato();
		$valor = json_encode($dato);

		return $valor;
	}//end get_valor



};//end class
?>