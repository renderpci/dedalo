<?php
/*
* CLASS TOOL_CATALOGING
*
*
*/
class tool_cataloging {
	

	public $source_list;
	public $source_thesaurus;
	public $button_triguer_tipo;

	public function __construct($section_tipo=null, $modo='button') {

		$button_triguer_tipo = isset($_REQUEST['button_tipo']) ? safe_tipo($_REQUEST['button_tipo']) : null;
		
		if (empty($button_triguer_tipo)) {
			throw new Exception("Error Processing Request. Var section is empty", 1);
		}

		$button_triguer = new RecordObj_dd($button_triguer_tipo);
		$button_triguer_properties = $button_triguer->get_propiedades(true);

		$this->source_list 			= $button_triguer_properties->source_list;
		$this->source_thesaurus		= $button_triguer_properties->source_thesaurus;
		$this->modo 				= $modo;
		$this->button_triguer_tipo 	= $button_triguer_tipo;

		return true;
	}//end __construct


	/**
	* GET_CONTEXT_DATA
	* get the @context of the data for sended to the JS for process the data.
	* @return $context_data array
	*/
	public function get_context_data(){

		$context_data = [];

		$button_triguer_tipo = $this->button_triguer_tipo;

		$context_object = new stdClass();
		$context_object->tool 		= get_class($this);
		$context_object->tool_label	= RecordObj_dd::get_termino_by_tipo($button_triguer_tipo, DEDALO_APPLICATION_LANG, true);
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
		$data = $this->get_sections_to_catalog();
		return $data;
	}// end get_data



	/**
	* GET_FILTER_HTML
	* Resolve the source list to get the section_list
	* @return html
	*/
	public function get_sections_to_catalog(){
		
		$ar_source_list = $this->source_list;

		$sections_to_catalog = [];

		foreach ($ar_source_list as $current_section_list) {

			$section_tipo = $current_section_list->section_tipo;

			$section_object = new stdClass();
				$section_object->section_tipo 	= $section_tipo;
				$section_object->label 			= RecordObj_dd::get_termino_by_tipo($section_tipo, DEDALO_APPLICATION_LANG, true);
				$section_object->filter_html	= $this->get_filter_html($section_tipo, $current_section_list);
				$section_object->search_options = $this->get_search_options($section_tipo, $current_section_list);
				$section_object->type 			= 'sections';

			$sections_to_catalog[] = $section_object;
		}

		return $sections_to_catalog;
	}//end sections_to_catalog



	/**
	* GET_FILTER_HTML
	* Resolve the source list to get the section_list
	* @return html
	*/
	public function get_filter_html($section_tipo, $current_section_list) {

		$current_section = section::get_instance(null, $section_tipo, 'list');
		//create the layout_map for the section to get the rows for the list
		// [section_tipo] => ["component_tipo1","component_tipo2",...]
		$layout_map = [];
		$layout_map[$section_tipo] = $current_section_list->section_list;
		$current_section->layout_map = $layout_map;

		$records_search = new records_search($current_section,'json');

		$filter_html = $records_search->get_html();

		return $filter_html;
	
	}//end get_filter_html



	/**
	* GET_SEARCH_OPTIONS
	* Resolve the search options for the section
	* @return html
	*/
	public function get_search_options($section_tipo, $current_section_list){

		$current_section = section::get_instance(null, $section_tipo, 'list');
		//create the layout_map for the section to get the rows for the list
		// [section_tipo] => ["component_tipo1","component_tipo2",...]
		$layout_map = [];
		$layout_map[$section_tipo] = $current_section_list->section_list;
		$current_section->layout_map = $layout_map;

		# SEARCH_OPTIONS
		$saved_search_options = section_records::get_search_options( $section_tipo .'_tool_cataloging' );

		if ($saved_search_options===false) {
			# Is not defined
			$search_options = new stdClass();
				$search_options->modo 	 = 'list';
				
			# SEARCH_QUERY_OBJECT . Add search_query_object to options
				$search_query_object = $current_section->build_search_query_object();							
			
				$search_options->search_query_object = $search_query_object;
		}else{
			# Use saved search options
			$search_options = $saved_search_options;
							
		}
		#$search_options_json = json_encode($search_options, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$search_options_json = json_encode($search_options, JSON_UNESCAPED_UNICODE );

		
		return $search_options_json;

	}//get_search_options



	/**
	* GET_HTML
	* 
	*/
	public function get_html(){
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
	}


	/**
	* GET_JSON
	* 
	*/
	public function get_json(){

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