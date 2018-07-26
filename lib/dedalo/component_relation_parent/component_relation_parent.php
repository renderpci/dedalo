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
	$ejemplo				= null;
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context 				= $this->get_context();	
	$file_name 				= $modo;
	
	if($permissions===0) return null;
	
	switch($modo) {
		
		case 'edit'	:
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return null; //($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false) 
				$dato 					 = $this->get_dato();
				$dato_json 				 = json_encode($dato);

				$ar_values = [];
				foreach ((array)$dato as $key => $current_locator) {
					$item = new stdClass();
						$item->label = 	ts_object::get_term_by_locator( $current_locator, DEDALO_DATA_LANG, $from_cache=true );
						$item->value = 	$current_locator;
					$ar_values[] = $item;
				}

				$search_input_name = $this->get_search_input_name();

				$id_wrapper 			 = 'wrapper_'.$identificador_unico;
				$input_name 			 = "{$tipo}_{$parent}";
				$component_info 		 = $this->get_component_info('json');
				$children_component_tipo = component_relation_parent::get_component_relation_children_tipo($tipo);
				$hierarchy_sections 	 = [$section_tipo];

				# search_tipos
				$term_tipo 		= hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
				$search_tipos 	= [$term_tipo]; // DEDALO_THESAURUS_TERM_TIPO
				
				$from_component_tipo = DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO; //'hierarchy49';

				$limit = 1;
				break;

		case 'tool_time_machine' :
				$id_wrapper 	= 'wrapper_'.$identificador_unico.'_tm';
				$input_name 	= "{$tipo}_{$parent}_tm";
				$file_name 		= 'edit'; 	dump($id_wrapper, ' $id_wrapper ++ '.to_string());
				break;
						
		case 'search':
				# dato is injected by trigger search wen is needed
				$dato 		= isset($this->dato) ? $this->dato : [];				
				$dato_json 	= json_encode($dato);
				
				$ar_values = [];
				foreach ((array)$dato as $key => $current_locator) {
					$item = new stdClass();
						$item->label = 	ts_object::get_term_by_locator( $current_locator, DEDALO_DATA_LANG, $from_cache=true );
						$item->value = 	$current_locator;
					$ar_values[] = $item;
				}				

				$id_wrapper 			= 'wrapper_'.$identificador_unico;				
				$component_info 		= $this->get_component_info('json');

				$hierarchy_sections 	= [$section_tipo];

				# q_operator is injected by trigger search2
				$q_operator = isset($this->q_operator) ? $this->q_operator : null;

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();

				# search_tipos
				$term_tipo 		= hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
				$search_tipos 	= [$term_tipo]; // DEDALO_THESAURUS_TERM_TIPO
				
				$from_component_tipo = DEDALO_THESAURUS_RELATION_CHIDRENS_TIPO; //'hierarchy49';
				
				$limit = 1;
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