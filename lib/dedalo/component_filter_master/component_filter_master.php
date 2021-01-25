<?php
	
	# CONTROLLER
		
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$lang 					= $this->get_lang();
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
	$caller_id 				= $this->get_caller_id();
	$file_name				= $modo;

	if($permissions===0) return null;

	switch($modo) {
		
		case 'edit'	:
				$ar_proyectos_section = (array)$this->get_ar_projects_for_current_section();
				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";
				$component_info 	= $this->get_component_info('json');

				# VERIFY USER LOGGED IS CURRENT VIEWED USER			
				$user_id_logged = navigator::get_user_id();
				$user_id_viewed = $parent;
				if($user_id_logged==$user_id_viewed) {
					$permissions=1; // Read only
				}
				break;

		case 'tool_time_machine' :	
				
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				# Force file_name
				$file_name 	= 'edit';	
				break;

		case 'search' :
				# dato is injected by trigger search wen is needed
				$dato = isset($this->dato) ? $this->dato : null;
				
				# Nothing to do
				#return print "$component_name. working here..";
				#$ar_comparison_operators 	= $this->build_search_comparison_operators();
				#$ar_logical_operators 		= $this->build_search_logical_operators();
							
				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				#break;
		case 'ajax'		:	
				$ar_proyectos_section = $this->get_ar_projects_for_current_section(); #die();
				break;
						
		case 'search'	:
				# Showed only when permissions are >1
				if ($permissions<1) return null;
				
				# Force file_name to 'list'
				$file_name 	= 'list';

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();
				break;
						
		case 'list_tm' :
				$file_name = 'list';

		case 'list'		:	
				if (empty($dato) || count($dato)<1) {
					echo "<span class=\"error\">Proyects is empty.<br>Please set at least one</span>";
					return;
				}
				# $valor = $this->get_valor();
				$ar_proyectos_section = (array)$this->get_ar_projects_for_current_section();
				if(SHOW_DEBUG) {
					#dump($ar_proyectos_section, " ar_proyectos_section ".to_string());
				}
				break;

		case 'relation':	
				# Force file_name to 'list'
				$file_name 	= 'list';
				break;		
							
		case 'lang'		:
				break;
	}
	
		
	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
