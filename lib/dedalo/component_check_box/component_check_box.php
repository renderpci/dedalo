<?php

	# CONTROLLER

	$tipo 					= $this->get_tipo();
	$parent 				= $this->get_parent();
	$section_tipo			= $this->get_section_tipo();
	$modo					= $this->get_modo();
	$label 					= $this->get_label();
	$required				= $this->get_required();
	$debugger				= $this->get_debugger();
	$permissions			= $this->get_component_permissions();
	$ejemplo				= NULL;
	$html_title				= $label;
	$ar_tools_obj			= $this->get_ar_tools_obj();
	$lang					= $this->get_lang();
	$identificador_unico	= $this->get_identificador_unico();
	$component_name			= get_class($this);


	if($permissions===0) return null;

	# Verify component content record is inside section record filter
	if ($this->get_filter_authorized_record()===false) return NULL ;

	$file_name				= $modo;
	$id_wrapper = 'wrapper_'.$identificador_unico;
	switch($modo) {

		case 'dataframe_edit' :
					$caller_dataset_json = json_encode($this->caller_dataset);
					$this->set_relation_type($this->caller_dataset->type);
					$dataframe_value 	 = $this->get_dataframe_value($this->RecordObj_dd->get_parent());
					$id_wrapper 		 = 'wrapper_'.$identificador_unico.'_'.$this->caller_dataset->component_tipo ;

		case 'edit' :
					$dato					= $this->get_dato();
					$value					= $this->get_valor();
					$input_name 			= "{$tipo}_{$parent}";
					$referenced_tipo		= $this->get_referenced_tipo();
					$ar_list_of_values  	= $this->get_ar_list_of_values2();
					$dato_string			= $this->get_dato_as_string();
					$component_info 		= $this->get_component_info('json');
					break;

		case 'tool_time_machine' :
					$dato		= $this->get_dato();
					$id_wrapper = 'wrapper_'.$identificador_unico.'_tm';
					$input_name = "{$tipo}_{$parent}_tm";
					# Force file_name
					$file_name 	= 'edit';
					break;

		case 'search' :
					# dato is injected by trigger search wen is needed
					$dato = isset($this->dato) ? $this->dato : null;

					$referenced_tipo		= $this->get_referenced_tipo();
					$ar_list_of_values  	= $this->get_ar_list_of_values2();

					# q_operator is injected by trigger search2
					$q_operator = isset($this->q_operator) ? $this->q_operator : null;

					# Search input name (var search_input_name is injected in search -> records_search_list.phtml)
					# and recovered in component_common->get_search_input_name()
					# Normally is section_tipo + component_tipo, but when in portal can be portal_tipo + section_tipo + component_tipo
					$search_input_name = $this->get_search_input_name();
					break;

		case 'portal_list' :
		case 'list_tm' :
					$file_name 	= 'list';
		case 'list' :
					$valor		= $this->get_valor($lang);
					break;

		case 'relation' :
					# Force file_name to 'list'
					$file_name 	= 'list';
					break;

		case 'lang' :
					break;

		case 'print' :
					$valor = $this->get_valor($lang);
					break;
	}


	$page_html	= DEDALO_LIB_BASE_PATH .'/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid mode $this->modo</div>";
	}
?>
