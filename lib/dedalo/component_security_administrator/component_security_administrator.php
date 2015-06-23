<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();
	$parent					= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();	
	$dato 					= $this->get_dato();
	$dato_string 			= $this->get_dato_as_string();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$visible				= $this->get_visible();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$html_title				= "Info about $tipo";
	$ar_tools_obj			= $this->get_ar_tools_obj();	
	$html_tools				= '';
	$valor					= $this->get_valor();				
	$ar_list_of_values[]	= $valor; 
	
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);


	$edited_user_id 		= $this->get_edited_user_id();										#dump($edited_user_id,'edited_user_id');
	$logged_user_id 		= navigator::get_user_id();											#dump($logged_user_id,'logged_user_id');
	$is_global_admin 		= component_security_administrator::is_global_admin($logged_user_id);#dump($is_global_admin,'is_global_admin');	

	
	#if($visible!==true) 
	return null;	# <- DESACTIVADA LA VISUALIZACIÓN HTML

	$file_name				= $modo;

	switch($modo) {
		
		
		case 'edit'		:	$ar_css		= $this->get_ar_css();
							#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
							$id_wrapper = 'wrapper_'.$identificador_unico;
							$input_name = "{$tipo}_{$parent}";	
							$component_info 	= $this->get_component_info('json');
							break;

		case 'tool_time_machine'		:	
							$ar_css		= $this->get_ar_css();
							#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
							$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
							$input_name = "{$tipo}_{$parent}_tm";
							# Force filename
							$file_name  = 'edit';
							break;					
						
		case 'search'	:	$ar_css		= false;
							break;
						
		case 'list'		:	$ar_css		= false;	
							break;

		case 'relation'	:	$ar_css		= false;
							$file_name  = 'list';	
							break;
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>