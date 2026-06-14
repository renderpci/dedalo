<?php declare(strict_types=1);
/**
 * CLASS GET_ARCHIVE_WEIGHTS
 * Widget that computes aggregated weight and diameter statistics from linked
 * numismatic records (e.g. coins).
 *
 * Responsibilities:
 * - Reads linked record locators from a source portal (IPO "source" input)
 * - Filters by "used" and "duplicated" portal flags; a section_id of '2'
 *   conventionally means the boolean flag is set to TRUE in Dédalo's numismatic
 *   schema — coins that are unused (used flag = '2') or duplicated (duplicated
 *   flag = '2') are skipped during aggregation
 * - For each qualifying linked record, collects per-record weight and diameter
 *   averages (mean of all values stored on that record)
 * - Computes media (mean), max, min, and total element count across ALL qualifying
 *   records for both weight and diameter
 * - Returns a flat array of stdClass items keyed by output IDs defined in the IPO;
 *   the shape is consumed by render_get_archive_weights.js on the client side
 * - The client subscribes to `update_widget_value_<key>_<id>` events for live refresh
 *   when source component values change
 *
 * Extends widget_common, which provides the factory (get_instance()), the shared
 * properties (section_tipo, section_id, mode, lang, ipo), and the get_data_parsed()
 * pass-through hook.
 *
 * Known issue (flag, do not fix): the IPO type key for diameter is spelled
 * "data_diamenter" (typo, extra 'e' — 'diamenter' instead of 'diameter') in both
 * the ontology configuration and the array_reduce call at line ~161. Any caller
 * must use the same misspelling.
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class get_archive_weights extends widget_common {



	/**
	* GET_DATA
	* Resolve the widget IPO configuration into aggregated weight and diameter
	* statistics from linked numismatic records.
	*
	* The method iterates over each IPO block ($this->ipo), extracts five typed
	* component descriptors from the "input" array, and then:
	*   1. Loads the source portal to get all coin locators linked to the current record.
	*   2. For each coin: checks the "used" and "duplicated" portal flags; coins where
	*      the used flag is absent (not yet classified) or section_id === '2' (meaning
	*      "unused" in the numismatic schema) are skipped; coins where the duplicated
	*      flag IS set (section_id === '2') are also skipped.
	*   3. Reads the weight and diameter component values from each qualifying coin record.
	*   4. Averages within-record values (a single record may store multiple measurements),
	*      then appends that per-record mean to $weights / $diameter.
	*   5. After all coins are processed, computes cross-record mean, max, min, and count.
	*   6. Emits one stdClass output item per IPO "output" entry, using PHP variable
	*      variables ($$current_id) to resolve the computed local variable by name.
	*
	* Expected IPO sample (from ontology properties):
	* {
	*   "input": [
	*     { "type": "source",        "section_tipo": "numisdata5", "component_tipo": "numis1" },
	*     { "type": "used",          "section_tipo": "numisdata4", "component_tipo": "numis2" },
	*     { "type": "duplicated",    "section_tipo": "numisdata4", "component_tipo": "numis3" },
	*     { "type": "data_weights",  "section_tipo": "numisdata4", "component_tipo": "numis4" },
	*     { "type": "data_diamenter","section_tipo": "numisdata4", "component_tipo": "numis5" }
	*   ],
	*   "output": [
	*     { "id": "media_weight" },
	*     { "id": "max_weight" },
	*     { "id": "min_weight" },
	*     { "id": "total_elements_weights" },
	*     { "id": "media_diameter" },
	*     { "id": "max_diameter" },
	*     { "id": "min_diameter" },
	*     { "id": "total_elements_diameter" }
	*   ]
	* }
	*
	* Note: "data_diamenter" is a typo (extra 'e') carried from the original ontology
	* configuration. It is intentionally left unchanged here to remain in sync with the
	* ontology. Do NOT correct it without also updating the ontology entry.
	*
	* Sample returned data items (one object per output id):
	* {
	*   "widget": "get_archive_weights",
	*   "key": 0,
	*   "widget_id": "media_weight",
	*   "value": 12.45
	* }
	* {
	*   "widget": "get_archive_weights",
	*   "key": 0,
	*   "widget_id": "total_elements_weights",
	*   "value": 24
	* }
	*
	* When the source portal is empty the method returns an empty array early (not null),
	* which signals "no linked coins" to the client without triggering an error state.
	* When weights or diameter collections are empty, the corresponding aggregate
	* variables ($media_weight, etc.) remain undefined; the variable-variable pattern
	* resolves them to null via the ?? null guard.
	*
	* Usage:
	*   $widget = widget_common::get_instance((object)[
	*       'widget_name'   => 'get_archive_weights',
	*       'path'          => 'numisdata/get_archive_weights',
	*       'section_tipo'  => 'numis1',
	*       'section_id'    => '123',
	*       'mode'          => 'edit',
	*       'ipo'           => $ipo_from_ontology
	*   ]);
	*   $data = $widget->get_data();
	*
	* @return array|null $data Flat array of stdClass items; each item has
	*                          widget, key, widget_id, value properties.
	*                          Returns [] when the source portal has no linked records.
	*/
	public function get_data() : ?array {

		$section_tipo 	= $this->section_tipo;
		$section_id 	= $this->section_id;
		$ipo 			= $this->ipo;

		$data = [];
		foreach ($ipo as $key => $current_ipo) {

			$input 		= $current_ipo->input;
			$output		= $current_ipo->output;

			// source descriptor
			// The "source" input entry identifies the portal component that holds
			// the locators of the linked coin records for the current archive record.
			$component_source = array_reduce($input, function ($carry, $item){
				if ($item->type==='source') {
					return $item;
				}
				return $carry;
			});

			$current_component_tipo = $component_source->component_tipo;
			$current_section_tipo 	= $component_source->section_tipo;

			#
			# PORTAL ROWS
			// Load the source portal and retrieve all coin locators linked to this
			// archive record. DEDALO_DATA_NOLAN skips language filtering so all locators
			// are returned regardless of the current display language.
				$model_name 	  = ontology_node::get_model_by_tipo($current_component_tipo,true); // Expected portal
				$component_portal = component_common::get_instance(
					$model_name,
					$current_component_tipo,
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$current_section_tipo
				);

				$component_data = $component_portal->get_data();

				// early exit
				// If the source portal is empty there are no linked coins to aggregate;
				// return [] (not null) so the client treats it as "no data" rather than an error.
				if (empty($component_data)) {
					return [];
				}

			// used descriptor
			// The "used" input entry points to a boolean-style portal on each coin
			// record that flags whether the coin is "not in use / unused".
			// In Dédalo's numismatic schema, section_id === '2' conventionally
			// represents a TRUE boolean: here, it means the coin IS marked as unused.
			// Coins where used is absent (not yet classified) or where section_id is '2'
			// (explicitly marked unused) are excluded from the aggregation.
			$component_used = array_reduce($input, function ($carry, $item){

				if ($item->type==='used') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_used 	= $component_used->component_tipo;
			$section_tipo_used 		= $component_used->section_tipo;


			// type duplicated
			// The "duplicated" input entry points to a boolean-style portal similar
			// to "used". section_id === '2' means the coin IS a duplicate and must
			// be excluded. Absence of the duplicated descriptor in the IPO is a fatal
			// configuration error; the IPO block is skipped and an ERROR is logged.
				$component_duplicated = array_reduce($input, function ($carry, $item){
					if ($item->type==='duplicated') {
						return $item;
					}
					return $carry;
				});
				if (empty($component_duplicated)) {
					debug_log(__METHOD__
						. " !!!!!!!!!!!!!!! Skipped component_duplicated (type == duplicated) not found in input " . PHP_EOL
						. ' input: ' . to_string($input)
						, logger::ERROR
					);
					continue;
				}
				$component_tipo_duplicated	= $component_duplicated->component_tipo;
				// $section_tipo_duplicated	= $component_duplicated->section_tipo;


			// data_weights descriptor
			// The "data_weights" input entry identifies the component on each coin
			// record that stores one or more numeric weight measurements (grams).
			$component_data_weights = array_reduce($input, function ($carry, $item){

				if ($item->type==='data_weights') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_data_weights 	= $component_data_weights->component_tipo;


			// data_diameter descriptor
			// (!) "data_diamenter" is a persistent typo in the ontology type key.
			// Do NOT correct the string literal — it must match the ontology entry exactly.
			$component_data_diameter = array_reduce($input, function ($carry, $item){

				if ($item->type==='data_diamenter') {
					return $item;
				}
				return $carry;
			});

			$component_tipo_data_diameter 	= $component_data_diameter->component_tipo;


			// per-record averages accumulators
			// $weights and $diameter collect one mean value per qualifying coin record.
			// A coin record may store multiple measurements; those are averaged first
			// so each coin contributes equally to the final cross-archive statistics.
			$weights = [];
			$diameter = [];
			#get the value of the component using portal data
				foreach ($component_data as $current_locator) {

					// shadow outer $section_id / $section_tipo with this coin's coordinates
					// so subsequent component_common::get_instance() calls address the coin record
					$section_id 	= $current_locator->section_id;
					$section_tipo 	= $current_locator->section_tipo;

					// used flag check
					// Load the "used" portal for this coin. In Dédalo's numismatic schema
					// the "used" portal records the "NOT IN USE / UNUSED" state: if the portal
					// is empty (flag absent, coin not yet classified) or if the first locator's
					// section_id is '2' (the conventional TRUE value, meaning "IS unused"),
					// the coin must be excluded from the aggregation.
					$used_model_name	= ontology_node::get_model_by_tipo($component_tipo_used,true); // Expected portal
					$used 				= component_common::get_instance(
						$used_model_name,
						$component_tipo_used,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$used_data = $used->get_data();

					// skip coins where the "used" flag is absent (not yet classified) or '2' (not in use)
					if (empty($used_data) || $used_data[0]->section_id==='2') continue;


					// duplicated flag check
					// Load the "duplicated" portal. If non-empty AND the first locator's
					// section_id is '2', the coin is a known duplicate and is excluded.
					$duplicated_modelo_name	= ontology_node::get_model_by_tipo($component_tipo_duplicated,true); // Expected portal
					$duplicated				= component_common::get_instance(
						$duplicated_modelo_name,
						$component_tipo_duplicated,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$duplicated_data = $duplicated->get_data();

					// skip coins that are flagged as duplicates
					if (!empty($duplicated_data) && $duplicated_data[0]->section_id==='2') continue;


					//weights
					// Collect all weight measurements stored on this coin record, compute
					// their within-record mean, and push it into the $weights accumulator.
					$data_weights_model_name	= ontology_node::get_model_by_tipo($component_tipo_data_weights,true); // Expected portal
					$data_weights				= component_common::get_instance(
						$data_weights_model_name,
						$component_tipo_data_weights,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$data_weights_data 	= $data_weights->get_data();

					// within-record weight mean; each measurement item is expected to have
					// a numeric 'value' property; missing values default to 0 via ?? 0
					if(!empty($data_weights_data)){
						$weights[] = array_sum(array_map(function($item) { return $item->value ?? 0; }, $data_weights_data)) / count($data_weights_data);
					}

					//diameter
					// Same pattern as weights but for diameter measurements (mm).
					$data_diameter_model_name	= ontology_node::get_model_by_tipo($component_tipo_data_diameter,true); // Expected portal
					$data_diameter				= component_common::get_instance(
						$data_diameter_model_name,
						$component_tipo_data_diameter,
						$section_id,
						'list',
						DEDALO_DATA_NOLAN,
						$section_tipo
					);

					$data_diameter_data = $data_diameter->get_data();

					// within-record diameter mean
					if(!empty($data_diameter_data)){
						$diameter[] = array_sum(array_map(function($item) { return $item->value ?? 0; }, $data_diameter_data)) / count($data_diameter_data);
					}
				}

				// cross-archive weight statistics
				// Variables declared here ($media_weight, $max_weight, etc.) are used
				// below via PHP variable variables ($$current_id) to populate the output
				// items without an explicit switch statement. If $weights is empty, these
				// variables are never declared, so $$current_id falls back to null.
				if (!empty($weights)) {
					$media_weight 			= round((array_sum($weights) / count($weights)),2);
					$total_elements_weights = count($weights);
					$max_weight 			= max($weights);
					$min_weight 			= min($weights);
				}else{
					debug_log(__METHOD__." Empty weights. Sum ignored in widget get_archive_weights ".to_string(), logger::DEBUG);
				}

				// cross-archive diameter statistics (same pattern as weights)
				if (!empty($diameter)) {
					$media_diameter				= round((array_sum($diameter) / count($diameter)),2);
					$total_elements_diameter 	= count($diameter);
					$max_diameter 				= max($diameter);
					$min_diameter				= min($diameter);
				}else{
					debug_log(__METHOD__." Empty diameter. Sum ignored in widget get_archive_weights ".to_string(), logger::DEBUG);
				}

				// output serialisation
				// Iterate over the IPO output map and resolve each declared id to its
				// computed local variable using PHP variable variables ($$current_id).
				// This avoids an explicit switch and keeps the method generic: the output
				// ids in the ontology directly drive which statistics are emitted.
				// If a variable was never set (e.g. $weights was empty), ?? null ensures
				// the output item carries value:null rather than a PHP undefined-variable
				// notice being triggered.
				foreach ($output as $data_map) {
					$current_id = $data_map->id;
					$current_data = new stdClass();
						$current_data->widget 		= get_class($this);
						$current_data->key  		= $key;
						$current_data->widget_id	= $current_id;
						$current_data->value 		= $$current_id ?? null;
					$data[] = $current_data;
				}

			// $data = new stdClass();
			// 	$data->media_weight 			= $media_weight 			?? null;
			// 	$data->max_weight 				= $max_weight 				?? null;
			// 	$data->min_weight 				= $min_weight 				?? null;
			// 	$data->total_elements_weights 	= $total_elements_weights 	?? null;
			// 	$data->media_diameter 			= $media_diameter 			?? null;
			// 	$data->max_diameter 			= $max_diameter 			?? null;
			// 	$data->min_diameter 			= $min_diameter 			?? null;
			// 	$data->total_elements_diameter 	= $total_elements_diameter 	?? null;
		}//foreach ipo

		return $data;
	}//end get_data



}//end get_archive_weights
