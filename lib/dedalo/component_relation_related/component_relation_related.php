<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_id 			= $parent;
	$section_tipo			= $this->get_section_tipo();
	$propiedades			= $this->get_propiedades();
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
	$dato 					= $this->get_dato();
	$relation_type 			= $this->get_relation_type();
	$file_name 				= $modo;
	
	if($permissions===0) return null;
	
	switch($modo) {
		
		case 'edit':
		
				# Verify component content record is inside section record filter
					if ($this->get_filter_authorized_record()===false) return null; //($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false) 

				// JS/CSS ADD
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_autocomplete/js/component_autocomplete.js";
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_autocomplete/css/component_autocomplete.css";

				// General vars
					$id_wrapper 		= 'wrapper_'.$identificador_unico;
					$input_name 		= "{$tipo}_{$parent}";
					$component_info 	= $this->get_component_info('json');
					$dato_json			= json_encode($dato);
					$ar_valor 			= $this->get_valor($lang,'array');
					$valor  			= implode('<br>',$ar_valor);
					$references 		= $this->get_calculated_references();
					$tipo_to_search		= $this->get_tipo_to_search();					
					$search_fields 		= $this->get_search_fields($tipo); # search_fields. Check propiedades custom search fields

				// target_section_tipo
					$target_section_tipo 		 = $section_tipo;
					$ar_target_section_tipo 	 = [];	//$this->get_ar_target_section_tipo();
					$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				
				// search_query_object params			
					$limit   		= isset($propiedades->limit) ? (int)$propiedades->limit : 0;
					$divisor 		= $this->get_divisor();
					# search_tipos
					$term_tipo 		= hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
					$search_tipos 	= [$term_tipo]; // DEDALO_THESAURUS_TERM_TIPO

				// hierarchy_type . Get hierarchy_type from current section
					$hierarchy_type 	= hierarchy::get_hierarchy_type_from_section_tipo($section_tipo);
					# hierarchy_types .  Array of all (only one in this case)
					$hierarchy_types 	= [$hierarchy_type];
					# hierarchy_sections .  Calculate all sections of current types
					$hierarchy_sections = component_autocomplete_hi::get_hierarchy_sections_from_types( $hierarchy_types );

				// service autocomplete options
					$search_sections = $hierarchy_sections;

				// search_query_object build
					$filter_by_list = false; // Default
					if (!empty($search_fields)) {
						// Use custom filters
							# FIlTER_BY_LIST (Propiedades option)
							if (isset($propiedades->source->filter_by_list)) {
								$filter_by_list = $propiedades->source->filter_by_list;
							}
							$json_filter_by_list = json_encode($filter_by_list);

							# search_query_object. component_autocomplete
							$query_object_options = new stdClass();
								$query_object_options->q 	 					= null;
								$query_object_options->limit  					= 40;
								$query_object_options->offset 					= 0;
								$query_object_options->section_tipo 			= $section_tipo;
								$query_object_options->tipo 					= $tipo;

							$search_query_object = component_autocomplete::build_search_query_object($query_object_options);

					}else{
						// Use hierarchy						
							
							# search_query_object. autocomplete hi						
							$search_query_object_options = new stdClass();
								$search_query_object_options->q 	 			= null;
								$search_query_object_options->limit  			= 40;
								$search_query_object_options->lang 				= 'all';
								$search_query_object_options->logical_operator 	= '$or';
								$search_query_object_options->section_tipo		= []; // Added from wrapper hierarchy_sections on the fly in service autosearch
								$search_query_object_options->tipo 				= $tipo;
								$search_query_object_options->search_tipos 		= $search_tipos; // [DEDALO_THESAURUS_TERM_TIPO];
								$search_query_object_options->distinct_values	= false;
								$search_query_object_options->show_modelo_name 	= true;
								$search_query_object_options->filter_custom 	= null;								

							$search_query_object = component_autocomplete_hi::build_search_query_object($search_query_object_options);
					}
					$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS);
				break;		
						
		case 'search':
				
				// General vars
					$dato 				= isset($this->dato) ? $this->dato : []; # dato is injected by trigger search wen is needed
					$dato_json			= json_encode($dato);
					$ar_valor 			= $this->get_valor($lang,'array');
					$valor  			= implode('<br>',$ar_valor);
					$id_wrapper 		= 'wrapper_'.$identificador_unico;
					$component_info 	= $this->get_component_info('json');
					# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
					# and recovered in component_common->get_search_input_name()
					# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
					$search_input_name 	= $this->get_search_input_name();

				// target_section_tipo
					$target_section_tipo 		 = $section_tipo;
					$ar_target_section_tipo 	 = [];	//$this->get_ar_target_section_tipo();
					$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				
				// hierarchy_type . Get hierarchy_type from current section
					$hierarchy_type 	= hierarchy::get_hierarchy_type_from_section_tipo($section_tipo);
					# hierarchy_types .  Array of all (only one in this case)
					$hierarchy_types 	= [$hierarchy_type];
					# hierarchy_sections .  Calculate all sections of current types
					$hierarchy_sections = component_autocomplete_hi::get_hierarchy_sections_from_types( $hierarchy_types );			
				
				// service autocomplete options
					$search_sections = $hierarchy_sections;				

				// search_tipos
					$term_tipo 		= hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
					$search_tipos 	= [$term_tipo]; // DEDALO_THESAURUS_TERM_TIPO

				// search_query_object params
					$q_operator = isset($this->q_operator) ? $this->q_operator : null;
					$limit 		= 1;
					$divisor 	= $this->get_divisor();

				// search_fields. Check propiedades custom search fields
					$search_fields = $this->get_search_fields($tipo);

				// search_query_object build
					#
					# SEARCH_QUERY_OBJECT
					/*
					$search_query_object_options = new stdClass();
						$search_query_object_options->q 	 			= null;
						$search_query_object_options->limit  			= 40;
						$search_query_object_options->lang 				= 'all';
						$search_query_object_options->logical_operator 	= '$or';
						$search_query_object_options->id 				= 'temp';
						$search_query_object_options->section_tipo		= []; // Added from wrapper hierarchy_sections on the fly in service autosearch
						$search_query_object_options->search_tipos 		= $search_tipos;
						$search_query_object_options->distinct_values	= false;
						$search_query_object_options->show_modelo_name 	= true;
						$search_query_object_options->filter_custom 	= null;
						$search_query_object_options->tipo 				= $tipo;
					$search_query_object 		= component_autocomplete_hi::build_search_query_object($search_query_object_options);
					$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS);
					*/
					$filter_by_list = false; // Default
					if (!empty($search_fields)) {
						// Use custom filters
							# FIlTER_BY_LIST (Propiedades option)
							
							if (isset($propiedades->source->filter_by_list)) {
								$filter_by_list = $propiedades->source->filter_by_list;
							}
							$json_filter_by_list = json_encode($filter_by_list);
		
							# search_query_object. component_autocomplete
							$query_object_options = new stdClass();
								$query_object_options->q 	 			= null;
								$query_object_options->limit  			= 40;
								$query_object_options->offset 			= 0;
								$query_object_options->section_tipo 	= $section_tipo;
								$query_object_options->tipo 			= $tipo;

							$search_query_object 		= component_autocomplete::build_search_query_object($query_object_options);							

					}else{
						// Use hierarchy
							
							# SEARCH_QUERY_OBJECT. Autocomplete hi
							$search_query_object_options = new stdClass();
								$search_query_object_options->q 	 			= null;
								$search_query_object_options->limit  			= 40;
								$search_query_object_options->lang 				= 'all';
								$search_query_object_options->logical_operator 	= '$or';
								$search_query_object_options->id 				= 'temp';
								$search_query_object_options->section_tipo		= []; // Added from wrapper hierarchy_sections on the fly in service autosearch
								$search_query_object_options->search_tipos 		= $search_tipos; // [DEDALO_THESAURUS_TERM_TIPO];
								$search_query_object_options->distinct_values	= false;
								$search_query_object_options->show_modelo_name 	= true;
								$search_query_object_options->filter_custom 	= null;
								$search_query_object_options->tipo 				= $tipo;

							$search_query_object = component_autocomplete_hi::build_search_query_object($search_query_object_options);							
					}
					$json_search_query_object = json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS);

				$file_name = 'edit';
				break;
		
		case 'tool_time_machine':
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;

		case 'portal_list':
		case 'list_tm':

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

		case 'print':
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