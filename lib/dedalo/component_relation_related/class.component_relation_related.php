<?php
/*
* CLASS COMPONENT_RELATION_RELATED
*
*
*/
class component_relation_related extends component_relation_common {
	
	# relation_type . Determines inverse resolutions and locator format
	# DEDALO_RELATION_TYPE_RELATED_TIPO (Default)
	# protected $relation_type = DEDALO_RELATION_TYPE_RELATED_TIPO; // Default
	protected $relation_type ; // Set on construct from propiedades

	# type of rel (like unidirectional, bidirectional, multidirectional, etc..) This info is inside each locator of current component dato
	# DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO (Default) 
	# DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO
	# DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
	# protected $relation_type_rel = DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO; // Default
	protected $relation_type_rel ; // Set on construct from propiedades

	# test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');
	
	# sql query stored for debug only
	static $get_inverse_related_query;



	/**
	* __CONSTRUCT
	*/
	function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# relation_type
		# $this->relation_type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;

		# Build the componente normally
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);

		#
		# RELATION CONFIG . Set current component relation_type Aand relation_type_rel based on propiedades config
		$propiedades = $this->get_propiedades();
		switch (true) {
			case (isset($propiedades->config_relation->relation_type) && isset($propiedades->config_relation->relation_type_rel)):
				$this->relation_type 	 = $propiedades->config_relation->relation_type;
				$this->relation_type_rel = $propiedades->config_relation->relation_type_rel;
				break;
			
			default:
				$this->relation_type 	 = DEDALO_RELATION_TYPE_RELATED_TIPO; // Default
				$this->relation_type_rel = DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO; // Default
				debug_log(__METHOD__." Using default values for config component $this->tipo . Please, config structure 'propiedades' for proper control about component behaviour".to_string(), logger::ERROR);
				break;
		}

		return true;
	}//end __construct


	
	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor( $lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false) {
		#return "working here! ".__METHOD__;
	
		if (isset($this->valor)) {
			return $this->valor;
		}

		# AR_COMPONETS_RELATED. By default, ar_related_terms is calculated. In some cases (diffusion for example) is needed overwrite ar_related_terms to obtain especific 'valor' form component
		if ($ar_related_terms===false) {
			$ar_related_terms = $this->RecordObj_dd->get_relaciones();
			$ar_componets_related = array();			
			foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $modelo => $component_tipo) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				if ($modelo_name !== 'section'){
					$ar_componets_related[] = $component_tipo;
				}
			}
		}else{
			$ar_componets_related = (array)$ar_related_terms;
		}

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang===DEDALO_DATA_NOLAN) $lang=DEDALO_DATA_LANG;

		$dato   	= $this->get_dato();
		$divisor 	= $this->get_divisor();
		$ar_values	= array();

		foreach ((array)$dato as $key => $current_locator) {

			$current_locator_json = json_encode($current_locator);

			$ar_values[$current_locator_json] = self::get_locator_value($current_locator, $lang, false, $ar_componets_related, $divisor);

		}//end if (!empty($dato))

		# Set component valor
		# $this->valor = implode(', ', $ar_valor);
		$valor='';
		#foreach ($ar_values as $key => $value) {
		#	if(!empty($value)) {
		#		$valor .= $value;
		#		if(end($ar_values)!=$value) $valor .= ', ';
		#	}
		#}
		if ($format==='array') {
			$valor = $ar_values;
		}else{
			$valor = implode($divisor, $ar_values);
		}

		$this->valor = $valor;

		return $this->valor;
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
	* ADD_RELATED
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' but NOT saves
	* @return bool
	*/
	public function add_related( $locator ) {

		#dump($locator, ' locator ++ '.to_string()); die();
		
		if ($locator->section_tipo===$this->section_tipo && $locator->section_id===$this->parent) {
			debug_log(__METHOD__." Invalid related element (self) ".to_string(), logger::DEBUG);
			return false;
		}

		# Add type_rel
		if (!isset($locator->type_rel)) {
			$locator->type_rel = $this->relation_type_rel;
		}

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
	public static function get_search_query( $json_field, $search_tipo, $tipo_de_dato_search, $current_lang, $search_value, $comparison_operator='=' ) {
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
	* GET_DATO_WITH_REFERENCES
	* return the full dato of the component, the real dato with the calculated references
	* @return 
	*/
	public function get_dato_with_references() {

		$dato = $this->get_dato();
		$references = $this->get_calculated_references();
			#dump($references, ' references 2 ++ '."$this->tipo, $this->parent, $this->relation_type_rel");

		$dato_with_references = array_merge($dato, $references);

		return $dato_with_references;
	}//end get_dato_with_references



	/**
	* GET_CALCULATED_REFERENCES
	* used for get the references, this function call the the get_references that make the recursive loop of the calculation
	* @return 
	*/
	public function get_calculated_references() {

		switch ($this->relation_type_rel) {
			case DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO:
			case DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO:
				$current_locator = new stdClass();
					$current_locator->section_tipo 			= $this->section_tipo;
					$current_locator->section_id 			= $this->parent;
					$current_locator->from_component_tipo 	= $this->tipo;
				$references = component_relation_related::get_references_recursive($this->tipo, $current_locator, $this->relation_type_rel, false, $this->lang );
				break;
			case DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO:
			default:
				$references = [];
				break;
		}
		
		if(SHOW_DEBUG===true) {
			#dump($references, ' references ++ **** '.to_string());
		}
	
		return $references;
	}//end get_calculated_references



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
	* GET_TYPE_REL
	* @return string $relation_type_rel
	*/
	public function get_type_rel() {

		return $this->relation_type_rel;
	}//end get_type_rel



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
	public static function get_inverse_related_DEPRECATED( $section_id, $section_tipo, $type_rel=DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO, $from_component_tipo=null, $ar_tables=null ) {

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

		#dump($inverse_related, ' inverse_related ++ '.to_string());
		#debug_log(__METHOD__." inverse_related ".to_string($strQuery), logger::DEBUG);

		return (array)$inverse_related;
	}//end get_inverse_related



	/**
	* GET_REFERENCES_RECURSIVE
	* Resolve references (related terms that point to current locator)
	*  	DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO
	# 	DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
	* @return array $ar_references
	*/
	public static function get_references_recursive($tipo, $locator, $type_rel=DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO, $recursion=false, $lang) {
	
		static $ar_resolved = array();

		// reset ar_resolved on first call
			if ($recursion===false) {
				$ar_resolved = [];
			}

		$pseudo_locator = $locator->section_tipo .'_'. $locator->section_id . '_'. $lang;
		$ar_resolved[]  = $pseudo_locator; # set self as resolved

		$ar_references 	= [];

		$RecordObj_dd = new RecordObj_dd($tipo);
		$ar_related_terms = $RecordObj_dd->get_relaciones();
		$ar_componets_related = array();
		foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $modelo => $component_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			if ($modelo_name !== 'section'){
				$ar_componets_related[] = $component_tipo;
			}
		}
		$propiedades = json_decode($RecordObj_dd->get_propiedades());
		$divisor = (isset($propiedades->source->divisor)) ?  $propiedades->source->divisor : ' | ';
		
		# References to me
		if (isset($locator->section_id) && isset($locator->section_tipo)) {
			#$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($locator->from_component_tipo,true); // get_class();
			$ref_component 	= component_common::get_instance('component_relation_related',
															 $locator->from_component_tipo,
															 $locator->section_id,
															 'edit',
															 DEDALO_DATA_NOLAN,
															 $locator->section_tipo);
			$ar_result = $ref_component->get_references();			
			foreach ($ar_result as $key => $result_locator) {
				$pseudo_locator = $result_locator->section_tipo .'_'. $result_locator->section_id . '_'. $lang;
				if (in_array($pseudo_locator, $ar_resolved)) {
					continue;
				}
				$ar_references[] = $result_locator;
				$ar_resolved[]   = $pseudo_locator; # set as resolved
			}
		}
	
		# Only DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
		if ($type_rel===DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO) {
					
			# Dato
			$dato = $ref_component->get_dato();
			foreach ($dato as $key => $dato_locator) {

				$pseudo_locator = $dato_locator->section_tipo .'_'. $dato_locator->section_id . '_'. $lang;
				if (in_array($pseudo_locator, $ar_resolved)) {
					continue;
				}	

				$element = new stdClass();
					$element->section_tipo 			= $dato_locator->section_tipo;
					$element->section_id 			= $dato_locator->section_id;
					$element->from_component_tipo 	= $dato_locator->from_component_tipo;
					#$element->label 				= ts_object::get_term_by_locator( $dato_locator, DEDALO_DATA_LANG, $from_cache=true);
					// $locator, $lang=DEDALO_DATA_LANG, $show_parents=false, $ar_componets_related=false, $divisor=false
					$element->label 				= self::get_locator_value($dato_locator, DEDALO_DATA_LANG, false, $ar_componets_related, $divisor);
				
				# Only add dato when is recursion, not at the first call
				if ($recursion===true) {
					$ar_references[] = $element;
				}

				$ar_resolved[] = $pseudo_locator; # set as resolved

				# References to dato
				# Recursion (dato)
				$ar_result 		= self::get_references_recursive($tipo, $dato_locator, $type_rel , true, $lang);
				$ar_references 	= array_merge($ar_references, $ar_result);
			}		

			# References to references
			foreach ($ar_references as $key => $current_locator) {
				# Recursion (references)
				$ar_result = self::get_references_recursive($tipo, $current_locator, $type_rel, true, $lang);
				$ar_references = array_merge($ar_references, $ar_result);
			}
			#dump($ar_resolved, ' ar_resolved ++ '.to_string());

		}//end if ($type_rel===DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO)
	
	
		return $ar_references;
	}//end get_references_recursive



	/**
	* GET_REFEreNCES
	* Get bidireccional / multidireccional references to current term
	* @return array $ar_result
	*/
	public function get_references( $type_rel=false ) {

		$RecordObj_dd = new RecordObj_dd($this->tipo);
		$ar_related_terms = $RecordObj_dd->get_relaciones();
		$ar_componets_related = array();			
		foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $modelo => $component_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			if ($modelo_name !== 'section'){
				$ar_componets_related[] = $component_tipo;
			}
		}
		$propiedades = json_decode($RecordObj_dd->get_propiedades());
		$divisor = (isset($propiedades->source->divisor)) ?  $propiedades->source->divisor : ' | ';


		$locator = new locator();
			$locator->set_section_tipo($this->section_tipo);
			$locator->set_section_id($this->parent);
			$locator->set_from_component_tipo($this->tipo);

		if ($type_rel!==false) {
			# Add type_rel filter
			$locator->set_type_rel($type_rel);
		}
		
		$locator_json = json_encode($locator);

		# Path
		$base_path = new stdClass();
			$base_path->name 			= $this->label;
			$base_path->modelo 			= get_class($this);
			$base_path->section_tipo 	= $this->section_tipo;
			$base_path->component_tipo 	= $this->tipo;
	
		$path = array($base_path);
		
		# Component path
		$component_path = ['relations'];

		# Filter
		$filter_group = new stdClass();
			$filter_group->q 				= $locator_json;
			$filter_group->lang 			= 'all';
			$filter_group->path 			= $path;
			$filter_group->component_path 	= $component_path;

		$filter = [
			'$and' => [$filter_group]
		];

		# Select
		$section_map 	= section::get_section_map($this->section_tipo);
		$thesaurus_map 	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;
			#dump($thesaurus_map, ' $thesaurus_map ++ '.to_string());
		if (isset($thesaurus_map->term)) {

			$select_path = new stdClass();
				$select_path->name 				= 'Term';
				$select_path->modelo 			= RecordObj_dd::get_modelo_name_by_tipo($thesaurus_map->term,true);
				$select_path->section_tipo 		= $this->section_tipo;
				$select_path->component_tipo 	= $thesaurus_map->term;
		
			$select_path = array($select_path);

			$select_group = new stdClass();
				$select_group->path 		  = $select_path;
				$select_group->component_path = ['components',$thesaurus_map->term,'valor_list'];

			$select = [$select_group];
		}else{
			$select = array(); // Nothing is selected but section_id, section_tipo columns
		}		

		# search_query_object
		$search_query_object = new stdClass();
			$search_query_object->id 			= 'temp';
			$search_query_object->section_tipo 	= $this->section_tipo;
			$search_query_object->filter 		= $filter;
			$search_query_object->select 		= $select;
			$search_query_object->limit 		= 0;
			$search_query_object->offset 		= 0;
			$search_query_object->full_count 	= false;		
		#dump( json_encode($search_query_object, JSON_PRETTY_PRINT), ' $search_query_object ++ '.to_string()); #die();

		$search_development2 = new search_development2($search_query_object);
		$records_data 		 = $search_development2->search();

		$ar_result = [];
		foreach ($records_data->ar_records as $key => $row) {


			$element = new stdClass();
				$element->section_tipo 			= $row->section_tipo;
				$element->section_id 			= $row->section_id;
				$element->from_component_tipo 	= $this->tipo;

			if (isset($thesaurus_map->term) && $term = json_decode($row->{$thesaurus_map->term})) {
		
				/*$lang = DEDALO_DATA_LANG;
				switch (true) {
					case isset($term->$lang):
						$label = $term->$lang;

						break;
					default:
						$label = reset($term);
						break;
				}*/

				$label = self::get_locator_value($element, DEDALO_DATA_LANG, false, $ar_componets_related, $divisor);

				$element->label = $label;
			}else{
				$element->label = '';
			}
		
			$ar_result[]    = $element;				
		}
		#dump($ar_result, ' ar_result ++ '.to_string());
		#dump($ar_resolved, ' ar_resolved 11 ++ '.to_string());


		return $ar_result;		
	}//end get_references

	

	/**
	* ADD_HIERARCHY_SECTIONS_FROM_TYPES
	* Alias of component_autocomplete_hi::add_hierarchy_sections_from_types
	* @return 
	*/
	public static function add_hierarchy_sections_from_types($hierarchy_types, $hierarchy_sections) {

		return component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
	}//end add_hierarchy_sections_from_types



	/**
	* GET_TIPO_TO_SEARCH
	* Locate in structure TR the component tipo to search
	* @return string $tipo_to_search
	*/
	public function get_tipo_to_search($options=null) {

		if(isset($this->tipo_to_search)) {
			return $this->tipo_to_search;
		}

		# DESECHADO POR PROBLEMAS AL SELECCIONAR EL PRIMERO. EL ORDEN NO ES RESPETADO...
		# $ar_related_terms = (array)$this->RecordObj_dd->get_relaciones();
		# 	#dump($ar_related_terms, ' ar_related_terms');
		# foreach ($ar_related_terms as $related_terms)		
		# foreach ($related_terms as $modelo => $current_tipo) {
		# 	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
		# 	# Get first component only
		# 	if (strpos($modelo_name, 'component_')!==false) {
		# 		$tipo_to_search = $current_tipo; break;
		# 	}
		# }		

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
	}//end get_tipo_to_search



	/**
	* GET_SEARCH_FIELDS
	*/
	public function get_search_fields($search_tipo) {
		//chenk the recursion 

		$current_tipo = $search_tipo;
		$ar_target_section_tipo = common::get_ar_related_by_model('section',$current_tipo);
		$target_section_tipo    = reset($ar_target_section_tipo);
		$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($current_tipo, true, true);
		
		$search_fields = array();
		foreach ($ar_terminos_relacionados as $key => $c_tipo) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($c_tipo,true);
			if ($modelo_name==='section') continue;
			
			$field = new stdClass();
				$field->section_tipo 	= $target_section_tipo;
				$field->component_tipo 	= $c_tipo;

			# COMPONENTS_WITH_REFERENCES case like autocomplete, select, etc.. 
			if(in_array($modelo_name, component_relation_common::get_components_with_relations())) {
				$field->search 	= $this->get_search_fields($c_tipo);
			}

			$search_fields[] = $field;
		}

		return $search_fields;
	}//end get_search_fields



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( $lang=null, $type=false ) {

		$diffusion_value = null;

		$separator = '<br>';

		# $dato_with_references = $this->get_dato_with_references();
		# 	dump($dato_with_references, ' dato_with_references ++ tipo: '.$this->get_tipo()." - ".$this->lang." - ".$this->get_parent());
		
		$diffusion_value = $this->get_valor($lang, $format='array');
		$diffusion_value = implode($separator, $diffusion_value);
		$diffusion_value = strip_tags($diffusion_value, $separator);
			#dump($diffusion_value, ' diffusion_value ++ '.to_string());
		#$term = $this->get_legacy_political_map_term( DEDALO_DATA_LANG, $dato_key=0, $type='municipality');
			#dump($term, ' term ++ '.to_string());

		// calculated references
			$calculated_references = $this->get_calculated_references();
			#dump($calculated_references, ' +++++ calculated_references ++ tipo: '.$this->get_tipo()." - ".$this->lang." - ".$this->get_parent());
			if (!empty($calculated_references)) {
				$ar_references = [];
				foreach ($calculated_references as $key => $ref_obj) {
					$ar_references[] = $ref_obj->label;
				}
				if (!empty($diffusion_value)) {
					$diffusion_value .= $separator;
				}
				$diffusion_value .= implode($separator, $ar_references);
			}
			#dump($diffusion_value, ' diffusion_value ++ '.to_string());	
		
		return (string)$diffusion_value;
	}//end get_diffusion_value



}//end component_relation_related
?>