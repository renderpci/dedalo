<?php
	
	# CONTROLLER
	
	$tipo				= $this->section_records_obj->get_tipo();
	$permissions		= common::get_permissions($tipo,$tipo);
	$modo				= $this->get_modo();
	$layout_map 		= $this->section_records_obj->rows_obj->options->layout_map;

	$ar_label_html		= array();
	$file_name 			= $modo;

	if(empty($this->section_records_obj->rows_obj->result)) return null;

	
	#if(isset($ar_component_obj) && is_array($ar_component_obj)) foreach($ar_component_obj as $tipo => $component_obj) {						
	#	$ar_label_html[$tipo] = $component_obj->get_label();
	#}

	$ar_components_tipo = reset($layout_map);
	

	foreach($ar_components_tipo as $current_tipo) {
		$ar_label_html[$current_tipo] = RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true);
	}
	
	

	switch($modo) {
		
		case 'portal_list':
				break;

		case 'list_into_tool_portal':
		case 'portal_list_in_list':
		
				$file_name = 'list';
				#return  null;
				break;

		case 'list'	:
				# Nothing to do
				break;
		
		case 'relation':# Nothing too do
				break;

		case 'list_tm':	
				# Nothing too do
				break;

		case 'relation_reverse_sections': 
				$file_name = 'relation_reverse';
				break;
	}
					
	# LOAD PAGE FOR EVERY ROW
	$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';	
	include($page_html);	
	
	
?>