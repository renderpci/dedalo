<?php

	# CONTROLLER TOOL LANG

	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$button_row				= $this->button_row;
	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	switch($modo) {	
		
		case 'button':
					# Nothing to do
					break;

		
		case 'page':
					$selector_relation_html 	= null;
					$component_relation 		= $this->component_obj;
					$component_relation->set_modo('selector');
					$selector_relation_html = $component_relation->get_html();

					$iframe_records_relation_url 	= null;
					break;

		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>