<?php
/**
* CLASS COMPONENT_RELATION_INDEX
*
*
*/
class component_relation_index extends component_relation_common {



	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_INDEX_TIPO;
	protected $default_relation_type_rel	= null;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo','component_tipo','tag_id');



	/**
	* GET_DATO
	* Resolve indexation references data
	* Note that this component data is always EXTERNAL
	* because is used to display remote references of relation type (DEDALO_RELATION_TYPE_INDEX_TIPO)
	* to current section
	* @return array|null $dato
	*/
	public function get_dato() : ?array {

		// dato_resolved. Already resolved case
			if(isset($this->dato_resolved)) {
				return $this->dato_resolved;
			}

		// reference_locator
			$reference_locator = new locator();
				$reference_locator->set_type(DEDALO_RELATION_TYPE_INDEX_TIPO); // dd96
				$reference_locator->set_section_tipo($this->section_tipo);
				$reference_locator->set_section_id($this->section_id);

		// referenced locators. Get calculated inverse locators for all matrix tables
			$ar_inverse_locators = search_related::get_referenced_locators( $reference_locator );

		// format result like own dato
			$new_dato = [];
			foreach ($ar_inverse_locators as $current_locator) {

				$locator = new locator();
					$locator->set_type($current_locator->type);
					$locator->set_section_tipo($current_locator->from_section_tipo);
					$locator->set_section_id($current_locator->from_section_id);
					if(isset($current_locator->tag_component_tipo)){
						$locator->set_component_tipo($current_locator->tag_component_tipo);
					}
					if(isset($current_locator->tag_id)){
						$locator->set_tag_id($current_locator->tag_id);
					}
					if(isset($current_locator->section_top_id)){
						$locator->set_section_top_id($current_locator->section_top_id);
					}
					if(isset($current_locator->section_top_id)){
						$locator->set_section_top_tipo($current_locator->section_top_tipo);
					}
					if(isset($current_locator->from_component_tipo)){
						$locator->set_from_component_top_tipo($current_locator->from_component_tipo);
					}

					$new_dato[] = $locator;
			}

		// fix resolved dato
			parent::set_dato($new_dato);

		// Set as loaded. Already set on set parent::set_dato
			// $this->bl_loaded_matrix_data = true;

		// @experimental. Already set on set parent::set_dato
			// $this->dato_resolved = $this->dato;


		return $this->dato;
	}//end get_data



	/**
	* GET_VALOR
	* Get value . default is get dato . overwrite in every different specific component
	* @return string | null $valor
	*/
	public function get_valor($lang=DEDALO_DATA_LANG) {

		$dato = $this->get_dato();
		if (empty($dato)) {
			return null;
		}

		$ar_valor = array();
		foreach ((array)$dato as $key => $current_locator) {
			// get_locator_value returns array|null
			$ar_valor[] = self::get_locator_value(
				$current_locator, // object locator
				$lang, // string lang
				false // bool show_parents
			);
		}//end if (!empty($dato))

		# Set component valor
		$valor='';
		foreach ($ar_valor as $key => $value) {
			if(!empty($value)) {
				$valor .= $value;
				if(end($ar_valor)!=$value) $valor .= ', ';
			}
		}


		return (string)$valor;
	}//end get_valor



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		$dato = $this->get_dato();

