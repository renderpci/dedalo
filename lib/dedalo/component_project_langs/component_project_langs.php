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
	$ejemplo				= $this->get_ejemplo();
	$html_title				= NULL;
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$html_tools				= NULL;
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);	
	

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name = $modo;
	
	switch($modo) {
		
		case 'edit'	:
				$ar_langs		= $this->get_ar_langs();			#dump($ar_langs);
				$ar_css			= $this->get_ar_css();
				$component_info	= $this->get_component_info('json');
				/*
				foreach($ar_tools_obj as $tool_obj) {
					if( get_class($tool_obj) != 'tool_lang' )
					$html_tools .= $tool_obj->get_html();
				}
				*/
				$dedalo_projects_default_langs = (array)unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
				break;
						
		case 'list'	:
				$ar_langs = $this->get_ar_langs();
				break;						
		case 'list_of_values':				
				break;						
		case 'tool_time_machine'	:	
				$ar_css	= $this->get_ar_css();	
				break;
		
		case 'search':
				break;
						
		case 'simple':
				break;						
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>