<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
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
	
	$ar_langs				= $this->get_ar_langs();			#dump($ar_langs);

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;
	
	switch($modo) {
		
		case 'edit'	:	
						$ar_css		= $this->get_ar_css();
						/*
						foreach($ar_tools_obj as $tool_obj) {
							if( get_class($tool_obj) != 'tool_lang' )
							$html_tools .= $tool_obj->get_html();
						}
						*/
						$dedalo_projects_default_langs = unserialize(DEDALO_PROJECTS_DEFAULT_LANGS);
						break;
						
		case 'list'	:	$ar_css		= false;
						break;
						
		case 'list_of_values'	:
						$ar_css		= false;
						break;	
						
		case 'tool_time_machine'	:	
						$ar_css		= $this->get_ar_css();	
						break;		
		
		case 'search':	$ar_css		= false;		
						break;
						
		case 'simple':	$ar_css		= false;	
						break;				
						
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>