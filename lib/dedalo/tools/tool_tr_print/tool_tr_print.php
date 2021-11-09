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
			return;
		}
	
	
	switch($modo) {	
		
		case 'button':
				break;

		case 'page':

				# TOOL CSS / JS MAIN FILES
				css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/Blob.js";
				js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/FileSaver.js";
					
				#
				# CSS includes
					#css::$ar_url[] = BOOTSTRAP_CSS_URL;
					#array_unshift(css::$ar_url_basic, BOOTSTRAP_CSS_URL);

				#
				# JS includes
					#js::$ar_url[] = BOOTSTRAP_JS_URL;

				// if(SHOW_DEBUG===true) {
					# tr data (header)
					$tr_data = $this->get_tr_data();
				// }	
				
				# source_text				
				$source_text = $this->get_source_text();				

				# ar_tc_text
				$options 	= new stdClass();
				$response 	= $this->get_ar_tc_text( $options );
				$ar_tc_text = $response->result;
				#$preview_text = $response->result;

				# PSEUDO VTT
				$duration 	= $this->get_av_duration();
				$pseudo_vtt = tool_tr_print::build_pseudo_vtt($ar_tc_text, $duration);

				# ORIGINAL_TEXT
				$original_text = $this->get_original_text();

				#
				# TEXT_CLEAN
				$raw_text 		= $this->get_raw_text();
				$text_clean 	= $raw_text;
				# clean text
				$text_clean 	= trim($text_clean); #$text_clean = htmlspecialchars_decode($text_clean);
				# Remove Dédalo marks
				$text_clean 	= TR::deleteMarks($text_clean);		
				
				#
				# COUNT
				$chars_info = TR::get_chars_info($raw_text);
					#dump($chars_info, ' $chars_info ++ '.to_string()); #die();

				$total_chars  			= $chars_info->total_chars;
				$total_chars_no_spaces 	= $chars_info->total_chars_no_spaces;				
				break;		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}	
?>