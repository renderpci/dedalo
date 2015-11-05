<?php
/*
* CLASS COMPONENT REF
 La idea es que sea un puntero hacia otros componentes. Que guarde el id_matrix y el tipo y se resuelva al mostrarse.
 Ejemplo: guardamos el id_matrix del usuario actual desde activity y al mostrar el componente en los listado de actividad, mostramos su resolución
 en lugar de su dato (Admin por )... por acabar..
*/


class component_autocomplete extends component_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	public $referenced_section_tipo ;		# Used to fix section tipo (calculado a partir del componente relacionado de tipo section) Puede ser virtual o real

	# Array of related terms in structure (one or more)
	protected $ar_terminos_relacionados;

	# referenced component tipo
	public $tipo_to_search;
	

	
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

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
		#$dato = json_handler::decode(json_encode($dato));	# Force array of objects instead default array of arrays
		#dump($dato," dato");
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
			$dato = array($dato); // IMPORTANT 
		}

		# Remove possible duplicates
		$dato_unique=array();
		foreach ((array)$dato as $locator) {
			if (!in_array($locator, $dato_unique)) {
				$dato_unique[] = $locator;
			}		
		}
		$dato = $dato_unique;

		parent::set_dato( (array)$dato );		
	}
	


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method
	*/
	public function Save() {		
		# dump($this->get_dato()," dato");
		# Salvamos de forma estándar
		return parent::Save();		
	}



	

	

	/**
	* GET VALOR 
	* Get resolved string representation of current value (expected id_matrix of section or array)
	* @return array $this->valor
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='string' ) {
		/*
		if (isset($this->valor)) {
			if(SHOW_DEBUG) {
				#error_log("Catched valor !!! from ".__METHOD__);
			}
			return $this->valor;
		}
		*/
		
		$dato = $this->get_dato();
			#dump($dato,'dato '.gettype($dato) );

		if ( empty($dato) ) {
			if ($format=='array') {
				return array();
			}else{
				return '';
			}
		}

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang==DEDALO_DATA_NOLAN) {
			$lang = DEDALO_DATA_LANG;
		}

		
		# Test dato format (b4 changed to object)
		foreach ($dato as $key => $value) {
			if (!is_object($value)) {
				if(SHOW_DEBUG) {
					dump($dato," dato ($value) is not object!! gettype:".gettype($value));
				}
				trigger_error(__METHOD__." Wrong dato format. OLD format dato in $this->label $this->tipo [section_id:$this->parent].Expected object locator, but received: ".gettype($value) .' : '. print_r($value,true) );
				return $this->valor = null;
			}
		}
	
		if (!isset($this->referenced_section_tipo)) {
			$this->referenced_section_tipo = $this->get_target_section_tipo();
		}
	
		# Filter custom (for ar_list_of_values)
		$filter_custom = false;
			foreach ($dato as $current_locator) {

				if (isset($current_locator->section_id)) {
					$locator_section_id = $current_locator->section_id;
					$filter_custom .= "section_id = $locator_section_id OR ";
				}
			}
			if (!empty($filter_custom)) {
				$filter_custom = "\n AND (" .substr($filter_custom, 0, -4). ")";
			}
			#dump($filter_custom, ' filter_custom ++ '.to_string());

		$this->ar_list_of_values = $this->get_ar_list_of_values( $lang, null, $this->referenced_section_tipo, $filter_custom ); # Importante: Buscamos el valor en el idioma actual
			#dump($this->ar_list_of_values, ' $this->ar_list_of_values');
		$ar_valor=array();
		foreach ($this->ar_list_of_values->result as $locator => $rotulo) {

			$locator_string = $locator;
			$locator = json_handler::decode($locator);	# Locator is json encoded object				

			#if (in_array($locator, $dato)) {
				$ar_valor[$locator_string] = $rotulo;		
			#}
		}//end foreach ($this->ar_list_of_values->result as $locator => $rotulo) {
			
		if ($format=='array') {
			$valor = $ar_valor;
		}else{
			$valor = implode("<br>", $ar_valor);
		}
		
		return $valor;
	}



	/**
	* GET_REFERENCED_SECTION_TIPO
	* Locate in structure TR the target section (remember, components are from real section, but you can target to virtual setion)
	* @return string $referenced_section_tipo
	*//*
	public function get_referenced_section_tipo($options=null) {
		#dump($this->RecordObj_dd->get_relaciones(), ' var');
		$ar_related_terms = (array)$this->RecordObj_dd->get_relaciones();		
		
		foreach ($ar_related_terms as $related_terms)
		foreach ($related_terms as $modelo => $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			if ($modelo_name=='section') {
				$referenced_section_tipo = $current_tipo; break;
			}
		}
		if (!isset($referenced_section_tipo)) {
			throw new Exception("Error Processing Request. Inconsistency detect. This component need related section always", 1);			
		}
		#dump($referenced_section_tipo, ' referenced_section_tipo');

		return $referenced_section_tipo;

	}#end get_referenced_section_tipo
	*/

	/**
	* GET_TIPO_TO_SEARCH
	* Locate in structure TR the component tipo to search
	* @return string $tipo_to_search
	*/
	public function get_tipo_to_search($options=null) {

		if(isset($this->tipo_to_search)) {
			return $this->tipo_to_search;
		}

		/* DESECHADO POR PROBLEMAS AL SELECCIONAR EL PRIMERO. EL ORDEN NO ES RESPETADO...
		$ar_related_terms = (array)$this->RecordObj_dd->get_relaciones();
			#dump($ar_related_terms, ' ar_related_terms');
		foreach ($ar_related_terms as $related_terms)		
		foreach ($related_terms as $modelo => $current_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
			# Get first component only
			if (strpos($modelo_name, 'component_')!==false) {
				$tipo_to_search = $current_tipo; break;
			}
		}
		*/

		$ar_terminoID_by_modelo_name = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($this->tipo, 'component_', 'termino_relacionado'); 
				#dump($ar_terminoID_by_modelo_name, ' ar_terminoID_by_modelo_name '.$this->tipo.' ');
		$tipo_to_search = reset($ar_terminoID_by_modelo_name);

		if (!isset($tipo_to_search)) {
			throw new Exception("Error Processing Request. Inconsistency detect. This component need related component to search always", 1);			
		}
		#dump($tipo_to_search, ' tipo_to_search');

		# Fix value
		$this->tipo_to_search = $tipo_to_search;

		return $tipo_to_search;

	}#end get_tipo_to_search




	
	/**
	* AUTOCOMPLETE_SEARCH
	* Used by trigger on ajax call
	* This function search is almost identical to component_common->get_ar_list_of_values
	* @param string tipo
	* @param string tipo_to_search
	* @param string string_to_search
	* @return array $output 
	*	Array format: id_matrix=>dato_string 
	*/
	public static function autocomplete_search($tipo, $tipo_to_search, $referenced_section_tipo, $string_to_search, $max_results=30, $id_path) {
		$ar_result=array();

		$component 			= component_common::get_instance(null, $tipo, null, 'edit', DEDALO_DATA_LANG, $referenced_section_tipo);
		$ar_list_of_values  = $component->get_ar_list_of_values(DEDALO_DATA_LANG, $id_path, $referenced_section_tipo);
		$ar_result 			= search_string_in_array($ar_list_of_values->result,(string)$string_to_search);	#dump($ar_result," ar_result");

		$output = array_slice($ar_result, 0, $max_results,true);
			#dump($output," ar_result");

		return $output;

	}#END autocomplete_search




	/**
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	* @return string $lang
	*/
	public function get_valor_lang() {

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
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*/
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}#end build_search_comparison_operators



	/**
	* GET_SEARCH_QUERY (OVERWRITE COMPONENT COMMON)
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



}
?>