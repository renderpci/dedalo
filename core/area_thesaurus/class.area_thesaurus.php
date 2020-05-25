<?php
/**
* AREA_THESAURUS
* Manage whole thesaurus hierarchies
*
*/
class area_thesaurus extends area_common {


	static $typologies_section_tipo = DEDALO_HIERARCHY_TYPES_SECTION_TIPO; // 'hierarchy13'
	static $typologies_name_tipo 	= DEDALO_HIERARCHY_TYPES_NAME_TIPO;	// 'hierarchy16'

	# Default vars for use in thesaurus mode (set GET['model']=true to change this vars in runtime)
	protected $model_view 			= false;
	// protected $target_section_tipo 		= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
	// protected $hierarchy_children_tipo	= DEDALO_HIERARCHY_CHILDREN_TIPO;

	public $build_options			= null;
	public $search_action 			= null;


	/**
	* GET_SECTION_TIPO
	* @return array $section_tipo
	*/
		// public function get_section_tipo() {

		// 	$hierarchy_sections = $this->get_hierarchy_sections(); // $this->get_data_items();

		// 	$section_tipo = array_map(function($item){

		// 		return $item->target_section_tipo;

		// 	}, $hierarchy_sections);

		// 	return $section_tipo;
		// }//end get_section_tipo



	/**
	* GET_HIERARCHY_TYPOLOGIES
	* @return array $active_hierarchies
	*/
	public function get_hierarchy_typologies() {

		$hierarchy_typologies = section::get_ar_all_section_records_unfiltered( area_thesaurus::$typologies_section_tipo );

		return (array)$hierarchy_typologies;
	}//end get_hierarchy_typologies



	/**
	* GET_HIERARCHY_SECTIONS
	* @return array $ar_items
	*/
	public function get_hierarchy_sections($hierarchy_types_filter=null, $hierarchy_sections_filter=null, $terms_are_model=false) {

		$hierarchy_target_section_tipo 	= $terms_are_model ? DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO : DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
		$hierarchy_children_tipo 		= $terms_are_model ? DEDALO_HIERARCHY_CHILDREN_MODEL_TIPO 		: DEDALO_HIERARCHY_CHILDREN_TIPO;

		$ar_records = area_thesaurus::get_active_hierarchy_sections();

		$ar_items = [];
		$ar_tipologies = [];
		foreach ($ar_records as $key => $row) {

			// typology data
			$typology_data = $this->get_typology_data($row->section_id);
			# Skip filtered types when defined
			if (!empty($hierarchy_types_filter) && !in_array($typology_data->section_id, $hierarchy_types_filter)) {
				continue; // Skip
			}

			//hierarchy target section tipo
			$model = RecordObj_dd::get_modelo_name_by_tipo($hierarchy_target_section_tipo,true);
			$target_section = component_common::get_instance($model,
															 $hierarchy_target_section_tipo,
															 $row->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $row->section_tipo);
			$target_section_tipo_dato = $target_section->get_dato();
			$target_section_tipo = reset($target_section_tipo_dato);

			if (empty($target_section_tipo)) {
				debug_log(__METHOD__." Skipped row $row->section_id with empty target_section_tipo ".$row->section_id, logger::WARNING);
				continue; // Skip
			}

			# Skip filtered sections when defined
			if (!empty($hierarchy_sections_filter) && !in_array($target_section_tipo, $hierarchy_sections_filter)) {
				continue; // Skip
			}

			//hierarchy target section name
			$model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TERM_TIPO,true);
			$hierarchy_section_name = component_common::get_instance($model,
															 DEDALO_HIERARCHY_TERM_TIPO,
															 $row->section_id,
															 'list',
															 DEDALO_DATA_LANG,
															 $row->section_tipo);
			$target_section_name = $hierarchy_section_name->get_valor();

			if (empty($target_section_name)) {
				$target_section_name = $this->get_hierarchy_name( $row->section_id );
			}

			//hierarchy order
			$model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_ORDER_TIPO,true);
			$hierarchy_section_order = component_common::get_instance($model,
															 DEDALO_HIERARCHY_ORDER_TIPO,
															 $row->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $row->section_tipo);
			$hierarchy_target_order_dato 	= $hierarchy_section_order->get_dato();
			$hierarchy_target_order_value 	= reset($hierarchy_target_order_dato);


			$item = new stdClass();
				$item->section_id 				= $row->section_id;
				$item->section_tipo 			= $row->section_tipo;
				$item->target_section_tipo		= $target_section_tipo;
				$item->target_section_name		= $target_section_name;
				$item->typology_section_id		= $typology_data->section_id;
				$item->order 					= $hierarchy_target_order_value;
				$item->type						= 'hierarchy';
				$item->children_tipo			= $hierarchy_children_tipo;

