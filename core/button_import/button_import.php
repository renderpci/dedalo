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
	$properties 			= $this->get_properties();
	if(SHOW_DEBUG) {
		if (!isset($properties->section_tipo)) {
			dump($properties , ' DEBUG ALERT (mandatory section_tipo is not defined in \'properties\') properties - button_tipo: '.$tipo );
		}
	}
	$tool_name 	  			= $properties->tool_name;
	$context_name 			= isset($properties->context_name) ? $properties->context_name : null;	
	$target_section_tipo	= isset($properties->target_section_tipo) ? $properties->target_section_tipo : $properties->section_tipo;


	# T
	# Configure 'tipo' send ed in url as ?t=XXX
	# Default is section tipo, but you can use a component tipo if you need specifyc value (import files from section list case, for example)
	$t = isset($properties->component_tipo) ? $properties->component_tipo : $properties->section_tipo;

	# CUSTOM_PARAMS
	# Optional properties params (used from import files from section list)
	$custom_params = isset($properties->custom_params) ? json_encode($properties->custom_params) : null;
	
	
	if(SHOW_DEBUG) {
		if (!property_exists($properties, 'tool_name')) {
			dump($properties, ' DEBUG ALERT (mandatory tool_name is not defined in \'properties\') - properties');
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