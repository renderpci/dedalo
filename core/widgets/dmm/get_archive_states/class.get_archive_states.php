<?php declare(strict_types=1);
/**
 * CLASS GET_ARCHIVE_STATES
 *
 * Widget that aggregates boolean or radio-button state values from linked
 * records (via a source portal) and computes counts and percentages for two
 * state dimensions: "answer" and "closed".
 *
 * Key features:
 * - Reads linked record locators from a source portal (IPO input)
 * - For each linked record, resolves an "answer" component and a "closed" component
 * - Counts affirmative (section_id "1"), negative (section_id "2"), and totals
 * - Computes percentages relative to the total number of linked records
 * - Returns 14 keyed output values consumed by render_get_archive_states.js
 * - Includes human-readable labels (closed_label, answer_label) on the first output item
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class get_archive_states extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into aggregated state counts and
	* percentages from linked records.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": [
	*     { "type": "source",  "section_tipo": "self", "component_tipo": "dmm1" },
	*     { "type": "answer",  "section_tipo": "current", "component_tipo": "dmm2" },
	*     { "type": "closed",  "section_tipo": "current", "component_tipo": "dmm3" }
	*   ],
	*   "output": [
	*     { "id": "closed_afirmative" },
	*     { "id": "closed_afirmative_percent" },
	*     { "id": "closed_negative" },
	*     { "id": "closed_negative_percent" },
	*     { "id": "closed_count" },
	*     { "id": "closed_count_percent" },
	*     { "id": "closed_total" },
	*     { "id": "answer_afirmative" },
	*     { "id": "answer_afirmative_percent" },
	*     { "id": "answer_negative" },
	*     { "id": "answer_negative_percent" },
	*     { "id": "answer_count" },
	*     { "id": "answer_count_percent" },
	*     { "id": "answer_total" }
	*   ]
	* }
	*
	* Sample returned data items:
	* {
	*   "widget": "get_archive_states",
	*   "key": 0,
	*   "widget_id": "closed_afirmative",
	*   "closed_label": "Closed",
	*   "answer_label": "Answer",
	*   "value": 12
	* }
	* {
	*   "widget": "get_archive_states",
	*   "key": 0,
	*   "widget_id": "closed_afirmative_percent",
	*   "value": 48.0
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'get_archive_states',
	*       'path'          => 'dmm/get_archive_states',
	*       'section_tipo'  => 'dmm1',
	*       'section_id'    => '123',
	*       'mode'          => 'edit',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null $data
	*/
	public function get_data() : ?array {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo ?? [];

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
			$current_section_tipo 	= $component_source->section_tipo === 'self'
					? $section_tipo
					: $component_source->section_tipo;

			#
			# PORTAL ROWS
				$model_name 	  = ontology_node::get_model_by_tipo($current_component_tipo,true); // Expected portal
				$component_portal = component_common::get_instance(
					$model_name,
					$current_component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);

				$component_data = $component_portal->get_data();

				if (empty($component_data)) {
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
			$answer_label	= ontology_node::get_term_by_tipo($component_tipo_answer, DEDALO_DATA_LANG);
			$closed_label	= ontology_node::get_term_by_tipo($component_tipo_closed, DEDALO_DATA_LANG);
			#get the value of the component using portal data
				foreach ($component_data as $current_locator) {

					$section_id 	= $current_locator->section_id;
					$section_tipo 	= $current_locator->section_tipo;

					$answer_modelo_name	= ontology_node::get_model_by_tipo($component_tipo_answer,true); // Expected component_radio_button
					$answer_component	= component_common::get_instance(
						$answer_modelo_name,
						$component_tipo_answer,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$answer_data 	= $answer_component->get_data();

					if(!empty($answer_data)){
						$ar_answer[] = $answer_data[0];
					}

					//closed
					$closed_modelo_name	= ontology_node::get_model_by_tipo($component_tipo_closed,true); // Expected component_radio_button
					$closed_component	= component_common::get_instance(
						$closed_modelo_name,
						$component_tipo_closed,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$closed_data 	= $closed_component->get_data();

					if(!empty($closed_data)){
						$ar_closed[] = $closed_data[0];
					}
				}

				if(!empty($component_data)){

					$total_data = count($component_data);
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

						$closed_percent = ($total_closed["1"] * 100 ) / $total_data;

						$closed_afirmative			= $total_closed["1"];
						$closed_afirmative_percent	= round($closed_percent, 1);
					}
					if(isset($total_closed["2"]) && $total_closed["2"]>0) {

						$closed_neg_percent = ($total_closed["2"] * 100 ) / $total_data;

						$closed_negative			= $total_closed["2"];
						$closed_negative_percent	= round($closed_neg_percent, 1);
					}
					if(isset($count_closed) && $count_closed>0) {

						$closed_total_percent	= ($count_closed * 100 ) / $total_data;

						$closed_count			= $count_closed;
						$closed_count_percent	= round($closed_total_percent, 1);
						$closed_total			= $total_data;
					}

				// answer
					if(isset($total_answer["1"]) && $total_answer["1"]>0 ) {

						$answer_percent = ($total_answer["1"] * 100 ) / $total_data;

						$answer_afirmative			= $total_answer["1"];
						$answer_afirmative_percent	= round($answer_percent, 1);
					}
					if(isset($total_answer["2"]) && $total_answer["2"]>0) {

						$answer_neg_percent = ($total_answer["2"] * 100 ) / $total_data;

						$answer_negative			= $total_answer["2"];
						$answer_negative_percent	= round($answer_neg_percent, 1);
					}
					if(isset($count_answer) && $count_answer>0) {

						$answer_total_percent	= ($count_answer * 100 ) / $total_data;

						$answer_count			= $count_answer;
						$answer_count_percent	= round($answer_total_percent, 1);
						$answer_total			= $total_data;
					}

				// fix data
					// $data = new stdClass();
					// 	$data->total_data 			= $total_data 			?? null;
					// 	$data->total_answer 		= $total_answer 		?? null;
					// 	$data->total_closed 		= $total_closed 		?? null;

				foreach ($output as $data_map) {
					$current_id = $data_map->id;
					$current_data = new stdClass();
						$current_data->widget		= get_class($this);
						$current_data->key			= $key;
						$current_data->widget_id	= $current_id;
						if($current_id === 'closed_afirmative'){
							$current_data->closed_label	= $closed_label;
							$current_data->answer_label	= $answer_label;
						}
						$current_data->value		= $$current_id ?? null;
					$data[] = $current_data;
				}
		}//foreach ipo

		return $data;
	}//end get_data



}//end get_archive_states
