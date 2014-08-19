<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$target_tipo			= $this->get_target();
	$id						= NULL;
	$modo					= $this->get_modo();		
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo); 	
	$html_title				= "Info about $tipo";

	
	$file_name = $modo;

	
	switch($modo) {
		
		case 'edit'		:	$ar_css		= $this->get_ar_css();							
							break;

		case 'tool_portal':
							$file_name  = 'list';
							break;
						
		case 'list'		:	$ar_css		= false;	
							break;
						
		case 'search'	:	$ar_css		= false;
							break;	
						
						
	}
		
	
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);
?>