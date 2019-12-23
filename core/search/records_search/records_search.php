<?php
	
	# CONTROLLER
	$modo					= $this->get_modo();
	$section_tipo 			= $this->section_tipo;

	/**
	* TEMPORAL !!
	* Para posibilitar el acceso del filtro a las secciones virtuales, fijamos los permisos temporalmente a 2
	*/
	$permissions = 2;

	if ($permissions<1) {
		echo "<span class=\"css_span_dato\">Access denied</span>";
		#return false;
	}	
	
	$ar_sections_by_type 	= isset($this->ar_sections_by_type) ? $this->ar_sections_by_type : null;
	
	#
	# OPTIONS CUSTOM
	# inyectado a la sección y usado para generar pequeñas modificaciones en la visualización del section list como por ejemplo el link de enlazar un registro con un portal
	$context = (object)$this->section_obj->context;
	/* 
	switch (true) {		
		case ( isset($context->context_name) && $context->context_name==='section_tool' && isset($context->tool_section_tipo) ):
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
	*/
	if (!isset($context->context_name)) {
		$context->context_name = false;
	}
	

	$form_action_url 	= '';
	$file_name			= $modo;

	#
	# DEVELOPMENT 2	- SEARCH2
		js::$ar_url[]  = DEDALO_LIB_BASE_URL . '/search/js/search2.js';

		

		# Get current search_options 
		# $search_options_id 	 = $section_tipo;
		# $search_options 	 = section_records::get_search_options( $search_options_id );
		#$search_options_json = json_encode($search_options);
		$user_id 	 = navigator::get_user_id();
		$temp_preset = search_development2::get_preset(DEDALO_TEMP_PRESET_SECTION_TIPO, $user_id, $section_tipo);
		$temp_filter = isset($temp_preset->json_filter) ? $temp_preset->json_filter : null;
	
		$init_options  = array(
							"section_tipo" 			=> $section_tipo,
							"temp_filter" 			=> encodeURIComponent($temp_filter),
							"modo" 					=> $this->modo,
							"ar_real_section_tipo" 	=> isset($this->ar_real_section_tipo) ? $this->ar_real_section_tipo : null,
							"ar_sections_by_type"	=> $ar_sections_by_type
							);
		$init_options_json = json_encode($init_options, JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP | JSON_HEX_TAG);


	
	switch($modo) {			
		
		case 'edit':
				$file_name = 'list';
				
		case 'search':
				$file_name = 'list';

		case 'portal_list':
				$file_name = 'list';

		case 'thesaurus':
				$file_name = 'list';

		case 'list':
				break;

		case 'json':
				$file_name = 'list';
				break;

		case 'relation':
				# Nothing to do
				break;		
	}

	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
	include($page_html);	
	
	
?>