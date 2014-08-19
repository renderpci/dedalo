<?php
	
	# CONTROLLER
	require DEDALO_LIB_BASE_PATH .'/media_engine/class.OptimizeTC.php';

	
	# AR_SECTION_TOP_TIPO : ARRAY FORMATED
	$ar_section_top_tipo 	= $this->get_ar_section_top_tipo();
	$ar_diffusion_map 		= $this->get_ar_diffusion_map($ar_section_top_tipo);
		#dump($ar_section_top_tipo,'$ar_section_top_tipo');
		#dump($ar_diffusion_map,'$ar_diffusion_map');


	foreach ($ar_section_top_tipo as $current_section_tipo => $ar_values) {
		
		$html_group 	='';


		# TIPO
		if(!isset($ar_diffusion_map['head'][$current_section_tipo])) {
			$section_name = RecordObj_ts::get_termino_by_tipo($current_section_tipo);
			$msg = "Warning: current_section_tipo: $current_section_tipo ($section_name) is not defined in structure to be showed. This section have indexations but will be not displayed in these results. Please fix this ASAP";
			trigger_error($msg);
			if(SHOW_DEBUG)	print "<div class=\"warning\">$msg</div>";
			continue;
		}
		$current_head = $ar_diffusion_map['head'][$current_section_tipo];
			#dump($ar_values,'$ar_diffusion_map');		
		

		# SECTION
		foreach ($ar_values as $current_section_id => $ar_head) {
			#dump($current_section_id,'$current_section_id');
			#dump($ar_head,'$ar_head');


			# SECTION HEAD
				# HEAD ELEMENTS
				# ar_diffusion_obj_head reset array on every iteration
				$ar_diffusion_obj_head = array();

	  			# HEAD COMPONENTS : Iterate head components
				foreach ($current_head as $head_element_tipo) {

					$RecordObj_ts 	= new RecordObj_ts($head_element_tipo);
					$propiedades 	= $RecordObj_ts->get_propiedades();
					$propiedades 	= json_decode($propiedades);
						#dump($propiedades,'$propiedades');
					
					$related_component_tipo = RecordObj_ts::get_ar_terminos_relacionados($head_element_tipo, $cache=false, $simple=true)[0];
						#dump($related_component_tipo,'$related_component_tipo');

					$component_modelo 	= RecordObj_ts::get_modelo_name_by_tipo($related_component_tipo);
					
					$current_component 	= new $component_modelo(NULL,$related_component_tipo,'list',$current_section_id);
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
					#$ar_components_text_area[$rel_locator] = new component_text_area(NULL,$rel_locator_obj->component_tipo,'list',$rel_locator_obj->section_id_matrix);
						#dump($ar_components_text_area[$rel_locator],'$ar_components_text_area[$rel_locator]');					

				}
				require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_row.phtml';
				$html_group .= $html_row;								
		
		}
		
		$section_name 	= RecordObj_ts::get_termino_by_tipo($current_section_tipo);

		require DEDALO_LIB_BASE_PATH .'/diffusion/'. get_class($this) . '/html/' . get_class($this) . '_table.phtml';
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