<?php
/*
* CLASS component_filter_records
*/


class component_filter_records extends component_common {	

	

	/**
	* GET DATO
	* @return array $dato
	*	$dato is stored in db as object (json encoded asoc array), but is converted to php array
	*/
	public function get_dato() {
		$dato = parent::get_dato();
	
		/*
		if (!empty($dato) && !is_array($dato)) {
			#dump($dato,"dato");
			trigger_error("Error: ".__CLASS__." dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent");
			$this->set_dato(array());
			$this->Save();
		}
		*/
		if ($dato===null) {
			$dato=array();
		}

		return (array)$dato;
	}//end get_dato
	


	/**
	* SET_DATO
	* dato is object (from js json data) and set as array
	*/
	public function set_dato( $dato ) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		#if (is_object($dato)) {
		#	$dato = array($dato);
		#}		

		parent::set_dato( (array)$dato );
	}//end set_dato



	/**
	* GET_VALOR
	* @return 
	*/
	public function get_valor() {
		return json_encode($this->get_dato());
	}//end get_valor



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* Usaremos get_valor para permitir importaciones de fichas en lenguajes distintos al actual. Ejemplo: importar
	* Francia (jer_fr) en castellano (lg-spa)
	*
	* @see class.section.php
	* @return string $html
	*/
	public function get_valor_list_html_to_save() {		
		return null;
	}//end get_valor_list_html_to_save



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
	*//*
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id, $current_locator=null, $caller_component_tipo=null, $section_list_key=0) {
		#dump($value, " value ++ parent:$parent - tipo:$tipo - section_id:$section_id ".to_string());

		$parent    = null; // Force null always !important
		$component = component_common::get_instance(__CLASS__,
													$tipo,
													$parent,
													'list',
													DEDALO_DATA_NOLAN,
													$section_tipo);
		
		$component->html_options->rows_limit = 1;

		# Set section_list_key for select what section list (can exists various) is selected to layout map
		$component->set_section_list_key( (int)$section_list_key );

			#if($component->tipo==='oh25') dump($component->section_list_key, '$section_list_key oh25 ++ '.$section_list_key);	
		
		# Use already query calculated values for speed
		$ar_records   = (array)json_handler::decode($value);
		$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id.'_'.$caller_component_tipo.'_'.$section_list_key); // Set unic id for build search_options_session_key used in sessions
		$html = $component->get_html();

		
		#if($component->tipo==='oh25') 	dump($html, ' html ++ '.to_string());

		return $html;
	}#end render_list_value
	*/

	

}//end component_filter_records
?>