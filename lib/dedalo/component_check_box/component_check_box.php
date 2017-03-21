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
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	$ar_tools_obj			= $this->get_ar_tools_obj();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	
	if($permissions===0) return null;
	
	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;

	
	switch($modo) {
		
		case 'edit' :					
					$id_wrapper = 'wrapper_'.$identificador_unico;
					$input_name = "{$tipo}_{$parent}";	
					$referenced_tipo		= $this->get_referenced_tipo();
					$ar_list_of_values		= $this->get_ar_list_of_values(DEDALO_DATA_LANG, null);							
					$dato_string			= $this->get_dato_as_string();
					$component_info 		= $this->get_component_info('json');
					break;

		case 'tool_time_machine' :					
					$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
					$input_name = "{$tipo}_{$parent}_tm";							
					# Force file_name
					$file_name 	= 'edit';
					break;
						
		case 'search' :
					# Showed only when permissions are >1
					if ($permissions<1) return null;

					$referenced_tipo	= $this->get_referenced_tipo();
					$ar_list_of_values  = $this->get_ar_list_of_values(DEDALO_DATA_LANG, null);
					$ar_comparison_operators 	= $this->build_search_comparison_operators();
					$ar_logical_operators 		= $this->build_search_logical_operators();

					# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
					# and recovered in component_common->get_search_input_name()
					# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
					$search_input_name = $this->get_search_input_name();
					break;
		
		case 'portal_list' :
		case 'list_tm' :	
					$file_name 	= 'list';					
		case 'list' :					
					$valor		= $this->get_valor();
					break;

		case 'relation' :	
					# Force file_name to 'list'
					$file_name 	= 'list';					
					break;			
							
		case 'lang' :
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