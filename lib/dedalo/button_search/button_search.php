<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$target_tipo			= $this->get_target();
	$id						= NULL;
	$modo					= $this->get_modo();		
	$label 					= $this->get_label();
	#$debugger				= $this->get_debugger();	
	$html_title				= "Info about $tipo";
	
	# Fixed to 1
	$permissions			= 1;	
	
	$file_name = $modo;

	
	switch($modo) {
		
		case 'edit':				
				break;

		case 'tool_portal':
				$file_name  = 'list';
				break;
						
		case 'list':
				break;
						
		case 'search':
				break;							
						
	}
		
	
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>