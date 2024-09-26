<?php
declare(strict_types=1);
/**
* CLASS COMPONENT_RELATION_RELATED
*
*/
class component_relation_related extends component_relation_common {



	# relation_type . Determines inverse resolutions and locator format
	# DEDALO_RELATION_TYPE_RELATED_TIPO (Default)
	# protected $relation_type = DEDALO_RELATION_TYPE_RELATED_TIPO; // Default
	// protected $relation_type ; // Set on construct from properties

	# type of rel (like unidirectional, bidirectional, multi directional, etc..) This info is inside each locator of current component dato
	# DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO (Default)
	# DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO
	# DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
	# protected $relation_type_rel = DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO; // Default
	// protected $relation_type_rel ; // Set on construct from properties

	// relation_type defaults
	protected $default_relation_type		= DEDALO_RELATION_TYPE_RELATED_TIPO;
	protected $default_relation_type_rel	= DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO;

	// test_equal_properties is used to verify duplicates when add locators
	public $test_equal_properties = array('section_tipo','section_id','type','from_component_tipo');


	/**
	* GET_VALOR
	* Get value. default is get dato . overwrite in every different specific component
	* @return array|string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG, $format='string', $ar_related_terms=false) {

		// lang never must be DEDALO_DATA_NOLAN
			if ($lang===DEDALO_DATA_NOLAN) $lang=DEDALO_DATA_LANG;

		// request_config
			$request_config	= $this->get_request_config_object();
			$show			= $request_config->show;

		# AR_COMPONETS_RELATED. By default, ar_related_terms is calculated. In some cases (diffusion for example) is needed overwrite ar_related_terms to obtain specific 'valor' form component
		if ($ar_related_terms===false) {
			$ar_componets_related =($ar_related_terms===false)
				? array_map(function($el){
					return $el->tipo;
				  }, $show->ddo_map)
				: $ar_related_terms;
		}

		$dato				= $this->get_dato() ?? [];
		$fields_separator	= (isset($show->fields_separator)) ?  $show->fields_separator : ' | ';
		$ar_values			= array();

		foreach ((array)$dato as $current_locator) {

			// current_ar_value array|null
			$current_ar_value = self::get_locator_value(
				$current_locator, // object locator
				$lang ?? DEDALO_DATA_LANG, // string lang
				false, // bool show_parents
				$ar_componets_related // array|null ar_components_related
			);

			$current_value = is_array($current_ar_value)
				? implode($fields_separator, $current_ar_value)
				: $current_ar_value; // null case

			$current_locator_json = json_handler::encode($current_locator);
			// add
			$ar_values[$current_locator_json] = $current_value;
		}//end if (!empty($dato))

		$valor = ($format==='array')
			? $ar_values
			: implode($fields_separator, $ar_values);


		return $valor;
	}//end get_valor



	/**
	* ADD_RELATED
	* Add one locator to current 'dato'. Verify is exists to avoid duplicates
	* NOTE: This method updates component 'dato' but NOT saves
	* @return bool $result
	*/
	public function add_related( object $locator ) : bool {

		// check locator
			if ($locator->section_tipo===$this->section_tipo && $locator->section_id==$this->parent) {
				debug_log(__METHOD__
					." Invalid related element (self) " . PHP_EOL
					.' locator: ' . to_string($locator)
					, logger::DEBUG
				);
				return false;
			}

		// Add type
			if (!isset($locator->type)) {
				$locator->type = $this->default_relation_type;
			}

		// Add type_rel
			if (!isset($locator->type_rel)) {
				$locator->type_rel = $this->relation_type_rel;
			}

		// Add current locator to component dato
			$result = $this->add_locator_to_dato($locator);


		return $result;
	}//end add_related



	/**
	* REMOVE_RELATED
	* Iterate current component 'dato' and if math requested locator, removes it the locator from the 'dato' array
	* NOTE: This method updates component 'dato' but NOT saves
	* @return bool $result
	*/
	public function remove_related( object $locator ) : bool {

		// Add current locator to component dato
		$result = $this->remove_locator_from_dato($locator);

		return $result;
	}//end remove_related



	/**
	* GET_DATO_WITH_REFERENCES
	* Return the full dato of the component, the real dato with the calculated references
	* @return array $dato_with_references
	*/
	public function get_dato_with_references() : array {

		$dato		= $this->get_dato();
		$references	= $this->get_calculated_references(true);

		$dato_with_references = array_merge($dato, $references);

		return $dato_with_references;
	}//end get_dato_with_references



