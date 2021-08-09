<?php
/*
* CLASS MEDIA_ICONS
*
*
*/
class media_icons extends widget_common {

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


					// output, use the ipo output for create the items to send to compoment_info and client side
					foreach ($output as $data_map) {

						// begin with empty tool_context
							$tool_context = null;

						switch ($data_map->id) {
							case 'id':
								$value = $locator->section_id;
								break;
							case 'tc':
								$value = $component->get_duration_seconds('timecode');
								break;

							case 'transcription':
							case 'indexation':
							case 'translation':
							default:
								$value = null;
								//get the section_tool of the $data_map
								$section_tool_tipo = $data_map->process_section_tipo;
								$section_tool = new RecordObj_dd($section_tool_tipo);
								// and get the tool_name, it need to be the same that the tool_name in the section_tool (see ontology)
								$tool_name = $data_map->label ?? false;
								// get the config for this tool, and get the ddo_map
								$properties = $section_tool->get_properties();
								$tool_config = $properties->tool_config->{$tool_name} ?? false;
								$ar_tool_ddo_map = $tool_config->ddo_map;

								// add the section_id to the ddo_map, only when the section_id is for components in audiovisual section. (ts doesn't has section_id)
								for ($i=0; $i < sizeof($ar_tool_ddo_map) ; $i++) {
									$current_ddo = $ar_tool_ddo_map[$i];
									if($current_ddo->section_id = 'self'){
										$current_ddo->section_id = $locator->section_id;
									}
								}
								// build the tool_context
									if ($tool_name) {
										$ar_tool_object	= common::get_client_registered_tools([$tool_name]);
										if (empty($ar_tool_object)) {
											debug_log(__METHOD__." ERROR. No tool found for tool '$tool_name' in media_icons widget ", logger::ERROR);
										}else{
											$tool_context	= common::create_tool_context($ar_tool_object[0], $tool_config);
										}
									}

								break;
						}

						// get the current row id and the items into the $result
						$current_id = $data_map->id;

							$current_data = new stdClass();
								$current_data->widget		= get_class($this);
								$current_data->key			= $key;
								$current_data->id			= $data_map->id;
								if (isset($value)) {
									$current_data->value		= $value;
								}
								$current_data->locator		= $locator;
								if (isset($tool_context)) {
									$current_data->tool_context	= $tool_context;
								}

							// set the final data to the widget
							$dato[] = $current_data;
					}

				}
			}//end foreach ($ar_paths as $path)
		}//foreach $ipo

		return $dato;
	}//end get_dato
}//end media_icons
