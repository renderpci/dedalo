<?php declare(strict_types=1);
/**
* CLASS TEST_INFO
* Minimal stub widget used exclusively for testing component_info with test sections.
*
* Responsibilities:
* - Provides a concrete, zero-dependency implementation of the widget_common contract
*   so that component_info can be exercised end-to-end without a real domain widget.
* - Iterates the standard IPO (Input-Process-Output) array inherited from widget_common,
*   optionally resolving a real component value from an 'input->source' block, and emits
*   one data item per declared output map entry.
* - When no source component is found (or the source block is absent), falls back to a
*   deterministic placeholder string that encodes the section_tipo and section_id so
*   test assertions can verify routing without checking real stored data.
*
* IPO shape expected by this widget (set via ontology widget properties):
* [
*   {
*     "input": {                              // optional
*       "source": [
*         {
*           "section_tipo":   "current",     // "current" | explicit tipo string
*           "section_id":     "current",     // "current" | explicit id
*           "component_tipo": "test139"      // component whose get_data() to read
*         }
*       ]
*     },
*     "output": [
*       { "id": "info_label" }              // one item emitted per output entry
*     ]
*   }
* ]
*
* Data item shape emitted by get_data():
* {
*   "widget":    "test_info",               // PHP class name via get_class($this)
*   "key":       0,                         // IPO array index
*   "widget_id": "info_label",             // mirrors output[n].id (redundant with id)
*   "id":        "info_label",             // stable output identifier used by get_grid_value()
*   "value":     <string|mixed>            // resolved component value, or fallback placeholder
* }
*
* Note: widget_id and id carry the same value ($data_map->id). The duplication mirrors
* the convention used by the state and dmm widgets so that client consumers can address
* either property uniformly.
*
* Extends widget_common, which supplies the get_instance() factory, the __construct()
* that unpacks section_tipo/section_id/mode/lang/ipo, and the default get_data_parsed()
* pass-through.
*
* @package Dédalo
* @subpackage Widgets
*/
class test_info extends widget_common {



	/**
	* GET_DATA
	* Resolve the IPO configuration into an array of test data items.
	*
	* For each entry in $this->ipo the method:
	*  1. Optionally reads a component value from the 'source' block in $current_ipo->input.
	*     Each source entry may override section_tipo and section_id with 'current'
	*     (meaning: use this widget's own context) or supply explicit tipo/id strings.
	*     The first non-empty value found across all source entries wins; later entries are
	*     not consulted once $source_value is set.
	*  2. Iterates $current_ipo->output and emits one stdClass data item per map entry.
	*     The item always carries widget, key, widget_id, id, and value fields.
	*  3. Falls back to a placeholder string when no source component produced a value;
	*     the placeholder encodes section_tipo and section_id for easy tracing in test logs.
	*
	* Source resolution detail:
	*   - ontology_node::get_model_by_tipo() looks up the PHP class name from the ontology.
	*     The second argument (true) requests a cache-warm lookup.
	*   - component_common::get_instance() is called in 'list' mode with DEDALO_DATA_LANG
	*     to mirror how component_info invokes production widgets.
	*   - Only $source_data[0]->value is read; multi-value components expose only their
	*     first stored scalar here, which is sufficient for test assertions.
	*
	* @return array|null $data Array of data items (one per output map entry per IPO entry),
	*                          or an empty array when $this->ipo is null or empty.
	*/
	public function get_data() : ?array {

		$ipo = $this->ipo ?? [];

		$data = [];

		foreach ($ipo as $key => $current_ipo) {

			$input	= $current_ipo->input;
			$output	= $current_ipo->output;

			// resolve source data if available
			// Walk all source descriptors and stop at the first one that returns data.
			// $source_value remains null if no source block is configured or all sources
			// produce empty results; the output loop uses the fallback string in that case.
			$source_value = null;
			if (isset($input->source)) {
				foreach ($input->source as $current_source) {
					// section_tipo / section_id: "current" means use this widget's context.
					$source_section_tipo = (!isset($current_source->section_tipo) || $current_source->section_tipo==='current')
						? $this->section_tipo
						: $current_source->section_tipo;

					$source_section_id = (!isset($current_source->section_id) || $current_source->section_id==='current')
						? $this->section_id
						: $current_source->section_id;

					$source_component_tipo = $current_source->component_tipo ?? null;

					if ($source_component_tipo) {
						// Instantiate the source component in list mode so get_data() returns
						// the stored value without triggering an edit-mode permission check.
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
							// Only the first element's value is used; this is intentional for
							// single-value test components (e.g. component_input_text).
							$source_value = $source_data[0]->value ?? null;
						}
					}
				}
			}

			// build output data items
			// One stdClass item is emitted per output map entry regardless of whether
			// a source value was resolved. The 'id' field on each output entry acts as
			// the stable identifier consumed by component_info::get_grid_value() and
			// component_info::get_export_value() to match columns to values.
			foreach ($output as $data_map) {

				$current_data = new stdClass();
					$current_data->widget		= get_class($this);
					$current_data->key			= $key;
					$current_data->widget_id	= $data_map->id;
					$current_data->id			= $data_map->id;
					// Fallback placeholder encodes section context so test assertions can
					// verify the correct section_tipo/section_id routing at a glance.
					$current_data->value		= $source_value ?? 'test_info widget value for section ' . $this->section_tipo . ' - ' . $this->section_id;

				$data[] = $current_data;
			}
		}//end foreach $ipo


		return $data;
	}//end get_data



}//end test_info
