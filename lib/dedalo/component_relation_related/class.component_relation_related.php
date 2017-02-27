<?php
/*
* CLASS component_relation_related
*/


class component_relation_related extends component_relation_common {
	
	# relation_type
	protected $relation_type = DEDALO_RELATION_TYPE_RELATED_TIPO;
	# type of rel (like bidirectional, etc..)
	protected $relation_type_rel = DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO; // Default

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');
	
	# sql query stored for debug only
	static $get_inverse_related_query;
	


	/**
	* SET_DATO
	*//*
	public function set_dato( $dato ) {

		if (is_string($dato)) { # Tool Time machine case, dato is string
			$dato = json_handler::decode($dato);
		}
		if (is_object($dato)) {
			$dato = array($dato);
		}
		# Ensures is a real non-associative array (avoid json encode as object)
		$dato = is_array($dato) ? array_values($dato) : (array)$dato;		
		
		# Verify all locators are well formed (only relation_type_rel here)
		$relation_type_rel = $this->relation_type_rel;
		foreach ((array)$dato as $key => $current_locator) {
			// type_rel
			if (!isset($current_locator->type_rel)) {
				$current_locator->type_rel = $relation_type_rel;
				debug_log(__METHOD__." Fixed bad formed locator (empty type_rel) [$this->section_tipo, $this->parent, $this->tipo] ".to_string(), logger::WARNING);
			}else if ($current_locator->type_rel!==$relation_type_rel) {
				$current_locator->type_rel = $relation_type_rel;
				debug_log(__METHOD__." Fixed bad formed locator (bad type_rel $current_locator->type_rel) [$this->section_tipo, $this->parent, $this->tipo] ".to_string(), logger::WARNING);
			}			
		}

		parent::set_dato( (array)$dato );
	}//end set_dato
	*/

	
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
			$ar_valor[] = self::get_locator_value( $current_locator, $lang, $this->section_tipo );
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
	* ADD_RELATED
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' but NOT saves
	* @return bool
	*/
	public function add_related( $locator ) {

		# Add current locator to component dato		
		if (!$add_locator = $this->add_locator_to_dato($locator)) {			
			return false;
		}
		
		return true;
	}//end add_related



	/**
	* REMOVE_RELATED
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato' but NOT saves
	* @return bool
	*/
	public function remove_related( $locator ) {

		# Add current locator to component dato		
		if (!$remove_locator_locator = $this->remove_locator_from_dato($locator)) {
			return false;
		}
		
		return true;	
	}//end remove_related
	


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
	*//*
	public function get_valor_list_html_to_save() {
		$result = $this->get_dato_unchanged();

		return $result;
	}//end get_valor_list_html_to_save
	*/



	/**
	* GET_INVERSE_RELATED
	* Get related term to current section	
	* @param int $section_id
	* @param string $section_tipo
	* @param string $from_component_tipo
	*	Optional. Previously calculated from structure using current section tipo info or calculated inside from section_tipo
	* @param array $ar_tables
	*	Optional. If set, union tables search is made over all tables received
	*
	* @return array $inverse_related
	*	Array of stClass objects with properties: section_tipo, section_id, component_tipo
	*/
	public static function get_inverse_related($section_id, $section_tipo, $type_rel=DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO, $from_component_tipo=null, $ar_tables=null) {
		#dump($ar_tables, ' $ar_tables ++ '.to_string());

		if(SHOW_DEBUG===true) {
			$start_time=microtime(1);
		}

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
		
		$type 	  = DEDALO_RELATION_TYPE_RELATED_TIPO;		
		$compare  = "{\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"type\":\"$type\",\"type_rel\":\"$type_rel\"".$filter."}";

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
			component_relation_related::$get_inverse_related_query = $strQuery;
			#dump($strQuery, ' $strQuery ++ '.to_string()); die();
		}
		$result	  = JSON_RecordObj_matrix::search_free($strQuery);
		
		$inverse_related = array();
		while ($rows = pg_fetch_assoc($result)) {

			$current_section_id   	= $rows['section_id'];
			$current_section_tipo 	= $rows['section_tipo'];

			if ($current_section_id==$section_id && $current_section_tipo===$section_tipo) {
				debug_log(__METHOD__." Error on get related. Related is set at itself as loop. Ignored locator. ($section_id - $section_tipo) ".to_string(), logger::ERROR);
				continue;
			}		

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
						if (!isset($current_locator->from_component_tipo)) {
								dump($current_locator, "Bad locator.'from_component_tipo' property not found in locator (get_inverse_related: $section_id, $section_tipo)".to_string());
							debug_log(__METHOD__." Bad locator.'from_component_tipo' property not found in locator (get_inverse_related: $section_id, $section_tipo) ".to_string($current_locator), logger::DEBUG);
						}
						$calculated_from_component_tipo = $current_locator->from_component_tipo;
						break;
					}					
				}
			}//end if (empty($from_component_tipo)) {

			$related = new stdClass();
				$related->section_tipo	= $current_section_tipo;
				$related->section_id 	= $current_section_id;
				$related->component_tipo = empty($from_component_tipo) ? $calculated_from_component_tipo : $from_component_tipo;

			# ar_related
			$inverse_related[] = $related;
		}//end while

		if(SHOW_DEBUG===true) {
			#$total=round(microtime(1)-$start_time,3);
			#debug_log(__METHOD__." section_id:$section_id, section_tipo:$section_tipo, from_component_tipo:$from_component_tipo, ar_tables:$ar_tables - $strQuery ".exec_time_unit($start_time,'ms').' ms' , logger::DEBUG);
		}

		return (array)$inverse_related;
	}//end get_inverse_related

	
	

}//end component_relation_related
?>