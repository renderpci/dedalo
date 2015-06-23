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
	$ar_tools_obj			= $this->get_ar_tools_obj();
	$html_tools				= '';	
	#$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	

	#dump($dato,"dato-string");

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;

	if(SHOW_DEBUG) {
		#dump($this->get_valor() );
	}
	

	switch($modo) {
		
		case 'edit' :	
					$ar_css		= $this->get_ar_css();
					$id_wrapper = 'wrapper_'.$identificador_unico;
					$input_name = "{$tipo}_{$parent}";	
					#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
					$referenced_tipo		= $this->get_referenced_tipo();
					$ar_list_of_values		= $this->get_ar_list_of_values(DEDALO_DATA_LANG, null);							
					$dato_string			= $this->get_dato_as_string();
					$component_info 		= $this->get_component_info('json');
					break;

		case 'tool_time_machine' :
					$ar_css		= $this->get_ar_css();
					$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
					$input_name = "{$tipo}_{$parent}_tm";							
					# Force file_name
					$file_name 	= 'edit';
					break;
						
		case 'search' :	
					$ar_css		= false;
					$referenced_tipo	= $this->get_referenced_tipo();
					$ar_list_of_values  = $this->get_ar_list_of_values(DEDALO_DATA_LANG, null);
					break;
		
		case 'portal_list' :
		case 'list_tm' :	
					$file_name 	= 'list';	
					
		case 'list' :	
					$ar_css		= false;
					$valor		= $this->get_valor();
					break;

		case 'relation' :	
					# Force file_name to 'list'
					$file_name 	= 'list';
					$ar_css		= false;
					break;			
							
		case 'lang' :	
					$ar_css		= $this->get_ar_css();
					# load only time machime tool
					foreach($ar_tools_obj as $tool_obj) {
						if( get_class($tool_obj) == 'tool_time_machine') {
							$html_tools .= $tool_obj->get_html();
						}
					}
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