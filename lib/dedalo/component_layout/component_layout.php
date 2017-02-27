<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();		
	$dato 					= $this->get_dato();
	$valor					= $this->get_valor();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";	
	
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context_name 			= $this->get_context();
	
	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;	

	
	switch($modo) {
		
		case 'edit' :
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";
				$component_info = $this->get_component_info('json');
				#return "WORK IN PROGRESS..";

				# Aditional css / js
				css::$ar_url[] = DEDALO_ROOT_WEB."/lib/jsoneditor/jsoneditor.min.css";
				js::$ar_url[]  = DEDALO_ROOT_WEB."/lib/jsoneditor/jsoneditor.min.js";

				# reference
				#$dato = new stdClass();
				#$dato->print = '<div class="test_class"> test print </div>';
				#$dato->edit = '<div class="test_class"> test edit </div>';
				break;

		case 'tool_time_machine' :	
				return null;	
				break;						
						
		case 'search' :
				# Search input name
				$search_input_name = $section_tipo.'_'.$tipo;
				
				return null;
				break;

		case 'list_tm' :
				$file_name = 'list';							
		case 'list' :
				echo "WORK IN PROGRESS..";
				return ;
				break;		
		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>