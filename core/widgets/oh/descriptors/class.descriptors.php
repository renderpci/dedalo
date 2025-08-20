<?php
// declare(strict_types=1);
/**
* CLASS DESCRIPTORS
*
*
*/
class descriptors extends widget_common {



	/**
	* GET_DATO
	* @return array $dato
	*/
	public function get_dato() : array {
		$start_time=start_time();

		$dato = [];

		// short vars
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;
			$mode			= $this->mode;
			$ipo			= $this->ipo;

		// list mode does not compute result for speed
			if($mode==='list') {
				return $dato;
			}

		// every state has a ipo that come from structure (input, process , output).
		foreach ($ipo as $key => $current_ipo) {

			// short vars
				$input		= $current_ipo->input;
				$output		= $current_ipo->output;
				// get the paths to the source data
				$source		= $input->source;
				$ar_paths	= $input->paths;

			// check the type for input, if it's a filter will use search_query_object to find data
				$type		= $input->type;
				$ar_locator	= [];
				switch($type) {

					case 'component_data':
						foreach ($source as $current_source) {

							$source_section_tipo = (!isset($current_source->section_tipo) || $current_source->section_tipo==='current')
								? $section_tipo
								: $current_source->section_tipo;

							$source_section_id = (!isset($current_source->section_id) || $current_source->section_id==='current')
								? $section_id
								: $current_source->section_id;

							$source_component_tipo = $current_source->component_tipo;

							$source_model_name	= ontology_node::get_model_name_by_tipo($source_component_tipo,true);
							$source_component	= component_common::get_instance(
								$source_model_name,
								$source_component_tipo,
								$source_section_id,
								'list',
								DEDALO_DATA_LANG,
								$source_section_tipo
							);
							$source_dato = $source_component->get_dato();

							// locator will use to get the label of the components that has the information, only 1 locator is necessary
							// $locator = reset($source_dato);

							if (!empty($source_dato)) {
								// add
								$ar_locator = array_merge($ar_locator, $source_dato);
							}
						}
						break;

					default:
						break;
				}//end switch($type)

			// paths
				foreach ($ar_paths as $path) {

					// get the last path, this will be the component the call to the list (select / radio_button)
					$last_path = end($path);

					// get the section pointed by the last component_tipo
					$component_tipo = $last_path->component_tipo;

					// create items with the every locator
					$ar_component_dato			= [];
					$ar_component_grid_value	= [];
					foreach ($ar_locator as $locator) {

						$model_name	= ontology_node::get_model_name_by_tipo($component_tipo,true);
						$component	= component_common::get_instance(
							$model_name,
							$component_tipo,
							$locator->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$locator->section_tipo
						);
						$component_dato			= $component->get_dato();
						$component_grid_value	= $component->get_grid_value();

						$ar_component_dato			= array_merge($ar_component_dato, $component_dato);
						$ar_component_grid_value	= array_merge($ar_component_grid_value, $component_grid_value->value);
					}

					// prevent empty locators value continue execution generating errors
						if (!isset($component_grid_value)) {
							continue;
						}

					// set value. Using last created component
						$component_grid_value->value = $ar_component_grid_value;

					// output, use the IPO output for create the items to send to compoment_info and client side
					foreach ($output as $data_map) {

						switch ($data_map->id) {

							case 'indexation':
								$value = sizeof($ar_component_dato);
								break;

							case 'terms':
							default:
								$value = $component_grid_value;
						}

						// get the current row id and the items into the $result
							$current_id = $data_map->id;

						$current_data = new stdClass();
							$current_data->widget	= get_class($this);
							$current_data->key		= $key;
							$current_data->id		= $current_id;
							$current_data->value	= $value;
							$current_data->locator	= $locator;

						// set the final data to the widget
						$dato[] = $current_data;
					}//end foreach ($output as $data_map)
				}//end foreach ($ar_paths as $path)
		}//foreach $ipo

		// debug
			if(SHOW_DEVELOPER===true) {
				debug_log(__METHOD__
					." Total time get_dato widget descriptors: ".exec_time_unit($start_time,'ms').' ms'
					, logger::DEBUG
				);
			}


		return $dato;
	}//end get_dato



}//end descriptors
