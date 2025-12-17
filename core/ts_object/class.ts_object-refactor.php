<?php declare(strict_types=1);
/**
* CLASS TS_OBJECT
* Manage thesaurus hierarchical elements. Every element is a section used as thesaurus term
*
*/
class ts_object {



	// int (mandatory)
	public $section_id;
	// string (mandatory)
	public $section_tipo;
	// object
	// protected $section;
	// mixed object|null (default null)
	protected $options;
	// string (default 'edit')
	protected $mode;
	// int
	public $order;
	// ar_elements
	public $ar_elements;
	// ts_id as dd1_1
	public $ts_id;
	// ts_parent as dd1_1
	public $ts_parent;



	/**
	* __CONSTRUCT
	* @param int|string $section_id
	* @param string $section_tipo
	* @param object|null $options
	*	Default null
	* @param string $mode
	*	Default 'edit'
	*/
	public function __construct( int|string $section_id, string $section_tipo, ?object $options=null, string $mode='edit', ?string $ts_parent=null ) {

		$this->section_id   = $section_id;
		$this->section_tipo = $section_tipo;

		// set thesaurus id
		$this->ts_id = $section_tipo.'_'.$section_id;

		// set thesaurus parent (link with parent node id)
		$this->ts_parent = $ts_parent;

		# Build and set current section obj
		// $this->section = section::get_instance( $section_id, $section_tipo );

		# Fix options
		$this->options = $options;

		# Fix mode
		$this->mode = $mode;

		# Set default order
		$this->order = $options->order ?? null;
	}//end __construct



	/**
	* GET_AR_ELEMENTS
	* Get elements from section_list_thesaurus -> properties
	* @param string $section_tipo
	* @param boolean|null $model = false
	* @return array $ar_elements
	*/
	public static function get_ar_elements( string $section_tipo, ?bool $model=false ) : array {

		$ar_elements = [];

		// Elements are stored in current section > section_list_thesaurus
		// Search element in current section
			$ar_model_name_required = array('section_list_thesaurus');

		// Search in current section
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo, // tipo
				$ar_model_name_required, // ar_modelo_name_required
				true, // from_cache
				false, // resolve_virtual
				false, // recursive
				true // search_exact
			);
			// relation map defined in properties
			$children_tipo	= $ar_children[0] ?? null;
			$properties		= null;
			if ($children_tipo) {
				$ontology_node	= ontology_node::get_instance($ar_children[0]);
				$properties		= $ontology_node->get_properties();
			}

			// Fallback to real section when in virtual
			if ( empty($properties) ) {
				$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
				if ($section_tipo!==$section_real_tipo) {
					$ar_children  = section::get_ar_children_tipo_by_model_name_in_section(
						$section_real_tipo,
						$ar_model_name_required,
						true, // from_cache
						false, // resolve_virtual
						false, // recursive
						true // search_exact
					);
					// relation map defined in properties
					if (isset($ar_children[0])) {
						$ontology_node	= ontology_node::get_instance($ar_children[0]);
						$properties		= $ontology_node->get_properties();
					}
				}
			}//end if (empty($properties))

