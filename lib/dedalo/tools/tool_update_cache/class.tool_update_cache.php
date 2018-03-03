<?php
/**
* TOOL_UPDATE_CACHE
*
*
*/
class tool_update_cache {


	protected $section_tipo;
	protected $modo;
	protected $section_list_tipo;
	protected $matrix_table;
	public static $debug_response; 


	
	function __construct( $section_tipo=null, $modo='button' ) {

		if (empty($section_tipo)) {
			throw new Exception("Error Processing Request. Var section_tipo is empty", 1);			
		}
		$this->section_tipo = $section_tipo;
		$this->modo 		= $modo;	
	}//end __construct



	/** 
	* HTML
	* @return string
	*/
	public function get_html() {
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		return  ob_get_clean();
	}//end get_html


	/**
	* UPDATE_CACHE
	* @param object $options
	* @return bool
	*/
	public function update_cache( $options=null ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. update_cache failed';

		if(SHOW_DEBUG!==true) {
			debug_log(__METHOD__." STOPPED METHOD. TO REVIEW WITH LANG CHANGES BEFORE USE !!!!! ".to_string(), logger::ERROR);
			$response->msg = " STOPPED METHOD. TO REVIEW WITH LANG CHANGES BEFORE USE !!!!! ";
			return $response;
		}		

		# Disable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = false;
		RecordObj_time_machine::$save_time_machine_version = false;

		#static $ar_regenerated_sections;

		if(SHOW_DEBUG===true && DEDALO_ENTITY==='development') {
			$start_time = start_time();
		}
		
		#self::$debug_response .= 'Init tool_update_cache ';		


		#
		# SECTION LIST COMPONENTS ONLY (only list mode of this is used here)
		# Solucionar el problema: cuando se buscan todos los componentes, se añaden componetes vacíos en secciones como 'Audiovisual' porque referencian
		# a una real que es mayor. Es no es deseable, ya que ensucia el dato de la sección.
		#
			$all_components = false ; // ! IMPORTANT false for the moment ..
			if ($all_components) {

				# All section components
				$related_terms = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, 'component_', true, true);
					#dump($related_terms, ' related_terms ++ '.to_string()); return;
			}else{

				# Only section list components
				$section_list_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, 'section_list', true);
				if (!isset($section_list_tipo[0])) {
					throw new Exception("Error Processing Request. Section list not found for $this->section_tipo", 1);			
				}
				$this->section_list_tipo = $section_list_tipo[0];
					#dump($this->section_list_tipo,"this->section_list_tipo ");
				
