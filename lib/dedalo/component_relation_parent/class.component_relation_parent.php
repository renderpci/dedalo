<?php
/*
* COMPONENT_RELATION_PARENT
* Class to manage parent relation between section.
* Not store his own data, only manage component_relation_childrens data in 'reverse' mode
*/
class component_relation_parent extends component_relation_common {
	
	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;
	# Current component relation_type (used to filter locators in 'relations' container data)
	public $relation_type = DEDALO_RELATION_TYPE_PARENT_TIPO;

	static $get_parents_query;
	/**
	* __CONSTRUCT
	*//*
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# relation_tipo
		$this->relation_tipo = DEDALO_RELATION_TYPE_PARENT_TIPO;

		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		if(SHOW_DEBUG) {
			$traducible = $this->RecordObj_dd->get_traducible();
			if ($traducible=='si') {
				throw new Exception("Error Processing Request. Wrong component lang definition. This component $tipo (".get_class().") is not 'traducible'. Please fix this ASAP", 1);
			}
		}
	}//end __construct
	*/



	/**
	* GET DATO
	* This component don't store data, only manages calculated data from component_relations_children generated data
	* stored in section 'relations' container
	* @return array $dato
	*	$dato is always an array of locators
	*/
	public function get_dato() {

		# get_my_parents always
		$dato = $this->get_my_parents();

		if (!empty($dato) && !is_array($dato)) {	
			debug_log(__METHOD__." Re-saved invalid dato. Array expected and ".gettype($dato)." is received for tipo:$this->tipo, parent:$this->parent", logger::ERROR);
			$dato = array();
			$this->set_dato( $dato );
			$this->Save();
		}
	
		return (array)$dato;
	}//end get_dato



	/**
	* GET_COMPONENT_RELATION_CHILDREN_TIPO
	* @return string $component_relation_children_tipo
	*/
	public static function get_component_relation_children_tipo($tipo) {
		
		$modelo_name 	 = 'component_relation_children';
		$ar_children 	 = (array)common::get_ar_related_by_model($modelo_name, $tipo);
		$ar_children_len = count($ar_children);
		if ($ar_children_len===0) {
			debug_log(__METHOD__." Sorry, component_relation_children not found in this section ($tipo) ".to_string(), logger::ERROR);
			return false;
		}elseif ($ar_children_len>1) {
			debug_log(__METHOD__." Sorry, more than 1 component_relation_children found in this section ($tipo). First component will be used. ".to_string($ar_children), logger::ERROR);
		}
		$component_relation_children_tipo = reset($ar_children);

		return (string)$component_relation_children_tipo;
	}//end get_component_relation_children_tipo



	/**
	* GET_MY_PARENTS
	* @return array $parents
	*/
	protected function get_my_parents() {
		
		# Calculate current target component_relation_children_tipo from structure
		$component_relation_children_tipo = self::get_component_relation_children_tipo($this->tipo);

		$parents = component_relation_parent::get_parents($this->parent, $this->section_tipo, $component_relation_children_tipo);

		return (array)$parents;
	}//end get_my_parents



