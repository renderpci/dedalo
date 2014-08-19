<?php

	# CONTROLLER TOOL LANG

	$id 					= $this->component_obj->get_id();		#dump($id,'id');
	$tipo 					= $this->component_obj->get_tipo();
	$parent 				= $this->component_obj->get_parent();
	$lang 					= $this->component_obj->get_lang();
	$label 					= $this->component_obj->get_label();
	$permissions			= common::get_permissions($tipo);
	$button_row				= $this->button_row;

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

		#dump( $this->component_obj->get_image_path() );

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
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);	
?>