<?php
	
	# CONTROLLER
	
	#$id 					= $this->get_id();		
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$lang 					= $this->get_lang();
	$modo					= $this->get_modo();		
	$dato 					= $this->get_dato();	#dump($dato,'dato');
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= common::get_permissions($tipo);
	$ejemplo				= NULL;
	$html_title				= "Info about $tipo";
	
	$html_tools				= '';	
	$valor					= $this->get_valor();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$dato_string			= $this->get_dato_as_string();
	$caller_id 				= $this->get_caller_id();				#dump($caller_id,'caller_id');	#die();

	#$ar_tools_obj			= $this->get_ar_tools_obj();

	$file_name				= $modo;

	switch($modo) {
		
		case 'edit'		:	$ar_css		= $this->get_ar_css();
							$ar_proyectos_section = (array)$this->get_ar_proyectos_section();	
								#dump($ar_proyectos_section,'ar_proyectos_section'); die();
							#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();
							$id_wrapper = 'wrapper_'.$identificador_unico;
							$input_name = "{$tipo}_{$parent}";
							$component_info 	= $this->get_component_info('json');
							break;

		case 'tool_time_machine'		:	
							$ar_css		= $this->get_ar_css();
							$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
							$input_name = "{$tipo}_{$parent}_tm";
							# Force file_name
							$file_name 	= 'edit';	
							break;

		case 'ajax'		:	$ar_css		= $this->get_ar_css();
							$ar_proyectos_section = $this->get_ar_proyectos_section(); #die();
							#foreach($ar_tools_obj as $tool_obj) $html_tools .= $tool_obj->get_html();		
							break;
						
		case 'search'	:	# Force file_name to 'list'
							$file_name 	= 'list';
							$ar_css		= false;
							break;
						
		case 'list_tm' :
							$file_name = 'list';

		case 'list'		:	$ar_css		= false;
							if (empty($dato) || count($dato)<1) {
								echo "<span class=\"error\">Proyects is empty.<br>Please set at least one</span>";
								return;
							}
							$ar_proyectos_section = (array)$this->get_ar_proyectos_section();
							break;

		case 'relation':	# Force file_name to 'list'
							$file_name 	= 'list';
							$ar_css		= false;
							break;
						
		
							
		case 'lang'		:	$ar_css		= $this->get_ar_css();
							# load only time machime tool
							/*
							foreach($ar_tools_obj as $tool_obj) {
								if( get_class($tool_obj) == 'tool_time_machine') {																				
									$html_tools .= $tool_obj->get_html();								
								}
							}
							*/
							break;
	}
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>