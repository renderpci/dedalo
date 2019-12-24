<?php

	# CONTROLLER TOOL_REPLACE_COMPONENT_DATA

	$component_tipo 		= $this->component_obj->get_tipo();
	$section_id 			= $this->component_obj->get_parent();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$traducible 			= $this->component_obj->get_traducible();	
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();	
	$file_name 				= $modo;

	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_CORE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_CORE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	# Case search options from search (list) are not available (session is closed)
	if (empty($this->search_options->search_query_object)) {
		echo "<div class=\"error\">Invalid list values. Please, go to list mode and select the records that you can change before replace.</div>";
		return;
	}

	switch($modo) {		
	
		case 'button':
					
			$line_lenght = 90;	// Default value is 90
			break;
		
		case 'page':

			$valor 			= $this->component_obj->get_valor();
			$total_records 	= (int)$this->search_options->search_query_object->full_count;
			break;
		
	}//end switch		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_CORE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}