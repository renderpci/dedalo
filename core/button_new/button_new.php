<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();	
	$section_tipo 			= $this->get_section_tipo();
	$target_tipo			= $section_tipo ; //$this->get_target();
	$context_tipo 			= $this->get_context_tipo(); // section tipo
	$id						= NULL;
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();

	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo); 	
	$html_title				= label::get_label('nuevo');	
	$file_name 				= $modo;


	switch($modo) {
		
		case 'list':
				#$label = strip_tags($label);
				break;

		case 'edit'	:
				$file_name	= 'list';					
				break;

		case 'tool_portal':			
		case 'relation':
				$file_name	= 'edit';
				break;

		case 'tool_time_machine':		
				$file_name	= 'edit';
				break;				

		case 'selected_fragment':
				$file_name  = 'edit';
				break;
						
		case 'list_of_values':						
				break;						
	}


	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>