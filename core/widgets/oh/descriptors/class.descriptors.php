<?php declare(strict_types=1);
/**
 * CLASS DESCRIPTORS
 * Oral History widget that aggregates and displays thesaurus descriptor terms
 * linked to a given record through a configurable IPO data path.
 *
 * Responsibilities:
 * - Reads locator objects (section_tipo + section_id pairs) produced by a
 *   source component (e.g. component_relation oh24) via the IPO 'input' block.
 * - Follows each 'paths' entry to a target component (e.g. rsc36 inside rsc170)
 *   and collects its component_data (raw) and component_grid_value (display) for
 *   every locator returned by the source.
 * - Emits two typed data items per IPO entry per path:
 *     'indexation' — integer count of matched descriptor records
 *     'terms'      — merged component_grid_value object ready for dd_grid
 * - Short-circuits immediately for 'list' mode: the list renderer only shows a
 *   count badge and loads the full term grid on demand (see render_list_descriptors.js).
 *
 * Relationships:
 * - Extends widget_common (core/widgets/widget_common/class.widget_common.php).
 * - Instantiated by widget_common::get_instance() with path 'oh/descriptors'.
 * - Client-side counterpart: descriptors.js / render_edit_descriptors.js /
 *   render_list_descriptors.js — the latter two consume the 'indexation' and
 *   'terms' widget_id values produced here to build a dd_grid display node.
 * - Uses ontology_node::get_model_by_tipo() and component_common::get_instance()
 *   to resolve components dynamically from ontology tipos.
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class descriptors extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into the structured data items
	* expected by render_edit_descriptors.js and render_list_descriptors.js.
	*
	* Processing pipeline (one iteration per IPO entry):
	*  1. Read the 'source' block to identify which component holds the
	*     relation locators (e.g. a component_relation like oh24).
	*  2. Call get_data() on that source component to obtain an array of
	*     locator objects — each locator identifies one related record
	*     (section_tipo + section_id) in the thesaurus section.
	*  3. For every 'paths' entry, resolve the final path step's
	*     component_tipo against each locator to load the target component
	*     (e.g. rsc36 inside rsc170), then merge component_data (count) and
	*     component_grid_value (display terms) across all locators.
	*  4. Build one stdClass data item per output id ('indexation'/'terms')
	*     and append to the returned array.
	*
	* 'list' mode short-circuit:
	*  Returns an empty array immediately. The list renderer shows only a
	*  toggle button; full term data is requested on demand by the client.
	*
	* Currently supported input type: 'component_data'.
	* Other types are silently skipped via the switch default branch.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": {
	*     "type": "component_data",
	*     "source": [
	*       {
	*         "section_tipo": "current",
	*         "section_id": "current",
	*         "component_tipo": "oh24"
	*       }
	*     ],
	*     "paths": [
	*       [
	*         {
	*           "var_name": "descriptor",
	*           "section_tipo": "rsc170",
	*           "component_tipo": "rsc36"
	*         }
	*       ]
	*     ]
	*   },
	*   "output": [
	*     { "id": "indexation" },
	*     { "id": "terms" }
	*   ]
	* }
	*
	* Each data item in the returned array has this shape:
	* {
	*   "widget":    "descriptors",   // class name
	*   "key":       0,               // IPO entry index
	*   "widget_id": "indexation",    // output id: 'indexation' | 'terms'
	*   "value":     7,               // int for 'indexation'; grid object for 'terms'
	*   "locator":   { ... }          // last locator processed — used as metadata
	* }
	*
	* @return array|null $data - flat array of stdClass data items (may be empty)
	*/
	public function get_data() : ?array {
		$start_time=start_time();

		$data = [];

		// short vars
			$section_tipo	= $this->section_tipo;
			$section_id		= $this->section_id;
			$mode			= $this->mode;
			$ipo			= $this->ipo;

		// list mode short-circuit
		// The list renderer shows only a toggle button and loads data on demand;
		// building the full term grid server-side on every list row would be wasteful.
			if($mode==='list') {
				return $data;
			}

		// IPO loop — each entry defines one independent data source + output set.
		// The $key is forwarded to the client so it can match data items back to
		// the correct IPO slot in the widget's configuration.
		foreach ($ipo as $key => $current_ipo) {

			// short vars
				$input		= $current_ipo->input;
				$output		= $current_ipo->output;
				// get the paths to the source data
				$source		= $input->source;
				$ar_paths	= $input->paths;

			// Resolve the source into an array of locator objects.
			// 'component_data' reads a relation component (e.g. oh24) whose get_data()
			// returns the locators pointing at the thesaurus records.
			// Other input types (e.g. search-based filters) are not yet implemented here.
				$type		= $input->type;
				$ar_locator	= [];
				switch($type) {

					case 'component_data':
						foreach ($source as $current_source) {

							// Resolve 'current' placeholders to the widget's own section context.
							// This allows the IPO definition to be section-agnostic.
							$source_section_tipo = (!isset($current_source->section_tipo) || $current_source->section_tipo==='current')
								? $section_tipo
								: $current_source->section_tipo;

							$source_section_id = (!isset($current_source->section_id) || $current_source->section_id==='current')
								? $section_id
								: $current_source->section_id;

							$source_component_tipo = $current_source->component_tipo;

							// Load source component in 'list' mode — we only need its data
							// (the locator array), not a full edit-mode render.
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

							// locator will use to get the label of the components that has the information, only 1 locator is necessary
							// $locator = reset($source_data);

							if (!empty($source_data)) {
								// Merge locators from multiple source entries into a single flat array.
								$ar_locator = [...$ar_locator, ...$source_data];
							}
						}
						break;

					default:
						break;
				}//end switch($type)

			// paths — each path describes a navigation chain to a target component.
			// Only the last step of the path is used here; intermediate hops are
			// reserved for more complex multi-hop traversals not yet needed.
				foreach ($ar_paths as $path) {

					// get the last path, this will be the component the call to the list (select / radio_button)
					$last_path = end($path);

					// get the section pointed by the last component_tipo
					$component_tipo = $last_path->component_tipo;

					// Collect component_data and component_grid_value from every related record.
					// component_data is used for the count ('indexation').
					// component_grid_value carries the display rows for the term grid ('terms').
					$ar_component_data			= [];
					$ar_component_grid_value	= [];
					foreach ($ar_locator as $locator) {

						// Use DEDALO_DATA_NOLAN so term labels are returned language-neutral
						// (the dd_grid on the client applies its own language resolution).
						$model_name	= ontology_node::get_model_by_tipo($component_tipo,true);
						$component	= component_common::get_instance(
							$model_name,
							$component_tipo,
							$locator->section_id,
							'list',
							DEDALO_DATA_NOLAN,
							$locator->section_tipo
						);
						$component_data			= $component->get_data() ?? [];
						$component_grid_value	= $component->get_grid_value();

						$ar_component_data		 = [...$ar_component_data, ...$component_data];
						$ar_component_grid_value = [...$ar_component_grid_value, ...$component_grid_value->value];
					}

					// Guard: $component_grid_value is only set when $ar_locator is non-empty.
					// If the source component returned no locators, skip this path to avoid
					// referencing an undefined variable in the output block below.
						if (!isset($component_grid_value)) {
							continue;
						}

					// Overwrite the value array on the last component's grid-value object
					// with the merged collection built above, so the client receives a single
					// consolidated grid-value structure rather than the last record's data only.
						$component_grid_value->value = $ar_component_grid_value;

					// output, use the IPO output for create the items to send to component_info and client side
					foreach ($output as $data_map) {

						switch ($data_map->id) {

							case 'indexation':
								// Total number of descriptor records linked to this record.
								// sizeof($ar_component_data) counts raw data items, one per locator match.
								$value = sizeof($ar_component_data);
								break;

							case 'terms':
							default:
								// Merged grid-value object: the 'value' array contains one row
								// per descriptor term, ready for dd_grid rendering on the client.
								$value = $component_grid_value;
						}

						// get the current row id and the items into the $result
							$current_id = $data_map->id;

						// (!) $locator here is the last value from the foreach above.
						// It is forwarded as metadata for the client renderer but does not
						// represent all locators — it is just the final one iterated.
						$current_data = new stdClass();
							$current_data->widget		= get_class($this);
							$current_data->key			= $key;
							$current_data->widget_id	= $current_id;
							$current_data->value		= $value;
							$current_data->locator		= $locator;

						// set the final data to the widget
						$data[] = $current_data;
					}//end foreach ($output as $data_map)
				}//end foreach ($ar_paths as $path)
		}//end foreach $ipo

		// debug
			if(SHOW_DEVELOPER===true) {
				debug_log(__METHOD__
					." Total time get_data widget descriptors: ".exec_time_unit($start_time,'ms').' ms'
					, logger::DEBUG
				);
			}


		return $data;
	}//end get_data



}//end descriptors
