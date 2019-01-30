<?php

	# CONTROLLER TOOL_CATALOGING

	$tool_name 			= get_class($this);
	$source_list 		= $this->source_list;
	$source_thesaurus 	= $this->source_thesaurus;
	$modo 				= $this->modo;
	$file_name			= $modo;
	$tool_tipo 			= $this->button_triguer_tipo;
	$tool_label 		= label::get_label('cataloging');


	switch($modo) {
		
		case 'button':
			
			break;

		case 'page':

			$context_data 	= $this->get_context_data();
			$data 			= $this->get_data();
			
			$tool_object 	= new stdClass();
				$tool_object->context_data 	= $context_data;
				$tool_object->data 			= $data;
			
			$data_json = encodeURIComponent(json_encode($tool_object));

			#dump($data,'$data');
			# TOOL CSS / JS MAIN FILES
			# CSS
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/css/component_portal.css";
			# JS
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/search/js/search2.js";
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
			js::$ar_url[] = DEDALO_LIB_BASE_URL."/component_portal/js/component_portal.js";

			break;		
	}//end switch

	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}

?>