<?php
/**
* AREA_THESAURUS
* Manage whole thesaurus hierarchies
*
*/
class area_thesaurus extends area {


	static $typologies_section_tipo = DEDALO_HIERARCHY_TYPES_SECTION_TIPO; // 'hierarchy13'
	static $typologies_name_tipo 	= DEDALO_HIERARCHY_TYPES_NAME_TIPO;	// 'hierarchy16'

	# Default vars for use in thesaurus mode (set GET['model']=true to change this vars in runtime)
	protected $model_view 				= false;
	protected $target_section_tipo 		= DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
	protected $hierarchy_childrens_tipo	= DEDALO_HIERARCHY_CHIDRENS_TIPO;


	
	function __construct($tipo, $modo='list') {

		return parent::__construct($tipo, $modo);
	}



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
	public function get_hierarchy_sections($hierarchy_types_filter=null, $hierarchy_sections_filter=null) {
		
		$ar_records = area_thesaurus::get_all_hierarchy_sections();
		
		$ar_items = [];
		foreach ($ar_records as $key => $row) {
	
			//hierarchy target section tipo
			$model = RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TARGET_SECTION_TIPO,true);
			$hierarchy_target_section_tipo = component_common::get_instance($model,
															 DEDALO_HIERARCHY_TARGET_SECTION_TIPO,
															 $row->section_id,
															 'list',
															 DEDALO_DATA_NOLAN,
															 $row->section_tipo);
			$target_section_tipo_dato = $hierarchy_target_section_tipo->get_dato();
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
			$hierarchy_target_section_name = $hierarchy_section_name->get_valor();

			if (empty($hierarchy_target_section_name)) {
				$hierarchy_target_section_name = $this->get_hierarchy_name( $row->section_id );
			}

			// typology data
			$typology_data = $this->get_typology_data($row->section_id);
			# Skip filtered types when defined
			if (!empty($hierarchy_types_filter) && !in_array($typology_data->section_id, $hierarchy_types_filter)) {
				continue; // Skip
			}

			

			$item = new stdClass();
				$item->section_id 					 = $row->section_id;
				$item->hierarchy_target_section_tipo = $target_section_tipo;
				$item->hierarchy_target_section_name = $hierarchy_target_section_name;
				$item->typology 					 = $typology_data->section_id;
				$item->typology_name 				 = $this->get_typology_name( $typology_data->section_id );

			$ar_items[] = $item;
		}//end foreach ($ar_records as $key => $row)
		#dump($ar_items, ' ar_items ++ '.to_string());

		return $ar_items;
	}//end get_hierarchy_sections



	/**
	* GET_ALL_HIERARCHY_SECTIONS
	* @return array $ar_records
	*/
	public static function get_all_hierarchy_sections() {
		
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
	}//end get_all_hierarchy_sections



	/**
	* GET_TyPOLOGY_DATA
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
			$typology_name = component_input_text::render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo);
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
			
			# DEDALO_HIERARCHY_CHIDRENS_TIPO	
			# DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO
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
	public function search_thesaurus($search_options) {

		$start_time=microtime(1);
		
		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

		$search_query_object = $search_options->search_query_object;

		# Search records
		$search_development2 = new search_development2($search_query_object);
		$search_result 		 = $search_development2->search();
		$ar_records 		 = $search_result->ar_records;
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
	* @return 
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

		/*
			REFERENCE ar_hierarchy
			Hierarchize the simple plain array in revere order

			[0] => Array
	        (
	            [ts1_65] => Array
	                (
	                    [ts1_73] => Array
	                        (
	                            [ts1_74] => Array
	                                (
	                                )
	                        )
	                )
	        )
		    [1] => Array
		        (
		            [ts1_65] => Array
		                (
		                    [ts1_66] => Array
		                        (
		                            [ts1_67] => Array
		                                (
		                                )
		                        )
		                )
		        )
		    )
		*/
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
						$ar_childrens = area_thesaurus::get_siblings($cvalue, $ar_value);
						if(!empty($ar_childrens)) foreach ($ar_childrens as $s_key => $s_value) {
							$ar_hierarchy[$key][$cvalue][$s_key]	= array();													
						}
					}
					*/
				}
			}
		}
		#dump($ar_hierarchy, ' ar_hierarchy ++ '.to_string()); die();


		/*
			REFERENCE ar_combine
			Combines hierarchized arrays to obtain one global array with combined values

			[ts1_65] => Array
	        (
	            [ts1_73] => Array
	                (
	                    [ts1_74] => Array
	                        (
	                        )
	                )
	            [ts1_66] => Array
	                (
	                    [ts1_67] => Array
	                        (
	                        )
	                )
	        )
        */		
		$ar_combine=array(); foreach ($ar_hierarchy as $key => $ar_value) {			
			$ar_combine = array_merge_recursive($ar_combine, $ar_value);			
		}
		#dump($ar_combine, ' ar_combine ++ '.to_string());
	
		return (array)$ar_combine;	
	}//end combine_ar_data



	/**
	* GET_SIBLINGS
	* @return 
	*/
	public static function get_siblings($ckey) {
		
		#dump($ckey, ' ckey ++ '.to_string());
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
	* Walk recursively $ar_data_combined resolving ts_object and add childrens as 'heritage'
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
			$childrens_data = $ts_object->get_childrens_data();
				#dump($childrens_data, ' $childrens_data ++ '.to_string($value));

			# Add to array
			$ar_mix[$key] = $childrens_data;

			# Add childrens in cotainer heritage
			if (!empty($ar_values)) {			
				$ar_mix[$key]->heritage = self::walk_hierarchy_data( $ar_values );
			}		
		}
		#dump($ar_mix, ' ar_mix ++ '.to_string());
		
		return $ar_mix;
	}//end walk_hierarchy_data





}//end area_thesaurus
?>