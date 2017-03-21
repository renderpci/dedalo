<?php
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();
	$section_tipo 			= $this->get_section_tipo();
	$propiedades			= $this->get_propiedades();
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();	
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$html_title				= "Info about $tipo";
	$dato 					= $this->get_dato();
	$valor					= $this->get_valor();	
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$file_name				= $modo;

	if($permissions===0) return null;

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	switch($modo) {
		
		case 'tool_lang':
				$file_name 		= 'edit';
		case 'edit'	:				
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";				
				$component_info = $this->get_component_info('json');
				$elements 		= $propiedades->elements;
				$dato_json 		= json_encode($dato);

					#dump($dato, ' dato ++ '.to_string());										
				break;

		case 'print' :
				$dato = $valor;
				break;

		case 'tool_time_machine'	:	
				$id_wrapper 	= 'wrapper_'.$identificador_unico.'_tm';
				$input_name 	= "{$tipo}_{$parent}_tm";				
				$file_name  	= 'edit'; # Force file_name
				break;				
		
		case 'list'	:	
				break;		
		
		case 'search':
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();

				if(isset($_REQUEST[$tipo])) $dato = $_REQUEST[$tipo];

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;					
	}
	

	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>