	/**
	* GET_PARENTS
	* Get parents of current section
	* If you call this method from component_relation_parent, always send $from_component_tipo var to avoid recreate the component statically
	* @param int $section_id
	* @param string $section_tipo
	* @param string $from_component_tipo
	*	Optional. Previously calculated from structure using current section tipo info or calculated inside from section_tipo
	* @param array $ar_tables
	*	Optional. If set, union tables search is made over all tables received
	*
	* @return array $parents
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_parents($section_id, $section_tipo, $from_component_tipo=null, $ar_tables=null) {

		# FROM_COMPONENT_TIPO FILTER OPTION
		$filter ='';
		if (!is_null($from_component_tipo)) {
			/*
				# Locate current section component parent tipo
				$ar_modelo_name_required = array('component_relation_parent');
				$ar_children_tipo 	 	 = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
				$component_parent_tipo 	 = reset($ar_children_tipo);
				# Calculate current target component_relation_children_tipo from structure
				$from_component_tipo 	 = component_relation_parent::get_component_relation_children_tipo($component_parent_tipo);
				*/
			$filter = ",\"from_component_tipo\":\"$from_component_tipo\"";
		}
		
		$type 	  = DEDALO_RELATION_TYPE_CHILDREN_TIPO;		
		$compare  = "{\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"type\":\"$type\"".$filter."}";

		# TABLES strQuery
		$strQuery  = '';
		if (is_null($ar_tables)) {
			// Calculated from section_tipo (only search in current table)
			$table 	   = common::get_matrix_table_from_tipo($section_tipo);
			$strQuery .= "SELECT section_tipo, section_id, datos#>'{relations}' AS relations FROM \"$table\" WHERE datos#>'{relations}' @> '[$compare]'::jsonb ";
		}else{
			// Iterate tables and make union search
			$ar_query=array();
			foreach ((array)$ar_tables as $table) {
				$ar_query[] = "SELECT section_tipo, section_id, datos#>'{relations}' AS relations FROM \"$table\" WHERE datos#>'{relations}' @> '[$compare]'::jsonb ";				
			}
			$strQuery .= implode(" UNION ALL ", $ar_query);
		}
		// Set order to maintain results stable
		$strQuery .= " ORDER BY section_id ASC";
		
		if(SHOW_DEBUG) {	
			component_relation_parent::$get_parents_query = $strQuery;
			#error_log($strQuery);
		}
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		
		$parents = array();
		while ($rows = pg_fetch_assoc($result)) {

			$current_section_id   	= $rows['section_id'];
			$current_section_tipo 	= $rows['section_tipo'];			

			// Search 'from_tipo' in locators when no is received
			if (empty($from_component_tipo)) {

				$current_relations = json_decode($rows['relations']);

				$reference_locator = new locator();
					$reference_locator->set_section_tipo($section_tipo);
					$reference_locator->set_section_id($section_id);
					$reference_locator->set_type($type);

				foreach ((array)$current_relations as $current_locator) {
					# dump( $current_locator, ' $current_locator ++ '.to_string($reference_locator));
					if( $match = locator::compare_locators( $current_locator, $reference_locator, $ar_properties=array('section_tipo','section_id','type')) ){
						$calculated_from_component_tipo = $current_locator->from_component_tipo;
						break;
					}					
				}
			}//end if (empty($from_component_tipo)) {

			$parent = new stdClass();
				$parent->section_tipo	= $current_section_tipo;
				$parent->section_id 	= $current_section_id;
				$parent->component_tipo = empty($from_component_tipo) ? $calculated_from_component_tipo : $from_component_tipo;

			# parents
			$parents[] = $parent;
		}//end while

		return (array)$parents;
	}//end get_parents



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
			dump($this->valor, ' RETURNED VALOR FROM CACHE this->valor ++ '.to_string());		
			return $this->valor;
		}

		$ar_valor  	= array();		
		$dato   	= $this->get_dato();
		foreach ((array)$dato as $key => $current_parent) {
			$ar_valor[] = $this->get_parent_value( $current_parent->section_id, $current_parent->section_tipo, $lang );			
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
	*//*
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=') {
		$search_query='';
		if ( empty($search_value) ) {
			return $search_query;
		}
		$json_field = 'a.'.$json_field; // Add 'a.' for mandatory table alias search
		
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
	*/


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
	* ADD_PARENT
	* Add a children to referenced component_relation_children
	* @return bool $result
	*/
	public static function add_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo) {
		
		$result=false;
	
		$modelo_name 	= 'component_relation_children';
		#$component_tipo = self::get_component_relation_children_tipo($tipo);
		$modo 			= 'edit';
		$lang 			= DEDALO_DATA_NOLAN;	
		$component_relation_children   = component_common::get_instance($modelo_name,
														  				$children_component_tipo,
														  				$children_section_id,
														  				$modo,
														  				$lang,
														  				$children_section_tipo);
		
		$added = (bool)$component_relation_children->make_me_your_children( $section_tipo, $parent );
		if ($added===true) {
			$component_relation_children->Save();
			$result = true;
		}

		return (bool)$result;
	}//end add_parent



	/**
	* REMOVE_PARENT
	* @return bool $result
	*/
	public static function remove_parent($tipo, $parent, $section_tipo, $children_section_tipo, $children_section_id, $children_component_tipo) {

		$result=false;
	
		$modelo_name 	= 'component_relation_children';
		#$component_tipo = self::get_component_relation_children_tipo($tipo);
		$modo 			= 'edit';
		$lang 			= DEDALO_DATA_NOLAN;	
		$component_relation_children   = component_common::get_instance($modelo_name,
														  				$children_component_tipo,
														  				$children_section_id,
														  				$modo,
														  				$lang,
														  				$children_section_tipo);

		$removed = (bool)$component_relation_children->remove_me_as_your_children( $section_tipo, $parent );
		if ($removed===true) {
			$component_relation_children->Save();
			$result = true;
		}

		return (bool)$result;
	}//end remove_parent



	/**
	* GET_PARENT_VALUE
	* Resolve value to show in list etc.
	* @return string $valor
	*/
	public function get_parent_value( $section_id, $section_tipo, $lang=DEDALO_DATA_LANG ) {
	
		# En proceso..
		$valor = "$section_id - $section_tipo";

		# Temporal
		#if( $section_tipo === $this->section_tipo ) {
		if($this->section_tipo===DEDALO_THESAURUS_SECTION_TIPO) {
			#dump($section_tipo, ' section_tipo ++ *** '.to_string($this->section_tipo).' - '.DEDALO_THESAURUS_SECTION_TIPO);

			$tipo 		 	= DEDALO_THESAURUS_TERM_TIPO; // input_text			
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$component 		= component_common::get_instance( $modelo_name,
															  $tipo,
															  $section_id,
															  $modo='edit',
															  $lang,
															  $section_tipo);
			$valor = $component->get_valor($lang);

			if (empty($valor)) {
				$main_lang = hierarchy::get_main_lang( $section_tipo );
				if($lang!=$main_lang) {
					$component->set_lang($main_lang);
					$valor = $component->get_valor($main_lang);
					if (strlen($valor)>0) {
						$valor = component_common::decore_untranslated( $valor );						
					}
					# return component to previous lang
					$component->set_lang($lang);					
				}				
			}		
		}

		if(SHOW_DEBUG) {
			$valor .= " <span class=\"note\">[$section_tipo:$section_id]</span>";
		}	
		
		return (string)$valor;
	}//end get_parent_value
	
	
	

}//end component_relation_parent
?>