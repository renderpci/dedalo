<?php
/*
	CONTROLLER
	Controller set specific page vars and create document content. 
*/
require_once(dirname(dirname(__FILE__)) .'/config_api/client_config_api.php');


	#
	# SAMPLE GET ALL TABLES INFO
		$options = new stdClass();
			$options->dedalo_get = 'tables_info';

		# DATA RETRIEVING
		$tables_info = json_web_data::get_data($options);
			#dump($tables_info, ' tables_info ++ '.to_string());

	#
	# SAMPLE GET PUBLICATION_SCHEMA
		$options = new stdClass();
			$options->dedalo_get = 'publication_schema';
		
		# DATA RETRIEVING
		$publication_schema = json_web_data::get_data($options);
			#dump($publication_schema, ' publication_schema ++ '.to_string());		


	#
	# SAMPLE GET ALL RECORDS UNFILTERED FROM TABLE
		$table = isset($_GET['t']) ? $_GET['t'] : WEB_DEFAULT_TABLE;

		$options = new stdClass();
			$options->dedalo_get 	 = 'records';
			$options->table 	 	 = $table;
			$options->order 	 	 = 'section_id ASC';
			$options->lang  	 	 = WEB_CURRENT_LANG_CODE;
			$options->resolve_portal = false;

		#
		# DATA RETRIEVING
		$search_data_records = json_web_data::get_data($options);
			#dump($search_data_records, ' search_data_records ++ '.to_string()); #die();
		

	#
	# SAMPLE GET REEL_TERMS
		$options = new stdClass();
			$options->dedalo_get 	= 'reel_terms';
			$options->av_section_id = $av_section_id = 1;
			$options->lang  	 	= WEB_CURRENT_LANG_CODE;

		# DATA RETRIEVING
		$search_data_reel_terms = json_web_data::get_data($options);
			#dump($search_data_reel_terms, ' search_data_reel_terms ++ '.to_string());


	#
	# SAMPLE GET FRAGMENTS_FROM_INDEX_LOCATOR
		#$locator = '{"type":"dd96","tag_id":"1","section_id":"1","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"1","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}';
		$locator = '{"type":"dd96","tag_id":"1","section_id":"1","section_tipo":"rsc167","component_tipo":"rsc36","section_top_id":"1","section_top_tipo":"oh1","from_component_tipo":"hierarchy40"}';
		$options = new stdClass();
			$options->dedalo_get 	= 'fragment_from_index_locator';
			$options->index_locator = $locator;
			$options->lang  	 	= WEB_CURRENT_LANG_CODE;

		# DATA RETRIEVING
		$search_data_fragment_from_index_locator = json_web_data::get_data($options);
			#dump($search_data_fragment_from_index_locator, ' search_data_fragment_from_index_locator ++ '.to_string()); die();



# HTML CONTENT
	$cwd = basename(__DIR__);
# Get specifig body content of current page
	ob_start();
	include ( __WEB_ROOT__ .'/'. $cwd . '/html/' . $cwd . '.phtml');
	$html = ob_get_clean();
	echo wrap_html($html,$cwd);
?>