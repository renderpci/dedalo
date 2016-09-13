<?php
/*
* CLASS COMPONENT PROJECT LANGS
*/


class component_project_langs extends component_common {
	
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	function __construct($tipo=null, $parent=null, $modo='edit', $lang=null, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		# Dato : Verificamos que hay un dato. Si no, asignamos el dato por defecto
		$dato = $this->get_dato();

		# Si se pasa un id vacío (desde class.section es lo normal), se verifica si existe en matrix y si no, se crea un registro que se usará en adelante
		if(empty($dato) && $modo=='edit') {
			$this->set_dato_default();
		}

	}//end __construct



	/**
	* SET_DATO_DEFAULT
	* Set default dato from config and save the component
	*/
	private function set_dato_default() {
		
		# Dato
		$ar_all_project_langs = (array)unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
		$dato=array();
		foreach ($ar_all_project_langs as $current_lang) {
			$current_locator = locator::lang_to_locator($current_lang);
			if (is_object($current_locator)) {
				$dato = component_common::add_object_to_dato( $current_locator, $dato );
			}
		}

		$this->set_dato($dato);
		$this->Save();

		debug_log(__METHOD__." Created component_project_langs default dato in parent:$this->parent with: (tipo:$this->tipo, lang:$this->lang) dato:" . to_string($dato), logger::DEBUG);

	}#end set_dato_default


	/*
	# GET DATO : Format ["lg-cat","lg-spa","lg-eng"]
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (array)$dato );
	}
	*/



	/**
	* GET DATO
	* @return array $dato
	*	$dato is always an array of locators
	*/
	public function get_dato() {
		$dato = parent::get_dato();

		if (!empty($dato) && !is_array($dato)) {
		
			trigger_error("Error: ".__CLASS__." dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent");			
			$dato = array( locator::lang_to_locator($dato) );
		}
		if ($dato==null) {
			$dato=array();
		}

		return (array)$dato;

	}//end get_dato



	/**
	* SET_DATO
	* @param array|string $dato
	*	When dato is string is because is a json encoded dato
	*/
	public function set_dato($dato) {
		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		# Ensures is a real non-associative array (avoid json encode as object)
		$dato = is_array($dato) ? array_values($dato) : $dato;

		parent::set_dato( (array)$dato );
		
	}//end set_dato



	/**
	* GET_VALOR
	* @param string $lang
	* @return string $valor
	*/
	public function get_valor( $lang=DEDALO_APPLICATION_LANG ) {
		
		$ar_langs = $this->get_ar_langs( $lang );
		$valor 	  = implode(',', $ar_langs);
	
		return (string)$valor;
	}#end get_valor



	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {

		# When is received 'valor', set as dato to avoid trigger get_dato against DB 
		# Received 'valor' is a json string (array of locators) from previous database search
		if (!is_null($valor)) {
			$dato = json_decode($valor);
			$this->set_dato($dato);
		}
		$valor = $this->get_valor($lang);
		
		return $valor;

	}#end get_valor_export


	
	/**
	* GET_AR_LANGS
	* Get array of data langs formated 
	* @param string $lang
	*	default is DEDALO_APPLICATION_LANG
	* @return array $ar_langs
	*	format array( lang_locator => label )
	*/
	protected function get_ar_langs( $lang=DEDALO_APPLICATION_LANG ) {
		
		$ar_langs	= array();
		$dato		= $this->get_dato();
	
		foreach ($dato as $current_lang_locator) {
			if (!isset($current_lang_locator->section_tipo)) {
				debug_log(__METHOD__." Error on get current_lang_locator as locator. Skipped this lang ".to_string($current_lang_locator), logger::WARNING);
				continue;
			}
			$key = json_encode($current_lang_locator);
			$ar_langs[$key] = RecordObj_ts::get_termino_by_tipo($current_lang_locator->section_tipo, $lang, true); # $terminoID, $lang=NULL, $from_cache=false, $fallback=true
		}
	
		return $ar_langs;	

	}//get_ar_langs
	
	

	/**
	* SAVE
	* Overwrite common Save . Force always maintain default langs
	*/
	public function Save() {
		
		# ar langs mandatory (config)
		$dedalo_projects_default_langs = (array)unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);

		# current dato langs
		$dato = (array)$this->dato;
		
		# prepend mandatory langs if they are not inside current dato
		foreach ($dedalo_projects_default_langs as $current_lang) {

			$lang_locator 	  = locator::lang_to_locator($current_lang);
			#$lang_locator_std =	locator::get_std_class( $lang_locator ); // cast to stdClass to compare
			#if(!in_array($lang_locator_std, $dato)) {				
			#	array_unshift($dato, $lang_locator_std);
			#}

			# add_object_to_dato is safe for duplicates 
			$dato = component_common::add_object_to_dato( $lang_locator, $dato);
		}

		# update object
		$this->dato = $dato;		
		
		# common save
		$result = parent::Save();

		# Reset session var (stored for speed)
		unset($_SESSION['dedalo4']['config']['ar_all_langs']);

		return $result;

	}//end Save
	


	/**
	* UPDATE_DATO_VERSION
	* @param string $update_version
	* 	like '4.0.11'
	* @param string | array $dato_unchanged
	* @return object $response
	*/
	public static function update_dato_version($update_version, $dato_unchanged, $reference_id) {

		$update_version = implode(".", $update_version);
		#dump($dato_unchanged, ' dato_unchanged ++ -- '.to_string($update_version)); #die();

		switch ($update_version) {

			case '4.0.12':
						
				$data_changed=false;
				if( empty($dato_unchanged) && !is_array($dato_unchanged) ) {

					$new_dato = array();	// Empty array default
					$data_changed=true;

				}else if(is_array($dato_unchanged) && !empty($dato_unchanged)) {

					$ar_langs_locator=array();
					foreach ($dato_unchanged as $key => $current_lang) {
						if (is_string($current_lang)) {
							$current_locator = locator::lang_to_locator($current_lang);
							if (is_object($current_locator)) {
								# add_object_to_dato is safe for duplicates and object types
								$ar_langs_locator = component_common::add_object_to_dato( $current_locator, $ar_langs_locator );
							}							
						}						
					}
					if (!empty($ar_langs_locator)) {
						$new_dato = $ar_langs_locator;
						$data_changed=true;
					}					

				}else{
					$new_dato = $dato_unchanged;
				}
					
				# Compatibility old dedalo instalations
				if ($data_changed) {
					$response = new stdClass();
						$response->result =1;
						$response->new_dato = $new_dato;
						$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

						#dump($new_dato, ' created new_dato ++ '.to_string($dato_unchanged));
					return $response;
				}else{
					$response = new stdClass();
						$response->result = 2;
						$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)." 

					return $response;
				}
				break;

			default:
				# code...
				break;
		}		
		
	}#end update_dato_version



	
	

}
?>