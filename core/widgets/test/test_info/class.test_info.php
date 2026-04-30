<?php declare(strict_types=1);
/**
* CLASS TEST_INFO
* Simple test widget for component_info
* Provides minimal data to allow testing component_info with test sections
*
* @package Dedalo
* @subpackage Widgets
*/
class test_info extends widget_common {



	/**
	* GET_DATA
	* Returns simple test data for component_info widget testing
	* @return array|null $data
	*/
	public function get_data() : ?array {

		$ipo = $this->ipo;

		$data = [];

		foreach ($ipo as $key => $current_ipo) {

			$input	= $current_ipo->input;
			$output	= $current_ipo->output;

			// resolve source data if available
			$source_value = null;
			if (isset($input->source)) {
				foreach ($input->source as $current_source) {
					$source_section_tipo = (!isset($current_source->section_tipo) || $current_source->section_tipo==='current')
						? $this->section_tipo
						: $current_source->section_tipo;

					$source_section_id = (!isset($current_source->section_id) || $current_source->section_id==='current')
						? $this->section_id
						: $current_source->section_id;

					$source_component_tipo = $current_source->component_tipo ?? null;

					if ($source_component_tipo) {
						$source_model_name	= ontology_node::get_model_by_tipo($source_component_tipo, true);
						$source_component	= component_common::get_instance(
							$source_model_name,
							$source_component_tipo,
							$source_section_id,
							'list',
							DEDALO_DATA_LANG,
							$source_section_tipo
						);
						$source_data = $source_component->get_data();
						if (!empty($source_data)) {
							$source_value = $source_data[0]->value ?? null;
						}
					}
				}
			}

			// build output data items
			foreach ($output as $data_map) {

				$current_data = new stdClass();
					$current_data->widget		= get_class($this);
					$current_data->key			= $key;
					$current_data->widget_id	= $data_map->id;
					$current_data->id			= $data_map->id;
					$current_data->value		= $source_value ?? 'test_info widget value for section ' . $this->section_tipo . ' - ' . $this->section_id;

				$data[] = $current_data;
			}
		}//end foreach $ipo


		return $data;
	}//end get_data



}//end test_info
