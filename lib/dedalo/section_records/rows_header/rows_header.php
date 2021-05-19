<?php
	
	# CONTROLLER

	// Section list propiedades	
		$propiedades	= $this->propiedades; // Is set in controller in list mode

	// ar_label_data. Iterate columns to format final ar columns and values
		$ar_label_data = array();
		foreach ($search_query_object->select as $key => $path_obj) {
			
			$path			= end($path_obj->path);
			$current_tipo	= $path->component_tipo;
			$label			= $path->name;
			$modelo_name	= $path->modelo;

			#
			# PORTALS. Portal with multiple list cases
			if ($modelo_name==='component_portal' && $modo!=='list_tm') {
				
				$ar_section_list = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($current_tipo, 'section_list', 'children', true);
					#dump($ar_section_list, ' $ar_section_list ++ '.to_string($current_tipo));
				
				if (empty($ar_section_list)) {
					if(SHOW_DEBUG===true) {
						debug_log(__METHOD__." Empty portal section_list. Please define at least one section_list for portal [portal tipo:$current_tipo - $label]".to_string(), logger::WARNING);
					}
					$ar_section_list = array($current_tipo);
				}

				$sl_count = count($ar_section_list);
				foreach ($ar_section_list as $slkey => $current_section_list_tipo) {

					if ($sl_count>1) {
						$label = RecordObj_dd::get_termino_by_tipo($current_section_list_tipo, DEDALO_DATA_LANG, true);
					}

					$path = search_development2::get_query_path($current_tipo, $section_tipo, $resolve_related=true);
					
					$ar_label_data[] = [
						'tipo'	=> $current_tipo,
						'label'	=> $label,
						'path'	=> $path
					];
				}
			# DEFAULT 
			}else{

				# Get oomponent related
					// $ar_components_with_references = component_relation_common::get_components_with_relations();
					// if (in_array($modelo_name, $ar_components_with_references)) {
					// 	$RecordObj_dd = new RecordObj_dd($current_tipo);
					// 	$relaciones   = $RecordObj_dd->get_relaciones();
					// 	$related_tipo = false;			
					// 	foreach ((array)$relaciones as $relation) foreach ((array)$relation as $modelo_tipo => $c_tipo) {
					// 		$c_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($c_tipo,true);
					// 		if (strpos($c_modelo_name, 'component')!==false) {
					// 			$related_tipo = $current_tipo;
					// 			break;
					// 		}
					// 	}
					// 	if ($related_tipo!==false) {

					// 	}
					// }

				$path = search_development2::get_query_path($current_tipo, $section_tipo, $resolve_related=true);
					#dump($path, ' path ++ '.to_string($current_tipo));

				$ar_label_data[] = [
					'tipo'	=> $current_tipo,
					'label'	=> RecordObj_dd::get_termino_by_tipo($current_tipo, DEDALO_APPLICATION_LANG, true),
					'path'	=> $path
				];
			}
		}//end foreach ($search_query_object->select as $key => $path_obj)
		

	// file name
		switch($modo) {
			
			case 'list_into_tool_portal':
			case 'portal_list_in_list':		
				$file_name = 'list';
				break;

			case 'relation_reverse_sections': 
				$file_name = 'relation_reverse';
				break;

			case 'list'	:
			case 'list_tm':	
			case 'portal_list':		
			case 'relation':
			default:		
				# Nothing too do
				break;		
		}
	
	# LOAD PAGE FOR EVERY ROW
		$page_html	= dirname(__FILE__) . '/html/'. basename(dirname(__FILE__)) .'_'. $file_name .'.phtml';
		include($page_html);
	
	
