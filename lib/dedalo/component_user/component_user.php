<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();	
	if($modo != 'simple')
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	$userID					= $dato;
	

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;

	
	
	switch($modo) {		
		
		case 'search' :	$file_name = 'list';
						return NULL;

		case 'list'	:
						break;
						
						
	}
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>