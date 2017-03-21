<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$propiedades 			= $this->get_propiedades();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $parent";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();	
	$component_name			= get_class($this);	

	
	if($permissions===0) return null;
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	$from_modo				= $modo;
	
	switch($modo) {		

		case 'edit'	:
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= $tipo;
				$ar_valor 		= $this->get_valor($lang,'array');
				$valor 			= $this->get_valor($lang);
				$ar_link_fields	= json_handler::encode($this->ger_ar_link_fields());
				$component_info = $this->get_component_info('json');
				$dato_json 		= json_encode($dato);

				#$ar_referenced_tipo 	= $this->get_ar_referenced_tipo();
				#$ar_referenced_tipo_json= json_handler::encode($this->get_ar_referenced_tipo());
					#dump($ar_referenced_tipo, ' $ar_referenced_tipo ++ '.to_string());

				$hierarchy_types 	= isset($propiedades->source->hierarchy_types) ? $propiedades->source->hierarchy_types : null;
				$hierarchy_sections = isset($propiedades->source->hierarchy_sections) ? $propiedades->source->hierarchy_sections : null;
	
				# Resolve hierarchy_sections for speed
				if (!empty($hierarchy_types)) {
					$hierarchy_sections = component_autocomplete_hi::add_hierarchy_sections_from_types($hierarchy_types, (array)$hierarchy_sections);
					$hierarchy_types 	= null; // Remove filter by type because we know all hierarchy_sections now
				}

				#dump($hierarchy_types, ' hierarchy_types ++ '.to_string());
				#dump($hierarchy_sections, ' hierarchy_sections ++ '.to_string());

				if (isset($_REQUEST['from_modo'])) {
					$from_modo = $_REQUEST['from_modo'];
				}
				# SOURCE_MODE
				$source_mode = $this->get_source_mode();
					#dump($source_mode, ' source_mode ++ '.to_string());
				break;		
						
		case 'search' :
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				$id_wrapper 			= 'wrapper_'.$identificador_unico;
				$input_name 			= $section_tipo.'_'.$tipo;
				$valor 					= $this->get_valor($lang);
				$ar_link_fields			= json_handler::encode($this->ger_ar_link_fields());
				# Valor searched
				$valor_searched 		= NULL;
				$valor_searched_string 	= NULL;
				$ar_valor 				= $this->get_valor($lang,'array');
				$dato_json 				= json_encode($dato);

				$ar_referenced_tipo 	= $this->get_ar_referenced_tipo();
				$ar_referenced_tipo_json= json_handler::encode($this->get_ar_referenced_tipo());
							
				if (!empty($_REQUEST[$tipo])) {
					$valor_searched 		= $_REQUEST[$tipo];
					$valor_searched_string 	= RecordObj_dd::get_termino_by_tipo($_REQUEST[$tipo]);
				}
				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();

				# SOURCE_MODE
				$source_mode 		= $this->get_source_mode();

				$hierarchy_types 	= isset($propiedades->source->hierarchy_types) ? $propiedades->source->hierarchy_types : null;
				$hierarchy_sections = isset($propiedades->source->hierarchy_sections) ? $propiedades->source->hierarchy_sections : null;

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;
						
		case 'list_tm' :
				$file_name = 'list';						
		case 'portal_list':
				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$dato_json 		= json_encode($dato);
				$component_info = $this->get_component_info('json');
				$valor 			= $this->get_valor($lang);
				$ar_valor 		= $this->get_valor($lang,'array');
				
				$file_name 	= 'list';
				break;
				
		case 'list'	:						
				# Return direct value for store in 'valor_list'
				$valor = $this->get_valor($lang,'string');
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