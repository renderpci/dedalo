<?php

	# CONTROLLER TOOL LANG

	$target_filename 		= $this->get_target_filename();
	$target_dir 			= $this->get_target_dir();

	$tipo 					= $this->component_obj->get_tipo();

	$modo 					= $this->get_modo();
	$file_name 				= $modo;	

	#dump($this);

	switch($modo) {	
		
		case 'button':
					return NULL;
					break;

		case 'page':
					#return print " ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff ";
					break;				
		
	}#end switch		


		



	# INCLUDE FILE HTML
	$page_html	= DEDALO_LIB_BASE_PATH . '/component_tools/' . get_class($this).  '/html/' . get_class($this) . '_' . $file_name .'.phtml';
	include($page_html);
	
?>