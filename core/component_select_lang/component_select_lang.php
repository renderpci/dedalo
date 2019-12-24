<?php
	
	# CONTROLLER

	$start_time=microtime(1);

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();	
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= null;
	$html_title				= "Info about $tipo";
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);
	$context 				= $this->get_context();
	$relation_type 			= $this->relation_type;

	$file_name = $modo;
	
	if($permissions===0) return null;
	
	switch($modo) {
		
		case 'edit'	:
		
				# Verify component content record is inside section record filter
				if ($this->get_filter_authorized_record()===false) return null ;

				$dato		= $this->get_dato();
				$dato_json 	= json_encode($dato);
				#$valor 	= $this->get_valor();
			
				#$ar_all_project_select_langs	= $this->get_ar_all_project_select_langs();
				$ar_all_project_select_langs	= common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);
					#dump($ar_all_project_select_langs," ar_all_project_select_langs");				

				$id_wrapper 	= 'wrapper_'.$identificador_unico;
				$input_name 	= "{$tipo}_{$parent}";
				$component_info = $this->get_component_info('json');

				$related_component_text_area = $this->get_related_component_text_area();
				break;

		case 'tool_time_machine' :
				$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
				$input_name = "{$tipo}_{$parent}_tm";
				$file_name 	= 'edit';
				break;	
		
		case 'tool_lang':
				return null;
				break;

		case 'search':
				# dato is injected by trigger search when is needed
				$dato = isset($this->dato) ? $this->dato : null;
				
				$ar_all_project_select_langs	= common::get_ar_all_langs_resolved(DEDALO_DATA_LANG);				
				
				# q_operator is injected by trigger search2
				$q_operator = isset($this->q_operator) ? $this->q_operator : null;

				# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
				# and recovered in component_common->get_search_input_name()
				# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
				$search_input_name = $this->get_search_input_name();		
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
				break;
				
		case 'print' :
				$valor = $this->get_valor();
				break;		
	}
		
	$page_html	= DEDALO_CORE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>