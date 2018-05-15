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
	* GET_HIERARCHY_TyPOLOGIES
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
			if (empty($row->{$this->target_section_tipo})) {
				debug_log(__METHOD__." Skipped row $row->section_id with empty target_section_tipo ".$row->{DEDALO_HIERARCHY_TERM_TIPO}, logger::WARNING);
				continue; // Skip
			}		

			# Skip filtered sections when defined
			$target_section_tipo = $row->{$this->target_section_tipo};
			if (!empty($hierarchy_sections_filter) && !in_array($target_section_tipo, $hierarchy_sections_filter)) {
				continue; // Skip
			}

			$tipology_data = $this->get_tipology_data($row->section_id);
			# Skip filtered types when defined
			if (!empty($hierarchy_types_filter) && !in_array($tipology_data->section_id, $hierarchy_types_filter)) {
				continue; // Skip
			}

			$hierarchy_target_section_name = $row->{DEDALO_HIERARCHY_TERM_TIPO};
			if (empty($hierarchy_target_section_name)) {
				$hierarchy_target_section_name = $this->get_hierarchy_name( $row->section_id );
			}
			
			$item = new stdClass();
				$item->section_id 					 = $row->section_id;
				$item->hierarchy_target_section_tipo = $target_section_tipo;
				$item->hierarchy_target_section_name = $hierarchy_target_section_name;
				$item->typology 					 = $tipology_data->section_id;
				$item->typology_name 				 = $this->get_tipology_name( $tipology_data->section_id );

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
		  "select": [
		    {
		      "path": [
		        {
		          "section_tipo": "hierarchy1",
		          "component_tipo": "hierarchy5",
		          "modelo": "component_input_text",
		          "name": "Name"
		        }
		      ]
		    },
		    {
		      "path": [
		        {
		          "section_tipo": "hierarchy1",
		          "component_tipo": "hierarchy6",
		          "modelo": "component_input_text",
		          "name": "TLD (alpha2)"
		        }
		      ]
		    },
		    {
		      "path": [
		        {
		          "section_tipo": "hierarchy1",
		          "component_tipo": "hierarchy7",
		          "modelo": "component_input_text",
		          "name": "TLS (alpha3)"
		        }
		      ]
		    },
		    {
		      "path": [
		        {
		          "section_tipo": "hierarchy1",
		          "component_tipo": "hierarchy53",
		          "modelo": "component_input_text",
		          "name": "Target thesaurus"
		        }
		      ]
		    },
		    {
		      "path": [
		        {
		          "section_tipo": "hierarchy1",
		          "component_tipo": "hierarchy58",
		          "modelo": "component_input_text",
		          "name": "Target model"
		        }
		      ]
		    },
		    {
		      "path": [
		        {
		          "section_tipo": "hierarchy1",
		          "component_tipo": "hierarchy9",
		          "modelo": "component_select",
		          "name": "Typology"
		        }
		      ]
		    }
		  ],
		  "order": [
	        {
	            "direction": "ASC",
	            "path": [
	                {
	                    "name": "Orden",
	                    "modelo": "component_order",
	                    "section_tipo": "hierarchy1",
	                    "component_tipo": "hierarchy48"
	                }
	            ]
	        }
	    ]
		}');

		$search_development2 = new search_development2($search_query_object);
		$result = $search_development2->search();

		$ar_records = $result->ar_records;

		return $ar_records;
	}//end get_all_hierarchy_sections



	/**
	* GET_TIPOLOGY_DATA
	* @return string $tipology_name
	*/
	public function get_tipology_data( $section_id ) {

		$tipo 			= DEDALO_HIERARCHY_TIPOLOGY_TIPO; // 'hierarchy9' component_select
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
	}//end get_tipology_data



	/**
	* GET_TIPOLOGY_NAME
	* @return string $tipology_name
	*/
	public function get_tipology_name( $tipology_section_id ) {

		# Store for speed
		static $tipology_names;
		if (isset($tipology_names[$tipology_section_id])) {
			return $tipology_names[$tipology_section_id];
		}
				
		$tipo 			 = DEDALO_HIERARCHY_TYPES_NAME_TIPO;
		$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($tipo,true);
		$parent 		 = $tipology_section_id;
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
			$tipology_name = component_input_text::render_list_value($value, $tipo, $parent, $modo, $lang, $section_tipo);
		}else{
			$tipology_name = $value;
		}

		if (empty($tipology_name)) {
			$tipology_name = 'Tipology unstranslated ' . $tipo .' '. $parent;
		}

		# Store for speed
		$tipology_names[$tipology_section_id] = $tipology_name;

		return (string)$tipology_name;
	}//end get_tipology_name



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
	public static function get_options_for_search_hierarchies( $tipology_section_tipo, $tipology_section_id ) {

		$section_tipo 	= DEDALO_HIERARCHY_SECTION_TIPO;
		$matrix_table   = common::get_matrix_table_from_tipo($section_tipo);

		# LAYOUT_MAP
		# Build a custom layout map with our needs
		$layout_map=array();
		$layout_map[DEDALO_HIERARCHY_SECTION_TIPO] = array(
			DEDALO_HIERARCHY_TIPOLOGY_TIPO,
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
				$locator->set_section_tipo($tipology_section_tipo);
				$locator->set_section_id($tipology_section_id);
			$locator_json = json_encode($locator);
			# Add to filter
			$filter_by_search->{$section_tipo.'_'.DEDALO_HIERARCHY_TIPOLOGY_TIPO} = (string)$locator_json;
				#dump($locator_json, ' locator ++ '.to_string(DEDALO_HIERARCHY_TIPOLOGY_TIPO));

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

		# ar_path_mix . Calculate full path of each result
		$ar_path_mix = array();
		foreach ($ar_records as $key => $row) {
		
			$section_tipo = $row->section_tipo;
			$section_id   = $row->section_id;

			$ar_parents = component_relation_parent::get_parents_recursive($section_id, $section_tipo, false);
				#dump($ar_parents, ' ar_parents ++ '.to_string("$section_id, $section_tipo"));

			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);

			$ar_path   = array_reverse($ar_parents);
			$ar_path[] = $locator; // add self at end
			
			$ar_path_mix[] = $ar_path;			
		}
		# Root parents
		if(SHOW_DEBUG===true) {
			#dump($ar_path_mix, ' ar_path_mix ++ '.to_string());
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
		$response->strQuery = $search_result->strQuery;
	

		return (object)$response;
	}//end search_thesaurus



	/**
	* SEARCH_THESAURUS
	* @return object $result
	*/ /*
	public function search_thesaurus__OLD( $request_options ) {
		
		$start_time=microtime(1);		

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';

			return $response;

		$options = new stdClass();
			$options->term  			  = false;
			$options->section_id  		  = false;
			$options->hierarchy_id 		  = false;
			$options->model  			  = false;
			$options->limit 			  = 1000;
			$options->comparison_operator = false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}
				#dump($options->model, ' options model ++ '.to_string());

		# Active hierarchies
			$active_hierarchies = hierarchy::get_active_hierarchies();
				#dump($active_hierarchies, ' $active_hierarchies ++ '.to_string());
				if (empty($active_hierarchies)) {
					$response->result 	= false;
					$response->msg 		= 'Failed get_active_hierarchies. No active hierarchies found!'.to_string();
					return $response;
				}

		# Target section tipos
			$target_string = $options->model===true ? 'target_section_model' : 'target_section';
			$target_section_tipos = array_get_by_key($active_hierarchies, $target_string);
				#dump($target_section_tipos, ' $target_section_tipos ++ '.to_string($options->model));
				if (empty($target_section_tipos)) {
					$response->result 	= false;
					$response->msg 		= 'Failed target_section_tipos. No target_section_tipos found!'.to_string();
					return $response;
				}

		# Terms and tables
			$all_term_tipo_by_map = hierarchy::get_all_term_tipo_by_map( $target_section_tipos );
				#dump($all_term_tipo_by_map, ' $all_term_tipo_by_map ++ '.to_string());
				if (empty($all_term_tipo_by_map)) {
					$response->result 	= false;
					$response->msg 		= 'Failed get_all_term_tipo_by_map for target_section_tipos:'.to_string($target_section_tipos);
					return $response;
				}

		# Move matrix table (bigger talble probably) to the end to optimize results		
		#if (isset($all_term_tipo_by_map['matrix'])) {
		#	$matrix_data = $all_term_tipo_by_map['matrix'];
		#	unset($all_term_tipo_by_map['matrix']);
		#	$all_term_tipo_by_map['matrix'] = $matrix_data;
		#}
		#dump($all_term_tipo_by_map, ' $all_term_tipo_by_map ++ '.to_string());
		

		# Filter sections
		# Only searchs across active sections
		$filter_section  = '';
		$filter_section .= "\n AND (";
		$last_target_section_tipos = end($target_section_tipos);
		foreach ($target_section_tipos as $target_section_tipo) {
			$filter_section .= "section_tipo='$target_section_tipo'";
			if($target_section_tipo!==$last_target_section_tipos) $filter_section .= " OR ";
		}
		$filter_section .= ")";
			#dump($filter_section, ' filter_section ++ '.to_string());

		# STRQUERY
		$strQuery = '';		
		end($all_term_tipo_by_map);	// move the internal pointer to the end of the array
		$last_key = key($all_term_tipo_by_map);	// fetches the key of the element pointed to by the internal pointer
		foreach ($all_term_tipo_by_map as $table => $ar_terms) {

			// EACH TABLE QUERY
			$strQuery .= "\n SELECT section_tipo, section_id FROM $table a WHERE ";

			#
			# Filter term
			if ($options->term!==false) {

				 // Escape the text data
  				$term = pg_escape_string($options->term);

				#$last_term_tipo = end($ar_terms);
				$ar_lines = array();
				foreach ((array)$ar_terms as $term_tipo) {

					#$line = "\n f_unaccent(datos#>>'{components, $term_tipo, dato}') ILIKE f_unaccent('%".$term."%') ";
						#dump($request_options, '$options->comparison_operator ++ '.to_string());
					$comparison_operator = isset($options->comparison_operator->{$term_tipo}) ? $options->comparison_operator->{$term_tipo} : 'ILIKE';
					$current_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($term_tipo,true);
					$search_query = $current_modelo_name::get_search_query( 'datos', $term_tipo, $tipo_de_dato_search='dato', $current_lang='all', $term, $comparison_operator);
					if(SHOW_DEBUG===true) {
						#error_log($search_query);	
					}									
					$line = "\n".$search_query;

					if (!in_array($line, $ar_lines)) {
						$ar_lines[] = $line;
					}		
					#$strQuery .= "\n datos#>>'{components, $term_tipo, dato}' ILIKE '%{$options->term}%' ";  //datos#>>'{components, hierarchy25, dato}' LIKE '%pepito%' 
					#if($term_tipo!==$last_term_tipo) $strQuery .= " OR\n";
				}
				$strQuery .= implode(" OR\n", $ar_lines);
			}

			#
			# Filter section_id
			if ($options->section_id!==false) {
				if ($options->term!==false) $strQuery .= " AND ";
				$strQuery .= "\n section_id = ".(int)$options->section_id." ";
			}

			#
			# Filter hierarchy_id
			if ($options->hierarchy_id!==false && ($options->section_id!==false || $options->term!==false)) {

				// Calculate target thesaurus
				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_HIERARCHY_TARGET_SECTION_TIPO,true);
				$component 		= component_common::get_instance($modelo_name,
																 DEDALO_HIERARCHY_TARGET_SECTION_TIPO,
																 (int)$options->hierarchy_id,
																 'list',
																 DEDALO_DATA_NOLAN,
																 DEDALO_HIERARCHY_SECTION_TIPO);
				$valor = trim($component->get_valor());
				#if ($options->term!==false) 
				$strQuery .= " AND ";
				$strQuery .= "\n (section_tipo = '{$valor}') ";
					#dump($options->hierarchy_id, '$options->hierarchy_id ++ '.to_string($valor));
			}

			# Section tipo filter
			$strQuery .= $filter_section;

			if($table!==$last_key) $strQuery .= "\n UNION ALL ";
		}
		$strQuery .= "\n LIMIT $options->limit ";
				 

		$result = JSON_RecordObj_matrix::search_free($strQuery);
		$n_rows = pg_num_rows($result);
		
		# DEBUG LOG
		debug_log(__METHOD__." strQuery: $strQuery ".exec_time($start_time," ").to_string(), logger::ERROR);
		
		if(SHOW_DEBUG===true) {
			$response->debug[] = exec_time($start_time,"$strQuery [rows:$n_rows]");
		}

		$ar_path_mix=array();
		while ($rows = pg_fetch_assoc($result)) {

			$section_tipo = $rows['section_tipo'];
			$section_id   = $rows['section_id'];

			$ar_parents = component_relation_parent::get_parents_recursive($section_id, $section_tipo);
				#dump($ar_parents, ' ar_parents ++ '.to_string("$section_id, $section_tipo"));

			$locator = new locator();
				$locator->set_section_tipo($section_tipo);
				$locator->set_section_id($section_id);

			$ar_path   = array_reverse($ar_parents);
			$ar_path[] = $locator; // add self at end
				#dump($ar_path, ' $ar_path ++ '.to_string());
			$ar_path_mix[] = $ar_path;

			
				#$ar_ts_objects = array();
				#foreach ($ar_path as $key => $current_locator) {
				#	$ts_object 		 = new ts_object($current_locator->section_id, $current_locator->section_tipo);
				#	$childrens_data  = $ts_object->get_childrens_data();
				#	$ar_ts_objects[] = $childrens_data;
				#}
				#dump($ar_ts_objects, ' ar_ts_objects ++ '.to_string());				
		}		
		if(SHOW_DEBUG===true) {			
			$response->debug[] = exec_time($start_time," ar_path_mix (recursive parents)");
		}

		# ROOT PARENTS
		$ar_path_mix = $this->add_root_parents($ar_path_mix, $active_hierarchies, $options->model);
			#dump($ar_path_mix, ' $ar_path_mix ++ '.to_string());

		# AR_DATA_COMBINED
		$ar_data_combined = $this->combine_ar_data($ar_path_mix);
			#dump($ar_data_combined, ' ar_data_combined ++ '.to_string());			

		$result = self::walk_hierarchy_data($ar_data_combined);
			#dump($result, ' result ++ '.json_encode($result));

		if(SHOW_DEBUG===true) {
			$response->debug[] = exec_time($start_time," result");			
		}

		$response->msg 	  = "Records found: $n_rows";
		$response->result = $result;
		$response->total  = $n_rows;

		return $response;		
	}//end search_thesaurus */



	/**
	* GET_ROOT_PARENT
	* @return object|null $root_parent
	*/ /* UNUSED !
	public function get_root_parent( $section_tipo, $section_id ) {

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			# Add locator type (children)
				$locator->type = DEDALO_RELATION_TYPE_CHILDREN_TIPO;
			# Add locator from_component_tipo
			if ($this->model_view===true) {
				$locator->from_component_tipo = DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO;
			}else{
				$locator->from_component_tipo = DEDALO_HIERARCHY_CHIDRENS_TIPO;
			}
		$q = json_encode($locator);
		
		$search_query_object = json_decode('{
		  "id": "hierarchy1_list ",
		  "section_tipo": "hierarchy1",
		  "limit": 1,
		  "filter": {
		    "$and": [
		      {
		        "q": "'.addslashes($q).'",
		        "path": [
		          {
		            "section_tipo": "hierarchy1",
		            "component_tipo": "hierarchy45",
		            "modelo": "component_relation_children",
		            "name": "Childrens"
		          }
		        ]
		      }
		    ]
		  }
		}');
		$search_development2 = new search_development2($search_query_object);
		$result 			 = $search_development2->search();
		$ar_records 		 = $result->ar_records;

		if (!empty($ar_records[0])) {
			$root_parent = $ar_records[0];
		}else{
			$root_parent = null;
			debug_log(__METHOD__." Empty result for search_query_object:\n ".json_encode($search_query_object, JSON_PRETTY_PRINT), logger::WARNING);
		}

		return $root_parent;
	}//end get_root_parent */



	/**
	* add_root_parents__OLD
	* @return array $ar_path_mix
	*/ /*
	public function add_root_parents__OLD($ar_path_mix, $active_hierarchies, $model=false) {
		
		#dump($active_hierarchies, ' active_hierarchies ++ '.to_string());
		#dump($ar_path_mix, '$ar_path_mix 1 ++ '.to_string());
		
		# Prepare array active_hierarchies
		$ar_target_section_tipo=array();
		$target_string = $model===true ? 'target_section_model' : 'target_section';
		foreach ($active_hierarchies as $key => $value) {
			$ar_target_section_tipo[$value[$target_string]] = $key;
		}
		#dump($ar_target_section_tipo, ' $ar_target_section_tipo ++ '.to_string());

		# Hierarchy component tipo
		$hierarchy_component_tipo = $model===true ? DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO : DEDALO_HIERARCHY_CHIDRENS_TIPO;

		foreach ($ar_path_mix as $key => $ar_value) foreach ($ar_value as $key2 => $current_obj) {
			
			$section_tipo = $current_obj->section_tipo;
			if (isset($ar_target_section_tipo[$section_tipo])) {

				$element = new stdClass();
					$element->section_tipo 	 = DEDALO_HIERARCHY_SECTION_TIPO;
					$element->section_id   	 = $ar_target_section_tipo[$section_tipo];
					$element->component_tipo = $hierarchy_component_tipo;

				 
				array_unshift($ar_path_mix[$key], $element);
			}
			break; // jump to next level loop	(only first element is important)	
		}
		#dump($ar_path_mix, '$ar_path_mix 2 ++ '.to_string());

		return $ar_path_mix;
	}//end add_root_parents__OLD */



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