<?php declare(strict_types=1);
/**
 * CLASS CALCULATION
 * IPO-driven widget that resolves component data, optionally applies a custom
 * PHP processing function, and returns typed output items for the client renderer.
 *
 * Responsibilities:
 * - Resolves the "input" phase: fetches component values from the current record,
 *   all records in a section (summed), or the active search session.
 * - Optionally executes the "process" phase: loads an external PHP file from
 *   DEDALO_WIDGETS_PATH and calls a named function (e.g. summarize, to_euros).
 * - Maps the "output" phase: selects named result items from the process return
 *   value and packages them as label/value pairs for render_calculation.js.
 * - Supports a "filter" mode in which one component stores a search_query_object
 *   (typically component_json) that is executed live to produce the data set.
 *
 * Extends widget_common, which provides get_instance() factory, section_tipo,
 * section_id, mode, lang, and ipo properties. The IPO configuration is read
 * from the ontology node's widget properties at run time.
 *
 * Security boundary (SEC-052):
 * - The external file path is confined via realpath() to DEDALO_WIDGETS_PATH;
 *   symlink escapes are refused.
 * - The function name is validated as a bare identifier (regex) and verified
 *   post-include via ReflectionFunction to ensure it was actually defined
 *   inside the widgets root and not an existing global.
 *
 * Client consumer: render_calculation.js expects an array of objects:
 *   [ { widget, key, id, value }, … ]
 *
 * See also: core/widgets/calculation/formulas.php — bundled processing functions.
 *
 * @package Dédalo
 * @subpackage Widgets
 */
class calculation extends widget_common {



	/**
	* GET_DATA
	* Main entry point: iterate the IPO array, resolve component data for each
	* entry, optionally run the processing function, and collect output items.
	*
	* Each element of $this->ipo drives one independent calculation cycle:
	*   1. input  — resolve_data() fetches raw component values keyed by var_name.
	*   2. process — (optional) resolve_logic() loads an external PHP function and
	*               invokes it, returning an array of {id, value} result objects.
	*   3. output  — for each $output map entry, find the matching result item by
	*               id and emit a flat data object for the client renderer.
	*
	* The IPO configuration lives in the ontology widget-properties node. Each
	* element of the top-level array corresponds to one rendered output group.
	*
	* IPO structure (from ontology properties):
	* [
	*   {
	*     "input": {
	*       "section_tipo": "current",          // "current" | explicit tipo string
	*       "section_id":   "current",          // "current" | "all" | "search_session"
	*       "filter":       false,              // true: component holds a search_query_object
	*       "value":        "sum",              // "sum" | "value" (for search_session scope)
	*       "components": [
	*         { "tipo": "test139", "var_name": "number" },
	*         { "tipo": "test140", "var_name": "fields_separator" }
	*       ]
	*     },
	*     "process": {                          // optional; omit to skip processing
	*       "engine": "php",
	*       "file":   "/mdcat/calculation/mdcat.php",   // relative to DEDALO_WIDGETS_PATH
	*       "fn":     "to_euros",
	*       "options": { "label": true, "separator": ", " }
	*     },
	*     "output": [
	*       { "id": "total", "value": "float", "label_after": "euros" }
	*     ]
	*   }
	* ]
	*
	* Each emitted data item:
	* {
	*   "widget": "calculation",    // get_class($this)
	*   "key":    0,                // IPO array index
	*   "id":     "total",          // matched output id
	*   "value":  "1,234.56 euros"  // value from the processing function result
	* }
	*
	* @return array|null $data Array of data items, or null when IPO is empty
	*/
	public function get_data() : ?array {

		$ipo = $this->ipo ?? [];
		if (empty($ipo)) {
			return null;
		}

		$data = [];
		foreach ($ipo as $key => $ipo_value) {

			// input
			// Resolve component values into a keyed object ($data_input->var_name = value).
			$data_input = $this->resolve_data($ipo_value->input);

			// process
			// The process block is optional; if absent, $result remains from the previous
			// iteration (or unset). Always resets per iteration via the isset guard below.
			if(isset($ipo_value->process) ){
				$process = $ipo_value->process;
				$result = $this->resolve_logic($process, $data_input);
			}

			// output
			// Each output map entry names an id that must match a result item returned
			// by the processing function. Unmatched ids produce no output (silent skip).
			foreach ($ipo_value->output as $data_map) {
				$current_id = $data_map->id;
				// array_find returns the first matching element or null/false.
				// $result may be null when process is absent or resolve_logic refused (SEC-052).
				$found = array_find($result ?? [], function($item) use($current_id){
					return $item->id===$current_id;
				});
				if (is_object($found)) {

					$value = $found->value;

					$current_data = new stdClass();
						$current_data->widget	= get_class($this);
						$current_data->key		= $key;
						$current_data->id		= $current_id;
						$current_data->value	= $value;

					$data[] = $current_data;
				}
			}
		}

		return $data;
	}//end get_data



