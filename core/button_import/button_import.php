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
			dump($propiedades , ' DEBUG ALERT (mandatory section_tipo is not defined in \'propiedades\') propiedades - button_tipo: '.$tipo );
		}
	}
	$tool_name 	  			= $propiedades->tool_name;
	$context_name 			= isset($propiedades->context_name) ? $propiedades->context_name : null;	
	$target_section_tipo	= isset($propiedades->target_section_tipo) ? $propiedades->target_section_tipo : $propiedades->section_tipo;


	# T
	# Configure 'tipo' send ed in url as ?t=XXX
	# Default is section tipo, but you can use a component tipo if you need specifyc value (import files from section list case, for example)
	$t = isset($propiedades->component_tipo) ? $propiedades->component_tipo : $propiedades->section_tipo;

	# CUSTOM_PARAMS
	# Optional propiedades params (used from import files from section list)
	$custom_params = isset($propiedades->custom_params) ? json_encode($propiedades->custom_params) : null;
	
	
	if(SHOW_DEBUG) {
		if (!property_exists($propiedades, 'tool_name')) {
			dump($propiedades, ' DEBUG ALERT (mandatory tool_name is not defined in \'propiedades\') - propiedades');
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