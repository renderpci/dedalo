<?php
/*
* CLASS TOOL_SORT
*
*
*/
class tool_sort {
	


	public $component_obj;
	public $target_component_tipo; // portal base
	public $sub_target_component_tipo; // portal to update record

	// section way
		public $source_list;



	/**
	* __CONSTRUCT
	*/
	public function __construct($component_obj, $modo='button') {
		
		$section_id = isset($_REQUEST['section_id']) ? safe_section_id($_REQUEST['section_id']) : null;		
		if (empty($section_id)) {
			throw new Exception("Error Processing Request. Var section_id is empty", 1);
		}

		$component_obj->set_parent($section_id);

		// fix component_obj
		$this->component_obj = $component_obj;
	
		$component_properties 	= $component_obj->get_propiedades(true);
		$tool_properties 	 	= $component_properties->ar_tools_name->tool_sort;


		// section way
			$this->source_list 		= $tool_properties->source_list;
				#dump($this->source_list, ' this->source_list ++ '.to_string());

		
		$this->target_component_tipo 	 = $tool_properties->target_component_tipo;
		$this->sub_target_component_tipo = $tool_properties->sub_target_component_tipo;
		

		$this->modo = $modo;

		return true;
	}//end __construct



	/**
	* GET_CONTEXT_DATA
	* get the @context of the data for sended to the JS for process the data.
	* @return $context_data array
	*/
	public function get_context_data(){

		$context_data = [];

		$tool_name = get_class($this);

		$context_object = new stdClass();
			$context_object->tool 		= $tool_name;
			$context_object->tool_label	= label::get_label($tool_name);
			$context_object->type 		= 'info';

		$context_data[] = $context_object;
		
		return $context_data;
	}// end get_context_data



	/**
	* GET_DATA
	* get the @data for sended to the JS for process it.
	* @return $data array
	*/
	public function get_data(){
		$data = $this->get_sections_to_sort();
		return $data;
	}// end get_data



	/**
	* GET_FILTER_HTML
	* Resolve the source list to get the section_list
	* @return html
	*/
	public function get_sections_to_sort() {
		
		$ar_source_list = $this->source_list;

		$sections_to_sort = [];

		foreach ($ar_source_list as $current_section_list) {
	
			$section_tipo = $current_section_list->section_tipo;

			$section_object = new stdClass();
				$section_object->section_tipo 		= $section_tipo;
				$section_object->label 				= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);
				$section_object->temp_preset_filter	= $this->get_temp_preset_filter($section_tipo);
				$section_object->search_options 	= $this->get_search_options($section_tipo);
				$section_object->ar_list_map 		= $this->get_ar_list_map($section_tipo, $current_section_list);
				$section_object->type 				= 'sections';

			$sections_to_sort[] = $section_object;
		}
		
		return $sections_to_sort;
	}//end sections_to_sort



	/**
	* GET_TEMP_PRESET_FILTER
	* Get the temp filter of the user preset to search
	* @return html
	*/
	public function get_temp_preset_filter($section_tipo) {
	
		$user_id 	 = navigator::get_user_id();
		$temp_preset = search_development2::get_preset(DEDALO_TEMP_PRESET_SECTION_TIPO, $user_id, $section_tipo);
		$temp_preset_filter = isset($temp_preset->json_filter) ? $temp_preset->json_filter : null;	
	
		return $temp_preset_filter;
	}//end get_temp_preset_filter



	/**
	* GET_SEARCH_OPTIONS
	* Resolve the search options for the section
	* @return html
	*/
	public function get_search_options($section_tipo){

		$current_section = section::get_instance(null, $section_tipo, 'list');
		//create the layout_map for the section to get the rows for the list
		// [section_tipo] => ["component_tipo1","component_tipo2",...]
		$layout_map = [];
		$current_section->layout_map = $layout_map;

		# SEARCH_OPTIONS (use equal id in trigger search)
		$search_options_id 	  = $section_tipo .'_json';
		$saved_search_options = section_records::get_search_options( $search_options_id );
	
		#if ($saved_search_options===false) {
			# Is not defined
			$search_options = new stdClass();
				$search_options->modo 	 = 'list';
				
			# SEARCH_QUERY_OBJECT . Add search_query_object to options
				// default section build search_query_object
				$search_query_object = $current_section->build_search_query_object();

				// edit the default search_query_object
					// section_tipo
						#$search_query_object->section_tipo = [];

					// select
						$search_query_object->select = null;

					// filter custom. Filtered by current component locators
						$dato = $this->component_obj->get_dato();
						if (!empty($dato)) {
							
							$ar_filter_items = [];
							foreach ($dato as $current_locator) {

								$path = new stdClass();
									$path->section_tipo 	= $current_locator->section_tipo;
									$path->modelo 			= 'component_section_id';
									$path->component_tipo 	= 'component_section_id'; # any value is valid for component_section_id
								
								$filter_item = new stdClass();
									$filter_item->q 	= $current_locator->section_id;
									$filter_item->path 	= [$path];

								$ar_filter_items[] = $filter_item;
							}
						}

						$operator = '$or';
						$search_query_object->filter = new stdClass();
							$search_query_object->filter->{$operator} = $ar_filter_items;

					// order custom
						$component_properties 		= $this->component_obj->get_propiedades(true);
						$search_query_object->order = $component_properties->ar_tools_name->tool_sort->source_order;

					// full_count
						$search_query_object->full_count = count($dato) ?? false;

					// limit
						$search_query_object->limit = 100;

					#dump($search_query_object, ' search_query_object ++ '.to_string());

			
				$search_options->search_query_object = $search_query_object;
		#}else{
		#	# Use saved search options
		#	$search_options = $saved_search_options;							
		#}


		#$search_options_json = json_encode($search_options, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$search_options_json = json_encode($search_options, JSON_UNESCAPED_UNICODE );

		
		return $search_options_json;
	}//get_search_options



	/**
	* GET_AR_LIST_MAP
	* Resolve the layout map of the section_list
	* @return $ar_list_map
	*/
	public function get_ar_list_map($section_tipo, $current_section_list) {

		//create the layout_map for the section to get the rows for the list
		// [section_tipo] => ["component_tipo1","component_tipo2",...]
		$ar_list_map = [];
		$ar_list_map[$section_tipo] = $current_section_list->section_list;
		
		return $ar_list_map;
	}// end get_ar_list_map



	/**
	* GET_HTML
	* Load html controller file
	*/
	public function get_html() {
		if(SHOW_DEBUG===true) {
			#global$TIMER;$TIMER[get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		ob_start();
		include ( DEDALO_LIB_BASE_PATH .'/tools/'.get_called_class().'/'.get_called_class().'.php' );
		$html = ob_get_clean();
		

		if(SHOW_DEBUG===true) {
			#global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}

		return $html;
	}//end get_html



	/**
	* GET_JSON
	* Load json controller file
	*/
	public function get_json() {
		if(SHOW_DEBUG===true) $start_time = start_time();		
		
			# Class name is called class (ex. component_input_text), not this class (common)	
			include ( DEDALO_LIB_BASE_PATH .'/'. get_called_class() .'/'. get_called_class() .'_json.php' );

		if(SHOW_DEBUG===true) {
			#$GLOBALS['log_messages'][] = exec_time($start_time, __METHOD__. ' ', "html");
			global$TIMER;$TIMER[__METHOD__.'_'.get_called_class().'_'.$this->tipo.'_'.$this->modo.'_'.microtime(1)]=microtime(1);
		}
		
		return $json;
	}//end get_json


	
}//end class tool_catalogue
?>