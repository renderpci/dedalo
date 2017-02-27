<?php

	# CONTROLLER TOOL

	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$tipo 					= $this->component_obj->get_tipo();
	$section_tipo 			= $this->component_obj->get_section_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$file_name 				= $modo;

	$is_authorized_tool_for_logged_user = component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		#dump($is_authorized_tool_for_logged_user, ' is_authorized_tool_for_logged_user ++ '.to_string($tool_name));

	if (!$is_authorized_tool_for_logged_user) {
		echo " <div class=\"warning\">Sorry. Tool not allowed</div>";
		return;
	}
	
	
	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
	
	switch($modo) {	
		
		case 'button':
					
				break;

		case 'page':
					
				#
				# CSS includes
					#css::$ar_url[] = BOOTSTRAP_CSS_URL;
					array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
					
				#
				# JS includes
					#js::$ar_url[] = BOOTSTRAP_JS_URL;

				# original_text
				$original_text = $this->get_original_text();

				# preview_text
				$preview_text = $original_text;

				# test
				/*
				$offset_seconds = 0;
				$response = $this->change_all_timecodes( $offset_seconds );
				$preview_text = $response->result;
				*/
				break;		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>