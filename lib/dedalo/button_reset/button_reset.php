<?php
	
	# CONTROLLER	
	
	$tipo 					= $this->get_tipo();
	$target_tipo			= $this->get_target();
	$id						= NULL;
	$modo					= $this->get_modo();		
	$label 					= $this->get_label();
	$dato 					= $this->get_dato();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo); 	
	$html_title				= "Info about $tipo";

	
	/*
	switch($modo) {
								
		case 'list'	:	$ar_css		= false;	
						break;
						
						
		case 'search':	$ar_css		= false;
						break;					
						
	}
	*/
	$file_name = 'list';
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	include($page_html);
?>