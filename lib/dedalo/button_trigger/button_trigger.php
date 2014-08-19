<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();			
	$target_tipo			= $this->get_target();
	$id						= NULL;
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();

	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo); 	
	$html_title				= "Info about $tipo";	
	$file_name 				= $modo;


	switch($modo) {
		
		case 'list':
				return null;

		case 'edit':		
				$file_name 		= 'edit';
				$propiedades 	= $this->get_propiedades();
					#dump($propiedades,'propiedades');

				$propiedades->component_parent 	= $this->parent;	# add current parent section id_matrix to vars
				$propiedades->lang_filter 		= DEDALO_DATA_LANG;	# add current lang to vars

				$propiedades 	= json_handler::encode($propiedades);
					#dump($propiedades,'propiedades after');

				#dump($this);		
				break;
		
		default:
				throw new Exception("Error Processing Request. Modo '$modo' not supported by $label", 1);
								
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>