	/**
	* RESOLVE_DATA
	* Resolve the "input" block of an IPO entry into a plain object whose
	* properties correspond to the var_name of each configured component.
	*
	* Data-source scopes (driven by $data->section_id):
	* - "current"        — instantiates each component for the current record and
	*                      calls get_calculation_data() to obtain the stored value.
	* - "all"            — sums the component values across the entire section via
	*                      get_sum_from_component_tipo() (no SQO session dependency).
	* - "search_session" — honours $data->value:
	*                        "value" → get_values_from_component_tipo() (raw values
	*                                  from records matching the active session SQO)
	*                        "sum"   → get_sum_from_component_tipo() (numeric sum of
	*                                  those same records)
	* - any other value  — treated as a literal section_id (no component iteration).
	*
	* Filter override ($data->filter === true):
	*   After the switch, if filter is true the code re-reads each component's data
	*   as a search_query_object (component_json is the typical model), executes it
	*   via exec_data_filter_data(), and stores the result rows under var_name.
	*   This is independent of the section_id switch and can coexist with it.
	*
	* True/false literals ($data->true / $data->false):
	*   Scalar boolean-like constants may be injected into $data_resolved via the
	*   "true" and "false" keys. The ar_locators variant (for computed lookups) is
	*   stubbed out in commented code awaiting a future implementation.
	*
	* @param object $data Input configuration object: section_tipo, section_id,
	*                     components[], filter bool, value string, true/false scalars.
	* @return object|null $data_resolved Object keyed by var_name, or null when $data empty
	*/
	public function resolve_data(object $data) : ?object {

		if(empty($data)) {
			return null;
		}

		$data_resolved = new StdClass();

		// set the section tipo
		// "current" maps to the widget's own section_tipo; any other string is used verbatim.
			switch ($data->section_tipo) {
				case 'current':
					$section_tipo = $this->section_tipo;
					break;
				default:
					$section_tipo = $data->section_tipo ;
			}

		// set the section id
		// The section_id keyword controls how component values are gathered.
		// Note: $section_tipo resolved above is always available to all branches.
			switch ($data->section_id) {
				case 'current':
					// Single-record mode: instantiate each component for this specific record
					// and retrieve its stored value via get_calculation_data().
					$section_id = $this->section_id;

					foreach ($data->components as $current_component) {
						$component_tipo	= $current_component->tipo;
						$var_name		= $current_component->var_name;
						$options		= isset($current_component->options) ? $current_component->options : null;
						$model_name		= ontology_node::get_model_by_tipo($component_tipo,true);
						// Use translatable lang only for components whose ontology node is flagged
						// as translatable; fall back to DEDALO_DATA_NOLAN for language-neutral data.
						$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

						$current_component = component_common::get_instance(
							$model_name,
							$component_tipo,
							$section_id,
							'edit',
							$lang,
							$section_tipo
						);

						$data_resolved->{$var_name} = $current_component->get_calculation_data($options);
					}// end foreach ($data->component_tipo as $component_tipo)
					break;

				case 'all':
					// Whole-section aggregate: sum this component's values across every record
					// in $section_tipo using a dedicated search SQO (no session SQO dependency).
					foreach ($data->components as $current_component) {
						$component_tipo	= $current_component->tipo;
						$var_name		= $current_component->var_name;
						$options		=  isset($current_component->options) ? $current_component->options : null;
						$model_name		= ontology_node::get_model_by_tipo($component_tipo,true);
						$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

						$search_options = new StdClass;
							$search_options->section_tipo	= $section_tipo;
							$search_options->component_tipo	= $component_tipo;

						$data_resolved->{$var_name} = $this->get_sum_from_component_tipo($search_options);
					}
					break;

				case 'search_session':
					// Session-filtered aggregate: operate only on the records matched by
					// the current user's active SQO (stored in $_SESSION['dedalo']['config']['search_options']).
					// $data->value selects the aggregation strategy:
					//   "value" → raw values array (get_values_from_component_tipo)
					//   "sum"   → numeric total   (get_sum_from_component_tipo)
					foreach ($data->components as $current_component) {
							$component_tipo	= $current_component->tipo;
							$var_name		= $current_component->var_name;
							$options		=  isset($current_component->options) ? $current_component->options : null;
							$model_name		= ontology_node::get_model_by_tipo( $component_tipo,true );
							$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

							$search_options = new StdClass;
								$search_options->section_tipo	= $section_tipo;
								$search_options->component_tipo	= $component_tipo;

							if($data->value ==='value'){
								$data_resolved->{$var_name} = $this->get_values_from_component_tipo($search_options, $data);
									#dump($data_resolved, ' data_resolved'.to_string());
							}else if($data->value ==='sum'){
								$data_resolved->{$var_name} = $this->get_sum_from_component_tipo($search_options);
							}
						}
					break;

				default:
					// Explicit section_id: store it for any future use; no component
					// iteration is performed here (caller must handle this case).
					$section_id = $data->section_id;
					break;
			}

		// filter true
		// This block runs AFTER the switch and is independent of the section_id scope.
		// When filter===true, each listed component is expected to hold a serialised
		// search_query_object (typical model: component_json). The stored SQO is
		// executed live and its result rows replace the var_name entry in $data_resolved.
			if (isset($data->filter) && $data->filter===true) {

				$section_id = $this->section_id;
				foreach ($data->components as $current_component) {

					$component_tipo	= $current_component->tipo;
					$var_name		= $current_component->var_name;
					$options		= isset($current_component->options) ? $current_component->options : null;

					// Component (component_json) where is stored source data, a json search_query_object
						$model_name			= ontology_node::get_model_by_tipo( $component_tipo,true );
						$lang				= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
						$current_component	= component_common::get_instance(
							$model_name,
							$component_tipo,
							$this->section_id,
							'edit',
							$lang,
							$this->section_tipo
						);
						// (!) $data is reused here as a local variable shadowing the $data parameter.
						// This overwrites the original input config object for the rest of this block.
						$data	= $current_component->get_data();
						$data	= is_array($data) ? $data : [$data]; // Array always

						if (empty($data) || !isset($data[0]->data)) {
							continue; // Skip empty
						}

						// exec_data_filter_data
						// Each item in $data may carry one or more SQOs under its ->data property.
						// exec_data_filter_data() executes all of them and applies result_map if present.
							$result = [];
							foreach ((array)$data as $data_item) {
								$result[] = self::exec_data_filter_data($data_item);
							}

					// Set result
						$data_resolved->{$var_name} = $result;

				}//end foreach ($data->component_tipo as $component_tipo)
			}//end if (isset($data->filter) && $data->filter===true)

		// true. set the value of true variable
		// Injects a scalar constant into $data_resolved->true so processing functions
		// can access a known "true" sentinel. The ar_locators variant (dynamic lookup
		// via get_valor_from_ar_locators) is not yet implemented — see commented code.
			switch (true) {
				case isset($data->true) && isset($data->true->ar_locators):
					// $ar_locators = json_decode( str_replace("'", '"', $data->true->ar_locators) );
					//
					// $options = new stdClass();
					// 	$options->lang 				= DEDALO_DATA_LANG;
					// 	$options->data_to_be_used 	= 'valor';
					// 	$options->ar_locators 		= $ar_locators;
					// 	$options->records_separator 	= isset($data->true->records_separator) ? $data->true->records_separator : false;
					// 	$options->fields_separator 	= isset($data->true->fields_separator) ? $data->true->fields_separator : false;
					//
					// 	$valor_from_ar_locators 	= $this->get_valor_from_ar_locators($options);
					// 		#dump($valor_from_ar_locators, ' valor_from_ar_locators');$valor_from_ar_locators->result
					// 	$data_resolved->true = $valor_from_ar_locators->result;
					break;
				case isset($data->true):
					$data_resolved->true = $data->true;
					break;
			}

		// false. set the value of false variable
		// Mirrors the "true" block above. The ar_locators variant is also not yet
		// implemented. Note: the active branch assigns $data->true (not $data->false)
		// — this appears to be a copy-paste oversight in the original code; flagged below.
			switch (true) {
				case isset($data->false) && isset($data->false->ar_locators):
					// $ar_locators = json_decode( str_replace("'", '"', $data->false->ar_locators) );
					//
					// $options = new stdClass();
					// 	$options->lang 				= DEDALO_DATA_LANG;
					// 	$options->data_to_be_used 	= 'valor';
					// 	$options->ar_locators 		= $ar_locators;
					// 	$options->records_separator 	= isset($data->false->records_separator) ? $data->false->records_separator : false;
					// 	$options->fields_separator 	= isset($data->false->fields_separator) ? $data->false->fields_separator : false;
					//
					// $valor_from_ar_locators 	= $this->get_valor_from_ar_locators($options);
					// 		#dump($valor_from_ar_locators, ' valor_from_ar_locators');$valor_from_ar_locators->result
					// $data_resolved->false = $valor_from_ar_locators->result;
					break;
				case isset($data->false):
					$data_resolved->false = $data->true;
					break;
			}

		// set the filter
		// NEED TO BE DEFINED


		return $data_resolved;
	}//end resolve_data



