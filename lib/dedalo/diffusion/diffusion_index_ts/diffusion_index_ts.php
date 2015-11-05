<?php

	if(SHOW_DEBUG) $start_time = start_time();
	
	# CONTROLLER
	require DEDALO_LIB_BASE_PATH .'/media_engine/class.OptimizeTC.php';

	
	# AR_SECTION_TOP_TIPO : ARRAY FORMATED
	$ar_section_top_tipo 	= $this->get_ar_section_top_tipo();
	$ar_diffusion_map 		= $this->get_ar_diffusion_map($ar_section_top_tipo);
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');
		#dump($ar_diffusion_map,'$ar_diffusion_map');



	foreach ($ar_section_top_tipo as $current_section_tipo => $ar_values) {
		#dump($current_section_tipo,'$current_section_tipo');	
		$html_group 	='';


		# TIPO
		if(!isset($ar_diffusion_map['head'][$current_section_tipo])) {
			$section_name = RecordObj_dd::get_termino_by_tipo($current_section_tipo,null,true);
			$msg = "Warning: current_section_tipo: $current_section_tipo ($section_name) is not defined in structure to be showed. This section have indexations but will be not displayed in these results. Please fix this ASAP";
			trigger_error($msg);
			if(SHOW_DEBUG)	print "<div class=\"warning\">$msg</div>";
			continue;
		}
		$current_head = $ar_diffusion_map['head'][$current_section_tipo];
			#dump($ar_values,'$ar_diffusion_map');		
		

		# SECTION
		foreach ($ar_values as $current_section_id => $ar_head) {
			#dump($ar_values,'$ar_values');
			


			# SECTION HEAD
				# HEAD ELEMENTS
				# ar_diffusion_obj_head reset array on every iteration
				$ar_diffusion_obj_head = array();

	  			# HEAD COMPONENTS : Iterate head components
				foreach ($current_head as $head_element_tipo) {
					#dump($current_head,'$current_head');

					$RecordObj_dd 	= new RecordObj_dd($head_element_tipo);
					$traducible 	= $RecordObj_dd->get_traducible();
					if ($traducible=='no') {
						$current_lang = DEDALO_DATA_NOLAN;
					}else{
						$current_lang = DEDALO_DATA_LANG;
					}
					$propiedades 	= $RecordObj_dd->get_propiedades();
					$propiedades 	= json_decode($propiedades);
					if(SHOW_DEBUG) {
						#dump($propiedades,'$propiedades');#die();
					}						
					
					$related_component_tipo = RecordObj_dd::get_ar_terminos_relacionados($head_element_tipo, $cache=false, $simple=true)[0];
						#dump($related_component_tipo,'$related_component_tipo');

					$component_modelo 	= RecordObj_dd::get_modelo_name_by_tipo($related_component_tipo,true);
					#dump($related_component_tipo,'$related_component_tipo');
					$current_component 	= component_common::get_instance($component_modelo, $related_component_tipo, $current_section_id, 'list', $current_lang,$current_section_tipo);
						#dump($current_component,'$current_component');

					$ar_diffusion_obj_head[] = $current_component->get_diffusion_obj( $propiedades );

				}
				#dump($ar_diffusion_obj_head,'ar_diffusion_obj_head');
				require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_head.phtml';

				$html_group .= $html_head;
			
			
			# SECTION ROWS				
				# ROWS ELEMENTS	
				#$ar_components_text_area = array();
				$ar_row_elements = $ar_values[$current_section_id];

				foreach ($ar_values[$current_section_id] as $key => $rel_locator_obj) {
					#dump($rel_locator_obj,'$rel_locator_obj');

					# COMPONENT_TEXT_AREA
					#$ar_components_text_area[$rel_locator] = component_common::get_instance('component_text_area', $rel_locator_obj->component_tipo,$rel_locator_obj->section_id,'list');
						#dump($ar_components_text_area[$rel_locator],'$ar_components_text_area[$rel_locator]');					

				}
				require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_row.phtml';
				$html_group .= $html_row;								
		
		}
		
		$section_name 	= RecordObj_dd::get_termino_by_tipo($current_section_tipo);

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