		// If element exists (section_list_thesaurus) we get element 'properties' JSON value as array
			if ( isset($properties->show) && isset($properties->show->ddo_map) ) {

				$ddo_map = $properties->show->ddo_map;
				foreach ($ddo_map as $current_ddo) {

					$type = $current_ddo->type ?? null;

					// link children exception
						if ($model===false && $type==='link_children_model') {
							continue;
						}else if ($model===true) {
							if ( $type==='link_children' && ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO || $section_tipo===DEDALO_ONTOLOGY_SECTION_TIPO) ) {
								// unset($properties[$key]);
								continue;
							}else if ( $type==='link_children_model' ) {
								$current_ddo->type = 'link_children';
							}
						}
					// add
					$ar_elements[] = $current_ddo;
				}//end foreach ($properties as $key => $value_obj)
			}


		return $ar_elements;
	}//end get_ar_elements



	/**
	* PARSE_CHILD_DATA
	* Auxiliary function used in dd_ts_api
	* Iterates locators extracting the child data of each one
	* @see get_data
	* @param array $locators
	* @param string $area_model='area_thesaurus'
	* @return array $child_data
	*/
	public static function parse_child_data( array $locators, string $area_model='area_thesaurus', ?object $ts_object_options=null ) : array {

		$children_data = [];

		foreach ($locators as $locator) {

			$section_id		= $locator->section_id;
			$section_tipo	= $locator->section_tipo;

			$ts_options = empty($ts_object_options)
				? new stdClass()
				: $ts_object_options;

			// Do not set order here because could overwrite the custom order !
			// set order of locator in the ts_options
			// $ts_options->order = $key+1;

			$ts_object		= new ts_object( $section_id, $section_tipo, $ts_options );
			$child_object	= $ts_object->get_data();

			if (empty($child_object->ar_elements)) {
				$tld = get_tld_from_tipo($locator->section_tipo);
				debug_log(__METHOD__
					. " Empty ar_elements child. Maybe this tld ($tld) is not installed " . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
			}

			$children_data[] = $child_object;
		}


		return $children_data;
	}//end parse_child_data



	/**
	* GET_DATA
    * Compose the data object to be returned
	* @return object $child_data
	*/
	public function get_data() : object {
		$data = $this->initialize_data_object();

		$model = $this->options->model ?? null;
		$ar_elements = self::get_ar_elements($this->section_tipo, $model);

		foreach ($ar_elements as $current_object) {
			if (empty($current_object->tipo)) {
				debug_log(__METHOD__ . " Warning. Ignored bad formed empty element_tipo in current_object", logger::WARNING, ['current_object' => $current_object]);
				continue;
			}

			// No descriptors do not have children. Avoid calculate children
			if ($data->is_descriptor === false && ($current_object->type ?? null) === 'link_children') {
				$data->children_tipo = null;
				continue;
			}

			$this->process_element_object($current_object, $data);
		}

		return $data;
	}//end get_data

	/**
	* Initializes the main data object with default values and permissions.
	* @return stdClass
	*/
	private function initialize_data_object() : stdClass {
		$is_indexable = (bool)self::is_indexable($this->section_tipo, $this->section_id);
		$permissions_button_new = $this->get_permissions_element('button_new');
		$permissions_button_delete = $this->get_permissions_element('button_delete');

		$data = new stdClass();
		$data->section_tipo = $this->section_tipo;
		$data->section_id = $this->section_id;
		$data->ts_id = $this->ts_id;
		$data->ts_parent = $this->ts_parent;
		$data->order = $this->order;
		$data->mode = 'list';
		$data->lang = DEDALO_DATA_LANG;
		$data->is_descriptor = true;
		$data->is_indexable = $is_indexable;
		$data->ar_elements = [];
		$data->permissions_button_new = $permissions_button_new;
		$data->permissions_button_delete = $permissions_button_delete;
		return $data;
	}

	/**
	* Processes a single element object and adds it to the data's ar_elements.
	* @param stdClass $current_object
	* @param stdClass $data
	*/
	private function process_element_object(stdClass $current_object, stdClass &$data) : void {
		$ar_element_tipo = is_array($current_object->tipo) ? $current_object->tipo : [$current_object->tipo];
		$element_obj = (object)[
			'type' => $current_object->type,
			'tipo' => $current_object->tipo,
		];

		foreach ($ar_element_tipo as $element_tipo) {
			$component = $this->get_component_for_element_tipo($element_tipo);
			if (!$component) {
				continue; // Skip if component cannot be instantiated or is invalid
			}

			$model_name = ontology_node::get_model_by_tipo($element_tipo, true);
			$component_data = $this->get_processed_component_data($component, $model_name, $element_tipo);

			$this->assign_element_value($element_obj, $component_data, $current_object, $data, $component);

			// Ontology model case. Used in area ontology to display the current element model like 'root'
			if (($element_obj->value ?? null) === 'M') {
				$element_obj->model_value = $component->get_value();
			}

			// Set model. Only first element if more than one exists (multiple term cases with same model)
			if (!isset($element_obj->model)) {
				$element_obj->model = $model_name;
			}
			// Set data_type. set the data_type when is set.
			if (isset($current_object->show_data)) {
				$element_obj->show_data = $current_object->show_data;
			}
		}
		$data->ar_elements[] = $element_obj;
	}

	/**
	* Gets a component instance for a given element tipo, handling model validation.
	* @param string $element_tipo
	* @return component_common|null
	*/
	private function get_component_for_element_tipo(string $element_tipo) : ?component_common {
		$model_name = ontology_node::get_model_by_tipo($element_tipo, true);

		if (empty($model_name) || $model_name === 'box elements') {
			return null;
		}
		// Ignore v5 component_relation_struct
		if ($model_name === 'component_relation_index') {
			$legacy_model = ontology_node::get_legacy_model_by_tipo($element_tipo);
			if ($legacy_model === 'component_relation_struct') {
				return null;
			}
		}

		$lang = common::get_element_lang($element_tipo, DEDALO_DATA_LANG);
		return component_common::get_instance(
			$model_name,
			$element_tipo,
			$this->section_id,
			'list_thesaurus',
			$lang,
			$this->section_tipo
		);
	}

	/**
	* Retrieves and processes component data based on its model.
	* @param component_common $component
	* @param string $model_name
	* @param string $element_tipo
	* @return mixed
	*/
	private function get_processed_component_data(component_common $component, string $model_name, string $element_tipo) : mixed {
		// Relation index gets full data when get_data() is called, others need pagination data.
		$component_data = ($model_name !== 'component_relation_index')
			? $component->get_data_lang()
			: [];

		switch (true) {
			case (in_array($element_tipo, hierarchy::$hierarchy_portals_tipo)):
				// Do not change main hierarchy portals data, component_children in main section
				break;

			case ($model_name === 'component_autocomplete_hi' || $model_name === 'component_portal'):
				if (!empty($component_data)) {
					$values = [];
					foreach ($component_data as $current_locator) {
						$values[] = self::get_term_by_locator($current_locator, DEDALO_DATA_LANG, true);
					}
					$component_data = $values;
				}
				break;

			case ($model_name === 'component_relation_related'):
				$type_rel = $component->get_type_rel();
				if ($type_rel !== DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO) {
					$component_rel = $component->get_references();
					$component_data = array_merge($component_data, $component_rel);
				}
				break;

			case ($model_name === 'component_svg'):
				$file_path = $component->get_media_filepath(DEDALO_SVG_QUALITY_DEFAULT);
				$component_data = (file_exists($file_path) === true)
					? $component->get_url() . '?' . microtime(true) // Using microtime for cache busting
					: '';
				break;
		}
		return $component_data;
	}

	/**
	* Assigns the value to the element object based on its type.
	* @param stdClass $element_obj
	* @param mixed $component_data
	* @param stdClass $current_object
	* @param stdClass $data
	* @param component_common $component
	*/
	private function assign_element_value(stdClass $element_obj, mixed $component_data, stdClass $current_object, stdClass &$data, component_common $component) : void {
		$separator = ' '; // Define separator locally or as class property if needed

		switch ($element_obj->type) {
			case 'term':
				$element_value = empty($component_data)
					? $component->extract_component_value_fallback()
					: ($component_data[0]->value ?? $component_data[0] ?? '');
				$element_obj->value = (isset($element_obj->value) ? $element_obj->value . $separator : '') . to_string($element_value);
				break;

			case 'icon':
				if (($current_object->icon ?? null) === 'CH') {
					return; // Skip 'CH' icon
				}
				if (($current_object->icon ?? null) === 'ND') {
					if (isset($component_data[0]) && isset($component_data[0]->section_id) && (int)$component_data[0]->section_id === 2) {
						self::set_term_as_nd($data->ar_elements);
						$data->is_descriptor = false;
					}
					return; // Skip 'ND' icon after processing
				}

				$element_obj->value = $current_object->icon;
				$model_name = ontology_node::get_model_by_tipo($element_obj->tipo, true);

				if ($model_name === 'component_relation_index') {
					$count_data_group_by = $this->get_count_data_group_by($component, $current_object);
					if ($count_data_group_by->total === 0) {
						return; // Skip if no items to display
					}
					$element_obj->value .= ':' . $count_data_group_by->total;
					array_map(function($item) {
						$item->label = ontology_node::get_term_by_tipo($item->key[0]);
						$item->key = $item->key[0];
					}, $count_data_group_by->totals_group);
					$element_obj->count_result = $count_data_group_by;
				} else {
					if (is_empty($component_data)) {
						return; // Skip empty icon value links
					}
				}
				break;

			case 'link_children':
				$data->children_tipo = $element_obj->tipo;
				$data->has_descriptor_children = empty($component_data)
					? false
					: $this->has_children_of_type($component_data, 'descriptor');
				$element_obj->value = ($data->has_descriptor_children === true)
					? 'button show children'
					: 'button show children unactive';

				$has_children_of_type_result = empty($component_data)
					? false
					: $this->has_children_of_type($component_data, 'nd');

				if ($has_children_of_type_result === true) {
					$nd_element = (object)[
						'type' => 'link_children_nd',
						'tipo' => $element_obj->tipo,
						'value' => 'ND',
					];
					$data->ar_elements[] = $nd_element;
				}
				break;

			default:
				$element_obj->value = $component_data;
				break;
		}
	}



	/**
	* GET_CHILDREN_DATA
	* 
	* @param object $options
	* @return object $response
	*/
	public function get_children_data( object $options ) : object {

		// options
			$children_tipo		= $options->children_tipo;
			$default_limit		= $options->default_limit;
			$area_model			= $options->area_model;
			$ts_object_options	= $options->ts_object_options;
			$pagination			= $options->pagination;

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// Calculate children from parent
			$model = ontology_node::get_model_by_tipo($children_tipo,true);
			if ($model!=='component_relation_children') {
				$response->errors[] = 'Wrong model';
				$response->msg .= ' Expected model (component_relation_children) but calculated: ' . $model;
				return $response;
			}

		// component_relation_children
			$component_relation_children = component_common::get_instance(
				$model,
				$children_tipo,
				$this->section_id,
				'list_thesaurus',
				DEDALO_DATA_NOLAN,
				$this->section_tipo
			);

			// Set default pagination if not defined
			if (empty($current_pagination)) {
				$current_pagination = (object)[
					'limit' => $default_limit,
					'offset' => 0,
				];
			}

			// Calculate total if not set
			if (!isset($current_pagination->total)) {
				$data = $component_relation_children->get_data();
				$current_pagination->total = (is_countable($data) ? count($data) : 0);
			}
			// Fix pagination to the component (used when get_data_paginated is called from the class)
			$component_relation_children->pagination = $current_pagination;

		// Get data (paginated or full based on actual need, not just total count)
			$use_pagination = $current_pagination->limit > 0 && $current_pagination->total > $current_pagination->limit;
			$children = $use_pagination
				? $component_relation_children->get_data_paginated()
				: $component_relation_children->get_data();

		// parse_child_data
			$ar_children_data = ts_object::parse_child_data(
				$children,
				$area_model,
				$ts_object_options
			);

		// build children_data result object
			$children_data = (object)[
				'ar_children_data'	=> $ar_children_data,
				'pagination'		=> $current_pagination ?? $pagination
			];

		// response
			$response->result	= $children_data;
			$response->msg		= empty($response->errors)
				? 'OK. Request done successfully'
				: 'Warning! Request done with errors';


		return $response;
	}//end get_children_data



	/**
	* HAS_CHILDREN_OF_TYPE
	* @param array $ar_children
	* 	Array of locators
	* @param string $type
	* 	As 'descriptor'
	* @return bool
	*/
	public function has_children_of_type( array $ar_children, string $type ) : bool {

		if (empty($ar_children)) {

			// options forced have_children cases (persons for example from trigger.ts_object.php)
			if ($type==='descriptor') {
				return $this->options->have_children ?? false;
			}

			return false;
		}

		$descriptor_value = ($type==='descriptor') ? 1 : 2;  # 1 for descriptors, 2 for non descriptors

		foreach($ar_children as $current_locator) {

			$model = ontology_node::get_model_by_tipo($current_locator->section_tipo,true);
			if (empty($model)) {
				debug_log(__METHOD__
					. " Ignored non resolved model for section: $current_locator->section_tipo" . PHP_EOL
					. ' Maybe is a non installed TLD : ' . get_tld_from_tipo($current_locator->section_tipo)
					, logger::ERROR
				);
				continue;
			}

			$section_map = section::get_section_map( $current_locator->section_tipo );
			if (empty($section_map) || !isset($section_map->thesaurus->is_descriptor)) {
				debug_log(__METHOD__
					." Invalid section_map 'is_descriptor' property " .PHP_EOL
					.' section_map: ' . json_encode($section_map, JSON_PRETTY_PRINT) . PHP_EOL
					.' Please, define a valid section_map for section ' .$current_locator->section_tipo
					, logger::ERROR
				);
				continue;
			}

			$component_tipo	= $section_map->thesaurus->is_descriptor;
			$model_name		= ontology_node::get_model_by_tipo($component_tipo,true);
			$component		= component_common::get_instance(
				$model_name,
				$component_tipo,
				$current_locator->section_id,
				'list',
				DEDALO_DATA_NOLAN,
				$current_locator->section_tipo
			);
			$data = $component->get_data();

			// When first element is found, return true
			if (isset($data[0])
				&& isset($data[0]->section_id)
				&& (int)$data[0]->section_id==$descriptor_value) {
				return true;
			}
		}


		return false;
	}//end has_children_of_type



	/**
	* IS_INDEXABLE
	* @param string $section_tipo
	* @param int $section_id
	* @return bool
	*/
	public static function is_indexable( string $section_tipo, int|string $section_id ) : bool {

		if (strpos($section_tipo, 'hierarchy')===0 || strpos($section_tipo, 'ontology')===0) {
			// Root hierarchies are always false
			return false;
		}

		$model = ontology_node::get_model_by_tipo($section_tipo,true);
		if (empty($model)) {
			debug_log(__METHOD__
				. " Ignored non resolved model for section: $section_tipo" . PHP_EOL
				. ' Maybe is a non installed TLD : ' . get_tld_from_tipo($section_tipo)
				, logger::ERROR
			);
			return false;
		}

		$section_map = section::get_section_map( $section_tipo );
		if (!isset($section_map->thesaurus->is_indexable)) {
			debug_log(__METHOD__." Invalid section_map 'is_indexable' property from section $section_tipo ".to_string($section_map), logger::ERROR);
			return false;
		}

		if ($section_map->thesaurus->is_indexable===false) {
			// properties set as false case
			return false;
		}

		$component_tipo	= $section_map->thesaurus->is_indexable;
		$model_name		= ontology_node::get_model_by_tipo($component_tipo,true);
		$component		= component_common::get_instance(
			$model_name,
			$component_tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$data = $component->get_data();

		$indexable_value = 1; // Yes

		// When first element is found, return true
		if (isset($data[0]) && isset($data[0]->section_id) && (int)$data[0]->section_id===$indexable_value) {
			return true;
		}

		return false;
	}//end is_indexable



	/**
	* GET_DESCRIPTORS_FROM_CHILDREN
	* @return
	*/
		// public static function get_descriptors_from_children__DES( $ar_children ) {

		// 	$ar_descriptors = array();

		// 	foreach ((array)$ar_children as $key => $current_locator) {

		// 		$section_map = section::get_section_map( $current_locator->section_tipo );
		// 		#dump($section_map['thesaurus']->is_descriptor, ' $section_map ++ '.to_string($current_locator->section_tipo));

		// 		if (!isset($section_map['thesaurus']->is_descriptor)) {
		// 			debug_log(__METHOD__." Invalid section_map 'is_descriptor' property fro section $current_locator->section_tipo ".to_string($section_map), logger::ERROR);
		// 			continue;
		// 		}

		// 		$component_tipo = $section_map['thesaurus']->is_descriptor;

		// 		$model_name = ontology_node::get_model_by_tipo($component_tipo,true);
		// 		$component 	 = component_common::get_instance($model_name,
		// 													  $component_tipo,
		// 													  $current_locator->section_id,
		// 													  'list',
		// 													  DEDALO_DATA_NOLAN,
		// 													  $current_locator->section_tipo);
		// 		$dato = $component->get_dato();

		// 		if (isset($dato[0]) && isset($dato[0]->section_id) && (int)$dato[0]->section_id===1) {
		// 			$ar_descriptors[] = $current_locator;
		// 		}
		// 	}


		// 	return $ar_descriptors;
		// }//end get_descriptors_from_children



	/**
	* SET_TERM_AS_ND
	* Modifies received array data on term to set as ND (no descriptor)
	* @return array $ar_elements
	*/
	public static function set_term_as_nd( array &$ar_elements ) : array {

		foreach ($ar_elements as $key => $obj_value) {

			if ($obj_value->type==='term') {

				if (!is_string($obj_value->value)) {
					debug_log(__METHOD__
						."  ".'$obj_value->value ++ EXPECTED STRING. But received type: '.gettype($obj_value->value) . PHP_EOL
						.' obj_value->value type: ' . gettype($obj_value->value) . PHP_EOL
						.' obj_value->value: ' . to_string($obj_value->value)
						, logger::ERROR
					);
				}

				$ar_elements[$key]->value = $obj_value->value; //'<span class="no_descriptor">' .  . '</span>';
				break;
			}
		}

		return $ar_elements;
	}//end set_term_as_nd



	/**
	* GET_TERM_DATO_BY_LOCATOR
	* @param object $locator
	* @return array|null $final_value
	*/
	public static function get_term_dato_by_locator( object $locator ) : ?array {

		// check valid object
			if (!is_object($locator) || !property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					#throw new Exception("Error Processing Request. locator is not object: ".to_string($locator), 1);
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return null;
			}

		$section_map	= section::get_section_map($locator->section_tipo);
		$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;

		$ar_tipo		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term];
		$section_id		= $locator->section_id;
		$section_tipo	= $locator->section_tipo;

		$ar_value = [];
		foreach ($ar_tipo as $tipo) {

			$model		= ontology_node::get_model_by_tipo($tipo,true);
			$component	= component_common::get_instance(
				$model,
				$tipo,
				$section_id,
				'list',
				DEDALO_DATA_LANG,
				$section_tipo
			);
			$data = $component->get_data();

			if (!empty($data)) {
				$ar_value = array_merge($ar_value, $data);
			}
		}//end foreach ($ar_tipo as $tipo) {

		// final value
			$final_value = $ar_value;


		return $final_value;
	}//end get_term_dato_by_locator



	/**
	* GET_TERM_BY_LOCATOR
	* Resolve locator to string value to show in list etc.
	* @param object $locator
	* @param string $lang = DEDALO_DATA_LANG
	* @param bool $from_cache = false
	*
	* @return string|null $valor
	*/
	public static function get_term_by_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) : ?string {

		$valor = null;

		// check locator->section_tipo mandatory property
			if (!property_exists($locator, 'section_tipo')) {
				if(SHOW_DEBUG===true) {
					#throw new Exception("Error Processing Request. locator is not object: ".to_string($locator), 1);
					debug_log(__METHOD__
						." ERROR on get term. locator is not of type object: ".gettype($locator)." FALSE VALUE IS RETURNED !"
						, logger::ERROR
					);
				}
				return $valor; // null
			}

		// Cache control (session)
			$cache_uid = $locator->section_tipo.'_'.$locator->section_id.'_'.$lang;
			static $term_by_locator_data;
			if ($from_cache===true && isset($term_by_locator_data[$cache_uid])) {
				return $term_by_locator_data[$cache_uid];
			}

		// thesaurus_map conditional value
			$section_map	= section::get_section_map($locator->section_tipo);
			$thesaurus_map	= isset($section_map->thesaurus) ? $section_map->thesaurus : false;
			if ($thesaurus_map===false) {

				$valor = $locator->section_tipo .'_'. $locator->section_id ;
				if(isset($locator->component_tipo))
					$valor .= '_'. $locator->component_tipo;
				if(isset($locator->tag_id))
					$valor .= '_'. $locator->tag_id;

			}else{

				$term		= is_array($thesaurus_map->term) ? $thesaurus_map->term : [$thesaurus_map->term]; // source could be an array or string
				$ar_valor	= [];
				foreach ($term as $tipo) {

					$parent			= $locator->section_id;
					$section_tipo	= $locator->section_tipo;
					$model_name		= ontology_node::get_model_by_tipo($tipo,true);
					// debug
						// if(SHOW_DEBUG===true) {
						// 	$real_model_name 	= ontology_node::get_model_by_tipo($tipo,true);
						// 	if ($real_model_name!==$model_name) {
						// 		trigger_error("Error. modelo_name of component $tipo must be $model_name. $#real_model_name is defined");#
						// 	}
						// }
					$component = component_common::get_instance(
						$model_name,
						$tipo,
						$parent,
						'list',
						$lang,
						$section_tipo
					);
					$current_value = $component->get_value();

					if (empty($current_value)) {
						$main_lang = hierarchy::get_main_lang( $locator->section_tipo );
						$data = $component->get_data();
						// get_value_with_fallback_from_dato_full( $dato_full_json, $decorate_untranslated=false, $main_lang=DEDALO_DATA_LANG_DEFAULT)
						$current_value = component_string_common::get_value_with_fallback_from_data(
							$data,
							true,
							$main_lang,
							$lang
						);
					}

					if (!empty($current_value)) {
						$ar_valor[] = $current_value;
					}
				}
				$valor = implode(', ', $ar_valor);
			}

		/*
			# En proceso. De momento devuelve el locator en formato json, sin resolver..
			if (!isset($valor)) {
				$valor = json_encode($locator);
			}

			if(SHOW_DEBUG===true) {
				$valor .= " <span class=\"debug_info notes\">".json_encode($locator)."</span>";
			}
			*/

		// cache control
			$term_by_locator_data[$cache_uid] = $valor;


		return $valor;
	}//end get_term_by_locator



	/**
	* RESOLVE_LOCATOR
	* Alias of get_term_by_locator
	* @return string|null $valor
	*/
	public function resolve_locator( object $locator, string $lang=DEDALO_DATA_LANG, bool $from_cache=false ) {
		return ts_object::get_term_by_locator($locator, $lang, $from_cache);
	}//end resolve_locator



	/**
	* GET_COMPONENT_ORDER_TIPO
	* Alias of hierarchy::get_element_tipo_from_section_map
	* @param string $section_tipo
	* @return string|null $element_tipo
	*/
	public static function get_component_order_tipo( string $section_tipo ) : ?string {

		// Calculated way
		$element_tipo = hierarchy::get_element_tipo_from_section_map( $section_tipo, 'order' );


		return $element_tipo;
	}//end get_component_order_tipo



	/**
	* GET_PERMISSIONS_ELEMENT
	* Resolve permissions value for given element name (model)
	* E.g. 'button_new'
	* @param string $element_name
	* @return int $permissions
	*/
	public function get_permissions_element( string $element_name ) : int {

		$permissions = 0;

		// Helper closure for repeated logic
		$get_child_permissions = function (string $element_name, bool $recursive = false): int {
			$ar_children = section::get_ar_children_tipo_by_model_name_in_section(
				$this->section_tipo,
				[$element_name],
				true,  // from_cache
				true,  // resolve_virtual
				$recursive,
				true,   // search_exact
				[] // ar_tipo_exclude_elements
			);

			if (!empty($ar_children[0])) {
				return common::get_permissions($this->section_tipo, $ar_children[0]);
			}

			// debug_log(__METHOD__ . " WARNING: Element not defined: $element_name", logger::DEBUG);
			return 0;
		};

		switch ($element_name) {
			case 'button_new':
				if ($this->section_tipo === DEDALO_HIERARCHY_SECTION_TIPO) {
					$tipo = DEDALO_HIERARCHY_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo, $tipo);
				} elseif ($this->section_tipo === DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_NEW_TIPO;
					$permissions = common::get_permissions($this->section_tipo, $tipo);
				} else {
					$permissions = $get_child_permissions($element_name, false);
				}
				break;

			case 'button_delete':
				if ($this->section_tipo === DEDALO_HIERARCHY_SECTION_TIPO) {
					$permissions = 0; // Always 0 for hierarchy
				} elseif ($this->section_tipo === DEDALO_THESAURUS_SECTION_TIPO) {
					$tipo = DEDALO_THESAURUS_BUTTON_DELETE_TIPO;
					$permissions = common::get_permissions($this->section_tipo, $tipo);
				} else {
					$permissions = $get_child_permissions($element_name, false);
				}
				break;

			default:
				$permissions = $get_child_permissions($element_name, true);
				break;
		}


		return (int)$permissions;
	}//end get_permissions_element



	/**
	* GET_COUNT_DATA_GROUP_BY
	* Counts indexation related items
	* @param object $component
	* 	component indexation
	* @param object section_list_thesaurus_item
	* sample:
	* {
	*	"icon": "TCHI",
	*	"tipo": "tchi59",
	*	"type": "icon",
	*	"show_data": "children"
	* }
	* @return object $count_data_group_by
	*/
	public function get_count_data_group_by( object $component, object $section_list_thesaurus_item ) : object {

		// cache
			static $resolved_child;

		// filter_locators
		// get all children of the current term to be used to count the indexations of the term
		// Used to get all callers of a term and its children together.
		// In TCHI, show all objects(TCH) related to all statigraphic units (children of the current sector) into the sector (current term).
		// see `hierarchy44`
			if (isset($section_list_thesaurus_item->show_data)) {

				// filter_by_locator
					$filter_by_locator = new locator();
						$filter_by_locator->set_section_tipo($this->section_tipo);
						$filter_by_locator->set_section_id($this->section_id);

				// sqo
					$sqo = new search_query_object();
						$sqo->set_section_tipo([$this->section_tipo]);
						$sqo->set_limit(0);
						$sqo->set_offset(0);
						$sqo->set_filter_by_locators([$filter_by_locator]);
						$sqo->set_children_recursive(true);

				// search
					// This search is for resolve children recursively
					// Store same sqo search to prevent duplicate queries
					$hash = md5(json_encode($sqo));
					if (isset($resolved_child[$hash])) {
						// return from cache
						$ar_records = $resolved_child[$hash];
					}else{
						$search = search::get_instance(
							$sqo // object sqo
						);
						$db_result	= $search->search();
						$ar_records	= $db_result->fetch_all();

						// cache
						$resolved_child[$hash] = $ar_records;
					}

				// relation_type is used to filter in relations
				$relation_type = $component->get_relation_type();

				$filter_locators = [];
				foreach ($ar_records as $current_row) {

					// filter_locator
					$filter_locator = new locator();
						$filter_locator->set_type( $relation_type ); // as dd96
						$filter_locator->set_section_tipo($current_row->section_tipo);
						$filter_locator->set_section_id($current_row->section_id);

					$filter_locators[] = $filter_locator;
				}
			}//end if (isset($section_list_thesaurus_item->show_data))

		// count_data_group_by. Get the total sections that are calling and the totals of every specific section
			$count_data_group_by = $component->count_data_group_by(
				['section_tipo'],
				$filter_locators ?? null
			);


		return $count_data_group_by;
	}//end get_count_data_group_by



	/**
	* IS_ONTOLOGY
	* Checks if current context is in ontology or in thesaurus
	* as boolean based on $this->options->area_model set on construct.
	* @return bool
	*/
	public function is_ontology() : bool {
		$area_model = $this->options->area_model ?? null;

		return $area_model==='area_ontology';
	}//end is_ontology



	# ACCESSORS
	final public function __call(string $strFunction, array $arArguments) {

		$strMethodType 		= substr($strFunction, 0, 4); # like set or get_
		$strMethodMember 	= substr($strFunction, 4);
		switch($strMethodType) {
			case 'set_' :
				if(!isset($arArguments[0])) return(false);	#throw new Exception("Error Processing Request: called $strFunction without arguments", 1);
				return($this->SetAccessor($strMethodMember, $arArguments[0]));
				break;
			case 'get_' :
				return($this->GetAccessor($strMethodMember));
				break;
		}
		return(false);
	}
	# SET
	final protected function SetAccessor(string $strMember, $strNewValue) : bool {

		if(property_exists($this, $strMember)) {

			// fix value
			$this->$strMember = $strNewValue;

			return true;
		}else{
			return false;
		}
	}
	# GET
	final protected function GetAccessor(string $strMember) {

		return property_exists($this, $strMember)
			? $this->$strMember
			: false;
	}//end GetAccessor



}//end class ts_object
