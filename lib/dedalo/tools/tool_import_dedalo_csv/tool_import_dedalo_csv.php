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
					#array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);
					
				#
				# JS includes
					#js::$ar_url[] = BOOTSTRAP_JS_URL;

				js::$ar_url[] = DEDALO_LIB_BASE_URL.'/tools/tool_common/js/dedalo_upload.js';
				
				#$target_file_name = 'marc21_uploaded_file.mrc';
				$target_file_path = DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH;	//DEDALO_MEDIA_BASE_PATH . '/import/files';
				#$file_final_path  = $target_file_path .'/'. $target_file_name;

					
				
				break;		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>