	/**
	* GET_CALCULATED_REFERENCES
	* used for get the references, this function call the the get_references that make the recursive loop of the calculation
	* @param bool $only_data = false
	* @return array $references
	*/
	public function get_calculated_references(bool $only_data=false) : array {

		switch ($this->relation_type_rel) {

			case DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO:
			case DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO:
				$current_locator = new stdClass();
					$current_locator->section_tipo			= $this->section_tipo;
					$current_locator->section_id			= $this->section_id;
					$current_locator->from_component_tipo	= $this->tipo;
				$references = component_relation_related::get_references_recursive(
					$this->tipo,
					$current_locator,
					$this->relation_type_rel,
					false, // bool recursion
					$this->lang
				);
				break;

			case DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO:
			default:
				$references = [];
				break;
		}

		// only_data. Return the locators without label,
		// used by merge with the real data of the component ($dato_full or get_dato_with_references())
			if($only_data===true){
				return $references;
			}

		// get the request_config of the component to get the show object, it will use to format the label of the reference.
			$request_config			= $this->get_request_config_object();
			$show					= $request_config->show;
			$ar_componets_related	= array_map(function($ddo){
				return $ddo->tipo;
			}, $show->ddo_map);

		$fields_separator = (isset($show->fields_separator)) ?  $show->fields_separator : ' | ';

		$references = array_map(function($locator) use($ar_componets_related, $fields_separator) {

			$ar_current_label = self::get_locator_value(
				$locator, // object locator
				DEDALO_DATA_LANG, // string lang
				false, // bool show_parents
				$ar_componets_related, // array|null ar_components_related
				true // bool include_self
			);
			$current_label = !empty($ar_current_label)
				? implode($fields_separator, $ar_current_label)
				: $ar_current_label; // null case

			$item = new stdClass();
				$item->value	= $locator;
				$item->label	= $current_label; // string|null

			return $item;
		}, $references);


		return $references;
	}//end get_calculated_references



	/**
	* GET_TYPE_REL
	* @return string $this->relation_type_rel
	*/
	public function get_type_rel() : string {

		return $this->relation_type_rel;
	}//end get_type_rel



	/**
	* GET_REFERENCES_RECURSIVE
	* Resolve references (related terms that point to current locator)
	*  	DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO
	* 	DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
	* @return array $ar_references
	*/
	public static function get_references_recursive(
		string $tipo,
		object $locator,
		string $type_rel=DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO,
		bool $recursion=false,
		string $lang=DEDALO_DATA_LANG
		) : array {

		static $ar_resolved = array();
		// reset ar_resolved on first call
			if ($recursion===false) {
				$ar_resolved = [];
			}

		$pseudo_locator	= $locator->section_tipo .'_'. $locator->section_id . '_'. $lang;
		$ar_resolved[]	= $pseudo_locator; // set self as resolved
		$ar_references	= [];

		// References to me
		if (isset($locator->section_id) && isset($locator->section_tipo)) {
			// $model_name 	= RecordObj_dd::get_modelo_name_by_tipo($locator->from_component_tipo,true); // get_class();
			$ref_component 	= component_common::get_instance(
				'component_relation_related',
				$locator->from_component_tipo,
				$locator->section_id,
				'edit',
				DEDALO_DATA_NOLAN,
				$locator->section_tipo
			);
			$ar_result = $ref_component->get_references();

			foreach ($ar_result as $result_locator) {
				$pseudo_locator = $result_locator->section_tipo .'_'. $result_locator->section_id . '_'. $lang;
				if (in_array($pseudo_locator, $ar_resolved)) {
					continue;
				}
				$ar_references[]	= $result_locator;
				$ar_resolved[]		= $pseudo_locator; // set as resolved
			}
		}

		// Only DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO
		if ($type_rel===DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO) {

			// ref_component dato
			if (isset($ref_component)) {
				$dato = $ref_component->get_dato();
				foreach ($dato as $dato_locator) {

					$pseudo_locator = $dato_locator->section_tipo .'_'. $dato_locator->section_id . '_'. $lang;
					if (in_array($pseudo_locator, $ar_resolved)) {
						continue;
					}

					$element = new stdClass();
						$element->section_tipo			= $dato_locator->section_tipo;
						$element->section_id			= $dato_locator->section_id;
						$element->from_component_tipo	= $dato_locator->from_component_tipo;

					// Only add dato when is recursion, not at the first call
					if ($recursion===true) {
						$ar_references[] = $element;
					}

					$ar_resolved[] = $pseudo_locator; // set as resolved

					// References to dato
					// Recursion (dato)
					$ar_result		= self::get_references_recursive($tipo, $dato_locator, $type_rel, true, $lang);
					$ar_references	= array_merge($ar_references, $ar_result);
				}
			}

			// References to references
			foreach ($ar_references as $current_locator) {
				// Recursion (references)
				$ar_result		= self::get_references_recursive($tipo, $current_locator, $type_rel, true, $lang);
				$ar_references	= array_merge($ar_references, $ar_result);
			}
		}//end if ($type_rel===DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO)


		return $ar_references;
	}//end get_references_recursive



