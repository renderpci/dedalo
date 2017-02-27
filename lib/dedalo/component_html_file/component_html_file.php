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
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$valor					= $this->get_valor();				
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	$html_file_id 			= $this->get_html_file_id();
	$html_file_url			= $this->get_html_file_url();
	$html_file_path 		= $this->get_html_file_path();


	switch($modo) {

		case 'edit'	:
			$id_wrapper = 'wrapper_'.$identificador_unico;
			$component_info 	= $this->get_component_info('json');
			

			# THUMB . Change temporally modo to get html
			$this->modo 		= 'thumb';
			$html_file_thumb_html 	= $this->get_html();
			
			# restore modo
			$this->modo 	= 'edit';
			break;		

		default: 
			return $valor;											
	}

	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>