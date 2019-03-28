<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();	
	
	$propiedades 			= isset($this->propiedades) ? $this->propiedades : $this->get_propiedades();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= NULL;
	$html_title				= "Info about $parent";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();	
	$component_name			= get_class($this);
	$relation_type 			= $this->get_relation_type();

	if($permissions===0) return null;
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	$from_modo				= $modo;

	
	switch($modo) {		

		case 'tool_transcription' :
				$file_name = 'edit';

		case 'edit'	:
				// General vars
					$dato 			= $this->get_dato();
					$id_wrapper 	= 'wrapper_'.$identificador_unico;
					$input_name 	= $tipo;
					$ar_valor 		= $this->get_valor($lang,'array');
					$valor 			= $this->get_valor($lang);
					$ar_link_fields	= json_encode($this->ger_ar_link_fields());
					$component_info = $this->get_component_info('json');
					$dato_json 		= json_encode($dato);
					$source_mode 	= $this->get_source_mode();
					$options_type 	= $this->get_options_type();

				// from_modo. get the change modo from portal list to edit
					$var_requested = common::get_request_var('from_modo');
					if (!empty($var_requested)) {
						$from_modo = $var_requested;
					}
				
				// hierarchy_terms. Defined in propiedades, constrain searched terms using children terms
					$hierarchy_terms_json = null;
					if (isset($propiedades->source->hierarchy_terms)) {
						$ar_childrens 	 = [];
						$hierarchy_terms = [];
						foreach ((array)$propiedades->source->hierarchy_terms as $key => $item) {
							$resursive = (bool)$item->recursive;
							# Get childrens						
							$ar_childrens = array_merge($ar_childrens, component_relation_children::get_childrens($item->section_id, $item->section_tipo, null, $resursive));	

							# Add pseudo locator
							$hierarchy_terms[] = $item->section_tipo .'_'. $item->section_id;	
						}
						$constrain_data = $ar_childrens;
										

						$filter_custom = [];
						$component_section_id_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_section_id'], true, true, true, true, false);
						$path = new stdClass();
							$path->section_tipo 	= $section_tipo;
							# get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false)
							$path->component_tipo 	= reset($component_section_id_tipo);
							$path->modelo 			= 'component_section_id';
							$path->name 			= 'Id';

						foreach ($ar_childrens as $key => $current_children) {
							$filter_item = new stdClass();
								$filter_item->q 	= $current_children->section_id;
								$filter_item->path 	= [$path];

							$filter_custom[] = $filter_item;
						}

						$hierarchy_terms_json = json_encode($hierarchy_terms);
					}//end if (isset($propiedades->source->hierarchy_terms))		
				
				// ar_filter_options
					$ar_filter_options = false; // Default
					switch ($options_type) {
						case 'hierarchy':
							$hierarchy_types 	= isset($propiedades->source->hierarchy_types) ? $propiedades->source->hierarchy_types : null;
							$hierarchy_sections = isset($propiedades->source->hierarchy_sections) ? $propiedades->source->hierarchy_sections : null;
				
							# Resolve hierarchy_sections for speed
							if (!empty($hierarchy_types)) {
								$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
								$hierarchy_types 	= null; // Remove filter by type because we know all hierarchy_sections now
							}

							// service autocomplete options
								$search_sections = $hierarchy_sections;

							// Get the term_tipo of the hierarchy_sections defined in structure in section_map
								$ar_terms = [];
								foreach ((array)$hierarchy_sections as $current_section) {
									// resolve and set if not empty
									$current_term = hierarchy::get_element_tipo_from_section_map($current_section,'term');
									if (!empty($current_term)) {
										$ar_terms[] = $current_term;
									}else{
										debug_log(__METHOD__." ERROR: Misconfigured section tipo: '$current_section'. No property 'term' found in section map thesaurus. Fix ASAP this structure error".to_string(), logger::ERROR);
									}
								}
								$ar_terms = array_unique($ar_terms);

							$ar_filter_options = $this->get_ar_filter_options($options_type, $hierarchy_sections);
							break;
						
						/*
						* Don't used for now, maybe can unify with the component_autocomplete (it use the "filter_by_list")
						*
						case 'generic':
							# FIlTER_BY_LIST (Propiedades option)			
							if (isset($propiedades->source->filter_by_list)) {
								$ar_filter_options = $this->get_ar_filter_options($options_type, $propiedades->source->filter_by_list);
							}
							break;
							*/
					}
					#dump($ar_filter_options, ' ar_filter_options ++ '.to_string());
					
				// search_query_object params
					// q_operator is injected by trigger search2
					$q_operator = isset($this->q_operator) ? $this->q_operator : null;
					// Limit (Max items allow. 0 for unlimited)
					$limit 		= isset($propiedades->limit) ? (int)$propiedades->limit : 0;
					// Divisor
					$divisor 	= $this->get_divisor();					
					$min_length = isset($propiedades->min_length) ? (int)$propiedades->min_length : 1;

				// search_query_object build
					$search_query_object_options = new stdClass();
						$search_query_object_options->q 	 			= null;
						$search_query_object_options->limit  			= 40;
						$search_query_object_options->offset 			= 0;
						$search_query_object_options->lang 				= 'all';
						$search_query_object_options->logical_operator 	= '$or';
						$search_query_object_options->id 				= 'autocomplete_hi_search';
						$search_query_object_options->section_tipo		= []; //$hierarchy_sections; // Normally hierarchy_sections
						//$search_query_object_options->search_tipos 		= [DEDALO_THESAURUS_TERM_TIPO];
						$search_query_object_options->search_tipos 		= $ar_terms;


						$search_query_object_options->distinct_values	= isset($propiedades->distinct_values) ? $propiedades->distinct_values : false;
						$search_query_object_options->show_modelo_name 	= true;
						$search_query_object_options->filter_custom 	= isset($filter_custom) ? $filter_custom : null; // See $propiedades->source->hierarchy_terms above
						$search_query_object_options->tipo 			 	= $tipo;
					$search_query_object 		= component_autocomplete_hi::build_search_query_object($search_query_object_options);
					$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS);
						#dump($json_search_query_object, ' json_search_query_object ++ '.to_string());
				break;		
		
		case 'search' :
				// General vars
					# dato is injected by trigger search wen is needed
					$dato 					= isset($this->dato) ? $this->dato : [];
					$dato_json 				= json_handler::encode($dato);					
					$id_wrapper 			= 'wrapper_'.$identificador_unico;
					$input_name 			= $tipo;
					$valor 					= $this->get_valor($lang);
					$ar_link_fields			= json_handler::encode($this->ger_ar_link_fields());
					$component_info 		= $this->get_component_info('json');
					# Valor searched
					$valor_searched 		= null;
					$valor_searched_string 	= null;
					$ar_valor 				= $this->get_valor($lang,'array');										
					# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
					# and recovered in component_common->get_search_input_name()
					# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
					$search_input_name = $this->get_search_input_name();
					$source_mode 			= $this->get_source_mode();
					$options_type 			= $this->get_options_type();
					
					$ar_referenced_tipo 	= $this->get_ar_referenced_tipo();
					$ar_referenced_tipo_json= json_handler::encode($this->get_ar_referenced_tipo());				

				// hierarchy_terms. Defined in propiedades, constrain searched terms using children terms
					$hierarchy_terms_json = null;
					if (isset($propiedades->source->hierarchy_terms)) {
						$ar_childrens 	 = [];
						$hierarchy_terms = [];
						foreach ((array)$propiedades->source->hierarchy_terms as $key => $item) {
							$resursive = (bool)$item->recursive;
							# Get childrens						
							$ar_childrens = array_merge($ar_childrens, component_relation_children::get_childrens($item->section_id, $item->section_tipo, null, $resursive));	

							# Add pseudo locator
							$hierarchy_terms[] = $item->section_tipo .'_'. $item->section_id;	
						}
						$constrain_data = $ar_childrens;
										

						$filter_custom = [];
						$component_section_id_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, ['component_section_id'], true, true, true, true, false);
						$path = new stdClass();
							$path->section_tipo 	= $section_tipo;
							# get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $ar_modelo_name_required, $from_cache=true, $resolve_virtual=false, $recursive=true, $search_exact=false, $ar_tipo_exclude_elements=false)
							$path->component_tipo 	= reset($component_section_id_tipo);
							$path->modelo 			= 'component_section_id';
							$path->name 			= 'Id';

						foreach ($ar_childrens as $key => $current_children) {
							$filter_item = new stdClass();
								$filter_item->q 	= $current_children->section_id;
								$filter_item->path 	= [$path];

							$filter_custom[] = $filter_item;
						}

						$hierarchy_terms_json = json_encode($hierarchy_terms);
					}//end if (isset($propiedades->source->hierarchy_terms))		
	
				// ar_filter_options
					$hierarchy_types 	= isset($propiedades->source->hierarchy_types) ? $propiedades->source->hierarchy_types : null;
					$hierarchy_sections = isset($propiedades->source->hierarchy_sections) ? $propiedades->source->hierarchy_sections : null;

					$ar_filter_options = false; // Default
					switch ($options_type) {
						case 'hierarchy':
							$hierarchy_types 	= isset($propiedades->source->hierarchy_types) ? $propiedades->source->hierarchy_types : null;
							$hierarchy_sections = isset($propiedades->source->hierarchy_sections) ? $propiedades->source->hierarchy_sections : null;
								#dump($hierarchy_sections, ' hierarchy_sections ++ '.to_string()); #return null;
				
							# Resolve hierarchy_sections for speed
							if (!empty($hierarchy_types)) {
								$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
								$hierarchy_types 	= null; // Remove filter by type because we know all hierarchy_sections now
							}

							// service autocomplete options
								$search_sections = $hierarchy_sections;

							//Get the term_tipo of the hierarchy_sections defined in structure in section_map
								$ar_terms = [];
								foreach ($hierarchy_sections as $current_section) {
									$ar_terms[] = hierarchy::get_element_tipo_from_section_map($current_section,'term');
								}
								$ar_terms = array_unique($ar_terms);

							$ar_filter_options = $this->get_ar_filter_options($options_type, $hierarchy_sections);
							break;
						
						case 'generic':
							# FIlTER_BY_LIST (Propiedades option)			
							if (isset($propiedades->source->filter_by_list)) {
								$ar_filter_options = $this->get_ar_filter_options($options_type, $propiedades->source->filter_by_list);
							}
							break;
					}

				// search_query_object params
					# q_operator is injected by trigger search2
					$q_operator = isset($this->q_operator) ? $this->q_operator : null;
					# limit (Max items allow. 0 for unlimited)
					$limit 		= 1;
					$divisor 	= $this->get_divisor();					
					$min_length = isset($propiedades->min_length) ? (int)$propiedades->min_length : 1;

				// search_query_object build
					$search_query_object_options = new stdClass();
						$search_query_object_options->q 	 			= null;
						$search_query_object_options->limit  			= 40;
						$search_query_object_options->offset 			= 0;
						$search_query_object_options->lang 				= 'all';
						$search_query_object_options->logical_operator 	= '$or';
						$search_query_object_options->id 				= 'autocomplete_hi_search';
						$search_query_object_options->section_tipo		= []; //$hierarchy_sections; // Normally hierarchy_sections
						//$search_query_object_options->search_tipos 		= [DEDALO_THESAURUS_TERM_TIPO];
						$search_query_object_options->search_tipos 		= $ar_terms;
						$search_query_object_options->distinct_values	= false;
						$search_query_object_options->show_modelo_name 	= true;
						$search_query_object_options->filter_custom 	= null;
						$search_query_object_options->tipo 			 	= $tipo;
					$search_query_object 		= component_autocomplete_hi::build_search_query_object($search_query_object_options);
					$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE | JSON_HEX_APOS);
						#dump($json_search_query_object, ' json_search_query_object ++ '.to_string());
				
				//search mode always can edit the field, permissions always in 2
				$permissions = 2;

				$file_name = 'edit';
				break;
						
		case 'list_tm' :
				$file_name = 'list';						
		case 'portal_list':
				$dato 			= $this->get_dato();
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$dato_json 		= json_encode($dato);
				$component_info = $this->get_component_info('json');
				$valor 			= $this->get_valor($lang);
				$ar_valor 		= $this->get_valor($lang,'array');
				
				$file_name 	= 'list';
				break;
				
		case 'list'	:
				$dato	= $this->get_dato();						
				# Return direct value for store in 'valor_list'
				$valor 	= $this->get_valor($lang,'string');
				echo (string)$valor; 	# Like "Catarroja, L'Horta Sud, Valencia/València, Comunidad Valenciana, España"
				return; // NOT load html file
				break;

		case 'relation':
				return NULL;
				# Force file_name to 'list'
				$file_name  = 'list';				
				break;
		
		case 'print' :
				$valor = $this->get_valor($lang,'string');
				break;

		case 'tool_time_machine' :	
				return NULL;
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$id}_tm";
				$file_name 	= 'edit';
				break;					
		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>