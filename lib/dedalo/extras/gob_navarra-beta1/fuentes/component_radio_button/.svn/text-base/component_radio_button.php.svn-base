<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $id";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$html_tools				= '';	
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();
	
	$ar_list_of_values		= $this->get_ar_list_of_values();		#dump($ar_list_of_values,'ar_list_of_values');

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;
	
	$file_name				= $modo;	

	
	switch($modo) {
		
		case 'edit'		:	$ar_css		= $this->get_ar_css();	
							#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
							$id_wrapper = 'wrapper_'.$identificador_unico;
							$input_name = "{$tipo}_{$id}";
							$js_code	= $this->generate_js();
							# Josetxo 20/01/2015
							$ar_link_fields	= json_handler::encode($this->ger_ar_link_fields());
							# Fin Josetxo 20/01/2015
							break;

		case 'tool_time_machine'		:	
							$ar_css		= $this->get_ar_css();
							$file_name 	= 'edit';
							$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
							$input_name = "{$tipo}_{$id}_tm";	
							break;						
						
		case 'search'	:	$ar_css		= false;
							if(is_array($ar_tools_obj)) foreach($ar_tools_obj as $tool_obj) {
								$html_tools .= $tool_obj->get_html();
							}
							break;
						
		case 'portal_list'	:
							$file_name = 'list';

		case 'list_tm' :
							$file_name = 'list';
							
		case 'list'		:	$ar_css		= false;
							break;

		case 'relation'	:	$file_name 	= 'list';
							$ar_css		= false;
							break;	
						
		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);
	}
	include($page_html);
?>