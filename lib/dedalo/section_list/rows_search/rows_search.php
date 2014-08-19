<?php
	
	# CONTROLLER	
	$tipo							= $this->get_tipo();			
	$permissions					= common::get_permissions($tipo);	
	$modo							= $this->get_modo();

	$section_tipo 					= $this->section_list->section_obj->get_tipo();
	

#return $ar_search_fields;

	/*
	$ar_component_obj				= $this->ar_component_obj;
	$ar_components_search_obj		= $this->ar_components_search_obj;
	$ar_buttons_search_obj			= $this->ar_buttons_search_obj;				
					
	$ar_component_obj_html			= array();	
	$ar_components_search_obj_html	= array();	
	$ar_buttons_search_obj_html		= array();
	*/
	$form_action_url 				= '';

	$file_name						= $modo;

	
	/*
	# COMPONENTS (CAMPOS)
	if(isset($ar_component_obj) && is_array($ar_component_obj)) foreach($ar_component_obj as $component_obj) {
						
		$ar_component_obj_html[]			= $component_obj->get_html(); 
	}
	
	# SEARCH COMPONENTS	
	if(isset($ar_components_search_obj) && is_array($ar_components_search_obj)) foreach($ar_components_search_obj as $component_search_obj) {
						
		$ar_components_search_obj_html[]	= $component_search_obj->get_html();
	}
	
	# SEARCH BUTTONS	
	if(isset($ar_buttons_search_obj) && is_array($ar_buttons_search_obj)) foreach($ar_buttons_search_obj as $button_search_obj) {
						
		$ar_buttons_search_obj_html[]		= $button_search_obj->get_html();
	}	
	*/

	switch($modo) {		
						
		case 'portal_list'	:
						$file_name = 'list';

		case 'list'	:	# FIELDS
						$ar_search_fields = $this->get_ar_search_fields();
							#dump($ar_search_fields,'ar_search_fields');

						# BUTTONS						
						$ar_tools_search = $this->get_ar_tools_search();
							#dump($ar_tools_search,'ar_tools_search');

						break;

		case 'relation':# Nothing to do
						break;		
	}

	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
	include($page_html);	
	
	
?>