<?php
/*
* CLASS MEDIA_ICONS
*
*
*/
class media_icons extends widget_common {



	/**
	* GET_DATO
	* @return array $dato
	*/
	public function get_dato() : array {

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$ipo			= $this->ipo;

		$dato = [];

		// every state has a IPO that come from structure (input, process , output).
		foreach ($ipo as $key => $current_ipo) {

			$input		= $current_ipo->input;
			$output		= $current_ipo->output;
			// get the paths to the source data
			$source		= $input->source;
			$ar_paths	= $input->paths;

			// check the type for input,
			// if it's a filter will use search_query_object to find data
			$type 		= $input->type;
			switch($type) {

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

						$source_model_name	= RecordObj_dd::get_model_name_by_tipo($source_component_tipo,true);
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
						$locator = reset($source_dato);

						$ar_locator = array_merge($ar_locator, $source_dato);
					}
					break;

				default:
					break;
			}//end switch($type)


			// ar_path iterate
			// sample ar_path:
			// [
			//     [
			//         {
			//             "var_name": "av",
			//             "section_tipo": "rsc167",
			//             "component_tipo": "rsc35"
			//         }
			//     ]
			// ]
			foreach ($ar_paths as $path) {

				// get the last path, this will be the component the call to the list (select / radio_button)
				$last_path = end($path);

				// get the section pointed by the last component_tipo
				$component_tipo = $last_path->component_tipo;

				// create items with the every locator
				foreach ($ar_locator as $locator) {

					$model_name	= RecordObj_dd::get_model_name_by_tipo($component_tipo,true);
					$component	= component_common::get_instance(
						$model_name,
						$component_tipo,
						$locator->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$locator->section_tipo
					);

					$object_value = new stdClass();

					// output, use the IPO output for create the items to send to compoment_info and client side
					foreach ($output as $data_map) {

						// begin with empty tool_context
							$tool_context = null;

						// value
							switch ($data_map->id) {

								case 'id':
									$value = $locator->section_id;
									break;

								case 'tc':
									// component that store duration (rsc54). Updated on file upload post-processing
										$duration_tipo			= 'rsc54';
										$duration_model_name	= RecordObj_dd::get_model_name_by_tipo($duration_tipo,true);
										$duration_component		= component_common::get_instance(
											$duration_model_name,
											$duration_tipo,
											$locator->section_id,
											'list',
											DEDALO_DATA_NOLAN,
											$locator->section_tipo
										);
										$duration_dato = $duration_component->get_dato();
										if (isset($duration_dato[0])) {

											// use already stored value from DDBB
											$tc	= $duration_dato[0];

										}else{

											// fallback to real calculation from av file
											$duration_seconds	= $component->get_duration();
											$tc					= OptimizeTC::seg2tc($duration_seconds);
											if ($this->mode!=='tm') {
												$duration_component->set_dato([$tc]);
												$duration_component->Save();
												debug_log(__METHOD__ . PHP_EOL
													. ' Falling back to real file duration calculation and save it ' . PHP_EOL
													. ' section_tipo: ' . $locator->section_tipo . PHP_EOL
													. ' section_id: ' . $locator->section_id . PHP_EOL
													. ' tc: ' . to_string($tc)
													, logger::WARNING
												);
											}
										}

									$value = $tc;
									break;

								case 'transcription':
								case 'indexation':
								case 'translation':
								default:
									$value = null;
									//get the section_tool of the $data_map
									$section_tool_tipo	= $data_map->process_section_tipo;
									$section_tool		= new RecordObj_dd($section_tool_tipo);
									// and get the tool_name, it need to be the same that the tool_name in the section_tool (see ontology)
									$tool_name			= $data_map->label ?? false;
									// get the config for this tool, and get the ddo_map
									$properties			= $section_tool->get_properties();
									$tool_config		= $properties->tool_config->{$tool_name} ?? false;
									$ar_tool_ddo_map	= $tool_config->ddo_map;

									// add the section_id to the ddo_map, only when the section_id is for components in audiovisual section. (ts doesn't has section_id)
									for ($i=0; $i < sizeof($ar_tool_ddo_map); $i++) {
										$current_ddo = $ar_tool_ddo_map[$i];
										if($current_ddo->section_id==='self'){
											$current_ddo->section_id = $locator->section_id;
										}
									}
									// build the tool_context
										if ($tool_name) {
											$user_tools = tool_common::get_user_tools( logged_user_id() );
											$tool_info = array_find($user_tools, function($el) use($tool_name) {
												return $el->name===$tool_name;
											});
											if (empty($tool_info)) {
												debug_log(__METHOD__
													." ERROR. No tool found for tool '$tool_name' in media_icons widget "
													, logger::ERROR
												);
											}else{
												$tool_context = tool_common::create_tool_simple_context($tool_info, $tool_config);
											}
										}
									break;
							}//end switch ($data_map->id)

						// get the current row id and the items into the $result
							$current_id = $data_map->id;

							$current_data = new stdClass();
								$current_data->widget		= get_class($this);
								$current_data->key			= $key; // ipo key
								$current_data->id			= $current_id;
								$current_data->locator		= $locator;
								if (isset($value)) {
									$current_data->value	= $value;
								}
								if (isset($tool_context)) {
									$current_data->tool_context	= $tool_context;
								}

							$object_value->{$current_id} = $current_data;
							$object_value->widget = get_class($this);
							// $dato[] = $current_data;
					}//end foreach ($output as $data_map)

					// set the final data to the widget
					$dato[] = $object_value;
				}
			}//end foreach ($ar_paths as $path)
		}//foreach $ipo


		return $dato;
	}//end get_dato



}//end media_icons
