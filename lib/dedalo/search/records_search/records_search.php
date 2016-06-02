<?php
	
	# CONTROLLER
	$modo							= $this->get_modo();
	$section_tipo 					= $this->section_tipo;	
	$permissions					= common::get_permissions($section_tipo, $this->search_list_tipo);	
	
	

	#
	# OPTIONS CUSTOM
	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
	$context = (object)$this->section_obj->context; 
	switch (true) {		
		case ( isset($context->context_name) && $context->context_name=='section_tool' && isset($context->tool_section_tipo) ):
			#
			# SECTION TOOL CASE
			# When current section is 'section_tool', $section_obj->context->section_tool was set with section_tool propiedades. In this case
			# section list of referenced 'tool_section_tipo' is used for create this session_key
			$search_options_session_key = 'section_'.$context->tool_section_tipo;
			break;
		default:
			$search_options_session_key	= 'section_'.$section_tipo;			
			break;
	}

	if (!isset($context->context_name)) {
		$context->context_name = false;
	}

	/**
	* TEMPORAL !!
	* Para posibilitar el acceso del filtro a las secciones virtuales, fijamos los permisos temporalmente a 1
	*/
	$permissions=1;

		


	if ($permissions<1) {
		echo "\n <span class=\"css_span_dato\"></span>";
		return false;
	}
	
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
		
		case 'edit':
				$file_name = 'list';
				
		case 'search':
				$file_name = 'list';

		case 'portal_list':
				$file_name = 'list';

		case 'list':
				# FIELDS
				$ar_search_fields = $this->get_ar_search_fields();

				# BUTTONS						
				$ar_tools_search = $this->get_ar_tools_search();
					#dump($ar_tools_search, ' ar_tools_search ++ '.to_string());				
				break;

		case 'relation':
				# Nothing to do
				break;		
	}

	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
	include($page_html);	
	
	
?>