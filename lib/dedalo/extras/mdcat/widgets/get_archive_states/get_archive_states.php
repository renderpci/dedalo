<?php

	# CONTROLLER

		$widget_name 				 	= $this->widget_name;
		$modo 						 	= $this->component_info->get_modo();
		$section_id					 	= $this->component_info->get_parent();
		$section_tipo 				 	= $this->component_info->get_section_tipo();
		$data_source 				 	= $this->data_source;
		$filename 					 	= $modo;

		$lang = isset($lang) ? $lang : DEDALO_DATA_LANG;

		switch ($modo) {

			case 'list':
				$filename = 'edit';
			case 'edit':

				$widget_base_url = $this->get_widget_base_url();
				css::$ar_url[] 	 = $widget_base_url ."/css/".$widget_name.".css";

				if($modo==='edit') {
					js::$ar_url[]    = $widget_base_url ."/js/".$widget_name.".js";
				}

				$component_source = array_reduce($data_source, function ($carry, $item){
					if ($item->type==='source') {
						return $item;
					}
					return $carry;
				});

				$current_component_tipo = $component_source->component_tipo;
				$current_section_tipo 	= $component_source->section_tipo;

				#
				# PORTAL ROWS

					$modelo_name 	  = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true); // Expected portal
					$component_portal = component_common::get_instance($modelo_name,
																	   $current_component_tipo,
																	   $section_id,
																	   $modo,
																	   DEDALO_DATA_NOLAN,
																	   $current_section_tipo);

					$dato = $component_portal->get_dato();

					if (empty($dato)) {
						return 'Empty portal data';
					}



				$component_answer = array_reduce($data_source, function ($carry, $item){

					if ($item->type==='answer') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_answer 	= $component_answer->component_tipo;
				$section_tipo_answer 	= $component_answer->section_tipo;


				$component_closed = array_reduce($data_source, function ($carry, $item){

					if ($item->type==='closed') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_closed 	= $component_closed->component_tipo;



				$ar_answer = [];
				$ar_closed = [];
				$answer_label ='';
				$closed_label = '';
				#get the value of the component using portal dato
					foreach ($dato as $current_locator) {

						$section_id 	= $current_locator->section_id;
						$section_tipo 	= $current_locator->section_tipo;

						$answer_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_answer,true); // Expected component_radio_button
						$answer 			= component_common::get_instance($answer_modelo_name,
																	   $component_tipo_answer,
																	   $section_id,
																	   'list',
																	   DEDALO_DATA_NOLAN,
																	   $section_tipo);

						$answer_dato 	= $answer->get_dato();
						$answer_label 	= $answer->get_label();



						if(!empty($answer_dato)){
							$ar_answer[] = $answer_dato[0];
						}


						#if ($answer_dato[0]->section_id==='2') continue;
						// if (empty($answer_dato) || $answer_dato[0]->section_id==='2') continue;

						//closed
						$closed_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_closed,true); // Expected component_radio_button
						$closed				= component_common::get_instance($closed_modelo_name,
																	   $component_tipo_closed,
																	   $section_id,
																	   'list',
																	   DEDALO_DATA_NOLAN,
																	   $section_tipo);

						$closed_dato 	= $closed->get_dato();
						$closed_label 	= $closed->get_label();

						if(!empty($closed_dato)){
							$ar_closed[] = $closed_dato[0];
						}



					}

					if(!empty($dato)){

						$total_dato = count($dato);
					}

					if (!empty($ar_answer)) {

						$total_answer 			= array_count_values(array_column($ar_answer, 'section_id'));
						$count_answer 			= count($ar_answer);

					}else{
						debug_log(__METHOD__." Empty answer. Sum ignored in widget get_archive_states ".to_string(), logger::DEBUG);
					}

					if (!empty($ar_closed)) {
						$total_closed 			= array_count_values(array_column($ar_closed, 'section_id'));
						$count_closed 			= count($ar_closed);

						
					}else{
						debug_log(__METHOD__." Empty diameter. Sum ignored in widget get_archive_states ".to_string(), logger::DEBUG);
					}


					// fix dato
						$dato = new stdClass();
							$dato->total_dato 			= $total_dato 			?? null;
							$dato->total_answer 		= $total_answer 		?? null;
							$dato->total_closed 		= $total_closed 		?? null;

						$this->dato = $dato;
				break;

			default:
				return "Sorry. Mode: $modo is not supported";
		}//end switch ($modo)




	$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid widget mode $modo</div>";
	}


