<?php
	
	# CONTROLLER

	#$id 					= $this->get_id();
	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$dato 					= $this->get_dato();			#dump($dato);
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
	$valor_string			= $dato;
	$ar_css					= false;
	
	
		#dump($ar_list_of_values,'$ar_list_of_values');

	

	$file_name = $modo;
	
	switch($modo) {
		
		case 'edit'	:	

				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return NULL ;

				$valor							= $this->get_valor();
				$ar_css							= $this->get_ar_css();
				$ar_all_project_select_langs	= $this->get_ar_all_project_select_langs();
					#dump($ar_all_project_select_langs," ar_all_project_select_langs");

				$id_wrapper = 'wrapper_'.$identificador_unico;
				$input_name = "{$tipo}_{$parent}";
				$component_info 	= $this->get_component_info('json');
				break;

		case 'tool_time_machine' :
				$ar_css		= $this->get_ar_css();
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;	
		
		case 'tool_lang':
				return null;
				break;

		case 'search':	
				$ar_all_project_select_langs 	= $this->get_ar_all_project_select_langs();
				$ar_comparison_operators 		= $this->build_search_comparison_operators();
				$ar_logical_operators 	 		= $this->build_search_logical_operators();				
				break;						
		
		case 'list_tm' :
				# Force file_name to 'list
				$file_name = 'list';
												
		case 'list' :
				$valor = $this->get_valor();					
				break;

		case 'relation':
				# Force file_name to 'list'
				$file_name  = 'list';
				$ar_css		= false;
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