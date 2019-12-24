<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$target_tipo			= $this->get_target();
	$id						= NULL;
	$modo					= $this->get_modo();
	$label 					= $this->get_label();
	$section_tipo 			= $this->get_section_tipo();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo, $tipo);
	$html_title				= "Info about $tipo";
	$file_name 				= $modo;
	
	switch($modo) {
		
		case 'list':
		case 'edit':		
				$file_name 		= 'edit';
				$propiedades 	= $this->get_propiedades();
				
				$propiedades->component_parent 	= $this->parent;	# add current parent section_id to vars
				$propiedades->lang_filter 		= DEDALO_DATA_LANG;	# add current lang to vars
				$propiedades_json 				= json_handler::encode($propiedades);
	
				# Custom js_exec_function (instead default 'trigger')
					$js_exec_function = isset($propiedades->js_exec_function) ? $propiedades->js_exec_function : false;
				break;
		
		default:
				throw new Exception("Error Processing Request. Modo '$modo' not supported by $label", 1);
	}
	

	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}