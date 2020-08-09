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
	protected $relation_type ; // Set on construct from properties

	# type of rel (like unidirectional, bidirectional, multidirectional, etc..) This info is inside each locator of current component dato
	# DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO (Default)
	# DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO
	# DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
	# protected $relation_type_rel = DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO; // Default
	protected $relation_type_rel ; // Set on construct from properties

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');

	// sql query stored for debug only
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
		# RELATION CONFIG . Set current component relation_type Aand relation_type_rel based on properties config
		$properties = $this->get_properties();
		switch (true) {
			case (isset($properties->config_relation->relation_type) && isset($properties->config_relation->relation_type_rel)):
				$this->relation_type 	 = $properties->config_relation->relation_type;
				$this->relation_type_rel = $properties->config_relation->relation_type_rel;
				break;

			default:
				$this->relation_type 	 = DEDALO_RELATION_TYPE_RELATED_TIPO; // Default
				$this->relation_type_rel = DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO; // Default
				debug_log(__METHOD__." Using default values for config component $this->tipo . Please, config structure 'properties' for proper control about component behaviour".to_string(), logger::ERROR);
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

		# AR_COMPONETS_RELATED. By default, ar_related_terms is calculated. In some cases (diffusion for example) is needed overwrite ar_related_terms to obtain especific 'valor' form component
		if ($ar_related_terms===false) {
			$ar_related_terms = $this->RecordObj_dd->get_relaciones();
			$ar_componets_related = array();
			foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $modelo => $component_tipo) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				if ($modelo_name!=='section'){
					$ar_componets_related[] = $component_tipo;
				}
			}
		}else{
			$ar_componets_related = (array)$ar_related_terms;
		}

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang===DEDALO_DATA_NOLAN) $lang=DEDALO_DATA_LANG;

		$dato   	= $this->get_dato();
		$properties = $this->get_properties();
		$divisor 	= (isset($properties->source->divisor)) ? $properties->source->divisor : ' | ';
		$ar_values	= array();

		foreach ((array)$dato as $key => $current_locator) {

			$current_locator_json = json_encode($current_locator);

			$ar_values[$current_locator_json] = self::get_locator_value($current_locator, $lang, false, $ar_componets_related, $divisor);

		}//end if (!empty($dato))


		if ($format==='array') {
			$valor = $ar_values;
		}else{
			$valor = implode($divisor, $ar_values);
		}

		return $valor;
	}//end get_valor



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
	* GET_DATO_WITH_REFERENCES
	* return the full dato of the component, the real dato with the calculated references
	* @return
	*/
	public function get_dato_with_references() {

		$dato 		= $this->get_dato();
		$references = $this->get_calculated_references();

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
	* GET_TYPE_REL
	* @return string $relation_type_rel
	*/
	public function get_type_rel() {

		return $this->relation_type_rel;
	}//end get_type_rel


	// DES
		// /**
		// * GET_INVERSE_RELATED
		// * Get related term to current section
		// * @param int $section_id
		// * @param string $section_tipo
		// * @param string $from_component_tipo
		// *	Optional. Previously calculated from structure using current section tipo info or calculated inside from section_tipo
		// * @param array $ar_tables
		// *	Optional. If set, union tables search is made over all tables received
		// *
		// * @return array $inverse_related
		// *	Array of stClass objects with properties: section_tipo, section_id, component_tipo
		// */
		// public static function get_inverse_related_DEPRECATED( $section_id, $section_tipo, $type_rel=DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO, $from_component_tipo=null, $ar_tables=null ) {

		// 	if(SHOW_DEBUG===true) {
		// 		$start_time=microtime(1);
		// 	}

		// 	# FROM_COMPONENT_TIPO FILTER OPTION
		// 	$filter ='';
		// 	if (!is_null($from_component_tipo)) {
		// 		/*
		// 			# Locate current section component parent tipo
		// 			$ar_modelo_name_required = array('component_relation_parent');
		// 			$ar_children_tipo 	 	 = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=true, $recursive=true, $search_exact=true);
		// 			$component_parent_tipo 	 = reset($ar_children_tipo);
		// 			# Calculate current target component_relation_children_tipo from structure
		// 			$from_component_tipo 	 = component_relation_parent::get_component_relation_children_tipo($component_parent_tipo);
		// 			*/
		// 		$filter = ",\"from_component_tipo\":\"$from_component_tipo\"";
		// 	}

		// 	$type 	  = DEDALO_RELATION_TYPE_RELATED_TIPO;
		// 	$compare  = "{\"section_tipo\":\"$section_tipo\",\"section_id\":\"$section_id\",\"type\":\"$type\",\"type_rel\":\"$type_rel\"".$filter."}";

		// 	# TABLES strQuery
		// 	$strQuery  = '';
		// 	if (is_null($ar_tables)) {
		// 		// Calculated from section_tipo (only search in current table)
		// 		$table 	   = common::get_matrix_table_from_tipo($section_tipo);
		// 		$strQuery .= "SELECT section_tipo, section_id, datos#>'{relations}' AS relations FROM \"$table\" WHERE datos#>'{relations}' @> '[$compare]'::jsonb ";
		// 	}else{
		// 		// Iterate tables and make union search
		// 		$ar_query=array();
		// 		foreach ((array)$ar_tables as $table) {
		// 			$ar_query[] = "SELECT section_tipo, section_id, datos#>'{relations}' AS relations FROM \"$table\" WHERE datos#>'{relations}' @> '[$compare]'::jsonb ";
		// 		}
		// 		$strQuery .= implode(" UNION ALL ", $ar_query);
		// 	}
		// 	// Set order to maintain results stable
		// 	$strQuery .= " ORDER BY section_id ASC";

		// 	if(SHOW_DEBUG) {
		// 		component_relation_related::$get_inverse_related_query = $strQuery;
		// 		#dump($strQuery, ' $strQuery ++ '.to_string()); die();
		// 	}
		// 	$result	  = JSON_RecordObj_matrix::search_free($strQuery);

		// 	$inverse_related = array();
		// 	while ($rows = pg_fetch_assoc($result)) {

		// 		$current_section_id   	= $rows['section_id'];
		// 		$current_section_tipo 	= $rows['section_tipo'];

		// 		if ($current_section_id==$section_id && $current_section_tipo===$section_tipo) {
		// 			debug_log(__METHOD__." Error on get related. Related is set at itself as loop. Ignored locator. ($section_id - $section_tipo) ".to_string(), logger::ERROR);
		// 			continue;
		// 		}

		// 		// Search 'from_tipo' in locators when no is received
		// 		if (empty($from_component_tipo)) {

		// 			$current_relations = json_decode($rows['relations']);

		// 			$reference_locator = new locator();
		// 				$reference_locator->set_section_tipo($section_tipo);
		// 				$reference_locator->set_section_id($section_id);
		// 				$reference_locator->set_type($type);

		// 			foreach ((array)$current_relations as $current_locator) {
		// 				# dump( $current_locator, ' $current_locator ++ '.to_string($reference_locator));
		// 				if( $match = locator::compare_locators( $current_locator, $reference_locator, $ar_properties=array('section_tipo','section_id','type')) ){
		// 					if (!isset($current_locator->from_component_tipo)) {
		// 						dump($current_locator, "Bad locator.'from_component_tipo' property not found in locator (get_inverse_related: $section_id, $section_tipo)".to_string());
		// 						debug_log(__METHOD__." Bad locator.'from_component_tipo' property not found in locator (get_inverse_related: $section_id, $section_tipo) ".to_string($current_locator), logger::DEBUG);
		// 					}
		// 					$calculated_from_component_tipo = $current_locator->from_component_tipo;
		// 					break;
		// 				}
		// 			}
		// 		}//end if (empty($from_component_tipo)) {

		// 		$related = new stdClass();
		// 			$related->section_tipo	= $current_section_tipo;
		// 			$related->section_id 	= $current_section_id;
		// 			$related->component_tipo = empty($from_component_tipo) ? $calculated_from_component_tipo : $from_component_tipo;

		// 		# ar_related
		// 		$inverse_related[] = $related;
		// 	}//end while

		// 	if(SHOW_DEBUG===true) {
		// 		#$total=round(microtime(1)-$start_time,3);
		// 		#debug_log(__METHOD__." section_id:$section_id, section_tipo:$section_tipo, from_component_tipo:$from_component_tipo, ar_tables:$ar_tables - $strQuery ".exec_time_unit($start_time,'ms').' ms' , logger::DEBUG);
		// 	}

		// 	#dump($inverse_related, ' inverse_related ++ '.to_string());
		// 	#debug_log(__METHOD__." inverse_related ".to_string($strQuery), logger::DEBUG);

		// 	return (array)$inverse_related;
		// }//end get_inverse_related



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
		$properties = $RecordObj_dd->get_properties();
		$divisor = (isset($properties->source->divisor)) ?  $properties->source->divisor : ' | ';

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
		$properties = $RecordObj_dd->get_properties();
		$divisor = (isset($properties->source->divisor)) ?  $properties->source->divisor : ' | ';


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

		$search 		= search::get_instance($search_query_object);
		$records_data 	= $search->search();

		$ar_result = [];
		foreach ($records_data->ar_records as $key => $row) {


			$element = new stdClass();
				$element->section_tipo 			= $row->section_tipo;
				$element->section_id 			= $row->section_id;
				$element->from_component_tipo 	= $this->tipo;

			if (isset($thesaurus_map->term) && $term = $row->{$thesaurus_map->term}) {

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
