<?php
	
	# CONTROLLER	
	
	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();				
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	if($modo != 'simple')
	$permissions			= common::get_permissions($tipo); 	
	$ejemplo				= "example: 'user@server.org'";
	$html_title				= "Info about $tipo";
	#$ar_tools_obj			= $this->get_ar_tools_obj();	
	#$html_tools				= '';
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$valor_string			= $dato;

	
	
	$file_name				= $modo;	
	
	switch($modo) {
		
		case 'edit'	:	
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL ;
				
				$ar_css		= $this->get_ar_css();
				#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";	
				$component_info 	= $this->get_component_info('json');	
				break;

		case 'tool_time_machine'	:	
				$ar_css		= $this->get_ar_css();
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				# Force modo
				$file_name 	= 'edit';
				break;				
						
		case 'list_tm' :
				$file_name = 'list';
						
		case 'list'	:
				$ar_css		= false;	
				break;
						
		case 'list_of_values'	:	
				$ar_css		= false;
				break;

		case 'relation'	:
				# Force modo list
				$file_name 	= 'list';
				$ar_css		= false;
				break;	
		
		case 'search':
				$ar_css		= $this->get_ar_css();
				foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();		
				break;
						
		case 'simple':
				$ar_css		= $this->get_ar_css();	
				break;					
		case 'print':
				
				break;				
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>