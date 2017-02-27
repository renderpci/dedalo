<?php
	
	# CONTROLLER
	
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$propiedades			= $this->get_propiedades();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$valor_string			= $dato;
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
				$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();		
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);
				
				$tipo_to_search			= $this->get_tipo_to_search();
				$valor 					= $this->get_valor();
				$ar_valor 				= $this->get_valor($lang,'array');
				$id_wrapper 			= 'wrapper_'.$identificador_unico;
				$input_name 			= "{$tipo}_{$parent}";
				$component_info 		= $this->get_component_info('json');
				$dato_json 				= json_handler::encode($dato);

				if (isset($_REQUEST['from_modo'])) {
					$from_modo = $_REQUEST['from_modo'];
				}

				#
				# SEMANTIC NODES
				$semantic_nodes = $this->get_semantic_nodes();
				if ( !empty($this->semantic_nodes) ) {
					# JS/CSS ADD
					js::$ar_url[]  = DEDALO_LIB_BASE_URL."/tools/tool_semantic_nodes/js/tool_semantic_nodes.js";
					css::$ar_url[] = DEDALO_LIB_BASE_URL."/tools/tool_semantic_nodes/css/tool_semantic_nodes.css";
				}

				$in_time_machine =  (isset($_REQUEST['m']) && $_REQUEST['m']=='tool_time_machine') || 
									(isset($_REQUEST['mode']) && $_REQUEST['mode']=='load_preview_component') ? true : false;	


				break;

		case 'tool_time_machine' :	
				return NULL;
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;	
						
		case 'search':
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				$referenced_tipo		= $this->get_referenced_tipo();
				$ar_list_of_values		= $this->get_ar_list_of_values(DEDALO_DATA_LANG, null); // $this->get_ar_list_of_values( $lang, null, $this->ar_referenced_section_tipo, $filter_custom );

				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();	

				# Search input name
				$search_input_name = $section_tipo.'_'.$tipo;			
				break;

		case 'dummy' :
				$file_name = 'search';
				break;

		case 'list_tm' :
				$file_name = 'list';
		case 'portal_list':
				$id_wrapper		= 'wrapper_'.$identificador_unico;
				$tipo_to_search			= $this->get_tipo_to_search();	
				$ar_target_section_tipo 	 = $this->get_ar_target_section_tipo();	
				$dato_json 		= json_handler::encode($dato);
				$component_info = $this->get_component_info('json');
				$ar_target_section_tipo_json = json_encode($ar_target_section_tipo);

				$valor 			= $this->get_valor($lang,'string');
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

	}
	
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>