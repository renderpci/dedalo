<?php
	
	# CONTROLLER

	$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();			#dump($dato);
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $id";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$html_tools				= '';
	
	$valor_string			= $dato;
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);

	$referenced_tipo 		= $this->get_referenced_tipo();
	#$referenced_tipo_json	= trim(json_handler::encode($referenced_tipo));
		#dump($referenced_tipo, "referenced_tipo_json: $referenced_tipo_json");
	

	#$ar_list_of_values		= $this->get_ar_list_of_values();	
		#dump($ar_list_of_values,"ar_list_of_values for dato:$dato - tipo:$tipo");

	#dump($this);

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	
	switch($modo) {
		
		case 'edit'	:	$ar_css		= false;
						$valor 		= $this->get_valor();
						$id_wrapper = 'wrapper_'.$identificador_unico;
						$input_name = "{$tipo}_{$id}";
						break;

		case 'tool_time_machine' :	
						return NULL;
						$ar_css		= $this->get_ar_css();
						$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
						$input_name = "{$tipo}_{$id}_tm";
						$file_name 	= 'edit';
						break;	
						
		case 'search':	$ar_list_of_values		= $this->get_ar_list_of_values();
						$ar_css		= false;
						break;
						
		case 'list_tm' :
						$file_name = 'list';

		case 'portal_list':
						$file_name 	= 'list';

		case 'list'	:	$ar_css		= false;
						$valor 		= $this->get_valor();
						break;

		case 'relation':return NULL;
						# Force file_name to 'list'
						$file_name  = 'list';
						$ar_css		= false;
						break;
						
							
		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
?>