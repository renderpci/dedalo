<?php
/*
* CLASS component_relation_children
*
*
*/
class component_relation_children extends component_relation_common {


	protected $relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');


	
	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {
		#return "working here! ".__METHOD__;
	
		if (isset($this->valor)) {
			#dump($this->valor, ' RETURNED VALOR FROM CACHE this->valor ++ '.to_string());		
			return $this->valor;
		}

		$ar_valor  	= array();
		$dato   	= $this->get_dato();
		foreach ((array)$dato as $key => $current_locator) {
			#$ar_valor[] = self::get_locator_value( $current_locator, $lang, $this->section_tipo );
			$ar_valor[] = ts_object::get_term_by_locator( $current_locator, $lang, $from_cache=true );		
		}//end if (!empty($dato))


		# Set component valor
		#$this->valor = implode(', ', $ar_valor);
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
	}//end get_valor_lang



	/**
	* GET_AR_TARGET_SECTION_TIPO
	* Select source section/s
	* Overrides component common method
	*/
	public function get_ar_target_section_tipo() {
		
		if (!$this->tipo) return null;

		if(isset($this->ar_target_section_tipo)) {
			return $this->ar_target_section_tipo;
		}

		$target_mode = isset($this->propiedades->target_mode) ? $this->propiedades->target_mode : null;
		switch ($target_mode) {

			case 'hierarchy_root_values':
				# Resolve DEDALO_HIERARCHY_TLD2_TIPO data
				$target_values = (array)$this->propiedades->target_values;
				foreach ((array)$target_values as $key => $current_component_tipo) {
					$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);					
					$component 		 = component_common::get_instance($modelo_name,
																	  $current_component_tipo,
																	  $this->parent,
																	  $modo='edit',
																	  $lang=DEDALO_DATA_LANG,
																	  $this->section_tipo);
					$valor = $component->get_valor(DEDALO_DATA_LANG);
					$ar_target_section_tipo[] = strtolower($valor).'1'; // Like 'es1'
				}
				break;

			case 'free':
				# target_values are directly the target section tipo
				$target_values = (array)$this->propiedades->target_values;
				$ar_target_section_tipo = $target_values;				
				break;

			default:
				# Default is self section
				$ar_target_section_tipo = array($this->section_tipo);
				break;
		}
		
		# Fix value
		$this->ar_target_section_tipo = $ar_target_section_tipo;

		return (array)$ar_target_section_tipo;
	}//end get_ar_target_section_tipo



	/**
	* MAKE_ME_YOUR_CHILDREN
	* Add one locator to current 'dato' from parent side
	* NOTE: This method updates component 'dato' and save
	* @return bool
	*/
	public function make_me_your_children( $section_tipo, $section_id ) {

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($this->relation_type);
			$locator->set_from_component_tipo($this->tipo);

		# Add children locator
		if (!$add_children = $this->add_children($locator)) {			
			return false;
		}
		
		return true;
	}//end make_me_your_children



	/**
	* REMOVE_ME_AS_YOUR_CHILDREN
	* @return bool 
	*/
	public function remove_me_as_your_children( $section_tipo, $section_id ) {
		
		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type($this->relation_type);
			$locator->set_from_component_tipo($this->tipo);

		# Remove children locator	
		if (!$remove_children = $this->remove_children($locator)) {			
			return false;
		}
		
		return true;
	}//end remove_me_as_your_children



	/**
	* ADD_CHILDREN
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' and save
	* @return bool
	*/
	public function add_children( $locator ) {

		if ($locator->section_tipo===$this->section_tipo && $locator->section_id==$this->parent) {
			return false; // Avoid autoreferences
		}

		if (!isset($locator->from_component_tipo)) {
			debug_log(__METHOD__." ERROR. ignored action. Property \"from_component_tipo\" is mandatory ".to_string(), logger::ERROR);
			return false;
		}

		# Add current locator to component dato		
		if (!$add_locator = $this->add_locator_to_dato($locator)) {
			return false;
		}
		
		return true;
	}//end add_children



	/**
	* REMOVE_CHILDREN
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato' 
	* @return bool
	*/
	public function remove_children( $locator ) {

		# Add current locator to component dato		
		if (!$remove_locator_locator = $this->remove_locator_from_dato($locator)) {
			return false;
		}
		
		return true;		
	}//end remove_children



	/**
	* BUILD_SEARCH_COMPARISON_OPERATORS 
	* Note: Override in every specific component
	* @param array $comparison_operators . Like array('=','!=')
	* @return object stdClass $search_comparison_operators
	*//*
	public function build_search_comparison_operators( $comparison_operators=array('=','!=') ) {
		
		return (object)parent::build_search_comparison_operators($comparison_operators);
	}//end build_search_comparison_operators */



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
	*//*
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}

		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search
		
		switch (true) {
			case $comparison_operator==='=':
				$search_query = " {$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb ";
				break;
			case $comparison_operator==='!=':
				$search_query = " ({$json_field}#>'{components, $search_tipo, $tipo_de_dato_search, ". $current_lang ."}' @> '[$search_value]'::jsonb)=FALSE ";
				break;
		}
		
		if(SHOW_DEBUG) {
			$search_query = " -- filter_by_search $search_tipo ". get_called_class() ." \n".$search_query;
			#dump($search_query, " search_query for search_value: ".to_string($search_value)); #return '';
		}

		return $search_query;
	}//end get_search_query */



}//end component_relation_children
?>