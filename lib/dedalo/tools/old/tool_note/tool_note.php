<?php

	# CONTROLLER TOOL

	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$section_tipo 			= $this->section_obj->get_tipo();
	$section_id 			= $this->section_obj->get_section_id();
	$lang 		 			= $this->section_obj->get_lang();
	$file_name 				= $modo;


	$is_authorized_tool_for_logged_user = component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		#dump($is_authorized_tool_for_logged_user, ' is_authorized_tool_for_logged_user ++ '.to_string($tool_name));

	if (!$is_authorized_tool_for_logged_user) {		
		return;
	}
	
	
	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	
	switch($modo) {	
		
		case 'button':
					
				break;

		case 'page':


				$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_NOTES_TEXT_TIPO,true);
				$component_text = component_common::get_instance($modelo_name,
																 DEDALO_NOTES_TEXT_TIPO,
																 $section_id,
																 'edit',
																 $lang,
																 $section_tipo);
				$component_text_html = $component_text->get_html();
					
				#
				# CSS includes
					#css::$ar_url[] = BOOTSTRAP_CSS_URL;
					array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
					
				#
				# JS includes
					#js::$ar_url[] = BOOTSTRAP_JS_URL;

					
				
				break;		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>