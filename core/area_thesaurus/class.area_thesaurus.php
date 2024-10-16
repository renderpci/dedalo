<?php
/**
* AREA_THESAURUS
* Manage whole thesaurus hierarchies
*
*/
class area_thesaurus extends area_common {



	/**
	* CLASS VARS
	* @var
	*/
	static $typologies_section_tipo	= DEDALO_HIERARCHY_TYPES_SECTION_TIPO; // 'hierarchy13'
	static $typologies_name_tipo	= DEDALO_HIERARCHY_TYPES_NAME_TIPO;	// 'hierarchy16'

	// Default vars for use in thesaurus mode (set GET['model']=true to change this vars in runtime)
	protected $model_view = false;

	// thesaurus_mode
	public $thesaurus_mode = null;



	/**
	* GET_SECTION_TIPO
	* @return string $section_tipo
	*/
	public function get_section_tipo() : string {

		$section_tipo = DEDALO_THESAURUS_TIPO; // 'dd100'

		return $section_tipo;
	}//end get_section_tipo



	/**
	* GET_HIERARCHY_TYPOLOGIES
	* Get an array of all section_id from records of current section
	* @return array $hierarchy_typologies
	*/
	public function get_hierarchy_typologies() : array {

		$hierarchy_typologies = section::get_ar_all_section_records_unfiltered(
			area_thesaurus::$typologies_section_tipo
		);

		return $hierarchy_typologies;
	}//end get_hierarchy_typologies



	/**
	* GET_HIERARCHY_SECTIONS
	* @param array|null $hierarchy_types_filter = null
	* @param array|null $hierarchy_sections_filter = null
	* @param bool $terms_are_model = false
	* 	This param comes from rqo->source->build_options->terms_are_model sent by the client from
	* 	area_thesaurus when building and self.thesaurus_view_mode==='model'
	* @return array $ar_items
	*/
	public function get_hierarchy_sections( ?array $hierarchy_types_filter=null, ?array $hierarchy_sections_filter=null, bool $terms_are_model=false ) : array {

		$hierarchy_target_section_tipo	= $terms_are_model ? DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO : DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
		$hierarchy_children_tipo		= $terms_are_model ? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO 		: DEDALO_HIERARCHY_CHILDREN_TIPO;

		// get all hierarchy sections
			$ar_records = area_thesaurus::get_active_and_visible_hierarchy_sections();

		$ar_items = [];
		foreach ($ar_records as $row) {

			// typology data
				$typology_data = $this->get_typology_data($row->section_id);
				if (empty($typology_data)) {
					debug_log(__METHOD__." Skipped hierarchy without defined typology. section_id: $row->section_id ", logger::WARNING);
					continue; // Skip
				}

			// Skip filtered types when defined
				if (!empty($hierarchy_types_filter) && !in_array($typology_data->section_id, $hierarchy_types_filter)) {
					continue; // Skip
				}

			// hierarchy target section tipo
				$model			= RecordObj_dd::get_modelo_name_by_tipo($hierarchy_target_section_tipo,true);
				$target_section	= component_common::get_instance(
					$model,
					$hierarchy_target_section_tipo,
					$row->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$row->section_tipo
				);
				$target_section_tipo_dato	= $target_section->get_dato();
				$target_section_tipo		= $target_section_tipo_dato[0] ?? null;
				if (empty($target_section_tipo)) {
					debug_log(__METHOD__
						." Skipped row $row->section_id with empty target_section_tipo ".$row->section_id
						, logger::WARNING
					);
					continue; // Skip
				}

			// Skip filtered sections when defined
				if (!empty($hierarchy_sections_filter) && !in_array($target_section_tipo, $hierarchy_sections_filter)) {
					continue; // Skip
				}

			// hierarchy target section name
				$model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TERM_TIPO,true);
				$hierarchy_section_name = component_common::get_instance(
					$model,
					DEDALO_HIERARCHY_TERM_TIPO,
					$row->section_id,
					'list',
					DEDALO_DATA_LANG,
					$row->section_tipo
				);
				$target_section_name = $hierarchy_section_name->get_valor();
				if (empty($target_section_name)) {
					$target_section_name = $this->get_hierarchy_name( $row->section_id );
				}

			// hierarchy order
				$model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_ORDER_TIPO,true);
				$hierarchy_section_order = component_common::get_instance(
					$model,
					DEDALO_HIERARCHY_ORDER_TIPO,
					$row->section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$row->section_tipo
				);
				$hierarchy_target_order_dato	= $hierarchy_section_order->get_dato();
				$hierarchy_target_order_value	= $hierarchy_target_order_dato[0] ?? 0;

