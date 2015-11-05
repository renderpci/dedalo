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

		if(SHOW_DEBUG && strpos(DEDALO_HOST, '8888')!==false) {
			$start_time = start_time();
		}
		
		#self::$debug_response .= 'Init tool_update_cache ';

		$filter_by_id = '';
		if (isset($options->filter_by_id)) {
			foreach ((array)$options->filter_by_id as $current_id) {
				$filter_by_id .= "section_id = $current_id OR";
			}
			if ( strlen($filter_by_id)>0 ) {
				$filter_by_id = "AND (". substr($filter_by_id, 0,-3).")";
			}			
		}
		#dump($options, ' options');
		#dump($filter_by_id, ' filter_by_id');


		#
		# SECTION LIST COMPONENTS ONLY (only list mode of this is used here)
		# 
			$section_list_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($this->section_tipo, 'section_list', true);
			if (!isset($section_list_tipo[0])) {
				throw new Exception("Error Processing Request. Section list not found for $this->section_tipo", 1);			
			}
			$this->section_list_tipo = $section_list_tipo[0];
				#dump($this->section_list_tipo,"this->section_list_tipo ");

			$RecordObj_dd = new RecordObj_dd($this->section_list_tipo);
			$related_terms= $RecordObj_dd->get_ar_terminos_relacionados($this->section_list_tipo, $cache=true, $simple=true);


		#
		# RECORDS
		$this->matrix_table = common::get_matrix_table_from_tipo($this->section_tipo);
		$query_limit = '';	// -- LIMIT 1000 OFFSET 44000

		# Select all records of current section
		$strQuery = "
		SELECT section_id FROM \"$this->matrix_table\"
		WHERE 
		section_tipo = '$this->section_tipo'
		$filter_by_id
		ORDER BY id ASC		
		";
		#dump($strQuery, ' strQuery');die();
		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		if(SHOW_DEBUG && strpos(DEDALO_HOST, '8888')!==false) {
			#$time = round( microtime(TRUE) - $partial_time ,4);
			error_log("- Time ".round( microtime(TRUE) - $start_time ,4)." secs to query - Memory: ".tools::get_memory_usage('pid'));				
		}
		while ($rows = pg_fetch_assoc($result)) {

			$section_id = $rows['section_id'];
			#$datos = $rows['datos'];

			if(SHOW_DEBUG && strpos(DEDALO_HOST, '8888')!==false) {
				$partial_time = start_time();
			}

			foreach ($related_terms as $current_component_tipo) {

				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true);

				switch ($modelo_name) {
					case 'component_portal':
					case 'component_autocomplete':
					case 'component_radio_button':
					case 'component_check_box':
					case 'component_select':
					case 'component_relation':
						continue; # Skip this option for now						
						break;					
					default:
						# Nothing to do
						break;
				}
				$this->regenerate_component($current_component_tipo, $section_id, $this->section_tipo, $modelo_name);
				
			}#end foreach

			if(SHOW_DEBUG && strpos(DEDALO_HOST, '8888')!==false) {
				#$time = round( microtime(TRUE) - $partial_time ,4);
				error_log("- Time ".round( microtime(TRUE) - $partial_time ,4)." secs for section_id: $section_id - related_terms:".count($related_terms) ." - Memory: ".tools::get_memory_usage('pid'));				
			}
		
		}#end while ($rows = pg_fetch_assoc($result))
		
		#sleep(1);
		
		if(SHOW_DEBUG && strpos(DEDALO_HOST, '8888')!==false) {			
			#$time = round( microtime(TRUE) - $start_time ,4);
			error_log("-- Finish Time ".round( microtime(TRUE) - $start_time ,4)." ms for section_tipo: $this->section_tipo "." - Memory: ".tools::get_memory_usage('pid'));				
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





}
?>