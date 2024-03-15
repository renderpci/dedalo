<?php


/*
* CLASS get_coins_by_period
*
*
*/
class get_coins_by_period extends widget_common {

	/**
	* get_dato
	* @return
	*/
	public function get_dato() {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		$data = [];
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
				$model_name 	  = RecordObj_dd::get_modelo_name_by_tipo($current_component_tipo,true); // Expected a portal
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

			$component_period = array_reduce($input, function ($carry, $item){

				if ($item->type==='period') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_period	= $component_period->component_tipo;
			$section_tipo_period	= $component_period->section_tipo;
			$use_parent				= $component_period->use_parent ?? null;


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

			$periods = [];
			// $ar_period_objects = [];
			#get the value of the component using portal dato
				foreach ($component_dato as $current_locator) {

					$duplicated_modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_duplicated,true); // Expected portal
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


					$section_id 	= $current_locator->section_id;
					$section_tipo 	= $current_locator->section_tipo;

					$period_model_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo_period,true); // Expected portal
					$period 			= component_common::get_instance(
						$period_model_name,
						$component_tipo_period,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$period_dato = $period->get_dato();

					if(empty($period_dato)){
						$periods[] = '?';
					}
					foreach ($period_dato as $current_period) {

						if($use_parent === true){
							$ar_parents = component_relation_parent::get_parents($current_period->section_id, $current_period->section_tipo);
							$period_label = ts_object::get_term_by_locator( reset($ar_parents), DEDALO_DATA_LANG, true );
						}else{
							$period_label = ts_object::get_term_by_locator( $current_period, DEDALO_DATA_LANG, true );
						}
						// $period_obj = new stdClass();
						// 	$period_obj->section_id		= $current_period->section_id;
						// 	$period_obj->section_tipo	= $current_period->section_tipo;
						// 	$period_obj->label			= $period_label;

						$periods[] = $period_label;

						// $ar_period_objects[] = $period_obj;
					}
				}

				$period = array_count_values($periods);

				// $period = array_unique(json_encode($ar_period_objects));
				// if (!empty($period_dato)) {

				// }else{
				// 	debug_log(__METHOD__." Empty weights. Sum ignored in widget get_coins_by_period ".to_string(), logger::DEBUG);
				// }

			foreach ($output as $data_map) {
				$current_id = $data_map->id;
				$current_data = new stdClass();
					$current_data->widget 	= get_class($this);
					$current_data->key  	= $key;
					$current_data->id 		= $current_id;
					$current_data->value 	= $$current_id ?? null;
				$data[] = $current_data;
			}


		}//foreach ipo
			dump($data, ' data +---------+ '.to_string());
		return $data;
	}//end get_dato

}//end get_coins_by_period
