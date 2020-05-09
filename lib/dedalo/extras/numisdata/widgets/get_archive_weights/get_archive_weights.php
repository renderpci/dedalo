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



				$component_used = array_reduce($data_source, function ($carry, $item){

					if ($item->type==='used') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_used 	= $component_used->component_tipo;
				$section_tipo_used 		= $component_used->section_tipo;


				$component_data_weights = array_reduce($data_source, function ($carry, $item){

					if ($item->type==='data_weights') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_data_weights 	= $component_data_weights->component_tipo;


				$component_data_diameter = array_reduce($data_source, function ($carry, $item){

					if ($item->type==='data_diamenter') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_data_diameter 	= $component_data_diameter->component_tipo;



				$weights = [];
				$diameter = [];
				#get the value of the component using portal dato
					foreach ($dato as $current_locator) {

						$section_id 	= $current_locator->section_id;
						$section_tipo 	= $current_locator->section_tipo;

						$used_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_used,true); // Expected portal
						$used 				= component_common::get_instance($used_modelo_name,
																	   $component_tipo_used,
																	   $section_id,
																	   'list',
																	   DEDALO_DATA_NOLAN,
																	   $section_tipo);

						$used_dato = $used->get_dato();

						#if ($used_dato[0]->section_id==='2') continue;
						if (empty($used_dato) || $used_dato[0]->section_id==='2') continue;

						//weights
						$data_weights_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_data_weights,true); // Expected portal
						$data_weights				= component_common::get_instance($data_weights_modelo_name,
																	   $component_tipo_data_weights,
																	   $section_id,
																	   'list',
																	   DEDALO_DATA_NOLAN,
																	   $section_tipo);

						$data_weights_dato 	= $data_weights->get_dato();
						$data_weights_label = $data_weights->get_label();

						if(!empty($data_weights_dato)){
							$weights[] = $data_weights_dato;
						}

						//diameter
						$data_diameter_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_data_diameter,true); // Expected portal
						$data_diameter				= component_common::get_instance($data_diameter_modelo_name,
																	   $component_tipo_data_diameter,
																	   $section_id,
																	   'list',
																	   DEDALO_DATA_NOLAN,
																	   $section_tipo);

						$data_diameter_dato = $data_diameter->get_dato();
						$data_diameter_label = $data_diameter->get_label();

						if(!empty($data_diameter_dato)){
							$diameter[] = $data_diameter_dato;
						}
					}

					if (!empty($weights)) {
						$media_weight 			= round((array_sum($weights) / count($weights)),2);
						$total_elements_weights = count($weights);
						$max_weight 			= max($weights);
						$min_weight 			= min($weights);
					}else{
						debug_log(__METHOD__." Empty weights. Sum ignored in widget get_archive_weights ".to_string(), logger::DEBUG);
					}

					if (!empty($diameter)) {
						$media_diameter				= round((array_sum($diameter) / count($diameter)),2);
						$total_elements_diameter 	= count($diameter);
						$max_diameter 				= max($diameter);
						$min_diameter				= min($diameter);
					}else{
						debug_log(__METHOD__." Empty diameter. Sum ignored in widget get_archive_weights ".to_string(), logger::DEBUG);
					}


					// fix dato
						$dato = new stdClass();
							$dato->media_weight 			= $media_weight 			?? null;
							$dato->max_weight 				= $max_weight 				?? null;
							$dato->min_weight 				= $min_weight 				?? null;
							$dato->total_elements_weights 	= $total_elements_weights 	?? null;
							$dato->media_diameter 			= $media_diameter 			?? null;
							$dato->max_diameter 			= $max_diameter 			?? null;
							$dato->min_diameter 			= $min_diameter 			?? null;
							$dato->total_elements_diameter 	= $total_elements_diameter 	?? null;

						$this->dato = $dato;
				break;

			default:
				return "Sorry. Mode: $modo is not supported";
		}//end switch ($modo)




	$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid widget mode $modo</div>";
	}


