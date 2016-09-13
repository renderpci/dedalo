<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$lang					= $this->get_lang();	
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= NULL;
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
		

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name = $modo;
	
	switch($modo) {
		
		case 'edit'	:
				$dato 			= $this->get_dato();
				$valor 			= $this->get_valor();
				$ar_langs		= $this->get_ar_langs();
				$component_info	= $this->get_component_info('json');
				$dedalo_projects_default_langs = (array)unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
				break;
						
		case 'list'	:
				#$valor	  = $this->get_valor();
				$ar_langs = $this->get_ar_langs(); 
				break;						
		case 'list_of_values':				
				break;						
		case 'tool_time_machine':
				break;
		
		case 'search':
				break;
						
		case 'simple':
				break;

		case 'print':
				break;					
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>