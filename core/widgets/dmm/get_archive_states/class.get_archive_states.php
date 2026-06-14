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
 * Both "answer" and "closed" are expected to be component_radio_button instances
 * whose stored datum is a locator with section_id "1" (affirmative) or "2" (negative).
 * Records that have no answer/closed datum are excluded from the respective count,
 * so count totals may be lower than the total number of linked records.
 *
 * Extends widget_common, which provides the IPO contract, section context, and
 * the get_instance() factory. Only get_data() is overridden here.
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
	* Algorithm:
	*  1. Load the source portal identified by IPO input type="source" to obtain
	*     an array of locators (one per linked record).
	*  2. For every linked record locator, instantiate the "answer" and "closed"
	*     components (both expected to be component_radio_button). Collect the
	*     first datum of each into $ar_answer / $ar_closed.
	*  3. Use array_count_values() on the 'section_id' column to bucket responses:
	*       "1" = affirmative, "2" = negative.
	*  4. Compute percentage of each bucket relative to the total locator count
	*     ($total_data = count($component_data)).
	*  5. Emit one stdClass item per IPO output entry, using PHP variable variables
	*     ($$current_id) to map each output id to the local variable of the same
	*     name. The first output item ("closed_afirmative") additionally carries
	*     the human-readable closed_label and answer_label strings resolved from
	*     the ontology.
	*  6. Returns [] (empty array) immediately when the source portal is empty,
	*     avoiding division-by-zero in step 4.
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

			// source input
			// Locate the IPO entry whose type is "source"; this is the portal
			// component that holds the list of linked record locators.
			$component_source = array_reduce($input, function ($carry, $item){
				if ($item->type==='source') {
					return $item;
				}
				return $carry;
			});

			// section_tipo resolution
			// The source portal may declare "self" as its section_tipo, meaning
			// it lives on the same section as the widget itself; resolve to the
			// actual section_tipo in that case.
			$current_component_tipo = $component_source->component_tipo;
			$current_section_tipo 	= $component_source->section_tipo === 'self'
					? $section_tipo
					: $component_source->section_tipo;

			#
			# PORTAL ROWS
			// Load the source portal in 'list' mode (NOLAN = language-neutral)
			// to retrieve all linked record locators for the current section_id.
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

				// early exit
				// No linked records means nothing to aggregate; return an empty
				// result rather than risk division-by-zero on $total_data later.
				if (empty($component_data)) {
					return [];
				}

			// answer input descriptor
			// Extracts the IPO entry for type="answer", which points to the
			// component_radio_button field recording whether a linked record
			// received an answer (section_id "1") or not (section_id "2").
			$component_answer = array_reduce($input, function ($carry, $item){

				if ($item->type==='answer') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_answer 	= $component_answer->component_tipo;
			$section_tipo_answer 	= $component_answer->section_tipo;

			// closed input descriptor
			// Extracts the IPO entry for type="closed", which points to the
			// component_radio_button field recording whether a linked record
			// is considered closed (section_id "1") or still open (section_id "2").
			$component_closed = array_reduce($input, function ($carry, $item){

				if ($item->type==='closed') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_closed 	= $component_closed->component_tipo;

			// accumulator arrays and label resolution
			// $ar_answer and $ar_closed collect the first datum locator from each
			// linked record's answer/closed component. Labels are fetched once
			// from the ontology and attached to the first output item only.
			$ar_answer		= [];
			$ar_closed		= [];
			$answer_label	= ontology_node::get_term_by_tipo($component_tipo_answer, DEDALO_DATA_LANG);
			$closed_label	= ontology_node::get_term_by_tipo($component_tipo_closed, DEDALO_DATA_LANG);
			#get the value of the component using portal data
				foreach ($component_data as $current_locator) {

					// (!) $section_id and $section_tipo are overwritten here with
					// the locator's values. After this loop the outer-scope
					// $section_id / $section_tipo no longer refer to the widget's
					// own record — they hold the last linked record's identifiers.
					$section_id 	= $current_locator->section_id;
					$section_tipo 	= $current_locator->section_tipo;

					// answer component for this linked record
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

					// collect only records that have an answer datum; records with
					// no datum are excluded from the count, so answer totals may
					// be less than $total_data.
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

					// same exclusion logic as for answer: only records with a closed
					// datum contribute to the closed count.
					if(!empty($closed_data)){
						$ar_closed[] = $closed_data[0];
					}
				}

				// $total_data: the denominator for all percentage calculations.
				// Using the count of portal locators (not the count of answered records)
				// so percentages are relative to the full linked set.
				if(!empty($component_data)){

					$total_data = count($component_data);
				}

				// bucket answer responses by section_id
				// array_count_values returns ['1' => N, '2' => M] where "1" is
				// affirmative and "2" is negative (component_radio_button convention).
				if (!empty($ar_answer)) {
					$total_answer 			= array_count_values(array_column($ar_answer, 'section_id'));
					$count_answer 			= count($ar_answer);
				}else{
					debug_log(__METHOD__." Empty answer. Sum ignored in widget get_archive_states ".to_string(), logger::DEBUG);
				}

				// bucket closed responses by section_id
				if (!empty($ar_closed)) {
					$total_closed 			= array_count_values(array_column($ar_closed, 'section_id'));
					$count_closed 			= count($ar_closed);
				}else{
					debug_log(__METHOD__." Empty diameter. Sum ignored in widget get_archive_states ".to_string(), logger::DEBUG);
				}

				// closed
				// Compute closed_afirmative, closed_negative, and closed_count output
				// variables. Each is set only when the corresponding bucket is non-zero,
				// so output items for absent buckets receive null via $$current_id ?? null.
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
				// Same computation as for "closed" above, but for the answer dimension.
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

				// output mapping
				// Walk the IPO output array. For each entry, use the PHP variable
				// variable $$current_id to read the local variable whose name matches
				// the output id string (e.g. $current_id === 'closed_afirmative'
				// resolves to $closed_afirmative). Unset variables yield null.
				// closed_label and answer_label are attached to the first item only
				// ("closed_afirmative") so the client renderer can read them once
				// without the cost of repeating them on every output row.
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