	/**
	* EXEC_DATA_FILTER_DATA
	* Execute one or more search_query_objects stored in a component_json data item
	* and return a clone of the item with its data property replaced by the combined
	* search result rows.
	*
	* $data_item->data may be a single SQO or an array of SQOs; both are normalised
	* to an array before processing. Each SQO is executed independently via
	* search::get_instance() and the resulting ar_records arrays are merged in order.
	*
	* result_map (optional — $search_query_object->result_map):
	*   An array of {column, key, process} descriptors that rename and optionally
	*   transform columns in each result row:
	*   - column : the source property name on the raw result row
	*   - key    : the target property name on the new row object
	*   - process: (optional) a callable name passed to call_user_func_array;
	*              the value is always wrapped in array($value) so the function
	*              receives the scalar as its sole argument
	*   Rows are remapped to new stdClass instances containing only the mapped keys.
	*   All other columns from the raw result are discarded.
	*
	* The result_map property itself is excluded from the output item ($key==='result_map'
	* is skipped) to avoid exposing the mapping configuration to the client renderer.
	*
	* This is a static method so it can be called from class contexts that hold a
	* data_item reference without needing a full widget instance.
	*
	* @param object $data_item Object with at least a data property (SQO or SQO[]). Other
	*                          properties are passed through verbatim to the output object.
	* @return object $result   Clone of $data_item with data replaced by merged result rows
	*/
	public static function exec_data_filter_data(object $data_item) : object {

		// Normalise: single SQO or array of SQOs — always iterate as array.
		$ar_search_query_object = !is_array($data_item->data) ? [$data_item->data] : $data_item->data; // Always array

		// Exec search with search_query_object
			$ar_result = [];
			foreach ($ar_search_query_object as $search_query_object) {

				// Search
					$search 		= search::get_instance($search_query_object);
					$search_data 	= $search->search();
					$ar_records 	= $search_data->ar_records;

				// Result map. If result_map exists, parse result rows
				// result_map is stored on the SQO itself (not on the data_item wrapper)
				// so it travels with the query that produced the columns it maps.
					$result_map = isset($search_query_object->result_map) ? $search_query_object->result_map : false;
					if (!empty($result_map)) {

						$ar_rows_mapped = [];
						foreach ($ar_records as $key => $row) {

							$new_row = new stdClass();
							foreach ($result_map as $map_item) {

								if (isset($row->{$map_item->column})) {

									// Process value
										$value = $row->{$map_item->column};
										if (isset($map_item->process)) {
											//$value = $map_item->process($value);
											#$value = call_user_func_array($map_item->process, $value);
											// Wrap $value in an array so call_user_func_array
											// passes it as the first positional argument.
											$value = call_user_func_array($map_item->process, array($value));
										}

									// Set mapped property
									// Cast to array so the client always receives a uniform container
									// even when the value is a scalar.
										$new_row->{$map_item->key} = (array)$value;
								}
							}
							$ar_rows_mapped[] = $new_row;
						}

						// Overwrite data property
						$ar_records = $ar_rows_mapped;
						#dump($ar_rows_mapped, ' ar_rows_mapped ++ '.to_string());
					}

				// Add and merge parsed rows
				$ar_result = array_merge($ar_result, $ar_records);
			}//end foreach ($ar_search_query_object as $search_query_object


		// Add data object properties
		// Copy all properties of $data_item verbatim, except:
		//   - "result_map": internal mapping config; excluded from the output.
		//   - "data": replaced by the computed $ar_result rows.
			$result = new StdClass();
			foreach ($data_item as $key => $value) {
				if ($key==='result_map') continue; # Skip some reserved properties
				// Add property
				if ($key==='data') {
					$result->data = $ar_result; # calculated
				}else{
					$result->{$key} = $value; # literal
				}
			}

		return $result;
	}//end exec_data_filter_data



