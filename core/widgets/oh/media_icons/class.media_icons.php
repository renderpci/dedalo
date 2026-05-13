<?php declare(strict_types=1);
/**
 * CLASS MEDIA_ICONS
 *
 * Widget that renders a row of action icons for each media record linked to
 * the current section (typically Oral History interviews). Each linked
 * audiovisual file gets its own row with:
 *  - ID (opens the media record in a new window)
 *  - A/V icon (opens the media viewer)
 *  - Transcription tool link (TR)
 *  - Indexation tool link (IN)
 *  - Translation tool link (TL)
 *  - Time code / duration (tc)
 *
 * Key features:
 * - Reads linked-media locators from a source component (IPO input)
 * - Resolves each locator into its target section (IPO paths)
 * - Builds per-row tool contexts from ontology section_tool definitions
 * - Falls back to real file duration calculation when DB has no cached value
 * - Outputs data consumed by render_media_icons.js for DOM rendering
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class media_icons extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into the structured data expected
	* by the client-side renderer.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": {
	*     "type": "component_data",
	*     "source": [
	*       {
	*         "section_tipo": "current",
	*         "section_id": "current",
	*         "component_tipo": "oh25"
	*       }
	*     ],
	*     "paths": [
	*       [
	*         {
	*           "var_name": "av",
	*           "section_tipo": "rsc167",
	*           "component_tipo": "rsc35"
	*         }
	*       ]
	*     ]
	*   },
	*   "output": [
	*     { "id": "id" },
	*     { "id": "tc" },
	*     {
	*       "id": "transcription",
	*       "label": "tool_transcription",
	*       "process_section_tipo": "rsc190"
	*     },
	*     {
	*       "id": "indexation",
	*       "label": "tool_indexation",
	*       "process_section_tipo": "rsc191"
	*     },
	*     {
	*       "id": "translation",
	*       "label": "tool_translation",
	*       "process_section_tipo": "rsc192"
	*     }
	*   ]
	* }
	*
	* Sample returned data item per locator:
	* {
	*   "widget": "media_icons",
	*   "id": {
	*     "widget": "media_icons",
	*     "key": 0,
	*     "widget_id": "id",
	*     "locator": { "type":"dd151", "section_id":"13", "section_tipo":"rsc167", "from_component_tipo":"oh25" },
	*     "value": "13"
	*   },
	*   "tc": {
	*     "widget": "media_icons",
	*     "key": 0,
	*     "widget_id": "tc",
	*     "locator": { ... },
	*     "value": "00:05:23"
	*   },
	*   "transcription": {
	*     "widget": "media_icons",
	*     "key": 0,
	*     "widget_id": "transcription",
	*     "locator": { ... },
	*     "tool_context": { ... }
	*   },
	*   "indexation": { ... },
	*   "translation": { ... }
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'media_icons',
	*       'path'          => 'oh/media_icons',
	*       'section_tipo'  => 'oh1',
	*       'section_id'    => '123',
	*       'mode'          => 'edit',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null $data
	*/
	public function get_data() : ?array {

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$ipo			= $this->ipo;

		$data = [];

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

						$source_model_name	= ontology_node::get_model_by_tipo($source_component_tipo,true);
						$source_component	= component_common::get_instance(
							$source_model_name,
							$source_component_tipo,
							$source_section_id,
							'list',
							DEDALO_DATA_LANG,
							$source_section_tipo
						);
						$source_data = $source_component->get_data();
						// add all locators from the source component data
						// each locator represents a separate record (e.g. audiovisual) that needs its own icon row
						foreach ($source_data as $locator) {
							if($locator){
								$ar_locator[] = $locator;
							}
						}
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

					$model_name	= ontology_node::get_model_by_tipo($component_tipo,true);
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
										$duration_model_name	= ontology_node::get_model_by_tipo($duration_tipo,true);
										$duration_component		= component_common::get_instance(
											$duration_model_name,
											$duration_tipo,
											$locator->section_id,
											'list',
											DEDALO_DATA_NOLAN,
											$locator->section_tipo
										);
										$duration_data = $duration_component->get_data();
										if (isset($duration_data[0]->value)) {

											// use already stored value from DDBB
											$tc	= $duration_data[0]->value;

										}else{

											// fallback to real calculation from av file
											$duration_seconds	= $component->get_duration();
											$tc					= OptimizeTC::seg2tc($duration_seconds);
											if ($this->mode!=='tm') {
												$duration_component->set_data(
													[(object)[
														'value' => $tc
													]]
												);
												$duration_component->save();
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
									$section_tool		= ontology_node::get_instance($section_tool_tipo);
									// and get the tool_name, it need to be the same that the tool_name in the section_tool (see ontology)
									$tool_name			= $data_map->label ?? false;
									// get the config for this tool, and get the ddo_map
									$properties			= $section_tool->get_properties();
									$tool_config		= $properties->tool_config->{$tool_name} ?? false;

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
												if (is_object($tool_config) && isset($tool_config->ddo_map)) {
													$ar_tool_ddo_map = $tool_config->ddo_map;
													for ($i=0; $i < sizeof($ar_tool_ddo_map); $i++) {
														$current_ddo = $ar_tool_ddo_map[$i];
														if($current_ddo->section_id==='self'){
															$current_ddo->section_id = $locator->section_id;
														}
													}
												}
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
								$current_data->widget_id	= $current_id;
								$current_data->locator		= $locator;
								if (isset($value)) {
									$current_data->value	= $value;
								}
								if (isset($tool_context)) {
									$current_data->tool_context	= $tool_context;
								}

							$object_value->{$current_id} = $current_data;
							$object_value->widget = get_class($this);
							// $data[] = $current_data;
					}//end foreach ($output as $data_map)

					// set the final data to the widget
					$data[] = $object_value;
				}
			}//end foreach ($ar_paths as $path)
		}//foreach $ipo


		return $data;
	}//end get_data



}//end media_icons
