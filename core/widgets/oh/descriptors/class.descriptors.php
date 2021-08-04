<?php
/*
* CLASS DESCRIPTORS
*
*
*/
class descriptors extends widget_common {

	/**
	* get_dato
	* @return
	*/
	public function get_dato() {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		$dato = [];
		$project_langs = common::get_ar_all_langs();

		// every state has a ipo that come from structure (input, process , output).
		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;
			// get the paths to the source data
			$source 	= $input->source;
			$ar_paths 	= $input->paths;

			// check the type for input,
			// if it's a filter will use search_query_object to find data
			$type 		= $input->type;
			switch ($type) {
				case 'component_data':
					$ar_locator = [];
					foreach ($source as $current_source) {
						$source_section_tipo = (!isset($current_source->section_tipo) || $current_source->section_tipo==='current')
							? $section_tipo
							: $current_source->section_tipo;
						$source_section_id = (!isset($current_source->section_id) || $current_source->section_id==='current')
							? $section_id
							: $current_source->section_id;
						$source_component_tipo = $current_source->component_tipo;

						$source_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($source_component_tipo,true);
						$source_component 	= component_common::get_instance($source_modelo_name,
														   $source_component_tipo,
														   $source_section_id,
														   'list',
														   DEDALO_DATA_LANG,
														   $source_section_tipo);
						$source_dato = $source_component->get_dato();
						// locator will use to get the label of the components that has the information, only 1 locator is necessary
						$locator = reset($source_dato);

						$ar_locator = array_merge($ar_locator, $source_dato);
					}
					break;

				default:
					break;
			}


			foreach ($ar_paths as $path) {
				// get the last path, this will be the component the call to the list (select / radio_button)
				$last_path		= end($path);

				// get the section pointed by the last component_tipo
				$component_tipo = $last_path->component_tipo;

				// create items with the every locator
				foreach ($ar_locator as $locator) {

					$modelo_name	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					$component		= component_common::get_instance($modelo_name,
																	   $component_tipo,
																	   $locator->section_id,
																	   'list',
																	   DEDALO_DATA_NOLAN,
																	   $locator->section_tipo);


					$component_dato	= $component->get_dato();
					$component_value	= $component->get_value();

					// output, use the ipo output for create the items to send to compoment_info and client side
					foreach ($output as $data_map) {

						switch ($data_map->id) {
							case 'indexation':
								$value = sizeof($component_dato);
								break;

							case 'terms':
							default:
								$value = $component_value;
						}

						// get the current row id and the items into the $result
						$current_id = $data_map->id;

							$current_data = new stdClass();
								$current_data->widget		= get_class($this);
								$current_data->key			= $key;
								$current_data->id			= $data_map->id;
								$current_data->value		= $value;
								$current_data->locator		= $locator;

							// set the final data to the widget
							$dato[] = $current_data;
					}

				}
			}//end foreach ($ar_paths as $path)
		}//foreach $ipo

		return $dato;
	}//end get_dato
}//end descriptors
