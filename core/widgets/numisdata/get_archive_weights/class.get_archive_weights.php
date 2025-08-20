<?php


/*
* CLASS GET_ARCHIVE_WEIGHTS
*
*
*/
class get_archive_weights extends widget_common {

	/**
	* get_dato
	* @return
	*/
	public function get_dato() {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		$dato = [];
		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;

			$component_source = array_reduce($input, function ($carry, $item){
				if ($item->type==='source') {
					return $item;
				}
				return $carry;
			});

			$current_component_tipo = $component_source->component_tipo;
			$current_section_tipo 	= $component_source->section_tipo;

			#
			# PORTAL ROWS
				$model_name 	  = ontology_node::get_modelo_name_by_tipo($current_component_tipo,true); // Expected portal
				$component_portal = component_common::get_instance(
					$model_name,
					$current_component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);

				$component_dato = $component_portal->get_dato();

				if (empty($component_dato)) {
					return [];
				}

			$component_used = array_reduce($input, function ($carry, $item){

				if ($item->type==='used') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_used 	= $component_used->component_tipo;
			$section_tipo_used 		= $component_used->section_tipo;


			// type duplicated
				$component_duplicated = array_reduce($input, function ($carry, $item){
					if ($item->type==='duplicated') {
						return $item;
					}
					return $carry;
				});
				if (empty($component_duplicated)) {
					debug_log(__METHOD__
						. " !!!!!!!!!!!!!!! Skipped component_duplicated (type == duplicated) not found in input " . PHP_EOL
						. ' input: ' . to_string($input)
						, logger::ERROR
					);
					continue;
				}
				$component_tipo_duplicated	= $component_duplicated->component_tipo;
				// $section_tipo_duplicated	= $component_duplicated->section_tipo;


			$component_data_weights = array_reduce($input, function ($carry, $item){

				if ($item->type==='data_weights') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_data_weights 	= $component_data_weights->component_tipo;


			$component_data_diameter = array_reduce($input, function ($carry, $item){

				if ($item->type==='data_diamenter') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_data_diameter 	= $component_data_diameter->component_tipo;



			$weights = [];
			$diameter = [];
			#get the value of the component using portal dato
				foreach ($component_dato as $current_locator) {

					$section_id 	= $current_locator->section_id;
					$section_tipo 	= $current_locator->section_tipo;

					$used_model_name	= ontology_node::get_modelo_name_by_tipo($component_tipo_used,true); // Expected portal
					$used 				= component_common::get_instance(
						$used_model_name,
						$component_tipo_used,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$used_dato = $used->get_dato();

					if (empty($used_dato) || $used_dato[0]->section_id==='2') continue;


					$duplicated_modelo_name	= ontology_node::get_modelo_name_by_tipo($component_tipo_duplicated,true); // Expected portal
					$duplicated				= component_common::get_instance(
						$duplicated_modelo_name,
						$component_tipo_duplicated,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$duplicated_dato = $duplicated->get_dato();

					if (!empty($duplicated_dato) && $duplicated_dato[0]->section_id==='2') continue;


					//weights
					$data_weights_model_name	= ontology_node::get_modelo_name_by_tipo($component_tipo_data_weights,true); // Expected portal
					$data_weights				= component_common::get_instance(
						$data_weights_model_name,
						$component_tipo_data_weights,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$data_weights_dato 	= $data_weights->get_dato();

					if(!empty($data_weights_dato)){
						$weights[] = array_sum($data_weights_dato) / count($data_weights_dato);
					}

					//diameter
					$data_diameter_model_name	= ontology_node::get_modelo_name_by_tipo($component_tipo_data_diameter,true); // Expected portal
					$data_diameter				= component_common::get_instance(
						$data_diameter_model_name,
						$component_tipo_data_diameter,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$data_diameter_dato = $data_diameter->get_dato();

					if(!empty($data_diameter_dato)){
						$diameter[] = array_sum($data_diameter_dato) / count($data_diameter_dato);
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

				foreach ($output as $data_map) {
					$current_id = $data_map->id;
					$current_data = new stdClass();
						$current_data->widget 	= get_class($this);
						$current_data->key  	= $key;
						$current_data->id 		= $current_id;
						$current_data->value 	= $$current_id ?? null;
					$dato[] = $current_data;
				}

			// $dato = new stdClass();
			// 	$dato->media_weight 			= $media_weight 			?? null;
			// 	$dato->max_weight 				= $max_weight 				?? null;
			// 	$dato->min_weight 				= $min_weight 				?? null;
			// 	$dato->total_elements_weights 	= $total_elements_weights 	?? null;
			// 	$dato->media_diameter 			= $media_diameter 			?? null;
			// 	$dato->max_diameter 			= $max_diameter 			?? null;
			// 	$dato->min_diameter 			= $min_diameter 			?? null;
			// 	$dato->total_elements_diameter 	= $total_elements_diameter 	?? null;
		}//foreach ipo

		return $dato;
	}//end get_dato

}//end get_archive_weights
