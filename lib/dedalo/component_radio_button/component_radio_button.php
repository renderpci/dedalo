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
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();
	$dato_json 				= json_encode($dato);

	if($permissions===0) return null;

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;
	
	switch($modo) {

		case 'edit' :
				$valor				= $this->get_valor();
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values	= $this->get_ar_list_of_values( DEDALO_DATA_LANG, null );
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				#$input_name 		= "{$tipo}_{$parent}";
				$input_name 		= 'radio_button_'.$identificador_unico;
				$js_code			= $this->generate_js();
				$component_info 	= $this->get_component_info('json');
				#$component_info  	= rawurlencode($component_info);

				$mandatory 		= (isset($propiedades->mandatory) && $propiedades->mandatory===true) ? true : false;
				$mandatory_json = json_encode($mandatory);
				break;

		case 'tool_time_machine' :	
				$file_name 	= 'edit';
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				break;						
						
		case 'search' :
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values	= $this->get_ar_list_of_values( DEDALO_DATA_LANG, null);
				
				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();

				# Search input name
				$search_input_name = $section_tipo.'_'.$tipo;
				break;
						
		case 'portal_list' :
				$file_name = 'list';

		case 'list_tm' :
				$file_name = 'list';
							
		case 'list' :		
				$valor  			= $this->get_valor();
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values	= $this->get_ar_list_of_values( DEDALO_DATA_LANG, null );
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= 'radio_button_'.$identificador_unico;
				$js_code			= $this->generate_js();
				$component_info 	= $this->get_component_info('json');				
				break;

		case 'relation'	:
				$file_name 	= 'list';
				break;	
		case 'tool_lang' :
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