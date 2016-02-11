<?php
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');



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
	}

	/** 
	* HTML
	* @return string
	*/
	public function get_html() {
		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		return  ob_get_clean();
	}


	/**
	* UPDATE_CACHE
	* @return bool
	*/
	public function update_cache( $options=null ) {

		# Disable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = false;
		RecordObj_time_machine::$save_time_machine_version = false;


		static $ar_regenerated_sections;

		if(SHOW_DEBUG && DEDALO_ENTITY=='development') {
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
			$search_options_session_key = 'section_'.$this->section_tipo;
			$search_options = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);	
			$search_options->modo 		= 'edit';	// Modo 'edit' allow use empty layout_map
			$search_options->layout_map = array();
			$search_options->offset 	= 0;
			$search_options->limit 		= 0;
			$search_options->full_count = false;
			$search_options->search_options_session_key = $search_options_session_key.'_tool_update_cache';	// Unconflict name with source list session key
			unset($search_options->layout_map_list);		

			# Optionally, filter by id is supported in request options (when update one record for example)
			# Format must be an array of locators
			if (isset($options->filter_by_id)) {
				$search_options->filter_by_id = $options->filter_by_id;
			}

			$records_data = search::get_records_data( $search_options );			
				#dump($records_data, ' records_data ++ '.to_string()); 
				#debug_log(__METHOD__." records_data ".to_string($records_data), logger::DEBUG);		


		if(SHOW_DEBUG && DEDALO_ENTITY=='development') {
			#$time = round( microtime(TRUE) - $partial_time ,4);
			#debug_log(__METHOD__." - Time ".round( microtime(TRUE) - $start_time ,4)." secs to query - Memory: ".tools::get_memory_usage('pid'));				
		}

		foreach ($records_data->result as $key => $ar_value) {
			$row = reset($ar_value);		

			$section_id = $row['section_id'];
			#$datos = $rows['datos'];

			if(SHOW_DEBUG && DEDALO_ENTITY=='development') {
				$partial_time = start_time();
			}

			foreach ($related_terms as $current_component_tipo) {

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);

				switch ($modelo_name) {
					
					case 'component_state':
						$current_component 	= new $modelo_name($current_component_tipo, $section_id, 'edit', DEDALO_DATA_NOLAN, $this->section_tipo);						
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
				
			}#end foreach

			if(SHOW_DEBUG && DEDALO_ENTITY=='development') {
				$time    = round( microtime(TRUE) - $partial_time ,4);
				$n_items = count($related_terms);				
				debug_log(__METHOD__." - Time $time secs to update section_id:$section_id ($n_items components) ".to_string(), logger::DEBUG);			
			}
		
		}#end while ($rows = pg_fetch_assoc($result))
		
		#sleep(1);
		
		if(SHOW_DEBUG && DEDALO_ENTITY=='development') {			
			#$time = round( microtime(TRUE) - $start_time ,4);
			debug_log(__METHOD__." -- Finish Time ".round( microtime(TRUE) - $start_time ,4)." ms for section_tipo: $this->section_tipo - related_terms:".count($related_terms)." - Memory: ".tools::get_memory_usage('pid'));				
		}

		# Enable logging activity and time machine # !IMPORTANT
		logger_backend_activity::$enable_log = true;
		RecordObj_time_machine::$save_time_machine_version = true;

		return true;
	
	}#end update_cache



	/**
	* REGENERATE_COMPONENT
	* @param string
	* @return (bool)
	*/
	protected function regenerate_component($current_component_tipo, $section_id, $section_tipo, $modelo_name=false ) {

		if (!$modelo_name) {
			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);
		}
		
		$RecordObj_dd 		= new RecordObj_dd($current_component_tipo);
		$traducible 		= $RecordObj_dd->get_traducible();
		if($traducible=='no') {
			$current_lang = DEDALO_DATA_NOLAN;
			//$current_component 	= component_common::get_instance($modelo_name, $current_component_tipo, $section_id, 'list', $current_lang, $section_tipo);
			$current_component 	= new $modelo_name($current_component_tipo, $section_id, 'list', $current_lang, $section_tipo);
			#$current_component->set_modo('list');
			#$current_component->get_html();
			switch (true) {
				case (strpos($modelo_name, 'filter')!==false) :
					$current_component->set_propagate_filter(false); # !IMPORTANT (to avoid calculate inverse search of portals, very long process)
					break;
				case ($modelo_name=='component_autocomplete_ts') :
					$current_dato = $current_component->get_dato(); # !IMPORTANT Force get_dato update component dato and save it
					break;				
				default:
			}			
			$current_component->Save();
			if(SHOW_DEBUG) {
				#$label = $current_component->get_label();
				#self::$debug_response .= "<br>  - [$section_id] Regenerated valor_list for $modelo_name ($current_component_tipo) $label in lang $current_lang ";
			}
		}else{
			#$ar_lang = (array)unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
			$ar_lang = array(DEDALO_DATA_LANG);
			foreach ($ar_lang as $current_lang) {
				//$current_component 	= component_common::get_instance($modelo_name, $current_component_tipo, $section_id, 'list', $current_lang, $section_tipo);
				$current_component 	= new $modelo_name($current_component_tipo, $section_id, 'list', $current_lang, $section_tipo);
				#$current_component->set_modo('list');
				#$current_component->get_html();
				$current_component->Save();
				if(SHOW_DEBUG) {
					#$label = $current_component->get_label();
					#self::$debug_response .= "<br>  - [$section_id] Regenerated valor_list for  $modelo_name ($current_component_tipo) $label in lang $current_lang ";
				}
			}
		}

		#return true;
	}


	/**
	* REGENERATE_PORTAL
	* Le dice a los 'hijos del portal' que 'papá' portal los llama (añade inverse locator en cada sección referenciada por el portal)
	* @return 
	*/
	public function regenerate_portal($current_component_tipo, $section_id, $section_tipo, $modelo_name) {
		
		$component = component_common::get_instance(  $modelo_name,
													  $current_component_tipo,
													  $section_id,
													  'edit',
													  DEDALO_DATA_NOLAN,
													  $section_tipo);
		$dato = $component->get_dato();
		if(empty($dato)) return false;

		$portal_inverse_locator = new locator();
			$portal_inverse_locator->set_section_id( $component->get_parent() );
			$portal_inverse_locator->set_section_tipo( $component->get_section_tipo() );
			$portal_inverse_locator->set_component_tipo( $component->get_tipo() );

		foreach ((array)$dato as $rel_locator) {

			# Add inverse locator into the destination section
			$section_to_add = section::get_instance($rel_locator->section_id, $rel_locator->section_tipo);

			$section_to_add->add_inverse_locator($portal_inverse_locator);
			$section_to_add->Save();

			debug_log(__METHOD__." $modelo_name Added section inverse locator reference tipo:$current_component_tipo, parent:$section_id, section_tipo:$section_tipo -> ".to_string($rel_locator), logger::DEBUG);
		}

	}#end regenerate_portal


	/**
	* REGENERATE_AUTOCOMPLETE (ALIAS OF regenerate_portal)
	* @return 
	*/
	public function regenerate_autocomplete( $current_component_tipo, $section_id, $section_tipo, $modelo_name ) {
		#debug_log(__METHOD__." $modelo_name Added section inverse locator reference tipo:$current_component_tipo, parent:$section_id, section_tipo:$section_tipo ", logger::DEBUG);
		return $this->regenerate_portal($current_component_tipo, $section_id, $section_tipo, $modelo_name);
	}#end regenerate_autocomplete


}
?>