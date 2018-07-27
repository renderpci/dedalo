<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$extension_name 		= get_class($this);
	$ar_target_section_tipo	= $this->get_ar_target_section_tipo();
	$search_fields			= $this->get_search_fields();
	$show_fields			= $this->get_show_fields();
	$divisor 				= $this->get_divisor();
	$modo					= $this->get_modo();
	$filter_by_value		= $this->get_filter_by_value();
	$filter_by_list 		= $this->get_filter_by_list();
	$limit 					= $this->get_limit();	
	
	$file_name = $modo;
	switch($modo) {
			
		case 'edit'	:

			$extension_wrapper_id 	= $extension_name.'_'.$tipo;
			$cookie_name 			= $extension_wrapper_id;

			# SEARCH_QUERY_OBJECT
			$query_object_options = new stdClass();
				$query_object_options->q 	 			= null;
				$query_object_options->limit  			= $limit;
				$query_object_options->offset 			= 0;
				$query_object_options->section_tipo 	= $ar_target_section_tipo;					
			$search_query_object 		= $this->build_search_query_object($query_object_options);
				# skip_projects_filter true on edit mode
				$search_query_object->skip_projects_filter 	= true;
			$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS );
				dump($json_search_query_object, ' json_search_query_object ++ '.to_string()); die();

			break;
						
		case 'search':
			# Not defined yet
			break;
	}
	
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/extensions/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>