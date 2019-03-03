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
	$propiedades 			= $this->get_propiedades();
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
				if ($this->get_filter_authorized_record()===false) return null;
				
				$dato		= $this->get_dato();
				$dato_json 	= json_encode($dato);

				$ar_values = [];
				foreach ((array)$dato as $key => $current_locator) {
					$item = new stdClass();
						$item->label = 	ts_object::get_term_by_locator( $current_locator, DEDALO_DATA_LANG, $from_cache=true );
						$item->value = 	$current_locator;
					$ar_values[] = $item;
				}				

				$id_wrapper 			 = 'wrapper_'.$identificador_unico;
				$input_name 			 = $tipo.'_'.$parent;
				$search_input_name 		 = $this->get_search_input_name();
				$component_info 		 = $this->get_component_info('json');
				
				#
				# MY_COMPONENT_CHILDREN_TIPO AND PROPIEDADES
				# component_children is related in structure to current component. This get source sections to look and constrain the target sections tipo
				$my_component_children_tipo 			= component_relation_parent::get_component_relation_children_tipo($tipo);
				$RecordObj 								= new RecordObj_dd($my_component_children_tipo);				
				$my_component_children_tipo_propiedades = $RecordObj->get_propiedades(true);
				
				#
				# HIERARCHY_SECTIONS
				$hierarchy_types 	= isset($my_component_children_tipo_propiedades->source->hierarchy_types) 	 ? $my_component_children_tipo_propiedades->source->hierarchy_types : null;
				$hierarchy_sections = isset($my_component_children_tipo_propiedades->source->hierarchy_sections) ? $my_component_children_tipo_propiedades->source->hierarchy_sections : null;
	
				# Resolve hierarchy_sections for speed
				if (!empty($hierarchy_types)) {
					$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
					$hierarchy_types 	= null; // Remove filter by type because we know all hierarchy_sections now
				}
				
				# Fallback to default (self section)
				if (empty($hierarchy_sections)) {
					$hierarchy_sections = [$section_tipo];
				}

				// service autocomplete options
					$search_sections = $hierarchy_sections;

				# search_tipos
				$search_tipos = [];
				foreach ($hierarchy_sections as $current_section_tipo) {
					$current_term_tipo 	= hierarchy::get_element_tipo_from_section_map( $current_section_tipo, 'term' );
					if (!in_array($current_term_tipo, $search_tipos)) {
						$search_tipos[] = $current_term_tipo;
					}
				}			
				
				$limit = 1;
				#
				# SEARCH_QUERY_OBJECT
				$search_query_object_options = new stdClass();
					$search_query_object_options->q 	 			= null;
					$search_query_object_options->limit  			= 40;
					$search_query_object_options->lang 				= 'all';
					$search_query_object_options->logical_operator 	= '$or';
					$search_query_object_options->id 				= 'temp';
					$search_query_object_options->section_tipo		= []; //$hierarchy_sections; // Normally hierarchy_sections
					$search_query_object_options->search_tipos 		= $search_tipos; // [DEDALO_THESAURUS_TERM_TIPO];
					$search_query_object_options->distinct_values	= false;
					$search_query_object_options->show_modelo_name 	= true;
					$search_query_object_options->show_parents 		= true;
					$search_query_object_options->filter_custom 	= null;
					$search_query_object_options->tipo 				= $tipo;
				$search_query_object 		= component_autocomplete_hi::build_search_query_object($search_query_object_options);
				$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS);
				break;

		case 'tool_time_machine' :
				$id_wrapper 	= 'wrapper_'.$identificador_unico.'_tm';
				$input_name 	= "{$tipo}_{$parent}_tm";
				$file_name 		= 'edit'; 	dump($id_wrapper, ' $id_wrapper ++ '.to_string());
				break;
						
		case 'search':
				# dato is injected by trigger search when is needed
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

				#
				# MY_COMPONENT_CHILDREN_TIPO AND PROPIEDADES
				# component_children is related in structure to current component. This get source sections to look and constrain the target sections tipo
				$my_component_children_tipo 			= component_relation_parent::get_component_relation_children_tipo($tipo);
				$RecordObj 								= new RecordObj_dd($my_component_children_tipo);				
				$my_component_children_tipo_propiedades = $RecordObj->get_propiedades(true);
				
				#
				# HIERARCHY_SECTIONS
				$hierarchy_types 	= isset($my_component_children_tipo_propiedades->source->hierarchy_types) 	 ? $my_component_children_tipo_propiedades->source->hierarchy_types : null;
				$hierarchy_sections = isset($my_component_children_tipo_propiedades->source->hierarchy_sections) ? $my_component_children_tipo_propiedades->source->hierarchy_sections : null;
	
				# Resolve hierarchy_sections for speed
				if (!empty($hierarchy_types)) {
					$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
					$hierarchy_types 	= null; // Remove filter by type because we know all hierarchy_sections now
				}
				
				# Fallback to default (self section)
				if (empty($hierarchy_sections)) {
					$hierarchy_sections = [$section_tipo];
				}

				// service autocomplete options
					$search_sections = $hierarchy_sections;

				# search_tipos
				$search_tipos = [];
				foreach ($hierarchy_sections as $current_section_tipo) {
					$current_term_tipo 	= hierarchy::get_element_tipo_from_section_map( $current_section_tipo, 'term' );
					if (!in_array($current_term_tipo, $search_tipos)) {
						$search_tipos[] = $current_term_tipo;
					}
				}
								
				$limit = 1;
				#
				# SEARCH_QUERY_OBJECT
				$search_query_object_options = new stdClass();
					$search_query_object_options->q 	 			= null;
					$search_query_object_options->limit  			= 40;
					$search_query_object_options->lang 				= 'all';
					$search_query_object_options->logical_operator 	= '$or';
					$search_query_object_options->id 				= 'temp';
					$search_query_object_options->section_tipo		= []; //$hierarchy_sections; // Normally hierarchy_sections
					$search_query_object_options->search_tipos 		= [DEDALO_THESAURUS_TERM_TIPO];
					$search_query_object_options->distinct_values	= false;
					$search_query_object_options->show_modelo_name 	= true;
					$search_query_object_options->filter_custom 	= null;
					$search_query_object_options->tipo 				= $tipo;
				$search_query_object 		= component_autocomplete_hi::build_search_query_object($search_query_object_options);
				$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS);
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