	/**
	* GET_REFERENCES
	* Get bidirectional / multi-directional references to current term
	* @param string|null $type_rel = null
	* @return array $ar_result
	* array of objects as
	* [{
	* 	section_tipo: 'rsc1568';
	*	section_id: 15269;
	*	from_component_tipo: rsc85741
	* }]
	*/
	public function get_references( ?string $type_rel=null ) : array {

		$locator = new locator();
			$locator->set_section_tipo($this->section_tipo);
			$locator->set_section_id($this->section_id);
			$locator->set_from_component_tipo($this->tipo);

		if (!empty($type_rel)) {
			// Add type_rel filter
			$locator->set_type_rel($type_rel);
		}

		// Path
		$base_path = new stdClass();
			$base_path->name			= $this->label;
			$base_path->model			= get_class($this);
			$base_path->section_tipo	= $this->section_tipo;
			$base_path->component_tipo	= $this->tipo;

		$path = array($base_path);

		// Component path
		$component_path = ['relations'];

		// Filter
		$filter_group = new stdClass();
			$filter_group->q				= $locator;
			$filter_group->lang				= 'all';
			$filter_group->path				= $path;
			$filter_group->component_path	= $component_path;

		$filter = (object)[
			'$and' => [$filter_group]
		];

		// search_query_object
		$search_query_object = new search_query_object();
			$search_query_object->set_id('temp');
			$search_query_object->set_section_tipo([$this->section_tipo]);
			$search_query_object->set_filter($filter);
			$search_query_object->set_limit(0);
			$search_query_object->set_offset(0);
			$search_query_object->set_full_count(false);

		$search			= search::get_instance($search_query_object);
		$records_data	= $search->search();

		$ar_result = [];
		foreach ($records_data->ar_records as $row) {

			$element = new stdClass();
				$element->section_tipo			= $row->section_tipo;
				$element->section_id			= $row->section_id;
				$element->from_component_tipo	= $this->tipo;

			$ar_result[]    = $element;
		}


		return $ar_result;
	}//end get_references



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component common method
	* Calculate current component diffusion value for target field (usually a mysql field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @see class.diffusion_mysql.php
	*
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*/
	public function get_diffusion_value(?string $lang=null, ?object $option_obj=null) : ?string {

		$diffusion_value = null;

		$separator = '<br>';

		// lang empty case. Apply default
			if (empty($lang)) {
				$lang = DEDALO_DATA_LANG;
			}

		// valor
			$valor = $this->get_valor(
				$lang,  // string lang
				'array' // string format array|string
			);

		// calculated references
		$calculated_references = $this->get_calculated_references();

		if (empty($option_obj)) {

			$diffusion_value	= implode($separator, $valor);
			$diffusion_value	= !empty($diffusion_value)
				? strip_tags($diffusion_value, $separator)
				: '';

			if (!empty($calculated_references)) {
				$ar_references = [];
				foreach ($calculated_references as $key => $ref_obj) {
					$ar_references[] = $ref_obj->label;
				}
				if (!empty($diffusion_value)) {
					$diffusion_value .= $separator;
				}
				// append ar_references
				$diffusion_value .= implode($separator, $ar_references);
			}
		}else{

			$ar_terms = [];
			// properties options defined
			foreach ($option_obj as $key => $value) {

				if ($key==='custom_parents') {

					$fields_separator 	= $this->get_fields_separator();

					if (!empty($valor)) {
						$array_values = array_values($valor);
						foreach ($array_values as $key => $current_term) {
							$ar_terms[] = explode($fields_separator, $current_term);
						}
					}

					if (!empty($calculated_references)) {
						foreach ($calculated_references as $key => $ref_obj) {
							$ar_terms[] = explode($fields_separator, $ref_obj->label);
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
							$final_term[] = implode($fields_separator, $term);
						}
						if (!empty($final_term)) {
							$diffusion_value = implode($separator, $final_term);
						}
					}
				}
			}//end foreach ($option_obj as $key => $value)
		}


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is false. Override when component is sortable
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		$path = [
			// self component path
			(object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true),
				'name'				=> RecordObj_dd::get_termino_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			],
			// thesaurus langs (component_input_text hierarchy25, section_tipo lg-1)
			(object)[
				'component_tipo'	=> DEDALO_THESAURUS_TERM_TIPO,
				'model'				=> RecordObj_dd::get_modelo_name_by_tipo(DEDALO_THESAURUS_TERM_TIPO,true),
				'name'				=> RecordObj_dd::get_termino_by_tipo(DEDALO_THESAURUS_TERM_TIPO),
				'section_tipo'		=> $section_tipo
			]
		];

		return $path;
	}//end get_order_path



}//end class component_relation_related
