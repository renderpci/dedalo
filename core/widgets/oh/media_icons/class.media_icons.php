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

		// IPO iteration
		// Each IPO entry (keyed by $key) defines one logical data band: its own
		// input sources, path traversal, and output column list. In practice most
		// ontology definitions carry exactly one IPO entry, but the loop supports
		// multiple independent bands (e.g. primary media + supplementary clips).
		foreach ($ipo as $key => $current_ipo) {

			$input		= $current_ipo->input;
			$output		= $current_ipo->output;
			// get the paths to the source data
			// $source defines which components to read locators FROM (e.g. oh25 on the current interview).
			// $ar_paths defines the traversal FROM those locators INTO the target section (e.g. rsc167/rsc35).
			$source		= $input->source;
			$ar_paths	= $input->paths;

			// check the type for input,
			// if it's a filter will use search_query_object to find data
			// Currently only 'component_data' is implemented; 'filter' (SQO-driven) is planned.
			$type 		= $input->type;
			switch($type) {

				case 'component_data':
					// locator collection
					// Iterate every source descriptor and gather all locator objects stored in
					// the named component (typically a component_relation_* such as oh25).
					// Multiple source descriptors merge into a single flat $ar_locator list.
					$ar_locator = [];
					foreach ($source as $current_source) {

						// resolve 'current' sentinels to the actual widget context values
						$source_section_tipo = (!isset($current_source->section_tipo) || $current_source->section_tipo==='current')
							? $section_tipo
							: $current_source->section_tipo;

						$source_section_id = (!isset($current_source->section_id) || $current_source->section_id==='current')
							? $section_id
							: $current_source->section_id;

						$source_component_tipo = $current_source->component_tipo;

						// (!) get_model_by_tipo resolves the PHP class name from the ontology
						// cache; the second parameter (true) forces a cache-first lookup.
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


			// ar_path iteration
			// Each $path is an ordered array of traversal hops from the locator's section
			// to the final target component. Only the LAST hop matters here: its
			// component_tipo identifies which component to instantiate on the linked
			// section (e.g. rsc35 — the AV file component on the rsc167 media record).
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
				// For a single-hop path this is the only element; multi-hop paths are not
				// traversed — the widget assumes direct links, not chained relations.
				$last_path = end($path);

				// get the section pointed by the last component_tipo
				$component_tipo = $last_path->component_tipo;

				// per-locator row construction
				// Each locator from $ar_locator corresponds to one linked audiovisual record.
				// This loop instantiates the target component (e.g. the AV file component on
				// the media record) so that helper methods such as get_duration() are available
				// when the cached timecode value is missing.
				foreach ($ar_locator as $locator) {

					// DEDALO_DATA_NOLAN: use the language-neutral (non-language) slot because
					// the AV component stores binary metadata, not translatable text.
					$model_name	= ontology_node::get_model_by_tipo($component_tipo,true);
					$component	= component_common::get_instance(
						$model_name,
						$component_tipo,
						$locator->section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$locator->section_tipo
					);

					// $object_value accumulates all column sub-objects for one media row.
					// It is reset for every locator so columns from one row do not bleed
					// into the next.
					$object_value = new stdClass();

					// output column construction
				// Walk every output descriptor from the IPO and produce one sub-object per column.
				// The resulting sub-objects are merged into $object_value keyed by column id
				// and are consumed by render_media_icons.js → get_value_element().
					foreach ($output as $data_map) {

						// reset per-output-column state; only tool columns populate tool_context
							$tool_context = null;

						// value resolution: branch on the column's semantic id
							switch ($data_map->id) {

								case 'id':
									// Simple pass-through: the section_id of the linked media record
									// is surfaced as the visible row identifier / link target.
									$value = $locator->section_id;
									break;

								case 'tc':
									// timecode (duration) resolution — two-tier strategy
									// rsc54 is the component that stores the pre-computed HH:MM:SS
									// duration string. It is normally populated by the post-upload
									// processing pipeline in component_av::post_save_files().
									// (!) 'rsc54' is hardcoded here; if the media ontology changes
									// this tipo the widget must be updated accordingly.
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

											// fast path: the timecode is already cached in the DB
											$tc	= $duration_data[0]->value;

										}else{

											// slow path: probe the actual media file via the AV
											// component's get_duration() method (reads file metadata)
											// and persist the result so subsequent calls take the fast path.
											// Saving is skipped in 'tm' (time-machine) mode to avoid
											// writing back-dated data into the versioned record.
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
									// tool-link columns (transcription / indexation / translation)
									// These columns carry no display value of their own; instead they
									// supply a tool_context object that the JS renderer uses to launch
									// the appropriate Dédalo tool when the user clicks the icon.

									$value = null;

									// resolve the section_tool node configured in the ontology
									// for this column (e.g. rsc190 → tool_transcription section).
									// The section_tool node's properties hold a tool_config object
									// that contains the ddo_map specifying which components the
									// tool should load for the given media record.
									$section_tool_tipo	= $data_map->process_section_tipo;
									$section_tool		= ontology_node::get_instance($section_tool_tipo);
									// and get the tool_name, it need to be the same that the tool_name in the section_tool (see ontology)
									$tool_name			= $data_map->label ?? false;
									// get the config for this tool, and get the ddo_map
									$properties			= $section_tool->get_properties();
									$tool_config		= $properties->tool_config->{$tool_name} ?? false;

									// build the tool_context
									// tool_context is a dd_object built by tool_common::create_tool_simple_context()
									// containing name, label, CSS URL, icon, and the resolved ddo_map.
									// The ddo_map 'self' sentinel in section_id is expanded here to the
									// actual section_id of the linked media record so the tool opens
									// the correct record directly rather than requiring the user to navigate.
										if ($tool_name) {
											// get_user_tools returns only tools the current user has access to;
											// if this tool is not in the list the icon will be absent/disabled.
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
												// expand ddo_map 'self' sentinels to the concrete section_id
												// of the current media locator before building the context.
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

						// assemble column sub-object
						// Each column becomes a named property on $object_value.
						// The 'widget' and 'key' fields let the client identify the
						// originating widget and IPO band without extra context.
						// 'value' is omitted for tool columns; 'tool_context' is omitted
						// for value columns — isset() guards handle both cases cleanly.
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

					// append completed row object (one per locator / media record)
					// $object_value holds all column sub-objects keyed by column id (id, tc,
					// transcription, indexation, translation) plus the top-level 'widget' label.
					$data[] = $object_value;
				}
			}//end foreach ($ar_paths as $path)
		}//foreach $ipo


		return $data;
	}//end get_data



}//end media_icons
