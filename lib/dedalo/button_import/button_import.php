<?php


	# CONTROLLER

	$tipo 					= $this->get_tipo();
	#$section_tipo			= $this->get_context_tipo();
	$section_tipo 			= $this->get_section_tipo();
	$id						= NULL;
	$modo					= $this->get_modo();
	$label 					= $this->get_label();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);	
	$html_title				= "Info about $tipo";
	$propiedades 			= $this->get_propiedades();
	if(SHOW_DEBUG) {
		if (!isset($propiedades->section_tipo)) {
			dump($propiedades , ' propiedades - button_tipo: '.$tipo );
		}
	}
	$tool_name 	  			= $propiedades->tool_name;
	$context_name 			= $propiedades->context_name;
	$target_section_tipo	= $propiedades->section_tipo;
	
	
	if(SHOW_DEBUG) {
		if (!property_exists($propiedades, 'tool_name')) {
			dump($propiedades, ' propiedades');
			throw new Exception("Error Processing Request. Properties 'tool_name' is mandatory ", 1);			
		}
	}		

	switch($modo) {
						
		case 'list'	:
				
				break;

		default: 
				return null;
	}
		
	
	$page_html = 'html/' . get_class($this) . '_' . $modo . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>