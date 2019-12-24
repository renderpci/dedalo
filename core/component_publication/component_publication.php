<?php
	
	# CONTROLLER
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$identificador_unico	= isset($this->identificador_unico) ? $this->identificador_unico : $this->get_identificador_unico();		
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();	
	$file_name				= $modo;
	$relation_type 			= $this->relation_type;

	# Value yes
	$value_yes = '[{"type":"'.$relation_type.'","section_id":"1","section_tipo":"dd64","from_component_tipo":"'.$tipo.'"}]';
	# Value no
	$value_no  = '[{"type":"'.$relation_type.'","section_id":"2","section_tipo":"dd64","from_component_tipo":"'.$tipo.'"}]';

	if($permissions===0) return null;

	switch($modo) {

		case 'portal_list' :
				$file_name = 'edit';
		case 'edit_note' :		
		case 'edit' :
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL ;

				$dato 				= $this->get_dato();
				$dato_json 			= json_encode($dato);				
				$referenced_tipo 	= $this->get_referenced_tipo();
				$id_wrapper 		= 'wrapper_'.$identificador_unico;			
				$input_name 		= 'publication_'.$identificador_unico; 
				#$js_code			= $this->generate_js();
				$component_info 	= $this->get_component_info('json');
				break;

		case 'list_tm' :
				$file_name = 'list';							
		case 'list' :
				$valor  			= $this->get_valor();
				echo $valor;
				return;

				$referenced_tipo 	= $this->get_referenced_tipo();
				$id_wrapper 		= 'wrapper_'.$identificador_unico;				
				$input_name 		= 'publication_'.$identificador_unico;
				#$js_code			= $this->generate_js();
				$component_info 	= $this->get_component_info('json');			
				break;

		case 'tool_time_machine' :			
				$file_name 			= 'edit';
				$id_wrapper 		= 'wrapper_'.$identificador_unico.'_tm';
				$input_name 		= "{$tipo}_{$parent}_tm";	
				break;						
						
		case 'search' :
				$dato 				= $this->get_dato();
				$dato_json 			= json_encode($dato);

				$input_name 		= 'publication_'.$identificador_unico;
				
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values	= $this->get_ar_list_of_values2(DEDALO_DATA_LANG);
				
				# q_operator is injected by trigger search2
				$q_operator = isset($this->q_operator) ? $this->q_operator : null;
				
				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;

		case 'relation'	:
				$file_name 	= 'list';			
				break;

		case 'tool_lang' :
				return null;
				break;

		case 'print' :
				$valor = $this->get_valor();
				break;		
	}
	
		
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>