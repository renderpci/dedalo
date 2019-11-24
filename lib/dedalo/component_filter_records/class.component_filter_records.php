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


	

}//end component_filter_records
?>