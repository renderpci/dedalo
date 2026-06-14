<?php declare(strict_types=1);
/**
* CALCULATION — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* calculation widget instance. Executed via common::get_json() inside the
* calling object scope ($this = calculation).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context and the
*   lightweight 'simple' variant used by list/portal views.
* - Resolve widget data for the current mode:
*     'list'  — get_valor() returns a flat representation for read-only cells.
*     'edit'  — get_data() executes the full IPO pipeline: resolve_data() fetches
*               component values for the configured scope (current / all /
*               search_session), resolve_logic() applies the external PHP
*               processing function, and the output map is iterated to produce
*               the returned data items.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Execution context:
*   This file is not a class or function — it is an include-script evaluated
*   inside calculation::get_json() (inherited from widget_common, which inherits
*   it from component_common). The variables $this (calculation), $options
*   (request options object) are injected by the caller.
*
* Data shape produced (one item per IPO entry in $data):
*   {
*     widget: "calculation",
*     key: int,       // IPO array index (0-based)
*     id: string,     // output item id from the IPO output map
*     value: mixed    // resolved and processed output value
*   }
*
* The number of items in $data depends on how many output entries the IPO
* configuration declares; a single IPO block may yield several distinct ids
* (e.g. 'total', 'label', 'extra'). All items from every IPO block are
* concatenated into a single flat $data array, differentiated by key+id.
*
* When permissions = 0 or $options->get_data is false, $data is returned empty.
* Context follows the same guard ($options->get_context and permissions > 0).
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
/** @var calculation $this */
// JSON data component controller


// component configuration vars
// Snapshot the two request-scoped config values once so they are not
// re-fetched from the object on every use below.
	$permissions		= $this->get_component_permissions();
	$mode				= $this->get_mode();


// context
// Accumulates dd_object entries that describe the ontology structure of this
// widget. Normally contains exactly one entry; skipped entirely when
// $options->get_context is false or permissions = 0 (no read access).
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: skips tools and buttons.
				// Used by list views and portal wrappers that only need the
				// ontology structure (tipo, relations, properties) without the
				// full tool/button tree.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools and buttons for edit/search views.
				// Component structure context (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context($permissions);
				break;
		}
	}//end if($options->get_context===true)



// data
// Accumulates the data item(s) produced by the IPO pipeline. The widget
// may produce multiple output items per IPO block (keyed by output map id).
// Skipped entirely when permissions = 0 (read-denied) or get_data is false.
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Value
		// Resolve widget output for the active render mode.
		// 'list' calls get_valor() for a compact, read-only representation
		// suitable for table cells (bypasses the full IPO pipeline).
		// 'edit' (and any other mode) calls get_data(), which runs the complete
		// IPO pipeline: resolve_data() → resolve_logic() → output map iteration.
		switch ($mode) {

			case 'list':
				$value 	= $this->get_valor();
				break;

			case 'edit':
			default:
				$value 	= $this->get_data();
				break;
		}

		// data item
		// Wrap the resolved value array in the standard data envelope.
		// get_data_item() copies section_id, section_tipo, tipo, mode, lang and
		// the output value into a stdClass. When $value is null (e.g. the IPO
		// config is missing or all processes returned null) the item is still
		// added so the client receives a consistent envelope.
		$item  = $this->get_data_item($value);

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)


// JSON string
// Assemble the final response object {context: array, data: array} and return
// it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
