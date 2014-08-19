<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();		#dump($id,'id');
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($tipo);
	$button_row				= $this->button_row;
	$target_section_tipo 	= $this->component_obj->get_target_section_tipo();
	$modo 					= $this->get_modo();
	$file_name 				= $modo;	



	switch($modo) {	
		
		#case 'button':
		#			# Button is inside component_portal
		#			break;

		
		case 'page':
					#echo " - tipo:$tipo - target_section_tipo:$target_section_tipo -";

					#return null;

					$section = new section(null, $target_section_tipo, 'list');
					
					#$section->set_caller_id(3926);
					$section->set_caller_tipo($tipo);

					# CONFIGURE SECTION CONTEXT
					$section->set_context('list_into_tool_portal');

						#dump($section,'section');
					

					$list_html = $section->get_html();		

					#DEDALO_LIB_BASE_URL + "/main/?m=list&tipo="+current_tipo+"&caller_id="+caller_id+"&caller_tipo="+caller_tipo;
					break;

		
		
	}#end switch
		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);	
?>