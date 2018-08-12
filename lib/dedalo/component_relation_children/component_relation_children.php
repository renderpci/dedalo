<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$propiedades			= $this->get_propiedades();
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
	$relation_type 			= $this->get_relation_type();
	$file_name 				= $modo;
	
	if($permissions===0) return null;
	
	switch($modo) {
		
		case 'edit'	:
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return null; //($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false) 

				$id_wrapper 			= 'wrapper_'.$identificador_unico;
				$input_name 			= "{$tipo}_{$parent}";
				$component_info 		= $this->get_component_info('json');			
				$dato_string			= json_handler::encode($dato);

				# target_section_tipo
				$target_section_tipo = $section_tipo;				
				if (isset($propiedades->target_values)) {
					# target_section_tipo is the value of component defined in propiedades->target_values 
					$source_component_tipo = reset($propiedades->target_values);
						#dump($source_component_tipo, ' $source_component_tipo ++ '.to_string($tipo));
					$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($source_component_tipo, true);
					$componnent 	 = component_common::get_instance($modelo_name,
																	  $source_component_tipo,
																	  $parent,
																	  $modo,
																	  DEDALO_DATA_NOLAN,
																	  $section_tipo);
					$target_section_tipo = $componnent->get_valor(0);
				}

				# Parent area is model (default is false)
				# hierarchy_sections			
				if ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
					
					if ($tipo===DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO) {
						# model
						$_current_target_tipo = DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;
					}else{
						# term
						$_current_target_tipo = DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
					}
					
					$_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($_current_target_tipo,true);
					$_component 	= component_common::get_instance($_modelo_name,
																	 $_current_target_tipo,
																	 $parent,
																	 'list',
																	 $lang,
																	 $section_tipo);					
					$hierarchy_sections = (array)$_component->get_dato(); // Is array
				
				}else{
					
					$hierarchy_types 	= isset($propiedades->source->hierarchy_types) 	  ? $propiedades->source->hierarchy_types 	 : null;
					$hierarchy_sections = isset($propiedades->source->hierarchy_sections) ? $propiedades->source->hierarchy_sections : null;
		
					# Resolve hierarchy_sections for speed
					if (!empty($hierarchy_types)) {
						$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
						$hierarchy_types 	= null; // Remove filter by type because we know all hierarchy_sections now
					}
					
					# Fallback to default (self section)
					if (empty($hierarchy_sections)) {
						$hierarchy_sections = [$section_tipo];
					}
				}
				#dump($hierarchy_sections, ' hierarchy_sections ++ '.to_string());

				# search_tipos
				$search_tipos = [];
				foreach ($hierarchy_sections as $current_section_tipo) {
					$current_term_tipo 	= hierarchy::get_element_tipo_from_section_map( $current_section_tipo, 'term' );
					if (!in_array($current_term_tipo, $search_tipos)) {
						$search_tipos[] = $current_term_tipo;
					}
				}
				break;

		case 'tool_time_machine' :
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;
						
		case 'search':
				# dato is injected by trigger search wen is needed
				$dato 		= isset($this->dato) ? $this->dato : [];
				$dato_json 	= json_encode($dato);
				
				$ar_valor 	= [];				
				foreach ((array)$dato as $key => $current_locator) {
					$current_locator_json = json_encode($current_locator);
					$value = ts_object::get_term_by_locator( $current_locator, DEDALO_DATA_LANG, $from_cache=true );

					$ar_valor[$current_locator_json] = $value;
				}

				$id_wrapper 	= 'wrapper_'.$identificador_unico;				
				$component_info = $this->get_component_info('json');

				# q_operator is injected by trigger search2
				$q_operator = isset($this->q_operator) ? $this->q_operator : null;

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();

				if ($section_tipo===DEDALO_HIERARCHY_SECTION_TIPO) {
					if ($tipo===DEDALO_HIERARCHY_CHIDRENS_MODEL_TIPO) {
						# model
						$_current_target_tipo = DEDALO_HIERARCHY_TARGET_SECTION_MODEL_TIPO;
					}else{
						# term
						$_current_target_tipo = DEDALO_HIERARCHY_TARGET_SECTION_TIPO;
					}
					
					$_modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($_current_target_tipo,true);
					$_component 	= component_common::get_instance($_modelo_name,
																	 $_current_target_tipo,
																	 $parent,
																	 'list',
																	 $lang,
																	 $section_tipo);
					
					$hierarchy_sections = (array)$_component->get_dato(); // Is array
				}else{
					$hierarchy_sections = [$section_tipo];
				}

				# search_tipos
				$term_tipo 		= hierarchy::get_element_tipo_from_section_map( $section_tipo, 'term' );
				$search_tipos 	= [$term_tipo]; // DEDALO_THESAURUS_TERM_TIPO

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

		case 'list_thesaurus' :
				$render_vars = $this->get_render_vars();
					#dump($render_vars, ' render_vars ++ '.to_string());
				$icon_label = isset($render_vars->icon) ? $render_vars->icon : '';

				$ar_childrens 		= $this->get_dato();
				if (empty($ar_childrens)) {
					return null;
				}

				$ar_childrens_json 	= json_encode($ar_childrens);
					#dump($ar_childrens, ' $ar_childrens ++ '.to_string($parent));
				break;

	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>