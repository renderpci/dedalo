<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$target_tipo			= $this->get_target();
	$id 					= NULL;
	$modo					= 'edit';		
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	#if($modo != 'simple')
	#$permissions			= common::get_permissions($tipo); 	
	$html_title				= "Click to login";
		
	
	switch($modo) {
		
		case 'edit'	:	$ar_css		= false;	
						break;
	}

	$file_name = $modo;

		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>