		// preserve v5 order (old webs compatibility
		// [{"type":"dd96","tag_id":"29","section_id":"30","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"26","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}]
		if (empty($dato)) {
			$diffusion_value = null;
		}else{
			$diffusion_dato = [];
			foreach ($dato as $current_locator) {

				$locator = new locator();

				// type
				$locator->set_type($current_locator->type ?? DEDALO_RELATION_TYPE_INDEX_TIPO);

				// tag_id
				if (isset($current_locator->tag_id)) {
					$locator->set_tag_id($current_locator->tag_id);
				}

				// section_id
				$locator->set_section_id($current_locator->section_id);

				// section_tipo
				$locator->set_section_tipo($current_locator->section_tipo);

				// component_tipo
				if (isset($current_locator->component_tipo)) {
					$locator->set_component_tipo($current_locator->component_tipo);
				}

				// section_top_id
				if (isset($current_locator->section_top_id)) {
					$locator->set_section_top_id($current_locator->section_top_id);
				}

				// section_top_tipo
				if (isset($current_locator->section_top_tipo)) {
					$locator->set_section_top_tipo($current_locator->section_top_tipo);
				}

				// from_component_tipo
				$locator->set_from_component_tipo($current_locator->from_component_tipo);

				// from_component_top_tipo
				if (isset($current_locator->from_component_top_tipo)) {
					$locator->set_from_component_top_tipo($current_locator->from_component_top_tipo);
				}

				$diffusion_dato[] = $locator;
			}

			$diffusion_value = !empty($diffusion_dato)
				? json_encode($diffusion_dato)
				: null;
		}


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* ADD_LOCATOR
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' but NOT save
	* @param object $locator
	* @return bool
	*/
		// public function add_locator( object $locator ) : bool {

		// 	$locator = clone($locator);

		// 	# Verify exists locator type
		// 	if (!property_exists($locator,'type')) {
		// 		$locator->type = $this->relation_type;
		// 	}

		// 	# Verify exists locator from_component_tipo
		// 	if (!property_exists($locator,'from_component_tipo')) {
		// 		$locator->from_component_tipo = $this->tipo;
		// 	}

		// 	if ($locator->type!=$this->relation_type) {
		// 		debug_log(__METHOD__." Stopped add index (struct) of invalid type (valid type is $this->relation_type). Received type: ".to_string($locator->type), logger::ERROR);
		// 		return false;
		// 	}

		// 	# Add current locator to component dato
		// 	if (!$add_locator = $this->add_locator_to_dato($locator)) {
		// 		return false;
		// 	}

		// 	return true;
		// }//end add_locator



	/**
	* REMOVE_LOCATOR
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato' and save
	* @param object $locator
	* @return bool
	*/
	public function remove_locator( object $locator ) : bool {

		$locator = clone($locator);

		# Verify exists locator type
		if (!property_exists($locator,'type')) {
			$locator->type = $this->relation_type;
		}

		# Verify exists locator from_component_tipo
		if (!property_exists($locator,'from_component_tipo')) {
			$locator->from_component_tipo = $this->tipo;
		}

		# Properties to compare for match locator to remove
		$ar_properties = [
			'type',
			'section_tipo',
			'section_id',
			'component_tipo',
			'tag_id',
			'from_component_tipo'
		];

		# Add current locator to component dato
		if (!$remove_locator_locator = $this->remove_locator_from_dato($locator, $ar_properties)) {
			return false;
		}

		return true;
	}//end remove_locator



	/**
	* GET_INDEXATIONS_FROM_TAG
	* Used by tool_indexation to get list of terms with index relation to current tag
	* @return array $ar_indexations
	*/
		// public static function get_indexations_from_tag_DES($component_tipo, $section_tipo, $section_id, $tag_id, $lang=DEDALO_DATA_LANG, $type=DEDALO_RELATION_TYPE_INDEX_TIPO) {
		// 	# Search relation index in hierarchy tables
		// 	$options = new stdClass();
		// 		$options->fields = new stdClass();
		// 			$options->fields->section_tipo		= $section_tipo;
		// 			$options->fields->section_id		= $section_id;
		// 			$options->fields->component_tipo	= $component_tipo;
		// 			$options->fields->type				= $type;
		// 			$options->fields->tag_id			= $tag_id;

		// 	$result = component_relation_index::get_indexations_search( $options );

		// 	$ar_indexations_resolved = [];
		// 	foreach ($result as $key => $inverse_locator) {

		// 		$locator = new locator();
		// 		 	$locator->set_section_tipo($inverse_locator->section_tipo);
		// 		 	$locator->set_section_id($inverse_locator->section_id);
		// 		 	$locator->set_from_component_tipo($inverse_locator->from_component_tipo);
		// 		 	$locator->set_component_tipo($inverse_locator->component_tipo);
		// 		 	$locator->set_type($inverse_locator->type);
		// 		 	$locator->set_tag_id($inverse_locator->tag_id);

