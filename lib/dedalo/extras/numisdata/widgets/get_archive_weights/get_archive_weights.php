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


				$component_data = array_reduce($data_source, function ($carry, $item){

					if ($item->type==='data') {
						return $item;
					}
					return $carry;
				});

				$component_tipo_data 	= $component_data->component_tipo;
				$section_tipo_data 		= $component_data->section_tipo;



				$weights = [];
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

						if ($used_dato[0]->section_id === '2') continue;


						$data_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_data,true); // Expected portal
						$data 				= component_common::get_instance($data_modelo_name,
																	   $component_tipo_data,
																	   $section_id,
																	   'list',
																	   DEDALO_DATA_NOLAN,
																	   $section_tipo);

						$data_dato = $data->get_dato();

						$weights[] = $data_dato;
					}

					$media_weight 	= array_sum($weights) / count($weights);
					$total_elements = count($weights);
					$max_weight 	= max($weights);
					$min_weight 	= min($weights);

				break;

			default:
				return "Sorry. Mode: $modo is not supported";
		}//end switch ($modo)




	$page_html = dirname(__FILE__) . '/html/' . $widget_name . '_' . $filename . '.phtml';	
	if( !include($page_html) ) {
		echo "<div class=\"error\">Invalid widget mode $modo</div>";
	}


