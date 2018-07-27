<?php

	# CONTROLLER TOOL

	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
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
					
				#
				# CSS includes
					#css::$ar_url[] = BOOTSTRAP_CSS_URL;
					array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
					
				#
				# JS includes
					#js::$ar_url[] = BOOTSTRAP_JS_URL;

				$current_dedalo_version = $this->get_dedalo_version();
				$current_dedalo_version = implode(".", $current_dedalo_version);


				$current_version_in_db = tool_administration::get_current_version_in_db();
				$current_version_in_db = implode(".", $current_version_in_db);


				$update_version = $this->get_update_version();				
				if(!empty($update_version)) {
					$update_version = implode(".", $update_version);
				}


				# Aditional css / js
				css::$ar_url[] = DEDALO_ROOT_WEB."/lib/jsoneditor/jsoneditor.min.css";
				js::$ar_url[]  = DEDALO_ROOT_WEB."/lib/jsoneditor/jsoneditor.min.js";
				#js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_json/js/component_json.js";

				#session_write_close();				
				break;		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>