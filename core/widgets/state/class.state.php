<?php declare(strict_types=1);
/**
 * CLASS STATE
 *
 * Widget that resolves and displays the completion state and situation of a record
 * by following IPO-driven ontology paths to the underlying status/situation components.
 * It computes per-column totals and a percentage-done metric across project languages.
 *
 * Responsibilities:
 * - Accepts input via IPO config as either direct locators ('locator' type) or dynamic
 *   component-data sources ('component_data' type, e.g. a portal that provides locators).
 * - Resolves multi-level ontology paths via `search::get_data_with_path()`, walking
 *   each path level to reach the leaf component that holds state/situation values.
 * - Distinguishes two controlled vocabularies:
 *     dd174  — "situation" section (user-editable; numeric value read from dd92)
 *     dd501  — "state" section (admin-controlled; numeric value read from dd83)
 * - Produces two item types per column per language:
 *     'detail' — one item per language per locator (value from the leaf component)
 *     'total'  — one aggregate per column (round(sum/n/items, 2)), language 'lg-nolan'
 * - Outputs are consumed by render_edit_state.js and render_list_state.js on the client.
 * - `get_data_list()` enumerates the available vocabulary entries for the UI dropdown.
 *
 * Extends:
 *   widget_common — provides section_tipo, section_id, mode, lang, ipo properties
 *                   and the get_instance() factory.
 *
 * No additional class-level properties are declared here; all state is inherited.
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class state extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into an array of detail and total state items.
	*
	* Each entry in `$this->ipo` (keyed by $key) describes one configured column group.
	* The method walks every path in `input->paths`, resolves the leaf component via
	* `search::get_data_with_path()`, reads numeric values from the appropriate sub-component
	* (dd92 for situation, dd83 for state), then appends both per-language 'detail' items and
	* one language-agnostic 'total' item per column to the returned array.
	*
	* Expected IPO shape (from ontology properties):
	* {
	*   "input": {
	*     "type": "component_data",          // or "locator"
	*     "source": [
	*       {
	*         "section_tipo": "current",     // "current" resolves to $this->section_tipo
	*         "section_id":   "current",     // "current" resolves to $this->section_id
	*         "component_tipo": "oh1"        // portal component that provides the locators
	*       }
	*     ],
	*     "paths": [
	*       [
	*         {
	*           "var_name":      "av",       // output column identifier
	*           "section_tipo":  "rsc167",   // section context for this path step
	*           "component_tipo":"rsc35"     // leaf component (select or radio_button)
	*         }
	*       ]
	*     ]
	*   },
	*   "output": [
	*     { "id": "state" },
	*     { "id": "situation" }
	*   ]
	* }
	*
	* Returned detail item shape:
	* {
	*   "widget":    "state",
	*   "key":       0,
	*   "widget_id": "state",                           // matches output[n].id
	*   "lang":      "lg-nolan",                        // or a project lang code
	*   "value":     1,                                  // numeric percentage value
	*   "locator":   { "type":"dd151", "section_id":"3", "section_tipo":"dd501", "lang":"lg-nolan" },
	*   "column":    "state",                            // "state" or "situation"
	*   "type":      "detail"
	* }
	*
	* Returned total item shape:
	* {
	*   "widget":    "state",
	*   "key":       0,
	*   "widget_id": "state",
	*   "lang":      "lg-nolan",
	*   "value":     0.33,                               // round(sum/n/items, 2)
	*   "column":    "state",
	*   "type":      "total"
	* }
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'state',
	*       'path'          => 'state',
	*       'section_tipo'  => 'oh1',
	*       'section_id'    => '123',
	*       'mode'          => 'edit',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null $data
	*  Flat array of stdClass items (detail and total), or empty array when no locators resolve.
	*/
	public function get_data() : ?array {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		$data = [];

		$project_langs = (array)common::get_ar_all_langs();

		// IPO iteration
		// Each IPO entry encodes one logical column group (input/process/output).
		// The 'process' slot is defined in the ontology schema but unused by this widget.
		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;
			// source: array of objects identifying where the root locators come from
			$source 	= $input->source;
			// paths: array of path arrays; each path is a walk from source to the leaf component
			$ar_paths 	= $input->paths;

			// Input type dispatch
			// 'locator'        — caller supplies explicit locator coords (section_tipo/section_id).
			// 'component_data' — locators are read from a component (e.g. a portal) at runtime.
			// A filter/SQO input type was contemplated but is not yet implemented.
			$type = $input->type;
			switch ($type) {

				case 'locator':
					// Build locators directly from the source coords.
					// The sentinel value 'current' is substituted with the widget's own
					// section_tipo / section_id, allowing the IPO to reference "this record".
					$ar_locator = [];
					foreach ($source as $current_source) {
						$locator = new locator();
						if($current_source->section_tipo==='current'){
							$locator->set_section_tipo($section_tipo);
						}
						if($current_source->section_id==='current'){
							$locator->set_section_id($section_id);
						}
						$ar_locator[] = $locator;
					}
					break;

				case 'component_data':
					// Instantiate the source component (e.g. a portal) and extract its data
					// as an array of locators pointing to the related records.
					// 'current' sentinels are replaced with the widget's own coords, as above.
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
						// Only the first locator from each source component is kept here;
						// it is used later for the 'get_label' call on the empty-value branch.
						// (!) $locator remains in scope after this loop and is tested below.
						$locator = $source_data[0] ?? null;
						if($locator){
							$ar_locator[] = $locator;
						}
					}
					break;

				default:
					break;
			}//end switch ($type)

			// (!) Guard: for 'component_data' input type, $locator is the last value set
			// inside the source-component foreach above (i.e. the last source's first item).
			// For 'locator' input type, $locator is set only inside the foreach and may not
			// exist if $source was empty. The guard relies on PHP variable scope leaking out
			// of the foreach, which works but is subtle — $ar_locator is the authoritative
			// collection; $locator here only signals "at least one locator was found".
			if (!empty($locator)) {
				// Path resolution loop
				// Each $path is an ordered array of path-step objects leading from the source
				// locators down to the leaf component that holds the state/situation values.
				$result = [];
				foreach ($ar_paths as $path) {
					// The last step of the path identifies the leaf component (select or radio_button)
					// whose controlled-vocabulary section determines the column type.
					$last_path = end($path);

					// 'self' section_tipo sentinel replacement
					// Path steps authored in a shared/resource ontology context may use 'self'
					// to mean "the calling section". Resolved here before path traversal.
					foreach ($path as $current_path) {
						$current_path->section_tipo = ($current_path->section_tipo === 'self')
							? $section_tipo
							: $current_path->section_tipo;
					}

					// Walk every level of the path.
					// search::get_data_with_path() returns one stdClass per step:
					//   ->path  (the path-step object) and ->value (array of locators at that level).
					// (!) array_find() requires PHP >= 8.4.
					$data_with_path = search::get_data_with_path($path, $ar_locator);

					// Extract the result entry that corresponds to the leaf component.
					// array_find returns the first matching element or null if none matched.
					$path_result = array_find($data_with_path, function($item) use($last_path){
						return $item->path->component_tipo === $last_path->component_tipo;
					});
					// Identify the vocabulary section that the leaf component belongs to.
					// get_ar_related_by_model('section', ...) returns the section tipos that
					// own this component; reset() picks the primary/first one.
					// Knowing the section tipo (dd174 vs dd501) determines which column
					// ('situation' vs 'state') and which value sub-component to read.
					$component_tipo	= $last_path->component_tipo;
					$ar_section		= common::get_ar_related_by_model('section', $component_tipo);
					$section		= reset($ar_section);
					// Translatable components store one value per project language (locators carry
					// a ->lang attribute). Non-translatable components have a single value under
					// 'lg-nolan'. This flag drives both the lang field and the 'n' divisor used
					// when computing the percentage total.
					$translatable = ontology_node::get_translatable($component_tipo);

					// $path_result->value is the array of locators resolved at the leaf level.
					// An empty array means no state/situation has been set for this record yet.
					$ar_value	= $path_result->value;
					// Empty-value placeholder
					// When no value has been recorded yet, emit a zero-value detail item so
					// the total calculation still accounts for this slot in the percentage.
					// label_component: dd503 is the name component inside dd501 (state);
					//                  dd185 is the name component inside dd174 (situation).
					// lang is null for translatable (meaning "all langs") and 'lg-nolan' otherwise.
					// n drives the percentage denominator (see total calculation below).
					if (empty($ar_value) ) {
						$current_result = new stdClass();
							$label_component = ($section==='dd501') ? 'dd503' :'dd185';

							$current_result->label		= $this->get_label($locator, $label_component);
							$current_result->value		= 0;
							$current_result->locator	= null;
							$current_result->lang		= $translatable === true ? null : 'lg-nolan';
							$current_result->widget_id	= $last_path->var_name;
							$current_result->column		= ($section==='dd501') ? 'state' :'situation';
							$current_result->type		= 'detail';
							$current_result->n			= $translatable===true ? count($project_langs) : 1;
						$result[] = $current_result;
					}

					// Per-value detail items
					// $ar_value is an array of locators, each pointing to one entry in the
					// controlled vocabulary section (dd174 situation or dd501 state).
					// The inner switch reads the numeric percentage from the appropriate
					// value sub-component within that vocabulary record.
					// (!) Note: $locator is reused as the loop variable here, overwriting the
					// outer $locator used in the empty-check guard above. This is intentional
					// for the locator-type input path but worth noting for 'component_data'.
					foreach ($ar_value as $locator) {

						$current_result = new stdClass();
						switch ($locator->section_tipo) {
							// dd174 — Situation section (user-editable vocabulary)
							// Numeric percentage value stored in component dd92 (component_number).
							// Column name: 'situation'.
							case 'dd174':
								$situation_value = $this->get_value($locator,'dd92');

								$current_result->widget_id	= $last_path->var_name;
								$current_result->lang		= isset($locator->lang) ? $locator->lang : 'lg-nolan';
								$current_result->value		= $situation_value;
								$current_result->locator	= $locator;
								$current_result->column		= 'situation';
								$current_result->type		= 'detail';
								// $current_result->label	= $this->get_label($locator,'dd185');
								$current_result->n			= $translatable===true ? count($project_langs) : 1;
								break;

							// dd501 — State section (admin-controlled vocabulary)
							// Numeric percentage value stored in component dd83 (component_number).
							// Column name: 'state'.
							case 'dd501':
								$state_value = $this->get_value($locator,'dd83');

								$current_result->widget_id	= $last_path->var_name;
								$current_result->lang		= isset($locator->lang) ? $locator->lang : 'lg-nolan';
								$current_result->value		= $state_value;
								$current_result->locator	= $locator;
								$current_result->column		= 'state';
								$current_result->type		= 'detail';
								// $current_result->label	= $this->get_label($locator,'dd503');
								$current_result->n			= $translatable===true ? count($project_langs) : 1;
								break;
						}
						// add all item to $result
						$result[] = $current_result;
					}
				}//end foreach ($ar_paths as $path)

				// Output assembly
				// Iterate over the IPO output descriptors; each has an 'id' matching a
				// var_name used in the paths. Filter $result to only the items for this
				// output id, then emit them plus one aggregate 'total' item per column.
				foreach ($output as $data_map) {
					// Per-column running sum, keyed by column name ('state' or 'situation').
					$ar_sum = [];
					// Match result items by widget_id (= var_name from the path step).
					$current_id = $data_map->id;
					$found = array_values( array_filter($result, function($item) use($current_id){
						return $item->widget_id===$current_id;
					}));

					// Emit detail items and accumulate column sums simultaneously.
					foreach ($found as $item) {

						$current_data = new stdClass();
							$current_data->widget	 = get_class($this);
							$current_data->key		 = $key;
							$current_data->widget_id = $item->widget_id;
							$current_data->lang		 = $item->lang;
							$current_data->value	 = $item->value;
							$current_data->locator	 = $item->locator;
							$current_data->column	 = $item->column;
							$current_data->type		 = $item->type;

						// Running sum per column
						// n = number of project languages (for translatable) or 1 (non-translatable).
						// It is used as a divisor in the total calculation below.
						// The last item's 'n' wins when items differ (they should not for one column).
							$current_total = $ar_sum[$item->column]->total ?? 0;
							$ar_sum[$item->column] = (object)[
								'total'		=> $current_total += (int)$item->value,
								'n'			=> $item->n,
								'widget_id'	=> $item->widget_id
							];
						// set the final data to the widget
						$data[] = $current_data;
					}

					// Total items (one per column)
					// Formula: round( (sum_of_values / n) / items, 2 )
					//   sum_of_values — integer sum of all detail values in this column
					//   n             — expected count of language slots (or 1 if non-translatable)
					//   items         — number of source locators (portal rows, etc.)
					// Result is a 0–1 fraction (e.g. 0.33 = 33 % done).
					// (!) Division by $value->n could produce a divide-by-zero error if
					// $project_langs is empty and the component is translatable (n == 0).
					foreach ($ar_sum as $column => $value) {
						// items = number of source-level locators used for this IPO entry
						$items = count($ar_locator);
						// percentage done: normalise by language count then by record count
						$total = round(($value->total / $value->n)/$items, 2);
						// create the total item
						$total_result = new stdClass();
							$total_result->widget		= get_class($this);
							$total_result->key			= $key;
							$total_result->widget_id	= $value->widget_id;
							$total_result->lang			= 'lg-nolan';
							$total_result->value		= $total;
							$total_result->column		= $column;
							$total_result->type			= 'total';
						$data[] = $total_result;
					}
				}
			}//end if (!empty($locator))
		}//foreach $ipo

		return $data;
	}//end get_data



	/**
	* GET_LABEL
	* Resolve the label of a related component (portal) for a given locator.
	* Typically used to fetch the human-readable name of a state/situation value.
	*
	* @param object $locator
	*  Locator pointing to the record whose label is needed.
	* @param string $component_tipo
	*  Tipo of the component that stores the label (e.g. dd185, dd503).
	* @return string $label
	*/
	public function get_label(object $locator, string $component_tipo) : string {

		$model_name			= ontology_node::get_model_by_tipo($component_tipo, true);
		$component_portal	= component_common::get_instance(
			$model_name,
			$component_tipo,
			$locator->section_id,
			'list',
			DEDALO_DATA_LANG,
			$locator->section_tipo
		);

		$data = $component_portal->get_data_lang();
		$label = '';
		if (!empty($data)) {
			$label = $data[0]->value;
		}

		return $label;
	}//end get_label



	/**
	* GET_VALUE
	* Get the numeric value of a component for a given locator.
	* Typically used to retrieve the completion percentage of a state/situation.
	*
	* @param object $locator
	*  Locator pointing to the record whose value is needed.
	* @param string $component_tipo
	*  Tipo of the component that stores the numeric value.
	*  Usually component_number 'dd92' (value %) or 'dd83'.
	* @return float $value
	*/
	public function get_value(object $locator, string $component_tipo) : float {

		$model_name			= ontology_node::get_model_by_tipo($component_tipo,true);
		$component_portal	= component_common::get_instance(
			$model_name,
			$component_tipo,
			$locator->section_id,
			'list',
			DEDALO_DATA_NOLAN,
			$locator->section_tipo
		);

		$data	= $component_portal->get_data();
		$value	= !empty($data)
			? $data[0]->value
			: 0;


		return $value;
	}//end get_value



	/**
	* GET_DATA_LIST
	* Enumerate the available list-of-values for the final component of each IPO path.
	* Used by the client renderer to populate the state/situation selector dropdown.
	*
	* @return array $data_list
	*  Array of objects enriched with `widget` and `key` properties.
	*/
	public function get_data_list() : array {

		$ipo		= $this->ipo;
		$data_list	= [];

		// Each IPO entry may declare multiple paths; each path's leaf component holds
		// one vocabulary list. Only the 'input' and 'paths' are read here; 'output'
		// and 'process' are not needed for a list-of-values enumeration.
		foreach ($ipo as $key => $current_ipo) {

			$input = $current_ipo->input;
			// paths: array of path arrays leading to the leaf vocabulary component
			$ar_paths = $input->paths;

			// Walk paths to find the leaf component for each configured column.
			foreach ($ar_paths as $path) {
				// The last step of the path identifies the select/radio_button component
				// whose get_list_of_values() returns the available options.
				$last_path		= end($path);
				$section_tipo 	= (isset($last_path->section_tipo)) ? $last_path->section_tipo : $this->section_tipo;
				$component_tipo = $last_path->component_tipo;
				$model_name 	= ontology_node::get_model_by_tipo($component_tipo,true);
				// Instantiate without a section_id (null) — we only need the vocabulary
				// list, not any record-specific stored value.
				$component = component_common::get_instance(
					$model_name,
					$component_tipo,
					null,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);

				// get_list_of_values() returns an object with a 'result' array.
				// Each item is enriched with 'widget' (class name) and 'key' (IPO index)
				// so the client can associate list items with their originating IPO entry.
				$list_of_values = $component->get_list_of_values();
				$list = array_map(function($item) use($key){
					$item->widget	= get_class($this);
					$item->key		= $key;
					return $item;
				}, $list_of_values->result ?? []);

				$data_list = [...$data_list, ...$list];
			}
		}


		return $data_list;
	}//end get_data_list



}//end state
