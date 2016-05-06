<?php
	
	# CONTROLLER
	
	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$dato_reference_lang 	= NULL;
	$traducible 			= $this->get_traducible();
	$label 					= $this->get_label();				
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo); 	
	$ejemplo				= $this->get_ejemplo();
	$html_title				= "Info about $tipo";		
	$lang					= $this->get_lang();
	$lang_name				= $this->get_lang_name();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$ejemplo 				= $this->get_ejemplo();
	$propiedades 			= $this->get_propiedades();
	

	# CONTEXT	
	if (isset($propiedades->method->get_valor_local)) {
		$valor	= $this->get_valor_local( reset($propiedades->method->get_valor_local) );		#dump($valor," valor");
	}else{
		$valor	= $this->get_valor_local(false);		
	}
		

	$file_name = $modo;
	
	
	switch($modo) {
		
		case 'tool_lang':
				$file_name = 'edit';
		case 'edit' :
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL;
				
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";
				$component_info = $this->get_component_info('json');
				$dato_json 		= json_encode($this->dato);
							
				break;

		case 'tool_time_machine' :				
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				# Force file_name
				$file_name  = 'edit';
				break;
				
		case 'portal_list'	:
				$file_name = 'list';
				if (empty($valor)) {
					return null;
				}						
		case 'list_tm' :
				$file_name = 'list';						
		case 'list'	:				
				break;
						
		case 'list_of_values':				
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';				
				break;
						
		case 'lang'	:					
				break;
		
		case 'search':
				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();	
				break;
						
		case 'simple':				
				break;

		case 'print':
					
				break;					
	}
	
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>