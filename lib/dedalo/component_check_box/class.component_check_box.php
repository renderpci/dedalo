<?php
/*
* CLASS COMPONENT CHECK BOX
*/


class component_check_box extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	function __construct($tipo=NULL, $parent=NULL, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}

	# GET DATO : 
	public function get_dato() {
		$dato = parent::get_dato();
		if (!empty($dato) && !is_array($dato)) {
			#dump($dato,"dato");
			trigger_error("Error: ".__CLASS__." dato type is wrong. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent");
			$this->set_dato(array());
			$this->Save();
		}
		if ($dato==null) {
			$dato=array();
		}
		
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if(SHOW_DEBUG) {
			#dump($dato," dato original");
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		#dump($dato,"dato ");die();
		parent::set_dato( (array)$dato );
	}
	/* OLD
	# GET DATO : Format {"67":"2","69":"2"}
	public function get_dato() {
		$dato = parent::get_dato();
		return (array)$dato;
	}
	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (object)$dato );
	}
	*/

	
	/**
	* GET VALOR
	* GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECDIFIC COMPONENT
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG) {		

		$dato = $this->get_dato();
		if (empty($dato)) {
			return $this->valor = null;
		}
		
		# Test dato format (b4 changed to object)
		foreach ($dato as $key => $value) {
			if (!is_object($value)) {
				if(SHOW_DEBUG) {
					dump($dato," dato");
				}
				trigger_error(__METHOD__." Wrong dato format. OLD format dato in label:$this->label tipo:$this->tipo parent:$this->parent.Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true) );
				return $this->valor = null;
			}
		}
		
		# Always run list of values
		$ar_list_of_values	= $this->get_ar_list_of_values( $lang, null ); # Importante: Buscamos el valor en el idioma actual

		$valor=array();
		foreach ($ar_list_of_values->result as $locator => $rotulo) {
			$locator = json_handler::decode($locator);	# Locator is json encoded object
			if (in_array($locator, $dato)) {
				$valor[] = $rotulo;				
			}
		}
		$this->valor = implode(', ', $valor);
		return $this->valor ;

		/* OLD
		$dato = $this->get_dato();
			#dump($dato,'dato LANG: '.$lang);
		if (!empty($dato)) {
			$referenced_tipo 	= $this->get_referenced_tipo();
			$ar_list_of_values	= (array)$this->get_ar_list_of_values( $lang, null );
			$valor='';
			foreach ((array)$dato as $id_matrix => $state) {
				if($state!=2) continue;
				
				if( in_array($id_matrix, array_keys($ar_list_of_values)) ) {
					$valor .= $ar_list_of_values[$id_matrix];
					$valor .= ", ";
				}
			}
			$valor = substr($valor, 0, -2);
				#dump($valor,'valor');
		}
		return $valor;
		*/		
	}

	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){

		$relacionados = (array)$this->RecordObj_dd->get_relaciones();
		
		#dump($relacionados,'$relacionados');
		if(empty($relacionados)){
			return $this->lang;
		}

		$termonioID_related = array_values($relacionados[0])[0];
		$RecordObjt_dd = new RecordObj_dd($termonioID_related);

		if($RecordObjt_dd->get_traducible() =='no'){
			$lang = DEDALO_DATA_NOLAN;
		}else{
			$lang = DEDALO_DATA_LANG;
		}
		return $lang;
	}


	public function get_dato_as_string() {
		return json_handler::encode($this->get_dato());
	}



}
?>