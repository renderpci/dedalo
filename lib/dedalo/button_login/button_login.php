<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$target_tipo			= $this->get_target();
	$section_tipo			= $this->get_section_tipo();
	$id 					= NULL;
	$modo					= 'edit';		
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();	
	$html_title				= "Click to login";
		
	
	switch($modo) {
		
		case 'edit'	:

			break;
	}

	$file_name = $modo;

		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>