	/**
	* GET_SUM_FROM_COMPONENT_TIPO
	* Build and execute a search_query_object that selects a single component column
	* across all matching records, then return the integer sum of those values.
	*
	* The SQO uses limit=0 (no paging) and parsed=false so raw JSONB scalars are
	* returned rather than resolved labels. Each row's value for $component_tipo is
	* cast to int before summation; non-numeric strings become 0.
	*
	* An optional section_id filter is injected into the $and clause when
	* $search_options->section_id is set, restricting the sum to a single record
	* (useful for row-level subtotals in list mode).
	*
	* The SQO is built as a JSON string via string interpolation and then
	* json_decoded — the interpolated variables come from ontology lookups and are
	* not user-supplied, so SQL injection is not a concern here.
	*
	* @param object $search_options Object with section_tipo, component_tipo,
	*                               and optional section_id properties.
	* @return int|float $total Integer sum of the component values; 0 when no records match
	*/
	public function get_sum_from_component_tipo(object $search_options) : int|float {

		$current_section_tipo	= $search_options->section_tipo;
		$current_tipo			= $search_options->component_tipo;
		$model_name				= ontology_node::get_model_by_tipo($current_tipo,true);
		$lang					= ontology_node::get_translatable( $current_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		# section_id filter
		// Optionally restrict the search to a single record by injecting a
		// component_section_id path element into the $and clause.
		$section_id_filter = '';
		if (isset($search_options->section_id)) {

			$section_id_filter = '
			{
				"q": "'.$search_options->section_id.'",
                "path": [
                    {
                        "model": "component_section_id"
                    }
                ],
                "component_path": [
                    "section_id"
                ]
			}
			';
		}

		// SQO built as an interpolated JSON string.
		// "q":"*" in the filter path means "match any record that has a value
		// in this component" — acting as an existence check, not a text filter.
		// "name":"Sum" is a human label for the path node (not a SQL keyword).
		$search_query_object = json_decode('{
		    "id": "sum_from_component_tipo",
		    "mode": "list",
		    "section_tipo": ["'.$current_section_tipo.'"],
		    "limit": 0,
		    "parsed" : false,
		    "filter": {
		        "$and": [
		            {
		                "q": "*",
		                "q_operator": null,
		                "path": [
		                    {
		                        "section_tipo": "'.$current_section_tipo.'",
		                        "component_tipo": "'.$current_tipo.'",
		                        "model": "'.$model_name.'",
		                        "name": "Sum",
		                        "lang": "'.$lang.'"
		                    }
		                ]
		            }'.$section_id_filter.'
		        ]
		    },
		    "select": [
		        {
		            "path": [
		                {
		                    "section_tipo": "'.$current_section_tipo.'",
		                    "component_tipo": "'.$current_tipo.'",
		                    "model": "'.$model_name.'",
		                    "name": "Sum",
		                    "lang": "'.$lang.'"
		                }
		            ]
		        }
		    ]
		}');
		#dump($search_query_object, ' $search_query_object ++ '.to_string()); exit();
		#dump(null, ' search_query_object ++ '.json_encode($search_query_object, JSON_PRETTY_PRINT)); #exit(); // , JSON_UNESCAPED_UNICODE | JSON_HEX_APOS


		# Search records
		$search 		= search::get_instance($search_query_object);
		$search_result 	= $search->search();
		$ar_records 	= $search_result->ar_records;

		// Cast each value to int before summation; JSONB scalars arrive as strings.
		// Non-numeric strings safely become 0 via PHP's integer cast.
		$ar_values = [];
		foreach ($ar_records as $key => $row) {
			$value = $row->{$current_tipo};
			$ar_values[] = (int)$value;
		}

		$total = array_sum($ar_values);

		return $total;
	}//end get_sum_from_component_tipo



	/**
	* GET_VALUES_FROM_COMPONENT_TIPO
	* Return the raw component values for all records that match the user's active
	* search session SQO, optionally narrowed by an inline component_filter_data.
	*
	* Session SQO handling:
	*   If $_SESSION['dedalo']['config']['search_options'][$section_tipo] exists, its
	*   search_query_object is cloned and reused as the base filter so the result set
	*   mirrors what the user currently sees in the list. If absent, a minimal SQO
	*   with an empty filter is created (returns all records).
	*
	* The component column is added to the select array using search::get_query_path()
	* to construct the correct JSONB path descriptor. limit=0, offset=0, parsed=false
	* and full_count=false are always enforced so the result is a flat raw array.
	*
	* component_filter_data ($data->component_filter_data):
	*   Optional array of {component_tipo: q} maps that are merged into the SQO
	*   filter under a $and/$or structure. The merge strategy:
	*   - If the existing filter already has a $and root, new path-elements are appended.
	*   - Otherwise a new $and wrapper is built; any existing $or clause is nested inside.
	*
	* @param object $search_options Object with section_tipo and component_tipo.
	* @param object $data           Input config object; may carry component_filter_data array.
	* @return array $ar_values      Array of raw component values (one entry per matched record)
	*/
	public function get_values_from_component_tipo(object $search_options, object $data) : array {

		$current_section_tipo	= $search_options->section_tipo;
		$current_tipo			= $search_options->component_tipo;
		$lang					= ontology_node::get_translatable($current_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		// Base SQO: clone the active session SQO so the result set matches the list
		// the user is currently viewing. Fall back to an all-records SQO when no
		// session filter is active for this section.
		if(!isset($_SESSION['dedalo']['config']['search_options'][$current_section_tipo])) {

			#$q_op 	 = '$and';
			#$filter_obj = new stdClass();
				#$filter_obj->{$q_op} = [];

			$search_query_object = new stdClass();
				$search_query_object->id  	   		= 'new_temp';
				$search_query_object->section_tipo 	= $current_section_tipo;
				$search_query_object->filter  		= [];
				$search_query_object->select  		= [];

		}else{

			// Clone to avoid mutating the session-stored SQO when we append select/filter.
			$search_query_object = clone $_SESSION['dedalo']['config']['search_options'][$current_section_tipo]->search_query_object;
		}

		# Select
		// Build the path descriptor for the target component column and add it
		// to the select array. component_path carries the JSONB key chain inside
		// the matrix cell so the search layer extracts the correct leaf value.
		$select = [];
		$path   = search::get_query_path($current_tipo, $current_section_tipo, false);
		$element = new stdClass();
			$element->path = $path;
			$element->component_path = ["components",$current_tipo,"data",$lang];

		$select[] = $element;

		$search_query_object->select 	 = $select;
		$search_query_object->limit  	 = 0;
		$search_query_object->offset 	 = 0;
		$search_query_object->parsed 	 = false;
		$search_query_object->full_count = false;


		# Filter element optional
		// Merge additional component-level constraints from the IPO input config.
		// The merge must preserve the existing session filter structure:
		//   - If filter already has a $and root, simply append new path-elements.
		//   - If not, wrap everything in a fresh $and; any existing $or clause is
		//     nested inside so it behaves as one operand of the conjunction.
		if(isset($data->component_filter_data)) {

			$q_op 	 = '$and';
			$q_op_or = '$or';

			if (!empty($search_query_object->filter)) {

				// Deep-copy the current filter via JSON round-trip so the clone
				// is a plain-object tree (not a nested stdClass reference).
				$current_filter = json_decode(json_encode($search_query_object->filter));

				$filter_obj = new stdClass();
					$filter_obj->{$q_op} = [$current_filter];

				$search_query_object->filter = $filter_obj;
			}

			$component_filter_data = $data->component_filter_data;
			foreach ($component_filter_data as $search) {
				foreach ($search as $current_component_tipo => $q) {

					$path    = search::get_query_path($current_component_tipo, $current_section_tipo, false);
					$element = new stdClass();
						$element->path = $path;
						$element->q    = $q;

					if (isset($search_query_object->filter->{$q_op})) {
						// $and root already present; append the new element.
						$search_query_object->filter->{$q_op}[] = $element;
					}else{

						// No $and root yet; build one and nest any existing $or clause.
						$filter_element = new stdClass();
							$filter_element->{$q_op}[] = $element;

						$current_filter = json_decode(json_encode($search_query_object->filter));
						if (isset($current_filter->{$q_op_or}) && !empty($current_filter->{$q_op_or})) {
							$filter_element->{$q_op}[] = $current_filter;
						}

						$search_query_object->filter = $filter_element;
					}
				}
			}
		}
		#dump($search_query_object, ' search_query_object ++ '.to_string()); #exit();
		#dump(null, ' search_query_object ++ '.json_encode($search_query_object, JSON_PRETTY_PRINT)); exit();

		# Search records
		$search 		= search::get_instance($search_query_object);
		$search_result 	= $search->search();
		$ar_records 	= $search_result->ar_records;


		$ar_values = [];
		foreach ($ar_records as $key => $row) {

			$component_data = $row->{$current_tipo};

			$ar_values[] = $component_data;
		}


		return $ar_values;
	}//end get_values_from_component_tipo



	/**
	* RESOLVE_LOGIC
	* Load an external PHP file confined to DEDALO_WIDGETS_PATH and invoke a named
	* function, passing the pre-resolved data as a single argument object.
	*
	* The $arg passed to the function is:
	*   (object)[
	*     'caller_section_tipo' => string,   // widget's own section_tipo
	*     'data'                => object,   // var_name-keyed data from resolve_data()
	*     'options'             => object    // process->options from the IPO config
	*   ]
	*
	* Security (SEC-052) — two-layer defence in depth:
	*   Layer 1 (path confinement): realpath() resolves symlinks; strncmp against
	*     widgets_root prevents directory traversal (e.g. "../../etc/passwd").
	*     Returns null and logs ERROR if the resolved path escapes the root.
	*   Layer 2 (function confinement): $fn is validated as a bare identifier
	*     ([a-zA-Z_][a-zA-Z0-9_]{0,63}) before include, then ReflectionFunction
	*     checks that the function was defined in a file inside the widgets root
	*     AFTER include, ensuring a pre-existing global function with the same
	*     name cannot be called even if the regex passes.
	*
	* Currently only 'php' engine is implemented; the switch is in place to allow
	* future engines (e.g. WASM, sandbox) without changing the call site.
	*
	* @param object    $process Object with engine (string), file (string, relative to
	*                           DEDALO_WIDGETS_PATH), fn (string), options (object).
	* @param object    $data    Pre-resolved data object keyed by var_name.
	* @return mixed|null        Return value of the invoked function, or null on refusal
	*/
	private function resolve_logic(object $process, $data) {

		// path to the file with the functions, defined in structure
		$file 	= DEDALO_WIDGETS_PATH . $process->file;
		// function name, defined in structure
		$fn		= $process->fn;
		// Merge the IPO process options and the pre-resolved data into a single
		// argument object so that processing functions have a uniform call signature.
		$arg 	= (object)[
			'caller_section_tipo'	=> $this->section_tipo,
			'data'					=> $data,
			'options'				=> $process->options ?? new stdClass()
		];

		// SEC-052: `$process` is sourced from the ontology (admin/developer
		// writable). Without confinement a hostile ontology entry could
		// `include_once` any PHP file on disk and invoke any global
		// function. Confine the include to DEDALO_WIDGETS_PATH and require
		// `$fn` to be a bare identifier resolved from the included file
		// (no builtins, no namespaced calls, no variable/class-method syntax).
			$widgets_root = realpath(DEDALO_WIDGETS_PATH);
			$real_file    = realpath($file);
			if ($widgets_root === false || $real_file === false
				|| strncmp($real_file, $widgets_root . DIRECTORY_SEPARATOR, strlen($widgets_root) + 1) !== 0) {
				debug_log(__METHOD__
					. ' SEC-052 refused calculation file outside DEDALO_WIDGETS_PATH.' . PHP_EOL
					. ' file: ' . to_string($file)
					, logger::ERROR
				);
				return null;
			}
			// Validate $fn as a plain PHP identifier (no namespaces, no static/instance
			// method syntax, no built-in names that could execute arbitrary code).
			if (!is_string($fn) || !preg_match('/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/', $fn)) {
				debug_log(__METHOD__
					. ' SEC-052 refused calculation fn (not a bare identifier): ' . to_string($fn)
					, logger::ERROR
				);
				return null;
			}

		switch ($process->engine) {
			case 'php':
			default:

				// require load the file with the functions in the path
					include_once($real_file);
				// execute the function in the $file (as summarize in formulas.php)
					if(!function_exists($fn)){
						return null;
					}
					// SEC-052: after include, confirm the function was
					// actually declared in the ontology-pointed file (not
					// some pre-existing global) by comparing its reflected
					// source with the confined widgets root.
					try {
						$fn_ref = new ReflectionFunction($fn);
						$fn_file = $fn_ref->getFileName();
						if ($fn_file === false
							|| strncmp($fn_file, $widgets_root . DIRECTORY_SEPARATOR, strlen($widgets_root) + 1) !== 0) {
							debug_log(__METHOD__
								. ' SEC-052 refused calculation fn defined outside DEDALO_WIDGETS_PATH.' . PHP_EOL
								. ' fn: ' . to_string($fn) . ' fn_file: ' . to_string($fn_file)
								, logger::ERROR
							);
							return null;
						}
					} catch (Throwable $e) {
						debug_log(__METHOD__
							. ' SEC-052 ReflectionFunction failed: ' . $e->getMessage()
							, logger::ERROR
						);
						return null;
					}
					$result = $fn($arg);

				break;
		}//end switch ($process->engine)


		return $result;
	}//end resolve_logic



}//end class calculation
