<?php
	
	# CONTROLLER

	$tipo				= $this->section_records_obj->get_tipo();
	$permissions		= common::get_permissions($tipo,$tipo);
	$modo				= $this->get_modo();
	$layout_map 		= $this->section_records_obj->rows_obj->options->layout_map;

	$section_tipo 		= $this->section_records_obj->rows_obj->options->section_tipo;
	$section_list_tipo 	= key($this->section_records_obj->rows_obj->options->layout_map);
	$ar_columns_tipo 	= reset($this->section_records_obj->rows_obj->options->layout_map);
	
	$RecordObj_dd = new RecordObj_dd($section_list_tipo);
	$propiedades  = json_decode($RecordObj_dd->get_propiedades());	

	$ar_label_html		= array();
	$file_name 			= $modo;

	if(empty($this->section_records_obj->rows_obj->result)) return null;

	
	#if(isset($ar_component_obj) && is_array($ar_component_obj)) foreach($ar_component_obj as $tipo => $component_obj) {						
	#	$ar_label_html[$tipo] = $component_obj->get_label();
	#}

	
	foreach($ar_columns_tipo as $current_tipo) {

		$label = RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_DATA_LANG, true);

		#
		# PORTALS. Portal with multiple list cases
		$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($current_tipo,true);
		if ($modelo_name==='component_portal') {			
			
			$ar_section_list = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, 'section_list', 'children', true);
				#dump($ar_section_list, ' $ar_section_list ++ '.to_string($current_tipo));
			
			if (empty($ar_section_list)) {
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__." Empty portal section_list. Please define at least one section_list for portal [portal tipo:$current_tipo - $label]".to_string(), logger::WARNING);
				}
				$ar_section_list = array($current_tipo);
			}

			$sl_count 		 = count($ar_section_list);				
			foreach ($ar_section_list as $slkey => $current_section_list_tipo) {

				if ($sl_count>1) {					
					$label = RecordObj_dd::get_termino_by_tipo($current_section_list_tipo, DEDALO_DATA_LANG, true);
				}
				
				$ar_label_html[] = array('tipo'  => $current_tipo,
									   	 'label' => $label
									   	 );
			}

		# DEFAULT 
		}else{

			$ar_label_html[] = array('tipo'  => $current_tipo,
								   	 'label' => RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_APPLICATION_LANG, true)
								   	);

		}//end if ($modelo_name==='component_portal')
	}
	#dump($ar_label_html, ' ar_label_html ++ '.to_string());
	
	

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