<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$modo					= $this->get_modo();
	$parent					= $this->get_parent();
	$section_tipo 			= $this->get_section_tipo();	
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$visible				= $this->get_visible();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($section_tipo,$tipo);
	$html_title				= "Info about $tipo";	
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$file_name				= $modo;


	# ONLY ADMIN GLOBAL USERS CAN ACCESS THIS HTML CONTENT
	$logged_user_id 		= navigator::get_user_id();
	$is_global_admin 		= component_security_administrator::is_global_admin($logged_user_id);
	if($is_global_admin!==true) return null;

	
	switch($modo) {		
		
		case 'edit'	:
				$dato 				= $this->get_dato();
				$dato_string 		= $this->get_dato_as_string();
				$valor				= $this->get_valor();				

				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";	
				$component_info 	= $this->get_component_info('json');
				break;

		case 'list':
				return null;
				break;
	}
	
	
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>