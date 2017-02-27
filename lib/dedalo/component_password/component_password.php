<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();
	$parent					= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();		
	$dato 					= $this->get_dato();
	$dato_limited_leng		= substr($dato, 0,25);
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
		
	$file_name = $modo;

	switch($modo) {

		case 'list':
				return null;
				break;
				
		case 'edit':
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";
				$component_info	= $this->get_component_info('json');
				break;
						
		case 'simple':
				break;									
		
		case 'tool_time_machine':
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				# Force filenam
				$file_name = 'edit';
				break;
	}
	
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>