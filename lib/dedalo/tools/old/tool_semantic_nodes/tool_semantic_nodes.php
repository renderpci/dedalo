<?php

	# CONTROLLER TOOL LANG

	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$section_tipo 			= $this->component_obj->get_section_tipo();				
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$component_name			= get_class($this->component_obj);
	$tool_name 				= get_class($this);
	$button_row				= $this->button_row;
	$target_section_tipo 	= $this->component_obj->target_section_tipo;	
	$modo 					= $this->get_modo();
	$file_name 				= $modo;	


	# TOOL CSS / JS MAIN FILES
	css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/css/".$tool_name.".css";
	js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/".$tool_name."/js/".$tool_name.".js";

	
	switch($modo) {	
				
		case 'page':

				$section = section::get_instance(null, $target_section_tipo, 'list');
				
					$section->set_caller_tipo($tipo);

					# Because components are loaded by ajax, we need prepare js/css elements from tool
					#
					# CSS
						css::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/css/$component_name.css";
					#
					# JS includes
						js::$ar_url[] = DEDALO_LIB_BASE_URL."/$component_name/js/$component_name.js";

					$exclude_elements = $this->component_obj->get_exclude_elements();

					# SEARCH_OPTIONS_SESSION_KEY
					$search_options_session_key = 'tool_portal_'.$target_section_tipo;

					# CONFIGURE SECTION CONTEXT
					$context = new stdClass();
						$context->context_name 				 = 'list_into_tool_portal';
						$context->portal_tipo 				 = $tipo;
						$context->portal_parent 			 = $parent;
						$context->portal_section_tipo 		 = $section_tipo;
						$context->exclude_elements 	  		 = $exclude_elements;
						$context->search_options_session_key = $search_options_session_key;
							#dump($context, ' context ++ '.to_string());
					
					$section->set_context($context);
					
					$section_html = $section->get_html();

				#DEDALO_LIB_BASE_URL + "/main/?m=list&tipo="+current_tipo+"&caller_id="+caller_id+"&caller_tipo="+caller_tipo;
				break;
		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>