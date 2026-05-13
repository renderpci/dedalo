<?php declare(strict_types=1);
/**
 * CLASS GET_ARCHIVE_WEIGHTS
 *
 * Widget that computes aggregated weight and diameter statistics from linked
 * numismatic records (e.g. coins). It traverses a source portal to its target
 * records, filters out unused or duplicated entries, and calculates per-archive
 * averages, maxima, minima, and element counts.
 *
 * Key features:
 * - Reads linked record locators from a source portal (IPO input)
 * - Filters by "used" and "duplicated" portal flags (skips when section_id === '2')
 * - Averages weight and diameter values across all linked records
 * - Computes media, max, min, and total element count for both metrics
 * - Returns keyed values driven by the IPO output map consumed by render_get_archive_weights.js
 * - Values are reactive: the client subscribes to `update_widget_value_*` events for live refresh
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class get_archive_weights extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into aggregated weight and diameter
	* statistics from linked numismatic records.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": [
	*     { "type": "source",       "section_tipo": "current", "component_tipo": "numis1" },
	*     { "type": "used",         "section_tipo": "current", "component_tipo": "numis2" },
	*     { "type": "duplicated",   "section_tipo": "current", "component_tipo": "numis3" },
	*     { "type": "data_weights", "section_tipo": "current", "component_tipo": "numis4" },
	*     { "type": "data_diamenter","section_tipo": "current", "component_tipo": "numis5" }
	*   ],
	*   "output": [
	*     { "id": "media_weight" },
	*     { "id": "max_weight" },
	*     { "id": "min_weight" },
	*     { "id": "total_elements_weights" },
	*     { "id": "media_diameter" },
	*     { "id": "max_diameter" },
	*     { "id": "min_diameter" },
	*     { "id": "total_elements_diameter" }
	*   ]
	* }
	*
	* Sample returned data items:
	* {
	*   "widget": "get_archive_weights",
	*   "key": 0,
	*   "widget_id": "media_weight",
	*   "value": 12.45
	* }
	* {
	*   "widget": "get_archive_weights",
	*   "key": 0,
	*   "widget_id": "total_elements_weights",
	*   "value": 24
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'get_archive_weights',
	*       'path'          => 'numisdata/get_archive_weights',
	*       'section_tipo'  => 'numis1',
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
			#get the value of the component using portal data
				foreach ($component_data as $current_locator) {

					$section_id 	= $current_locator->section_id;
					$section_tipo 	= $current_locator->section_tipo;

					$used_model_name	= ontology_node::get_model_by_tipo($component_tipo_used,true); // Expected portal
					$used 				= component_common::get_instance(
						$used_model_name,
						$component_tipo_used,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$used_data = $used->get_data();

					if (empty($used_data) || $used_data[0]->section_id==='2') continue;


					$duplicated_modelo_name	= ontology_node::get_model_by_tipo($component_tipo_duplicated,true); // Expected portal
					$duplicated				= component_common::get_instance(
						$duplicated_modelo_name,
						$component_tipo_duplicated,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$duplicated_data = $duplicated->get_data();

					if (!empty($duplicated_data) && $duplicated_data[0]->section_id==='2') continue;


					//weights
					$data_weights_model_name	= ontology_node::get_model_by_tipo($component_tipo_data_weights,true); // Expected portal
					$data_weights				= component_common::get_instance(
						$data_weights_model_name,
						$component_tipo_data_weights,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$data_weights_data 	= $data_weights->get_data();

					if(!empty($data_weights_data)){
						$weights[] = array_sum(array_map(function($item) { return $item->value ?? 0; }, $data_weights_data)) / count($data_weights_data);
					}

					//diameter
					$data_diameter_model_name	= ontology_node::get_model_by_tipo($component_tipo_data_diameter,true); // Expected portal
					$data_diameter				= component_common::get_instance(
						$data_diameter_model_name,
						$component_tipo_data_diameter,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$data_diameter_data = $data_diameter->get_data();

					if(!empty($data_diameter_data)){
						$diameter[] = array_sum(array_map(function($item) { return $item->value ?? 0; }, $data_diameter_data)) / count($data_diameter_data);
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
						$current_data->widget 		= get_class($this);
						$current_data->key  		= $key;
						$current_data->widget_id	= $current_id;
						$current_data->value 		= $$current_id ?? null;
					$data[] = $current_data;
				}

			// $data = new stdClass();
			// 	$data->media_weight 			= $media_weight 			?? null;
			// 	$data->max_weight 				= $max_weight 				?? null;
			// 	$data->min_weight 				= $min_weight 				?? null;
			// 	$data->total_elements_weights 	= $total_elements_weights 	?? null;
			// 	$data->media_diameter 			= $media_diameter 			?? null;
			// 	$data->max_diameter 			= $max_diameter 			?? null;
			// 	$data->min_diameter 			= $min_diameter 			?? null;
			// 	$data->total_elements_diameter 	= $total_elements_diameter 	?? null;
		}//foreach ipo

		return $data;
	}//end get_data



}//end get_archive_weights
