<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_id 			= $parent;
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
	$file_name 				= $modo;
	
	if($permissions===0) return null;
	
	switch($modo) {
		
		case 'edit'	:
		
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return null; //($lang=DEDALO_DATA_LANG, $id_path=false, $referenced_section_tipo=false, $filter_custom=false) 

				# JS/CSS ADD
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/component_autocomplete/js/component_autocomplete.js";
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/component_autocomplete/css/component_autocomplete.css";

				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";
				$component_info 	= $this->get_component_info('json');				
				$dato_string		= json_handler::encode($dato);


				# target_section_tipo
				$target_section_tipo = $section_tipo;

				$ar_target_section_tipo 	 = [];	//$this->get_ar_target_section_tipo();
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				
				$tipo_to_search			= $this->get_tipo_to_search();	

				# Inverse relations to current term
				# $inverse_related = component_relation_related::get_inverse_related($section_id, $section_tipo);
					#dump($inverse_related, ' inverse_related ++ '.to_string());

				# REFERENCES

				$references = $this->get_calculated_references();
				/*
				switch ($this->relation_type_rel) {
					case DEDALO_RELATION_TYPE_RELATED_BIDIRECTIONAL_TIPO:				
					case DEDALO_RELATION_TYPE_RELATED_MULTIDIRECTIONAL_TIPO:
						$current_locator = new stdClass();
							$current_locator->section_tipo 			= $section_tipo;
							$current_locator->section_id 			= $section_id;
							$current_locator->from_component_tipo 	= $tipo;
						$references = component_relation_related::get_references_recursive($tipo, $current_locator, $this->relation_type_rel, false );
						break;
					case DEDALO_RELATION_TYPE_RELATED_UNIDIRECTIONAL_TIPO:					
					default:
						$references = [];
						break;
				}
				*/			
				#dump($references, ' $references ++ '.to_string());

				# FIlTER_BY_LIST (Propiedades option)
				$filter_by_list = false; // Default
				if (isset($propiedades->source->filter_by_list)) {
					$filter_by_list = $propiedades->source->filter_by_list;
				}
				$json_filter_by_list = json_encode($filter_by_list);			

				#$referenced_tipo = $this->get_referenced_tipo();
				
				# SEARCH_FIELDS
				$search_fields 		= $this->get_search_fields($tipo);
					#dump($search_fields, ' $search_fields ++ '.to_string($tipo));
				$search_fields_json = json_encode($search_fields);
									
				#$terminoID_valor = reset($fields); // Select first field tipo

				# Limit
				$limit = isset($propiedades->limit) ? (int)$propiedades->limit : 0;
				
				# Divisor
				$divisor = $this->get_divisor();

				$ar_valor 	= $this->get_valor($lang,'array');
				$valor  	= implode('<br>',$ar_valor);

				# search_query_object
				$query_object_options = new stdClass();
					$query_object_options->q 	 	= null;
					$query_object_options->limit  	= 40;
					$query_object_options->offset 	= 0;
				$search_query_object 		= $this->build_search_query_object($query_object_options);
				$json_search_query_object 	= json_encode( $search_query_object, JSON_UNESCAPED_UNICODE);
					#dump($search_query_object, ' search_query_object ++ '.to_string());
					#dump(json_encode( $search_query_object, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), '$search_query_object ++ '.to_string());
				break;

		case 'tool_time_machine' :
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;
						
		case 'search':
				# dato is injected by trigger search wen is needed
				$dato = isset($this->dato) ? $this->dato : null;
							
				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
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