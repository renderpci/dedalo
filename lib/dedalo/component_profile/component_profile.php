<?php
	
	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$lang					= DEDALO_APPLICATION_LANG;
	$label 					= $this->get_label();	
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);	
	$html_title				= "Info about $tipo";
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$file_name 				= $modo;
	
	switch($modo) {
		
		case 'edit'	:
				$dato 			  	= $this->get_dato();				
				$id_wrapper 		= 'wrapper_'.$identificador_unico;
				$input_name 		= "{$tipo}_{$parent}";	
				$component_info 	= $this->get_component_info('json');
				
				$profile_section_tipo 	= DEDALO_SECTION_PROFILES_TIPO;
					#dump($dato, ' dato ++ '.to_string($tipo));

				$ar_select_values = (array)$this->get_ar_select_values();
					#dump($ar_select_values," ar_select_values");				
				break;

		case 'valor_list':
				$file_name	= 'list';
		case 'list':
				$valor 		= $this->get_valor();
				break;		
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>