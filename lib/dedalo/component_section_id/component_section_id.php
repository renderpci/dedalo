<?php
	
	# CONTROLLER


	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();
	$permissions			= 1;	//common::get_permissions($tipo);
	$html_title				= "Info about $tipo";		
	$html_tools				= '';
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$visible				= $this->get_visible();
	$file_name				= $modo;
	
	
	switch($modo) {		
	
		case 'edit':				
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";				
				$component_info = '';//$this->get_component_info('json');
					#dump($component_info, ' component_info'.to_string());
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
				if ($dato<1) {
					$dato = null;
				}

				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();
				break;					
	}
	

	$page_html	= dirname(__FILE__) . '/html/' . $component_name . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>