<?php
	
	# CONTROLLER
	$class_name 			= get_class();
	$section_tipo 			= $this->get_section_tipo();
	$section_id 			= $this->get_section_id();
	$modo					= $this->get_modo();	

	$permissions			= common::get_permissions($section_tipo, $section_tipo);
	$this->section->set_permissions($permissions);	// Fix permissions for current element (important)

	$lang					= DEDALO_DATA_LANG;	
	$identificador_unico	= $this->section->get_identificador_unico();

	$file_name				= $modo;
	switch($modo) {		
	
		case 'edit'	:
				$id_wrapper 	  = 'wrapper_'.$identificador_unico;
				$term 			  = $this->get_term();
				$ar_elements 	  = $this->get_ar_elements();

				$childrens_html   = '';
				$indexations_html = '';

				# Aditional css / js
				css::$ar_url[] = DEDALO_LIB_BASE_URL.'/section_records/'.$class_name."/css/".$class_name.".css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL.'/section_records/'.$class_name."/js/".$class_name.".js";											
				break;

		default:
			echo "Invalid mode $this->modo";
			return null;				
	}
	

	$page_html	= dirname(__FILE__) . '/html/' . $class_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>