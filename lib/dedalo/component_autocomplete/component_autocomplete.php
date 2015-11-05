<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();			#dump($dato);
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$html_tools				= '';
	
	$valor_string			= $dato;
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	
	switch($modo) {
	
		case 'edit'	:
				
				$tipo_to_search			= $this->get_tipo_to_search(); 	
				#$referenced_section_tipo= $this->get_referenced_section_tipo();		#dump($referenced_section_tipo, ' referenced_section_tipo'); return;
				$referenced_section_tipo= $this->get_target_section_tipo();
				$ar_css					= false;
				#$valor 				= $this->get_valor();		#dump($valor,"$label valor");
				$ar_valor 				= $this->get_valor($lang,'array');
				$id_wrapper 			= 'wrapper_'.$identificador_unico;
				$input_name 			= "{$tipo}_{$parent}";
				$component_info 		= $this->get_component_info('json');
				#$parent_section_tipo	= component_common::get_section_tipo_from_component_tipo($referenced_tipo);
				#$current_tipo_section 	= $this->get_current_tipo_section();
				$dato_json 				= json_handler::encode($dato);

					/*
					dump($tipo_to_search, ' tipo_to_search');					
					dump($referenced_section_tipo, ' referenced_section_tipo');
					#dump($parent_section_tipo, ' parent_section_tipo');
					#dump($current_tipo_section, ' current_tipo_section');
					*/
				break;

		case 'tool_time_machine' :	
				return NULL;
				$ar_css		= $this->get_ar_css();
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;	
						
		case 'search':
				$referenced_tipo		= $this->get_referenced_tipo();
				$ar_list_of_values		= $this->get_ar_list_of_values(DEDALO_DATA_LANG, null); // $this->get_ar_list_of_values( $lang, null, $this->referenced_section_tipo, $filter_custom );

				$ar_comparison_operators = $this->build_search_comparison_operators();
				$ar_logical_operators 	 = $this->build_search_logical_operators();

				$ar_css		= false;
				break;
		case 'dummy' :
				$file_name = 'search';
				break;				
		case 'list_tm' :
				$file_name = 'list';
		case 'portal_list':
				$file_name 	= 'list';
		case 'list'	:
				$ar_css		= false;
				$valor 	= $this->get_valor($lang,'string');
				break;

		case 'relation':
				return NULL;
				# Force file_name to 'list'
				$file_name  = 'list';
				$ar_css		= false;
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