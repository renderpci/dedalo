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
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$permission_section 	= common::get_permissions($section_tipo,$section_tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	
	$lang					= $this->get_lang();	
	$component_name			= get_class($this);
	$dato_string			= json_encode($dato);

	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$user_id_logged  = navigator::get_user_id();
	$is_global_admin = (bool)component_security_administrator::is_global_admin($user_id_logged);
	
	$file_name = $modo;
	
					
	switch($modo) {
		
		case 'edit'	:

				#
				# MAIN SECTION STATE
				# Whole section state					
				$id_wrapper 		= 'wrapper_'.$this->get_identificador_unico();	// add current modo to avoid rehuse cached uid
				$input_name 		= "{$tipo}_{$tipo}";
				$valor_for_checkbox	= $this->get_valor_for_checkbox();

				$options_json 		= json_encode($this->get_options());
				$dato_json 			= json_encode($this->get_dato());	
				$component_info 	= $this->get_component_info('json');
				
				#
				# GRAPHICS
					$ar_graph 	= $this->get_ar_graph();					
					# CSS includes
						css::$ar_url[] = NVD3_URL_CSS;					
					# JS includes
						js::$ar_url[] = D3_URL_JS;
						js::$ar_url[] = NVD3_URL_JS;
				break;

		case 'edit_component':
				#
				# COMPONENT SPECIFIC STATE
				# WARNING : NOT USE RELOAD COMPONENT METHODS LIKE 'component_common.load_component_by_wrapper_id' TO UPDATE CURRENT 
				# COMPONENT IN THIS MODE. Component in 'edit_component' mode is called only by related component (normally text area)			
				$id_wrapper = 'wrapper_'.$this->get_identificador_unico();	// add current modo to avoid rehuse cached uid

				$component_info = $this->get_component_info('json');
				break;

		case 'edit_tool' :
				#
				# TOOL STATE
				# Like transcription, indexation, lang ..
				$id_wrapper = 'wrapper_'.$this->get_identificador_unico();	// add current modo to avoid rehuse cached uid
				$input_name = "{$tipo}_{$tipo}";

				$valor_for_checkbox	= $this->get_valor_for_checkbox();					
				$options_json 		= json_encode($this->get_options());
				
				# tool label
				$component_input_text = component_common::get_instance('component_input_text',
																		DEDALO_TOOL_INVESTIGATION_COMPONENT_TIPO,
																		DEDALO_TOOL_TRANSCRIPTION_ID,
																		'edit',
																		DEDALO_DATA_LANG,
																		DEDALO_TOOL_INVESTIGATION_SECTION_TIPO);
				$current_label 		= $component_input_text->get_valor();

				break;		
						
		case 'portal_list' :
				$file_name = 'list';
		case 'list' :
				# Format 'valor' as simple array lang resolved to store in 'valor_list'
				$valor 	  = $this->get_valor(); 
				$ar_valor = $this->get_valor_plain( $valor );
					#dump($this->get_dato(), ' get_dato ++ '.to_string());
					#dump($ar_valor, ' ar_valor ++ '.to_string());
				break;

		case 'search' :
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				return null;
				break;

		case 'print' :
				return null;
				break;

		case 'default':
				exit("Unsupported modo: '$modo'");		
	}

		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>