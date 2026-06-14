<?php declare(strict_types=1);
/**
* COMPONENT_NUMBER — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_number instance. Executed via common::get_json() inside the
* calling object scope ($this = component_number).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context (tools +
*   buttons) and the lightweight 'simple' variant used by list/portal views.
*   When has_dataframe is true the second argument ($has_dataframe / add_request_config)
*   ensures the dataframe's request_config object is embedded in the context
*   payload so the client can build the inline dataframe RQO without an extra
*   round-trip.
* - Resolve component numeric data for the current mode:
*     'list' / 'tm' — get_list_value() returns a flat representation suitable
*                     for read-only table cells and Time Machine diff views.
*     'edit' (default) — get_data_lang() returns the full array of stored
*                     value items (each a {id, value} object) for the current
*                     lang (always DEDALO_DATA_NOLAN; component_number is
*                     non-translatable).
* - Delegate dataframe subdatum resolution to the shared trait helper
*   (build_dataframe_subdatum), merging any produced context and data entries
*   into the controller's own arrays so the client receives everything in a
*   single payload.
* - Attach parent_tipo and parent_section_id to the data item (used by the
*   client to navigate edit context), plus a row counter when a dataframe is
*   present so the client can render a provisional blank row for new entries.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is not a class or function — it is an include-script evaluated
*   inside component_number::get_json() (inherited from component_common). The
*   variables $this (component_number), $options (request options object), and
*   SHOW_DEBUG (global constant) are injected by the caller.
*
* Data shape produced (one item in $data):
*   {
*     section_id, section_tipo, tipo, mode, lang,
*     from_component_tipo,
*     entries: [{ id: int, value: int|float }, …],
*     parent_tipo: string,
*     parent_section_id: string,
*     counter?: int   // only when has_dataframe is true
*   }
*
* The entries array mirrors the stored v7 value objects. Numeric values are
* always stored and transmitted with '.' as the decimal separator; display
* formatting (e.g. comma-decimals for European locales) is applied only in the
* render/view layer, never persisted or transmitted in this payload.
*
* @package Dédalo
* @subpackage Core
*/
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_number $this */
// JSON data component controller



// component configuration vars
// Snapshot the three request-scoped config values once so they are not
// re-fetched from the object on every use below.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();
	// has_dataframe flag
	// When true, build_dataframe_subdatum() is called during data resolution to
	// produce subdatum rows and attach a counter to the data item, allowing the
	// client to render additional blank rows for inline dataframe editing.
	// The flag also signals get_structure_context*() to embed the dataframe's
	// request_config in the context payload (add_request_config = true).
	$has_dataframe	= isset($properties->has_dataframe) && $properties->has_dataframe===true;



// context
// Accumulates dd_object entries that describe the ontology structure of this
// component. Normally contains exactly one entry; skipped entirely when
// $options->get_context is false (e.g. data-only requests).
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: skips tools and buttons.
				// Used by list/tm views and portal wrappers that only need the
				// ontology structure (tipo, relations, properties) without the
				// full tool/button tree.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple(
					$permissions,
					$has_dataframe // bool add_request_config (dataframe ddo must reach the client RQO)
				);
				break;

			default:
				// Full context: includes tools and buttons for edit/search views.
				// add_request_config ($has_dataframe) ensures the dataframe's own
				// request_config is embedded so the client can build the inline
				// dataframe RQO without an extra round-trip.
				// Component structure context (tipo, relations, properties, etc.)
					$this->context = $this->get_structure_context(
						$permissions,
						$has_dataframe // bool add_request_config (dataframe ddo must reach the client RQO)
					);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) for this component. Normally one entry for
// the component itself, plus zero-or-more dataframe subdatum entries when
// has_dataframe is true. Skipped entirely when permissions = 0 (read-denied).
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
		// Resolve the stored numeric value for the active render mode.
		// component_number is non-translatable, so both branches ultimately
		// read from DEDALO_DATA_NOLAN; the switch is retained for structural
		// parity with other JSON controllers and to allow future mode-specific
		// handling (e.g. a condensed list format).
			switch ($mode) {

				case 'list':
				case 'tm':
					// Read-only modes: get_list_value() returns a compact representation
					// suitable for table cells and Time Machine diff views.
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					// Edit mode: get_data_lang() returns the full array of {id, value}
					// objects stored under DEDALO_DATA_NOLAN, or null when no data
					// has been saved yet. The client iterates this array to render
					// one input per value entry.
					$value = $this->get_data_lang();
					break;
			}

		// dataframe. If it exists, calculate the subdatum (shared trait helper)
		// build_dataframe_subdatum() returns null when has_dataframe is false or
		// mode is 'search'. When non-null, its context entries (dataframe component
		// structures) and data entries (resolved subdatum rows) are merged into the
		// controller's own $context/$data arrays so the client receives everything
		// in a single payload.
			$dataframe_subdatum = $this->build_dataframe_subdatum($value, $mode);
			if ($dataframe_subdatum!==null) {
				foreach ($dataframe_subdatum->context as $current_context) {
					$context[] = $current_context;
				}
				foreach ($dataframe_subdatum->data as $sub_value) {
					$data[] = $sub_value;
				}
			}

		// data item
		// Wrap value + metadata in the standard data envelope used by all
		// components. The envelope includes section_id, section_tipo, tipo,
		// mode, lang, from_component_tipo, and the entries array.
		// parent_tipo / parent_section_id are set here (not inside get_data_item)
		// because they depend on the calling context, not just the component's
		// own identity — the client uses them to navigate back to the owning record.
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

			// counter. Used by edit views to build the provisional dataframe
			// render context (counter+1) for new blank rows
			if ($dataframe_subdatum!==null) {
				$item->counter = $dataframe_subdatum->counter;
			}

		// debug
		// Record elapsed time and increment the global data-call counter when
		// debug metrics are active. SHOW_DEBUG is a compile-time constant.
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
// Assemble the final response object {context: array, data: array} and return
// it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