				$RecordObj_dd = new RecordObj_dd($this->section_list_tipo);
				$related_terms= $RecordObj_dd->get_ar_terminos_relacionados($this->section_list_tipo, $cache=true, $simple=true);
			}
			

			

		#
		# RECORDS
		# Use actual list search options as base to build current search
			
			# SEARCH_OPTIONS
				$search_options_id    = $this->section_tipo; // section tipo like oh1
				$saved_search_options = section_records::get_search_options($search_options_id);
			
			# SEARCH_QUERY_OBJECT
				# Use saved search options (deep cloned to avoid propagation of changes !)
					$search_options 	 = unserialize(serialize($saved_search_options));
					$search_query_object = $search_options->search_query_object;
						$search_query_object->limit  = 0;  // unset limit
						$search_query_object->select = []; // unset select
			
			# SEARCH
				$search_develoment2  = new search_development2($search_query_object);
				$rows_data 		 	 = $search_develoment2->search();


		if(SHOW_DEBUG===true && DEDALO_ENTITY==='development') {
			#$time = round( microtime(TRUE) - $partial_time ,4);
			#debug_log(__METHOD__." - Time ".round( microtime(TRUE) - $start_time ,4)." secs to query - Memory: ".tools::get_memory_usage('pid'));				
		}

		foreach ($rows_data->ar_records as $key => $row) {
			
			$section_id = $row->section_id;		

			if(SHOW_DEBUG===true && DEDALO_ENTITY==='development') {
				$partial_time = start_time();
			}

			foreach ($related_terms as $current_component_tipo) {

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
				if (strpos($modelo_name, 'component_')===false) {					
					debug_log(__METHOD__." Skipped element '$modelo_name' tipo: $current_component_tipo (is not a component) ".to_string(), logger::DEBUG);
					continue;
				}
				$current_component 	= component_common::get_instance($modelo_name,
																	 $current_component_tipo,
																	 $section_id,
																	 'edit',
																	 DEDALO_DATA_LANG,
																	 $this->section_tipo);
				$current_component->get_dato(); # !! Important get dato before regenerate
				$result = $current_component->regenerate_component();
				if ($result!==true) {
					debug_log(__METHOD__." Error on regenerate componet $modelo_name - $current_component_tipo - $this->section_tipo - $section_id ".to_string(), logger::ERROR);
				}
				/*
				switch ($modelo_name) {
					
					case 'component_state':						
						$current_component 	= component_common::get_instance($modelo_name,
																			 $current_component_tipo,
																			 $section_id,
																			 'edit',
																			 DEDALO_DATA_NOLAN,
																			 $this->section_tipo);				
						$dato = $current_component->get_dato();
						if ( empty($dato) ) {
							$current_component->set_defaults();	// Set default values and save it
							debug_log(__METHOD__." Updated with defaults component_state $current_component_tipo - $section_id ".to_string(), logger::DEBUG);
						}
						break;										
					case 'component_portal':
						$this->regenerate_portal($current_component_tipo, $section_id, $this->section_tipo, $modelo_name);
						break;
					case 'component_autocomplete':
						$this->regenerate_autocomplete($current_component_tipo, $section_id, $this->section_tipo, $modelo_name);
						break;
					case 'component_radio_button':
					case 'component_check_box':
					case 'component_select':
					case 'component_relation':
					case 'component_filter':
					case 'component_password':
						continue; # Skip this components for now			
						break;		
					default:
						$this->regenerate_component($current_component_tipo, $section_id, $this->section_tipo, $modelo_name);
						break;
				}
				*/				
			}//end foreach ($related_terms as $current_component_tipo)

			if(SHOW_DEBUG===true && DEDALO_ENTITY==='development') {
				$time    = round( microtime(TRUE) - $partial_time ,4);
				$n_items = count($related_terms);				
				debug_log(__METHOD__." - Time $time secs to update section_tipo:$this->section_tipo, section_id:$section_id ($n_items components) ".to_string(), logger::DEBUG);			
			}
			
			#debug_log(__METHOD__." Updated cached of section $this->section_tipo - $section_id ".to_string(), logger::DEBUG);
		}//end foreach ($records_data->result as $key => $ar_value)
		
		#sleep(1);
		
		if(SHOW_DEBUG===true && DEDALO_ENTITY==='development') {			
			#$time = round( microtime(TRUE) - $start_time ,4);
			debug_log(__METHOD__." -- Finish Time ".round( microtime(TRUE) - $start_time ,4)." ms for section_tipo: $this->section_tipo - related_terms:".count($related_terms)." - Memory: ".tools::get_memory_usage('pid'));				
		}

		# Enable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = true;
		RecordObj_time_machine::$save_time_machine_version = true;

		$response->result 	  = true;
		$response->msg 		  = "Updated cache of section $this->section_tipo successufully. Total records: ".count($rows_data->ar_records)." where elements: ".count($related_terms);
		if(SHOW_DEBUG===true) {
			$ar_components = array();
			foreach ($related_terms as $tipo) {
				$ar_components[] = array($tipo => RecordObj_dd::get_modelo_name_by_tipo($tipo,true));
			}
			$response->components = $ar_components;
		}
		

		return $response;
	}//end update_cache
	


	/**
	* REMOVE_INVERSE_LOCATORS_IN_SECTION
	* Note that deletes OLD inverse locators stored in section dato
	* @param string $section_tipo
	*	You can use also a sequence of sections separated by commas like 'rsc197,rsc172'
	* @see trigger.tool_administration.php
	* @return bool
	*/
	public static function remove_inverse_locators_in_section__DISABLED( $section_tipo ) {

		#trigger_error("DEPRECATED WAY. Please define a direct db way to delete section old relations");
		
		$ar_section_tipo = explode(',', $section_tipo);
		foreach ($ar_section_tipo as $current_section_tipo) {

			$current_section_tipo = trim($current_section_tipo);
			
			# Get section all records
			$result = section::get_resource_all_section_records_unfiltered($current_section_tipo);
			while ($rows = pg_fetch_assoc($result)) {

				$current_section_id = $rows['section_id'];
				
				/*
				$section 		  = section::get_instance($current_section_id, $current_section_tipo, false);
				$section->get_dato(); // Force load section data
				$inverse_locators = $section->get_inverse_locators();

				if (!empty($inverse_locators)) {
					$section->remove_all_inverse_locator();
					$section->Save();

					if(SHOW_DEBUG===true) {
						debug_log(__METHOD__." Deleted inverse locators from $current_section_tipo - $current_section_id : ".json_encode($inverse_locators), logger::WARNING);
					}
				}*/
			}

		}//end foreach ($ar_section_tipo as $current_section_tipo)
		
		
		return true;
	}//end remove_inverse_locators_in_section



}
?>