		// 		$locator_resolve_term = new locator();
		// 			$locator_resolve_term->set_section_tipo($inverse_locator->from_section_tipo);
		// 		 	$locator_resolve_term->set_section_id($inverse_locator->from_section_id);

		// 		$term_label = ts_object::get_term_by_locator($locator_resolve_term, $lang, $from_cache=true) ?? '';

		// 		$data = new stdClass();
		// 			$data->section_tipo	= $inverse_locator->from_section_tipo;
		// 			$data->section_id	= $inverse_locator->from_section_id;
		// 			$data->term			= strip_tags($term_label);
		// 			$data->locator		= $locator;

		// 		$ar_indexations_resolved[] = $data;
		// 	}
		// 	$ar_indexations = $ar_indexations_resolved;


		// 	return (array)$ar_indexations;
		// }//end get_indexations_from_tag



	/**
	* GET_INDEXATIONS_SEARCH
	* @return resource $result
	*/
		// public static function get_indexations_search_DES( $request_options ) {

		// 	$options = new stdClass();
		// 		$options->fields = new stdClass();
		// 			$options->fields->section_tipo 	= false;
		// 			$options->fields->section_id 	= false;
		// 			$options->fields->component_tipo= false;
		// 			$options->fields->type 			= DEDALO_RELATION_TYPE_INDEX_TIPO;
		// 			$options->fields->tag_id 		= false;

		// 		foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		// 	$locator = new locator();
		// 		$locator->set_section_tipo($options->fields->section_tipo);
		// 		$locator->set_section_id($options->fields->section_id);
		// 		if (isset($options->fields->component_tipo) && $options->fields->component_tipo!==false) {
		// 		$locator->set_component_tipo($options->fields->component_tipo);
		// 		}
		// 		if (isset($options->fields->type) && $options->fields->type!==false) {
		// 		$locator->set_type($options->fields->type);
		// 		}
		// 		if (isset($options->fields->tag_id) && $options->fields->tag_id!==false) {
		// 		$locator->set_tag_id($options->fields->tag_id);
		// 		}

		// 	# calculate_inverse_locators: $locator, $limit=false, $offset=false, $count=false
		// 	$result = search::calculate_inverse_locators( $locator );


		// 	return $result;
		// }//end get_indexations_search



	/**
	* GET_LOCATOR_FROM_AR_RELATIONS
	* Find searched locator in array of locators
	* Used to locate the correct locator inside relations container returned for SQL search
	* @return object|null $current_locator
	*/
		// public static function get_locator_from_ar_relations_DES($relations, $section_tipo, $section_id, $type, $tag_id=false) {

		// 	// Locator to find
		// 		$locator = new locator();
		// 			$locator->set_section_tipo($section_tipo);
		// 			$locator->set_section_id($section_id);
		// 			$locator->set_type($type);

		// 			if ($tag_id!==false) {
		// 				$locator->set_tag_id($tag_id);
		// 			}

		// 	$ar_properties = array_keys((array)$locator);

		// 	foreach ((array)$relations as $current_locator) {

		// 		if (true===locator::compare_locators($current_locator, $locator, $ar_properties) ) {
		// 			// Full locator (with from tipo)
		// 			return $current_locator;
		// 		}
		// 	}
		// 	debug_log(__METHOD__." Zero locators are located in relations data. This is abnormal situation. Please review this data. ar_relations: ".to_string($relations), logger::ERROR);

		// 	return null;
		// }//end get_locator_from_ar_relations



	/**
	* SEARCH_OPERATORS_INFO
	* Return valid operators for search in current component
	* @return array $ar_operators
	*/
		// public function search_operators_info() : array {

		// 	$ar_operators = [
		// 		'*' 	 => 'no_empty', // not null
		// 		'=' 	 => 'vacio'
		// 	];

		// 	return $ar_operators;
		// }//end search_operators_info



}//end class component_relation_index