			$ar_items[] = $item;
		}//end foreach ($ar_records as $key => $row)
		#dump($ar_items, ' ar_items ++ '.to_string());

		return $ar_items;
	}//end get_hierarchy_sections



	/**
	* GET_ACTIVE_HIERARCHY_SECTIONS
	* @return array $ar_records
	*/
	public static function get_active_hierarchy_sections() {

		$search_query_object = json_decode('{
		  "id": "thesaurus",
		  "section_tipo": ["hierarchy1"],
		  "limit": 0,
		  "full_count": false,
		  "filter": {
		    "$and": [
		      {
		        "q": "{\"section_id\":\"1\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"hierarchy4\"}",
		        "path": [
		          {
		            "section_tipo": "hierarchy1",
		            "component_tipo": "hierarchy4",
		            "modelo": "component_radio_button",
		            "name": "Active"
		          }]
		      }
		    ]
		  },
		  "order": [
	        {
	            "direction": "ASC",
	            "path": [
	                {
	                    "name": "Orden",
	                    "modelo": "component_number",
	                    "section_tipo": "hierarchy1",
	                    "component_tipo": "hierarchy48"
	                }
	            ]
	        }
	    ]
		}');

		$search = search::get_instance($search_query_object);
		$result = $search->search();

		$ar_records = $result->ar_records;

		return $ar_records;
	}//end get_active_hierarchy_sections



	/**
	* GET_TYPOLOGY_DATA
	* @return string $typology_name
	*/
	public function get_typology_data( $section_id ) {

		$tipo 			= DEDALO_HIERARCHY_TYPOLOGY_TIPO; // 'hierarchy9' component_select
		$section_tipo 	= DEDALO_HIERARCHY_SECTION_TIPO; // hierarchy1
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$component 		= component_common::get_instance($modelo_name,
														 $tipo,
														 $section_id,
														 'list',
														 DEDALO_DATA_NOLAN,
														 $section_tipo);
		$dato 	 = $component->get_dato();

		$locator = reset($dato);

		return $locator;
	}//end get_typology_data



	/**
	* GET_TYPOLOGY_NAME
	* @return string $typology_name
	*/
	public function get_typology_name( $typology_section_id ) {

		# Store for speed
		static $typology_names;
		if (isset($typology_names[$typology_section_id])) {
			return $typology_names[$typology_section_id];
		}

		$tipo 			 = DEDALO_HIERARCHY_TYPES_NAME_TIPO;
		$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent 		 = $typology_section_id;
		$modo 			 = 'list';
		$lang 			 = DEDALO_DATA_LANG;
		$section_tipo 	 = area_thesaurus::$typologies_section_tipo;

		$component 		 = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);
		$value = $component->get_valor($lang);

		if (empty($value)) {
			$typology_name = component_common::extract_component_value_fallback($component);
		}else{
			$typology_name = $value;
		}

		if (empty($typology_name)) {
			$typology_name = 'Typology unstranslated ' . $tipo .' '. $parent;
		}

		# Store for speed
		$typology_names[$typology_section_id] = $typology_name;

		return (string)$typology_name;
	}//end get_typology_name



	/**
	* GET_TYPOLOGY_ORDER
	* @return
	*/
	public function get_typology_order($typology_section_id) {

		# Store for speed
		static $typology_names;
		if (isset($typology_names[$typology_section_id])) {
			return $typology_names[$typology_section_id];
		}

		$tipo 			 = DEDALO_HIERARCHY_TYPES_ORDER;
		$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent 		 = $typology_section_id;
		$modo 			 = 'list';
		$lang 			 = DEDALO_DATA_LANG;
		$section_tipo 	 = area_thesaurus::$typologies_section_tipo;

		$component 		 = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);
		$dato = $component->get_dato();
		$value = reset($dato);

		return (int)$value;
	}//end get_typology_order



	/**
	* GET_HIERARCHY_NAME
	* @return string $hierarchy_name
	*/
	public function get_hierarchy_name( $hierarchy_section_id ) {

		# Store for speed
		static $hierarchy_names;
		if (isset($hierarchy_names[$hierarchy_section_id])) {
			return $hierarchy_names[$hierarchy_section_id];
		}


		$tipo 			 = DEDALO_HIERARCHY_TERM_TIPO;
		$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent 		 = $hierarchy_section_id;
		$modo 			 = 'list';
		$lang 			 = DEDALO_DATA_LANG;
		$section_tipo 	 = DEDALO_HIERARCHY_SECTION_TIPO;

		$component 		 = component_common::get_instance($modelo_name,
														  $tipo,
														  $parent,
														  $modo,
														  $lang,
														  $section_tipo);
		$value = $component->get_valor($lang);

		if (empty($value)) {
			$hierarchy_name = component_input_text::render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo);
		}else{
			$hierarchy_name = $value;
		}

		if (empty($hierarchy_name)) {
			$hierarchy_name = 'Hierarchy unstranslated ' . $tipo .' '. $parent;
		}

		# Store for speed
		$hierarchy_names[$hierarchy_section_id] = $hierarchy_name;

		return (string)$hierarchy_name;
	}//end get_hierarchy_name



	/**
	* GET_OPTIONS_FOR_SEARCH_HIERARCHIES
	* @return object $options
	*/
	public static function get_options_for_search_hierarchies( $typology_section_tipo, $typology_section_id ) {

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
				#dump($locator_json, ' locator ++ '.to_string(DEDALO_HIERARCHY_TYPOLOGY_TIPO));

		# OPTIONS SEARCH . Prepares options to get search
		$options = new stdClass();
			$options->section_tipo 		= $section_tipo;
			$options->section_real_tipo = $section_tipo;
			$options->matrix_table 		= $matrix_table;
			$options->layout_map 		= $layout_map;
			$options->layout_map_list 	= $options->layout_map;
			$options->offset_list 		= 0;
			$options->limit 			= null; // Not limit amount of results (use null)
			$options->filter_by_search	= $filter_by_search;
			#$options->filter_custom 	= $filter_custom;
			$options->modo 				= 'list_thesaurus';
			$options->context 			= null;
			$options->tipo_de_dato 		= 'dato';
			#$options->order_by	 		= "a.datos#>'{components, ".DEDALO_HIERARCHY_ORDER_TIPO.", dato, lg-nolan}' ASC";
			$options->order_by	 		= DEDALO_HIERARCHY_ORDER_TIPO." ASC";
			$options->search_options_session_key = 'area_thesaurus';
				#dump($options, ' options ++ '.to_string());

		return (object)$options;
	}//end get_options_for_search_hierarchies



	/**
	* SEARCH_THESAURUS
	* @return object $response
	*/
	public function search_thesaurus($search_query_object) {
	dump($search_query_object, ' search_query_object ++ '.to_string());
		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		# Search records
			$search 		= search::get_instance($search_query_object);
			$search_result  = $search->search();
			$ar_records 	= $search_result->ar_records;
				#dump($ar_records, ' ar_records ++ '.to_string()); die();

		# ar_path_mix . Calculate full path of each result
		$ar_path_mix = array();
		foreach ($ar_records as $key => $row) {

			$section_tipo = $row->section_tipo;
			$section_id   = $row->section_id;

			$ar_parents = component_relation_parent::get_parents_recursive($section_id, $section_tipo, false);
				#dump($ar_parents, ' ar_parents ++ '.to_string("$section_id, $section_tipo")); die();

			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);

			$ar_path   = array_reverse($ar_parents);
			$ar_path[] = $locator; // add self at end

			$ar_path_mix[] = $ar_path;
		}
		# Root parents
		if(SHOW_DEBUG===true) {
			#dump($ar_path_mix, ' ar_path_mix ++ '.to_string()); die();
		}

		# AR_DATA_COMBINED
		$ar_data_combined = $this->combine_ar_data($ar_path_mix);
			#dump($ar_data_combined, ' ar_data_combined ++ '.to_string());

		$result = self::walk_hierarchy_data($ar_data_combined);
			#dump($result, ' result ++ '.json_encode($result));

		if(SHOW_DEBUG===true) {
			$response->debug[] = exec_time($start_time," result");
		}

		$total_records = count($ar_records);

		$response->msg 	  	= "Records found: $total_records";
		$response->result 	= $result;
		$response->total  	= $total_records;
		if(SHOW_DEBUG===true) {
			$response->strQuery = $search_result->strQuery;
		}


		return (object)$response;
	}//end search_thesaurus



	/**
	* COMBINE_AR_DATA
	* Build a global array hierarchized with all elements
	* @return array $ar_combine
	*/
	public static function combine_ar_data( $ar_path_mix ) {

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
		#dump($ar_combine, ' ar_combine ++ '.to_string());

		return (array)$ar_combine;
	}//end combine_ar_data



	/**
	* GET_SIBLINGS
	* @return array $ar_siblings
	*/
	public static function get_siblings($ckey) {

		debug_log(__METHOD__." ckey ".to_string($ckey), logger::WARNING);

		$ar_parts 		= explode('_', $ckey);
		$section_tipo 	= $ar_parts[0];
		$section_id 	= $ar_parts[1];

		$modelo_name 	= 'component_relation_children';
		$tipo 			= DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO;
		$modo 			= 'list';
		$component_relation_children = component_common::get_instance($modelo_name,
																	  $tipo,
																	  $section_id,
																	  $modo,
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);
		$dato = $component_relation_children->get_dato();
			#dump($dato, ' dato ++ '.to_string($ckey));

		$ar_siblings = array();
		foreach ((array)$dato as $s_key => $s_locator) {
			if ($s_locator->section_id==$section_id && $s_locator->section_tipo===$section_tipo) {
				# exclude
			}else{
				$ar_siblings[$s_locator->section_tipo.'_'.$s_locator->section_id] = array();
			}
		}
		# dump($ar_siblings, ' $ar_siblings ++ '.to_string());

		return (array)$ar_siblings;
	}//end get_siblings



	/**
	* WALK_HIERARCHY_DATA
	* Walk recursively $ar_data_combined resolving ts_object and add children as 'heritage'
	* @return array $ar_mix
	*/
	public static function walk_hierarchy_data( $ar_data_combined ) {

		$ar_mix = array();
		foreach ($ar_data_combined as $key => $ar_values) {

			# Parent
			$ar_parts = explode('_', $key);
			$current_section_tipo = $ar_parts[0];
			$current_section_id   = $ar_parts[1];
			$ts_object = new ts_object($current_section_id, $current_section_tipo);
			$children_data = $ts_object->get_children_data();
				#dump($children_data, ' $children_data ++ '.to_string($value));

			# Add to array
			$ar_mix[$key] = $children_data;

			# Add children in cotainer heritage
			if (!empty($ar_values)) {
				$ar_mix[$key]->heritage = self::walk_hierarchy_data( $ar_values );
			}
		}
		#dump($ar_mix, ' ar_mix ++ '.to_string());

		return $ar_mix;
	}//end walk_hierarchy_data



	/**
	* GET_SQO_CONTEXT
	* @return object $sqo_context
	*/
	public function get_sqo_context() {

		// already calculated
			if (isset($this->sqo_context)) {
				return $this->sqo_context;
			}

		// sort vars
			$section_tipo 	= $this->get_tipo();
			$lang 			= $this->get_lang();
			$mode 			= $this->get_modo();
			$limit 			= ($mode==='list') ? 10 : 1;


		// ar_section_tipo. Get the sections of the thesaurus that will be used in the filter
			$hierarchy_sections = $this->get_hierarchy_sections();
			$ar_section_tipo = array_map(function($item){
				return $item->target_section_tipo;
			}, $hierarchy_sections);


		// SHOW
			$show = [];
			// source
				$source = new stdClass();
					$source->typo 			= 'source';
					$source->action 		= 'get_data'; //  'search';
					$source->tipo 			= $section_tipo;
					$source->section_tipo 	= $ar_section_tipo;
					$source->lang 			= $lang;
					$source->mode 			= $mode;
					$source->section_id 	= null;
					$source->model 			= get_class($this);
					$source->pagination 	= (object)[
						'total'  => 0,
						'offset' => 0,
					];
					$source->loaded 			= false;
				// add source
					$show[] = $source;

			// search_query_object
				$sqo_options = new stdClass();
					$sqo_options->tipo 			= $section_tipo;
					$sqo_options->section_tipo 	= $ar_section_tipo;
					$sqo_options->full_count 	= false;
					$sqo_options->add_select 	= false;
					$sqo_options->direct 		= true;

					$sqo_options->limit  		= $limit;
					$sqo_options->offset 		= 0;

					// filter_by_locators. when sectio_id is received
					if (!empty($section_id)) {
						$self_locator = new locator();
							$self_locator->set_section_tipo($section_tipo);
							$self_locator->set_section_id($section_id);
						$sqo_options->filter_by_locators = [$self_locator];
					}

					$search_query_object = common::build_search_query_object($sqo_options);

				// add search_query_object
					$show[] = $search_query_object;

			// // ddo
			// 	$layout_map_options = new stdClass();
			// 		$layout_map_options->section_tipo 		 = $section_tipo;
			// 		$layout_map_options->tipo 				 = $section_tipo;
			// 		$layout_map_options->modo 				 = $mode;
			// 		$layout_map_options->add_section 		 = true;
			// 		$layout_map_options->config_context_type = 'show';

			// 	$ar_ddo = layout_map::get_layout_map($layout_map_options);

			// 	// add layout_map ddo's
			// 		$show = array_merge($show, $ar_ddo);


		// SEARCH
			$search = [];
			// nothing to do yet


		// sqo_context object
			$sqo_context = new stdClass();
				$sqo_context->show 	 = $show;
				$sqo_context->search = $search;

		// fix
			$this->sqo_context = $sqo_context;


		return $sqo_context;
	}//end get_sqo_context



}//end area_thesaurus
