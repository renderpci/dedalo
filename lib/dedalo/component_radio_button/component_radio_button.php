<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	#$ar_tools_obj			= $this->get_ar_tools_obj();	
	$html_tools				= '';	
	#$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();
	$dato_json 				= json_encode($dato);
		#dump($dato_json, ' dato_json');
	
			#dump($ar_list_of_values,'ar_list_of_values');

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;	

	
	switch($modo) {

		case 'edit' :
				$valor				= $this->get_valor();
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values	= $this->get_ar_list_of_values( DEDALO_DATA_LANG, null );
				$ar_css				= $this->get_ar_css();	
				#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";
				$js_code	= $this->generate_js();
				$component_info 	= $this->get_component_info('json');
				break;

		case 'tool_time_machine' :	
				$ar_css		= $this->get_ar_css();
				$file_name 	= 'edit';
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";	
				break;						
						
		case 'search' :
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values	= $this->get_ar_list_of_values( DEDALO_DATA_LANG, null);
				$ar_css		= false;
				
				$ar_comparison_operators 	= $this->build_search_comparison_operators();
				$ar_logical_operators 		= $this->build_search_logical_operators();
				#if(is_array($ar_tools_obj)) foreach($ar_tools_obj as $tool_obj) {
				#	$html_tools .= $tool_obj->get_html();
				#}
				break;
						
		case 'portal_list' :
				$file_name = 'list';

		case 'list_tm' :
				$file_name = 'list';
							
		case 'list' :
		
				$valor  			= $this->get_valor();
				$referenced_tipo 	= $this->get_referenced_tipo();
				$ar_list_of_values	= $this->get_ar_list_of_values( DEDALO_DATA_LANG, null );
				$ar_css				= $this->get_ar_css();	
				#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";
				$js_code	= $this->generate_js();
				$component_info 	= $this->get_component_info('json');				
				break;

		case 'relation'	:
				$file_name 	= 'list';
				$ar_css		= false;
				break;	
		case 'tool_lang' :
				return null;
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