			// item
				$item = new stdClass();
					$item->section_id			= $row->section_id;
					$item->section_tipo			= $row->section_tipo;
					$item->target_section_tipo	= $target_section_tipo;
					$item->target_section_name	= $target_section_name;
					$item->typology_section_id	= $typology_data->section_id;
					$item->order				= $hierarchy_target_order_value;
					$item->type					= 'hierarchy';
					$item->children_tipo		= $hierarchy_children_tipo;

			$ar_items[] = $item;
		}//end foreach ($ar_records as $key => $row)


		return $ar_items;
	}//end get_hierarchy_sections



	/**
	* GET_ACTIVE_and_visible_HIERARCHY_SECTIONS
	* @return array $ar_records
	*/
	public static function get_active_and_visible_hierarchy_sections() : array {

		$section_tipo		= DEDALO_HIERARCHY_SECTION_TIPO; // hierarchy1
		$active_tipo		= DEDALO_HIERARCHY_ACTIVE_TIPO; // hierarchy4
		$order_tipo			= DEDALO_HIERARCHY_ORDER_TIPO; // hierarchy48
		$active_in_ts_tipo	= DEDALO_HIERARCHY_ACTIVE_IN_THESAURUS_TIPO; //hierarchy125

		$search_query_object = json_decode('{
			"id": "thesaurus",
			"section_tipo": ["'.$section_tipo.'"],
			"limit": 0,
			"full_count": false,
			"filter": {
				"$and": [
					{
						"q": {"section_id":"1","section_tipo":"dd64","type":"dd151","from_component_tipo":"'.$active_tipo.'"},
						"path": [
							{
								"name": "Active",
								"model": "component_radio_button",
								"section_tipo": "'.$section_tipo.'",
								"component_tipo": "'.$active_tipo.'"
							}
						]
					},
					{
						"q": {"section_id":"1","section_tipo":"dd64","type":"dd151","from_component_tipo":"'.$active_in_ts_tipo.'"},
						"path": [
							{
								"name": "Active",
								"model": "component_radio_button",
								"section_tipo": "'.$section_tipo.'",
								"component_tipo": "'.$active_in_ts_tipo.'"
							}
						]
					}
				]
			},
			"order": [
				{
					"direction": "ASC",
					"path": [
						{
							"name": "Order",
							"model": "component_number",
							"section_tipo": "'.$section_tipo.'",
							"component_tipo": "'.$order_tipo.'"
						}
					]
				}
			]
		}');

		$search = search::get_instance($search_query_object);
		$result = $search->search();

		$ar_records = $result->ar_records;

		return $ar_records;
	}//end get_active_and_visible_hierarchy_sections



	/**
	* GET_TYPOLOGY_DATA
	* @param int|string int|string $section_id
	* @return object|null $locator
	*/
	public function get_typology_data( int|string $section_id ) : ?object {

		$tipo			= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // 'hierarchy9' component_select
		$section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO; // hierarchy1
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component		= component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$section_tipo
		);

		$dato		= $component->get_dato();
		$locator	= $dato[0] ?? null;

		return $locator;
	}//end get_typology_data



	/**
	* GET_TYPOLOGY_NAME
	* Resolve typology name from section_id
	* @param int $typology_section_id
	* @return string $typology_name
	*/
	public function get_typology_name( int $typology_section_id ) : string {

		// cache Store for speed
			static $typology_names;
			if (isset($typology_names[$typology_section_id])) {
				return $typology_names[$typology_section_id];
			}

		// component
			$tipo			= DEDALO_HIERARCHY_TYPES_NAME_TIPO;
			$model_name		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
			$parent			= $typology_section_id;
			$mode			= 'list';
			$lang			= DEDALO_DATA_LANG;
			$section_tipo	= area_thesaurus::$typologies_section_tipo;

			$component		= component_common::get_instance(
				$model_name,
				$tipo,
				$parent,
				$mode,
				$lang,
				$section_tipo
			);
			$value = $component->get_valor($lang);

		$typology_name = empty($value)
			? component_common::extract_component_value_fallback($component)
			: $value;

		if (empty($typology_name)) {
			$typology_name = 'Typology untranslated ' . $tipo .' '. $parent;
		}

		// cache. Store for speed
		$typology_names[$typology_section_id] = $typology_name;


		return $typology_name;
	}//end get_typology_name



	/**
	* GET_TYPOLOGY_ORDER
	* @param int|string $typology_section_id
	* @return int $order_value
	*/
	public function get_typology_order($typology_section_id) : int {

		// cache. Store for speed
			static $typology_order_values;
			if (isset($typology_order_values[$typology_section_id])) {
				return $typology_order_values[$typology_section_id];
			}

		$tipo			= DEDALO_HIERARCHY_TYPES_ORDER;
		$model_name		= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent			= $typology_section_id;
		$mode			= 'list';
		$lang			= DEDALO_DATA_LANG;
		$section_tipo	= area_thesaurus::$typologies_section_tipo;
		$component		= component_common::get_instance(
			$model_name,
			$tipo,
			$parent,
			$mode,
			$lang,
			$section_tipo
		);
		$dato			= $component->get_dato();
		$order_value	= $dato[0] ?? 0;

		// cache
			$typology_order_values[$typology_section_id] = $order_value;


		return (int)$order_value;
	}//end get_typology_order



	/**
	* GET_HIERARCHY_NAME
	* @param string|int $hierarchy_section_id
	* @return string $hierarchy_name
	*/
	public function get_hierarchy_name( $hierarchy_section_id ) : string {

		# Store for speed
		static $hierarchy_names;
		if (isset($hierarchy_names[$hierarchy_section_id])) {
			return $hierarchy_names[$hierarchy_section_id];
		}


		$tipo 			 = DEDALO_HIERARCHY_TERM_TIPO;
		$model_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent 		 = $hierarchy_section_id;
		$mode 			 = 'list';
		$lang 			 = DEDALO_DATA_LANG;
		$section_tipo 	 = DEDALO_HIERARCHY_SECTION_TIPO;

		$component 		 = component_common::get_instance(
			$model_name,
			$tipo,
			$parent,
			$mode,
			$lang,
			$section_tipo
		);
		$value = $component->get_valor($lang);

		if (empty($value)) {
			$hierarchy_name = component_common::extract_component_value_fallback($component);
		}else{
			$hierarchy_name = $value;
		}

		if (empty($hierarchy_name)) {
			$hierarchy_name = 'Hierarchy untranslated ' . $tipo .' '. $parent;
		}

		# Store for speed
		$hierarchy_names[$hierarchy_section_id] = $hierarchy_name;


		return (string)$hierarchy_name;
	}//end get_hierarchy_name



	/**
	* GET_OPTIONS_FOR_SEARCH_HIERARCHIES
	* @param string $typology_section_tipo
	* @param int|string $typology_section_id
	* @return object $options
	*/
	public static function get_options_for_search_hierarchies( string $typology_section_tipo, $typology_section_id ) : object {

		$section_tipo 	= DEDALO_HIERARCHY_SECTION_TIPO;
		$matrix_table   = common::get_matrix_table_from_tipo($section_tipo);

		# LAYOUT_MAP
		# Build a custom layout map with our needs
		$layout_map=array();
		$layout_map[DEDALO_HIERARCHY_SECTION_TIPO] = array(
			DEDALO_HIERARCHY_TYPOLOGY_TIPO,
			DEDALO_HIERARCHY_TLD2_TIPO,
			DEDALO_HIERARCHY_TERM_TIPO,
			DEDALO_HIERARCHY_TARGET_SECTION_TIPO,
			DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO
			);

			# DEDALO_HIERARCHY_CHILDREN_TIPO
			# DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO
			# DEDALO_HIERARCHY_ORDER_TIPO,
			# DEDALO_HIERARCHY_ACTIVE_TIPO,
			# DEDALO_HIERARCHY_LANG_TIPO,

		# FILTER_BY_SEARCH . Uses a search similar as sections do
		$filter_by_search = new stdClass();

			# Locator 'YES'
			$locator = new locator();
				$locator->set_section_tipo(DEDALO_SECTION_SI_NO_TIPO);
				$locator->set_section_id(NUMERICAL_MATRIX_VALUE_YES);
			$locator_json = json_encode($locator);
			# Add to filter
			$filter_by_search->{$section_tipo.'_'.DEDALO_HIERARCHY_ACTIVE_TIPO} = (string)$locator_json;

			# Locator 'filter section'
			$locator = new locator();
				$locator->set_section_tipo($typology_section_tipo);
				$locator->set_section_id($typology_section_id);
			$locator_json = json_encode($locator);
			# Add to filter
			$filter_by_search->{$section_tipo.'_'.DEDALO_HIERARCHY_TYPOLOGY_TIPO} = (string)$locator_json;

		# OPTIONS SEARCH . Prepares options to get search
		$options = new stdClass();
			$options->section_tipo					= $section_tipo;
			$options->section_real_tipo				= $section_tipo;
			$options->matrix_table					= $matrix_table;
			$options->layout_map					= $layout_map;
			$options->layout_map_list				= $options->layout_map;
			$options->offset_list					= 0;
			$options->limit							= null; // Not limit amount of results (use null)
			$options->filter_by_search				= $filter_by_search;
			#$options->filter_custom				= $filter_custom;
			$options->mode							= 'list_thesaurus';
			$options->context						= null;
			$options->tipo_de_dato					= 'dato';
			#$options->order_by						= "a.datos#>'{components, ".DEDALO_HIERARCHY_ORDER_TIPO.", dato, lg-nolan}' ASC";
			$options->order_by						= DEDALO_HIERARCHY_ORDER_TIPO." ASC";
			$options->search_options_session_key	= 'area_thesaurus';


		return $options;
	}//end get_options_for_search_hierarchies



	/**
	* SEARCH_THESAURUS
	* @param object $search_query_object
	* @return object $response
	*/
	public function search_thesaurus(object $search_query_object) : object {
		$start_time = start_time();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';

		// terms_are_model. This value comes from rqo->source->build_options->terms_are_model
			// sent by the client from area_thesaurus when building and self.thesaurus_view_mode==='model'
			$terms_are_model				= $this->build_options->terms_are_model ?? false;
			$hierarchy_from_component_tipo	= $terms_are_model
				? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO
				: DEDALO_HIERARCHY_CHILDREN_TIPO;

		// Search records
			$search			= search::get_instance($search_query_object);
			$search_result	= $search->search();
			$ar_records		= $search_result->ar_records;

		// ar_path_mix . Calculate full path of each result
			$ar_path_mix = array();
			foreach ($ar_records as $row) {

				$section_tipo	= $row->section_tipo;
				$section_id		= $row->section_id;

				// properties children_search check (case rsc197 persons)
					$RecordObj_dd		= new RecordObj_dd($section_tipo);
					$section_properties	= $RecordObj_dd->get_properties();

					switch (true) {
						case (!empty($section_properties) && isset($section_properties->children_search)):

							// defined section properties 'children_search' case

							$ar_path = [];

							// root locator
							$root_locator	= self::get_root_locator($section_tipo);
							$ar_path[]		= $root_locator;
							break;

						default:

							// default case

							$ar_parents = component_relation_parent::get_parents_recursive(
								$section_id,
								$section_tipo,
								(object)[
									'skip_root'						=> false,
									'hierarchy_from_component_tipo'	=> $hierarchy_from_component_tipo,
									'search_in_main_hierarchy'		=> true
								]
							);
							// add
							$ar_path = array_reverse($ar_parents);
							break;
					}//end switch (true)

				// add self at end
					$locator = new locator();
						$locator->set_section_tipo($section_tipo);
						$locator->set_section_id($section_id);
					$ar_path[] = $locator;

				$ar_path_mix[] = $ar_path;
			}

		// AR_DATA_COMBINED
			$ar_data_combined = $this->combine_ar_data($ar_path_mix);

		// result. Walk ar_data
			$result = self::walk_hierarchy_data($ar_data_combined);

		// total_records count
			$total_records = count($ar_records);

		// response
			$response->msg		= 'Records found: ' . $total_records;
			$response->result	= $result;
			$response->total	= $total_records;

		// debug
			if(SHOW_DEBUG===true) {
				$response->strQuery = $search_result->strQuery;
				$response->debug[] = exec_time_unit($start_time);
			}


		return $response;
	}//end search_thesaurus



	/**
	* GET_ROOT_LOCATOR
	* Builds a root locator from section_tipo
	* searching hierarchy with target section tipo match
	* and return a standard locator
	* @param string $section_tipo
	* @return object locator $root_locator
	*/
	public static function get_root_locator(string $section_tipo) : locator {

		static $hierarchy_section_id = [];

		// root locator. Calculate once from current section_tipo
		if (!isset($hierarchy_section_id[$section_tipo])) {
			$hierarchy_section_id[$section_tipo] = hierarchy::get_hierarchy_section(
				$section_tipo,
				DEDALO_HIERARCHY_TARGET_SECTION_TIPO
			);
		}

		// root_locator
		$root_locator = new locator();
			$root_locator->section_tipo	= DEDALO_HIERARCHY_SECTION_TIPO; // 'hierarchy1'
			$root_locator->section_id	= $hierarchy_section_id[$section_tipo];


		return $root_locator;
	}//end get_root_locator



	/**
	* COMBINE_AR_DATA
	* Build a global array hierarchized with all elements
	* @param array $ar_path_mix
	* @return array $ar_combine
	*/
	public static function combine_ar_data( array $ar_path_mix ) : array {

		/*
			REFERENCE ar_simple
			Simplify array keys

			[0] => ts1_65
            [1] => ts1_73
            [2] => ts1_74
        */
		$ar_simple=array();	foreach ($ar_path_mix as $key => $ar_value) {
			foreach ($ar_value as $i => $locator) {
				$ckey = $locator->section_tipo.'_'.$locator->section_id;
				$ar_simple[$key][$i] = $ckey;
			}
		}
		#dump($ar_simple, ' ar_simple ++ '.to_string());
		#return $ar_simple;

		// REFERENCE ar_hierarchy
			// Hierarchize the simple plain array in revere order
			// [0] => Array
			//       (
			//           [ts1_65] => Array
			//               (
			//                   [ts1_73] => Array
			//                       (
			//                           [ts1_74] => Array
			//                               (
			//                               )
			//                       )
			//               )
			//       )
			//    [1] => Array
			//        (
			//            [ts1_65] => Array
			//                (
			//                    [ts1_66] => Array
			//                        (
			//                            [ts1_67] => Array
			//                                (
			//                                )
			//                        )
			//                )
			//        )
			//    )

		$ar_hierarchy=array(); foreach ($ar_simple as $key => $ar_value) {
			# iterate array values in reverse order
			foreach (array_reverse($ar_value) as $ckey => $cvalue) {


				if(empty($ar_hierarchy[$key])) {
					// Último elemento (estará vacío porque es el que estamos buscando)
					$ar_hierarchy[$key][$cvalue] = array();

				}else{
					// Elementos intermendios descendentes
					$ar_hierarchy[$key] = array($cvalue => $ar_hierarchy[$key]);


					# Add siblings
					/*
					if (strpos($cvalue, 'hierarchy')===false) {
						$ar_children = area_thesaurus::get_siblings($cvalue, $ar_value);
						if(!empty($ar_children)) foreach ($ar_children as $s_key => $s_value) {
							$ar_hierarchy[$key][$cvalue][$s_key]	= array();
						}
					}
					*/
				}
			}
		}
		#dump($ar_hierarchy, ' ar_hierarchy ++ '.to_string()); die();


		// REFERENCE ar_combine
			// Combines hierarchized arrays to obtain one global array with combined values

			// [ts1_65] => Array
			//       (
			//           [ts1_73] => Array
			//               (
			//                   [ts1_74] => Array
			//                       (
			//                       )
			//               )
			//           [ts1_66] => Array
			//               (
			//                   [ts1_67] => Array
			//                       (
			//                       )
			//               )
			//       )

		$ar_combine=array(); foreach ($ar_hierarchy as $key => $ar_value) {
			$ar_combine = array_merge_recursive($ar_combine, $ar_value);
		}


		return (array)$ar_combine;
	}//end combine_ar_data



	/**
	* GET_SIBLINGS
	* @param string $ckey
	* @return array $ar_siblings
	*/
	public static function get_siblings(string $ckey) : array {

		$ar_parts 		= explode('_', $ckey);
		$section_tipo 	= $ar_parts[0];
		$section_id 	= $ar_parts[1];

		$tipo 			= DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO;
		$model_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true); // 'component_relation_children';
		$mode 			= 'list';
		$component_relation_children = component_common::get_instance(
			$model_name,
			$tipo,
			$section_id,
			$mode,
			DEDALO_DATA_NOLAN,
			$section_tipo
		);
		$dato = $component_relation_children->get_dato();

		$ar_siblings = array();
		foreach ((array)$dato as $s_locator) {
			if ($s_locator->section_id==$section_id && $s_locator->section_tipo===$section_tipo) {
				# exclude
			}else{
				$ar_siblings[$s_locator->section_tipo.'_'.$s_locator->section_id] = array();
			}
		}


		return (array)$ar_siblings;
	}//end get_siblings



	/**
	* WALK_HIERARCHY_DATA
	* Walk recursively $ar_data_combined resolving ts_object and add children as 'heritage'
	* @param array $ar_data_combined
	* Sample assoc array:
	* [
	* 	"ts1_1" => {
	* 		"ts1_258": []
	* 		"ts1_259": []
	* 	}
	* ]
	* @return array $ar_mix
	*/
	public static function walk_hierarchy_data( array $ar_data_combined ) : array {

		$ar_mix = array();
		foreach ($ar_data_combined as $key => $ar_values) {

			// Parent
			$ar_parts				= explode('_', $key);
			$current_section_tipo	= $ar_parts[0];
			$current_section_id		= $ar_parts[1];
			$ts_object				= new ts_object($current_section_id, $current_section_tipo);
			$child_data				= $ts_object->get_child_data();

			# Add to array
			$ar_mix[$key] = $child_data;

			# Add children in container heritage
			if (!empty($ar_values)) {
				$ar_mix[$key]->heritage = self::walk_hierarchy_data( $ar_values );
			}
		}


		return $ar_mix;
	}//end walk_hierarchy_data



	/**
	* GET_HIERARCHY_TERMS_SQO
	* @param array $hierarchy_terms
	* @return object $sqo
	* 	Full Search query object
	*/
	public function get_hierarchy_terms_sqo(array $hierarchy_terms) : object {

		#
		# FILTER_CUSTOM. hierarchy_terms
		$filter_custom = null;


		// Reset $ar_section_tipos to use only filter sections
			$ar_section_tipos = [];

			$filter_custom = new stdClass();

			$filter_custom->{OP_OR} = [];

			$path = new stdClass();
				$path->component_tipo	= 'hierarchy22';
				$path->model			= 'component_section_id';
				$path->name				= 'Id';

			$path_section = new stdClass();
				$path_section->model	= 'section';
				$path_section->name		= 'Section tipo column';

		// hierarchy_terms
			foreach ($hierarchy_terms as $current_term) {
				foreach ($current_term->value as $item) {

					$current_section_tipo	= $item->section_tipo;
					$current_section_id		= $item->section_id;

					# Update path section tipo
					$path->section_tipo		= $current_section_tipo;

					# Add to ar_section_tipos
					$ar_section_tipos[] = $current_section_tipo;

					$filter_item = new stdClass();
						$filter_item->q		= $current_section_id;
						$filter_item->path	= [$path];

					$filter_item_section = new stdClass();
						$filter_item_section->q		= $current_section_tipo;
						$filter_item_section->path	= [$path_section];

					$group = new stdClass();
						$group->{OP_AND} = [$filter_item, $filter_item_section];

					$filter_custom->{OP_OR}[] = $group;

				}
			}

			# SEARCH_QUERY_OBJECT . Add search_query_object to options
			$search_query_object = new search_query_object();
				$search_query_object->id			= 'thesaurus';
				$search_query_object->section_tipo	= $ar_section_tipos;
				$search_query_object->limit			= 100;
				$search_query_object->filter		= isset($filter_custom) ? $filter_custom : null;
				$search_query_object->select		= [];


		return $search_query_object;
	}//end get_hierarchy_terms_sqo



}//end area_thesaurus
