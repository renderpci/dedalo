<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$section_tipo 			= $this->get_section_tipo();
	$target_tipo			= $this->get_target();
	$id 					= $this->get_target();
	$mode					= $this->get_mode();
	$label 					= $this->get_label();
	$properties 			= $this->get_properties();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	$html_title				= "Info about $tipo";

	$file_name 				= $mode;

	
	switch($mode) {
		
		case 'edit':
					break;
						
		case 'tool_portal':
					$file_name  = 'edit';
					break;
						
		case 'relation':$file_name  = 'edit';
					break;

		case 'tool_time_machine':
					$file_name  = 'edit';
					break;

		case 'selected_fragment':
					$file_name  = 'edit';
					break;

		case 'list':
					break;
						
		case 'list_of_values':
					break;
	}
	
		
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->mode</div>";
	}
?>