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

		$request_config = $this->get_request_query_object();
		$show = $request_config->show;

		# AR_COMPONETS_RELATED. By default, ar_related_terms is calculated. In some cases (diffusion for example) is needed overwrite ar_related_terms to obtain especific 'valor' form component
		if ($ar_related_terms===false) {
			// $ar_related_terms = $this->RecordObj_dd->get_relaciones();
			// $ar_componets_related = array();
			// foreach ((array)$ar_related_terms as $ar_value) foreach ($ar_value as $modelo => $component_tipo) {
			// 	$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			// 	if ($modelo_name!=='section'){
			// 		$ar_componets_related[] = $component_tipo;
			// 	}
			// }

			$ar_componets_related = $show->ddo_map;


		}else{
			$ar_componets_related = (array)$ar_related_terms;
		}

		# lang never must be DEDALO_DATA_NOLAN
		if ($lang===DEDALO_DATA_NOLAN) $lang=DEDALO_DATA_LANG;

		$dato   	= $this->get_dato();
		$properties = $this->get_properties();
		$divisor 	= (isset($show->divisor)) ?  $show->divisor : ' | ';
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

		$references = $this->get_calculated_references(true);
		$dato_with_references = array_merge($dato, $references);

		return $dato_with_references;
	}//end get_dato_with_references



	/**
	* GET_CALCULATED_REFERENCES
	* used for get the references, this function call the the get_references that make the recursive loop of the calculation
	* @return
	*/
	public function get_calculated_references($only_data=false) {

		switch ($this->relation_type_rel) {
			case DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO:
			case DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO:
				$current_locator = new stdClass();
					$current_locator->section_tipo 			= $this->section_tipo;
					$current_locator->section_id 			= $this->section_id;
					$current_locator->from_component_tipo 	= $this->tipo;
				$references = component_relation_related::get_references_recursive($this->tipo, $current_locator, $this->relation_type_rel, false, $this->lang );
				break;
			case DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO:
			default:
				$references = [];
				break;
		}
		// return the locators without label, used by merge with the real data of the component ($dato_full or get_dato_with_references())
		if($only_data===true){
			return $references;
		}


		// get the request_config of the componet to get the show object, it will use to format the label of the reference.
		$request_config = $this->get_request_query_object();
		$show = $request_config->show;
		$ar_componets_related = $show->ddo_map;
		$divisor = (isset($show->divisor)) ?  $show->divisor : ' | ';

		$references = array_map(function($locator) use($ar_componets_related, $divisor) {

			$item = new stdClass();
				$item->value = $locator;
				$item->label = self::get_locator_value($locator, DEDALO_DATA_LANG, false, $ar_componets_related, $divisor, $include_self=true, $glue=true);

			return $item;
		}, $references);


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



	/**
	* GET_REFERENCES_RECURSIVE
	* Resolve references (related terms that point to current locator)
	*  	DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO
	# 	DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
	* @return array $ar_references
	*/
	public static function get_references_recursive($tipo, $locator, $type_rel=DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO, $recursion=false, $lang=DEDALO_DATA_LANG) {

		static $ar_resolved = array();

		// reset ar_resolved on first call
			if ($recursion===false) {
				$ar_resolved = [];
			}

		$pseudo_locator	= $locator->section_tipo .'_'. $locator->section_id . '_'. $lang;
		$ar_resolved[]	= $pseudo_locator; # set self as resolved

		$ar_references 	= [];

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
					$element->section_tipo			= $dato_locator->section_tipo;
					$element->section_id			= $dato_locator->section_id;
					$element->from_component_tipo	= $dato_locator->from_component_tipo;


				# Only add dato when is recursion, not at the first call
				if ($recursion===true) {
					$ar_references[] = $element;
				}

				$ar_resolved[] = $pseudo_locator; # set as resolved

				# References to dato
				# Recursion (dato)
				$ar_result		= self::get_references_recursive($tipo, $dato_locator, $type_rel , true, $lang);
				$ar_references	= array_merge($ar_references, $ar_result);
			}

			# References to references
			foreach ($ar_references as $key => $current_locator) {
				# Recursion (references)
				$ar_result		= self::get_references_recursive($tipo, $current_locator, $type_rel, true, $lang);
				$ar_references	= array_merge($ar_references, $ar_result);
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

		$locator = new locator();
			$locator->set_section_tipo($this->section_tipo);
			$locator->set_section_id($this->section_id);
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

		# search_query_object
		$search_query_object = new stdClass();
			$search_query_object->id 			= 'temp';
			$search_query_object->section_tipo 	= $this->section_tipo;
			$search_query_object->filter 		= $filter;
			$search_query_object->select 		= [];
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

			$ar_result[]    = $element;
		}


		return $ar_result;
	}//end get_references



	/**
	* GET_SEARCH_FIELDS DEPRECATED
	*/
	// public function get_search_fields($search_tipo) {
	// 	//chenk the recursion
	//
	// 	$current_tipo = $search_tipo;
	// 	$ar_target_section_tipo = common::get_ar_related_by_model('section',$current_tipo);
	// 	$target_section_tipo    = reset($ar_target_section_tipo);
	// 	$ar_terminos_relacionados = RecordObj_dd::get_ar_terminos_relacionados($current_tipo, true, true);
	//
	// 	$search_fields = array();
	// 	foreach ($ar_terminos_relacionados as $key => $c_tipo) {
	// 		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($c_tipo,true);
	// 		if ($modelo_name==='section') continue;
	//
	// 		$field = new stdClass();
	// 			$field->section_tipo 	= $target_section_tipo;
	// 			$field->component_tipo 	= $c_tipo;
	//
	// 		# COMPONENTS_WITH_REFERENCES case like autocomplete, select, etc..
	// 		if(in_array($modelo_name, component_relation_common::get_components_with_relations())) {
	// 			$field->search 	= $this->get_search_fields($c_tipo);
	// 		}
	//
	// 		$search_fields[] = $field;
	// 	}
	//
	// 	return $search_fields;
	// }//end get_search_fields



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

		// calculated references
		$calculated_references = $this->get_calculated_references();

		if (empty($option_obj)) {

			$diffusion_value = implode($separator, $diffusion_value);
			$diffusion_value = strip_tags($diffusion_value, $separator);

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


		}else{

			$ar_terms = [];
			// properties options defined
			foreach ($option_obj as $key => $value) {

				if ($key==='custom_parents') {

					$divisor 	= $this->get_divisor();

					if (!empty($diffusion_value)) {
						$array_values = array_values($diffusion_value);
						foreach ($array_values as $key => $current_term) {
							$ar_terms[] = explode($divisor, $current_term);
						}
					}

					if (!empty($calculated_references)) {
						foreach ($calculated_references as $key => $ref_obj) {
							$ar_terms[] = explode($divisor, $ref_obj->label);
						}
					}

					// append whole or part of results when no empty

					if (!empty($ar_terms)) {
						$final_term = [];
						foreach ($ar_terms as $term) {
							// parents_splice. Selects a portion of the complete parents array
							if(isset($value->parents_splice)){
								$splice_values = is_array($value->parents_splice) ? $value->parents_splice : [$value->parents_splice];
								if (isset($splice_values[1])) {
									array_splice($term, $splice_values[0], $splice_values[1]);
								}else{
									array_splice($term, $splice_values[0]);
								}
							}
							$final_term[] = implode($divisor, $term);

						}
					}
				}
			}
			$diffusion_value = implode($separator, $final_term);
			// $diffusion_value = strip_tags($diffusion_value, $separator);
		}


		return (string)$diffusion_value;
	}//end get_diffusion_value



}//end component_relation_related
