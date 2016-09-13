<?php
/*
* CLASS COMPONENT_RELATION_INDEX
*/


class component_relation_index extends component_relation_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;

	

	/**
	* __CONSTRUCT
	*/
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# relation_tipo
		$this->relation_tipo = DEDALO_RELATION_TYPE_INDEX_TIPO;			

		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}//end __construct



	/**
	* SAVE
	* @return int $result
	*	section returns section_id on save
	* When save component, section is saved, not explicit section save is needed here
	* Note that section relation data of current type is deleted and recreated completely on every save action
	*/
	public function Save() {

		# Set section relation locators for fast access later from class relation
		$my_section = $this->get_my_section();

		# Remove whole actual section parent locators
		$my_section->remove_relations_of_type($this->relation_tipo);

		# Add whole array of parent locators
		$dato = $this->get_dato();
		foreach ((array)$dato as $current_locator) {
			$current_locator->type = $this->relation_tipo;
			$my_section->add_relation($current_locator, $remove_previous_of_current_type=false); // Note thats second param force remove old locators of current type
		}
		

		# Save normally
		return parent::Save();
	}//end Save



	/**
	* GET DATO
	* @return array $dato
	*	$dato is always an array of locators
	*/
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
		$dato = is_array($dato) ? array_values($dato) : (array)$dato;		
		/*
		if (empty($dato)) {
			parent::set_dato( null ); // To store null in database instead empty array
		}else{
			parent::set_dato( (array)$dato );
		}
		*/
		parent::set_dato( (array)$dato );		
	}//end set_dato


	
	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {
		#return "working here! ".__METHOD__;
	
		if (isset($this->valor)) {			
			return $this->valor;
		}

		$ar_valor  	= array();		
		$dato   	= $this->get_dato();
		foreach ((array)$dato as $key => $current_locator) {
			$ar_valor[] = $this->get_locator_value( $current_locator, $lang );			
		}//end if (!empty($dato)) 

		# Set component valor
		# $this->valor = implode(', ', $ar_valor);
		$valor='';
		foreach ($ar_valor as $key => $value) {
			if(!empty($value)) {
				$valor .= $value;
				if(end($ar_valor)!=$value) $valor .= ', ';
			}
		}		
		$this->valor = $valor;

		return (string)$this->valor;
	}//end get_valor



	/*
	* GET_VALOR_LANG
	* Return the main component lang
	* If the component need change this langs (selects, radiobuttons...) overwritte this function
	*/
	public function get_valor_lang(){
		return "working here! ".__METHOD__;
		/*
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

		return $lang;*/
	}#end get_valor_lang
	


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
				$search_query = " {$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb ";
				break;
			case $comparison_operator=='!=':
				$search_query = " ({$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb)=FALSE ";
				break;
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}

		return $search_query;
	}//end get_search_query



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

	
	

}//end component_relation_index
?>