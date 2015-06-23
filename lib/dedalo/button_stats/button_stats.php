<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$context_tipo			= $this->get_context_tipo();
	$id						= NULL;
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();

	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$html_title				= "Info about $tipo";
	$ar_css					= $this->get_ar_css();	
	$file_name 				= $modo;

	switch($modo) {		
						
		case 'list'	:	
						break;

		case 'edit'	:	return null;
						break;

		default:
						return null;
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>