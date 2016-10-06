<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= null;
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context 				= $this->get_context();	
	$file_name 				= $modo;
	
	switch($modo) {
		
		case 'edit'	:
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return null; //($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false) 
				$dato 					 = $this->get_dato();
				$dato_string 			 = json_encode($dato);
				$id_wrapper 			 = 'wrapper_'.$identificador_unico;
				$input_name 			 = "{$tipo}_{$parent}";
				$component_info 		 = $this->get_component_info('json');
				$children_component_tipo = component_relation_parent::get_component_relation_children_tipo($tipo);
				break;

		case 'tool_time_machine' :
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;
						
		case 'search':				
				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();

				# Search input name
				$search_input_name = $section_tipo.'_'.$tipo;
				break;
					
		case 'portal_list' :
		case 'list_tm' :
				$file_name = 'list';
						
		case 'list'	:
				$valor	= $this->get_valor();
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';
				break;
		
		case 'tool_lang':
				return null;
				break;

		case 'print' :
				$valor = $this->get_valor();
				break;
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>