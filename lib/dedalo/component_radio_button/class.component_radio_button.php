<?php
/*
* CLASS COMPONENT RADIO BUTTON
*/


class component_radio_button extends component_common {

	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;


	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		/*
		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
		*/
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
		#$dato = json_handler::decode(json_encode($dato));	# Force array of objects instead default array of arrays
		#dump($dato," dato");
		return (array)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		if (is_string($dato) && strpos($dato, '}')!==false ) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if(SHOW_DEBUG) {
			#dump($dato," dato original");
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		parent::set_dato( (array)$dato );
	}

	/* OLD
	# GET DATO : Format "3"
	public function get_dato() {
		$dato = parent::get_dato();		
		if(SHOW_DEBUG) {
			if (is_array($dato) || is_object($dato)) {
				dump($dato,"dato - parent:".$this->get_parent()." tipo:".$this->get_tipo());	dump($this,"this");
				throw new Exception("Error Processing Request. Este componente contiuene un tipo de dato no válido (debe ser string)", 1);				
			}
		}		
		return (string)$dato;
	}

	# SET_DATO
	public function set_dato($dato) {
		parent::set_dato( (string)$dato );
	}
	*/
	
	# GET VALUE . DEFAULT IS GET DATO . OVERWRITE IN EVERY DIFFERENT SPECIFIC COMPONENT
	public function get_valor( $lang=DEDALO_DATA_LANG ) {

		if (isset($this->valor)) {
			if(SHOW_DEBUG) {
				//error_log("Catched valor !!! from ".__METHOD__);
			}
			return $this->valor;
		}

		

		switch ($this->modo) {

			case 'diffusion':				
				$dato = $this->get_dato();
				
				$object_si = new stdClass();
					$object_si->section_id   = (string)NUMERICAL_MATRIX_VALUE_YES;
					$object_si->section_tipo = (string)"dd64";

				$object_no = new stdClass();
					$object_no->section_id   = (string)NUMERICAL_MATRIX_VALUE_NO;
					$object_no->section_tipo = (string)"dd64";
				
				if ($dato[0]==$object_si) {
					return 'si';
				}else{
					return 'no';
				}
				break;
			
			default:
				
				
				# Always run list of values
				$ar_list_of_values	= $this->get_ar_list_of_values( $lang, null, false); # Importante: Buscamos el valor en el idioma actual
				
			
				
				$dato = $this->get_dato();
				if (empty($dato)) {
					return $this->valor = null;
				}
				
				# Test dato format (b4 changed to object)
				foreach ($dato as $key => $value) {
					if (!is_object($value)) {
						if(SHOW_DEBUG) {
							dump($dato," dato");						
							trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo .Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true) );
						}
						return $this->valor = null;
					}
				}
				

				foreach ($ar_list_of_values->result as $locator => $rotulo) {

					$locator = json_handler::decode($locator);	# Locator is json encoded object
						#dump($locator," locator - dato:".print_r($dato,true));

					if (in_array($locator, $dato)) {						
						return $this->valor = $rotulo;
					}
				}
				break;
				
		}#end switch		

	}#end get_valor




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


	/**
	* GET_VALOR_EXPORT
	* Return component value sended to export data
	* @return string $valor
	*/
	public function get_valor_export( $valor=null, $lang=DEDALO_DATA_LANG, $quotes, $add_id ) {
		
		if (is_null($valor)) {
			$dato = $this->get_dato();				// Get dato from DB
		}else{
			$this->set_dato( json_decode($valor) );	// Use parsed json string as dato
		}

		$valor = $this->get_valor($lang);
		
		if(SHOW_DEBUG) {
			#return "RADIO_BUTTON: ".$valor;
		}
		return $valor;

	}#end get_valor_export



	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}//end build_search_comparison_operators

	/**
	* GET_SEARCH_QUERY
	* Build search query for current component . Overwrite for different needs in other components 
	* (is static to enable direct call from section_records without construct component)
	* Params
	* @param string $json_field . JSON container column Like 'dato'
	* @param string $search_tipo . Component tipo Like 'dd421'
	* @param string $tipo_de_dato_search . Component dato container Like 'dato' or 'valor'
	* @param string $current_lang . Component dato lang container Like 'lg-spa' or 'lg-nolan'
	* @param string $search_value . Value received from search form request Like 'paco'
	* @param string $comparison_operator . SQL comparison operator Like 'ILIKE'
	*
	* @see class.section_records.php get_rows_data filter_by_search
	* @return string $search_query . POSTGRE SQL query (like 'datos#>'{components, oh21, dato, lg-nolan}' ILIKE '%paco%' )
	*/
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}
		switch (true) {
			case $comparison_operator=='=':
				$search_query = " $json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb ";
				break;
			case $comparison_operator=='!=':
				$search_query = " ($json_field#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb)=FALSE ";
				break;
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}
		return $search_query;
	}//end get_search_query



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
	public static function render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo, $section_id) {

		$component 	= component_common::get_instance(__CLASS__,
													 $tipo,
												 	 $parent,
												 	 'list',
													 DEDALO_DATA_NOLAN,
												 	 $section_tipo);

		
		# Use already query calculated values for speed
		$ar_records   = (array)json_handler::decode($value);
		$component->set_dato($ar_records);
		$component->set_identificador_unico($component->get_identificador_unico().'_'.$section_id); // Set unic id for build search_options_session_key used in sessions
		
		return  $component->get_valor($lang);		
	}#end render_list_value



	/**
	* GET_VALOR_LIST_HTML_TO_SAVE
	* Usado por section:save_component_dato
	* Devuelve a section el html a usar para rellenar el 'campo' 'valor_list' al guardar
	* Por defecto será el html generado por el componente en modo 'list', pero en algunos casos
	* es necesario sobre-escribirlo, como en component_portal, que ha de resolverse obigatoriamente en cada row de listado
	*
	* En este caso, usaremos únicamente el valor en bruto devuelto por el método 'get_dato_unchanged'
	*
	* @see class.section.php
	* @return mixed $result
	*/
	public function get_valor_list_html_to_save() {
		$result = $this->get_dato_unchanged();

		return $result;		
	}//end get_valor_list_html_to_save




}
?>