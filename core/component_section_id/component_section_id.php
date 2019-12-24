<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$lang					= $this->get_lang();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$valor					= $this->get_valor();
	$traducible 			= $this->get_traducible();
	$visible				= $this->get_visible();
	$label 					= $this->get_label();
	$permissions			= $this->get_component_permissions();
	$html_title				= "Info about $tipo";	
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);	
	$file_name				= $modo;

		
	if($permissions===0) return null;
	
	switch($modo) {		
	
		case 'edit':
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";				
				$component_info = $this->get_component_info('json');
				break;

		case 'print':
				$dato = intval($dato);
				break;

		case 'tool_time_machine':	
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;
				
		case 'portal_list':
				if(empty($valor)) return null;					
		
		case 'list_tm' :
				$file_name = 'list';	

		case 'list'	:	
				break;	
		
		case 'search':				
				# dato is injected by trigger search wen is needed
				$dato = isset($this->dato) ? $this->dato : null;

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