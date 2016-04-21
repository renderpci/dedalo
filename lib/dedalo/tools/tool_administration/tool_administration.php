<?php

	# CONTROLLER TOOL

	$tool_name 				= get_class($this);
	$modo 					= $this->get_modo();
	$file_name 				= $modo;

	$is_authorized_tool_for_logged_user = component_security_tools::is_authorized_tool_for_logged_user($tool_name);
		#dump($is_authorized_tool_for_logged_user, ' is_authorized_tool_for_logged_user ++ '.to_string());

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
					#css::$ar_url[] = DEDALO_ROOT_WEB.'/lib/bootstrap/css/bootstrap.min.css';
					array_unshift(css::$ar_url_basic, DEDALO_ROOT_WEB.'/lib/bootstrap/dist/css/bootstrap.min.css');
					
				#
				# JS includes
					#js::$ar_url[] = DEDALO_ROOT_WEB.'/lib/bootstrap/dist/js/bootstrap.min.js';
				
				break;		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>