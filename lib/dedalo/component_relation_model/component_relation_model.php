<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= null;
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context 				= $this->get_context();
	

	$file_name = $modo;
	
	if($permissions===0) return null;

	switch($modo) {
		
		case 'edit'	:
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return null; //($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false) 

				// referenced section tipo
					$referenced_tipo 	= $this->get_referenced_tipo();

				// ar list of values					
					$ar_list_of_values  = $this->get_ar_list_of_values2();
					
				
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";
				$component_info 	= $this->get_component_info('json');
				$valor				= $this->get_valor();
				$dato_string		= json_handler::encode($dato);

				# search_tipos
				$term_tipo 		= hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
				$search_tipos 	= [$term_tipo]; // DEDALO_THESAURUS_TERM_TIPO			
				break;

		case 'tool_time_machine' :
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;
						
		case 'search':
				# dato is injected by trigger search wen is needed
				$dato 				= isset($this->dato) ? $this->dato : null;
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$component_info 	= $this->get_component_info('json');			
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values  = $this->get_ar_list_of_values2();
	
				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name 	= $this->get_search_input_name();

				# search_tipos
				$term_tipo 		= hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
				$search_tipos 	= [$term_tipo]; // DEDALO_THESAURUS_TERM_TIPO

				# q_operator is injected by trigger search2
				$q_operator = isset($this->q_operator) ? $this->q_operator : null;
				break;
					
		case 'portal_list' :
				$file_name = 'list';
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

		case 'list_thesaurus':
				$render_vars = $this->get_render_vars();
				$icon_label = isset($render_vars->icon) ? $render_vars->icon : '';
				break;

	}

		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>