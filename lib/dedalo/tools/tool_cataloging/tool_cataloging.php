<?php

	# CONTROLLER TOOL_CATALOGING

	$tool_name 		= get_class($this);
	$source_list 	= $this->source_list;
	$source_thesaurus 	= $this->source_thesaurus;
	$modo 			= $this->modo;
	$file_name		= $modo;

	$tool_tipo 		= $this->button_triguer_tipo;
	$tool_label 	= label::get_label('cataloging');


	switch($modo) {
		
		case 'button':
			
			break;

		case 'page':

			$sections_to_catalog 	= $this->get_sections_to_catalog();
			
			$data_json = encodeURIComponent(json_encode($sections_to_catalog));


			#dump($data,'$data');
			# TOOL CSS / JS MAIN FILES
			# CSS
			css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
			# JS
			js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

			break;		
	}//end switch

	


	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}

?>