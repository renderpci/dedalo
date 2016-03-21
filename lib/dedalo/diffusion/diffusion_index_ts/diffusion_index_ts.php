<?php

	if(SHOW_DEBUG) $start_time = start_time();
	
	# CONTROLLER
	require_once(DEDALO_LIB_BASE_PATH .'/media_engine/class.OptimizeTC.php');

	$terminoID 				= $this->terminoID;	
	$ar_section_top_tipo 	= $this->get_ar_section_top_tipo();
	$ar_diffusion_map 		= $this->get_ar_diffusion_map($ar_section_top_tipo);
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');
		#dump($ar_diffusion_map,'$ar_diffusion_map');

	#$layout_map = $this->get_layout_map('oh1');
		#dump($layout_map,'$layout_map 2');

	foreach ($ar_section_top_tipo as $current_section_tipo => $ar_values) {

		
		$html_group 	= '';
		$section_name 	= RecordObj_dd::get_termino_by_tipo($current_section_tipo,null,true);

		#
		# HEAD ELEMENTS (diffusion map)
		if(!isset($ar_diffusion_map['head'][$current_section_tipo])) {
			if(SHOW_DEBUG) {
				debug_log(__METHOD__." Warning: current_section_tipo: $current_section_tipo ($section_name) is not defined in structure to be showed. <br>
				This section have indexations but will be not displayed in these results. Please fix this ASAP ".to_string(), logger::WARNING);			
				echo "<div class=\"warning\">".end($GLOBALS['log_messages'])."</div>";
			}
			continue;
		}
		$current_head_elements = $ar_diffusion_map['head'][$current_section_tipo];
			#dump($current_head_elements,'$current_head_elements');		
		
		#
		# SECTION
		# dump($ar_values,'$ar_values');	
		foreach ($ar_values as $current_section_id => $ar_head) {
			#dump($current_section_id, ' current_section_id ++ '.to_string());					
			/**/
			#
			# SECTION HEAD
				# HEAD ELEMENTS
				# ar_diffusion_obj_head reset array on every iteration
				$ar_diffusion_obj_head = array();

	  			# HEAD COMPONENTS : Iterate head components
				foreach ($current_head_elements as $head_element_tipo) {
					#dump($current_head_elements,'$current_head_elements');

					$RecordObj_dd 	= new RecordObj_dd($head_element_tipo);
					$current_lang 	= $RecordObj_dd->get_traducible()=='si' ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;					
					$propiedades 	= $RecordObj_dd->get_propiedades();
					$propiedades 	= json_decode($propiedades);
						#dump($propiedades, ' propiedades ++ '.to_string());						
					
					$related_component_tipo = RecordObj_dd::get_ar_terminos_relacionados($head_element_tipo, $cache=true, $simple=true)[0];
						#dump($related_component_tipo,'$related_component_tipo');

					$component_modelo 	= RecordObj_dd::get_modelo_name_by_tipo($related_component_tipo,true);
					#dump($related_component_tipo,'$related_component_tipo');
					$current_component 	= component_common::get_instance($component_modelo,
																		 $related_component_tipo,
																		 $current_section_id,
																		 'list',
																		 $current_lang,
																		 $current_section_tipo);
					#dump($current_component,'$current_component');

					$ar_diffusion_obj_head[] = $current_component->get_diffusion_obj( $propiedades );
				}
				#dump($ar_diffusion_obj_head,'ar_diffusion_obj_head '.to_string($current_section_id));
				require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_head.phtml';
				$html_group .= $html_head;
			
			#
			# SECTION ROWS				
				# ROWS ELEMENTS	
				#$ar_components_text_area = array();
				$ar_row_elements = $ar_values[$current_section_id];
				/*
				foreach ($ar_values[$current_section_id] as $key => $rel_locator_obj) {
					#dump($rel_locator_obj,'$rel_locator_obj');

					# COMPONENT_TEXT_AREA
					#$ar_components_text_area[$rel_locator] = component_common::get_instance('component_text_area', $rel_locator_obj->component_tipo,$rel_locator_obj->section_id,'list');
						#dump($ar_components_text_area[$rel_locator],'$ar_components_text_area[$rel_locator]');					

				}
				*/
				require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_row.phtml';
				$html_group .= $html_row;

		}//end foreach ($ar_values as $current_section_id => $ar_head) {		
		

		require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_table.phtml';
	}

	if(SHOW_DEBUG) {
		echo "<span style=\"position:absolute;right:30px\">".exec_time($start_time)."</span>";
	}
	
	#print "<pre>";	
	#print_r($ar_section_top_tipo).'';
	#print "</pre>";	

	/*
	$page_html	= DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_' . $file_name . '.phtml';
	if (!file_exists($page_html)) {
		throw new Exception("Error Processing Request. Mode <b>$file_name</b> is not valid! (2) ", 1);		
	}
	include($page_html);
	*/

	
?>