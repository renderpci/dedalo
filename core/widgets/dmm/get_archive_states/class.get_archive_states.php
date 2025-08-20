<?php


/*
* CLASS GET_ARCHIVE_STATES
*
*
*/
class get_archive_states extends widget_common {

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
			$current_section_tipo 	= $component_source->section_tipo === 'self'
					? $section_tipo
					: $component_source->section_tipo;

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


			$component_answer = array_reduce($input, function ($carry, $item){

				if ($item->type==='answer') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_answer 	= $component_answer->component_tipo;
			$section_tipo_answer 	= $component_answer->section_tipo;


			$component_closed = array_reduce($input, function ($carry, $item){

				if ($item->type==='closed') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_closed 	= $component_closed->component_tipo;

			$ar_answer		= [];
			$ar_closed		= [];
			$answer_label	= ontology_node::get_termino_by_tipo($component_tipo_answer, DEDALO_DATA_LANG);
			$closed_label	= ontology_node::get_termino_by_tipo($component_tipo_closed, DEDALO_DATA_LANG);
			#get the value of the component using portal dato
				foreach ($component_dato as $current_locator) {

					$section_id 	= $current_locator->section_id;
					$section_tipo 	= $current_locator->section_tipo;

					$answer_modelo_name	= ontology_node::get_modelo_name_by_tipo($component_tipo_answer,true); // Expected component_radio_button
					$answer_component	= component_common::get_instance(
						$answer_modelo_name,
						$component_tipo_answer,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$answer_dato 	= $answer_component->get_dato();

					if(!empty($answer_dato)){
						$ar_answer[] = $answer_dato[0];
					}

					//closed
					$closed_modelo_name	= ontology_node::get_modelo_name_by_tipo($component_tipo_closed,true); // Expected component_radio_button
					$closed_component	= component_common::get_instance(
						$closed_modelo_name,
						$component_tipo_closed,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$closed_dato 	= $closed_component->get_dato();

					if(!empty($closed_dato)){
						$ar_closed[] = $closed_dato[0];
					}

				}

				if(!empty($component_dato)){

					$total_dato = count($component_dato);
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

				// closed
					if(isset($total_closed["1"]) && $total_closed["1"]>0 ) {

						$closed_percent = ($total_closed["1"] * 100 ) / $total_dato;

						$closed_afirmative			= $total_closed["1"];
						$closed_afirmative_percent	= round($closed_percent, 1);
					}
					if(isset($total_closed["2"]) && $total_closed["2"]>0) {

						$closed_neg_percent = ($total_closed["2"] * 100 ) / $total_dato;

						$closed_negative			= $total_closed["2"];
						$closed_negative_percent	= round($closed_neg_percent, 1);
					}
					if(isset($count_closed) && $count_closed>0) {

						$closed_total_percent	= ($count_closed * 100 ) / $total_dato;

						$closed_count			= $count_closed;
						$closed_count_percent	= round($closed_total_percent, 1);
						$closed_total			= $total_dato;
					}
					$closed_label = $closed_label;

				// answer
					if(isset($total_answer["1"]) && $total_answer["1"]>0 ) {

						$answer_percent = ($total_answer["1"] * 100 ) / $total_dato;

						$answer_afirmative			= $total_answer["1"];
						$answer_afirmative_percent	= round($answer_percent, 1);
					}
					if(isset($total_answer["2"]) && $total_answer["2"]>0) {

						$answer_neg_percent = ($total_answer["2"] * 100 ) / $total_dato;

						$answer_negative			= $total_answer["2"];
						$answer_negative_percent	= round($answer_neg_percent, 1);
					}
					if(isset($count_answer) && $count_answer>0) {

						$answer_total_percent	= ($count_answer * 100 ) / $total_dato;

						$answer_count			= $count_answer;
						$answer_count_percent	= round($answer_total_percent, 1);
						$answer_total			= $total_dato;
					}
					$answer_label = $answer_label;


				// fix dato
					// $dato = new stdClass();
					// 	$dato->total_dato 			= $total_dato 			?? null;
					// 	$dato->total_answer 		= $total_answer 		?? null;
					// 	$dato->total_closed 		= $total_closed 		?? null;

				foreach ($output as $data_map) {
					$current_id = $data_map->id;
					$current_data = new stdClass();
						$current_data->widget		= get_class($this);
						$current_data->key			= $key;
						$current_data->id			= $current_id;
						if($current_id === 'closed_afirmative'){
							$current_data->closed_label	= $closed_label;
							$current_data->answer_label	= $answer_label;
						}
						$current_data->value		= $$current_id ?? null;
					$dato[] = $current_data;
				}
		}//foreach ipo

		return $dato;
	}//end get_dato

}//end get_archive_states
