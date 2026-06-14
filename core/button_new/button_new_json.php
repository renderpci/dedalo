<?php declare(strict_types=1);
/**
* BUTTON_NEW — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* button_new instance. Executed via common::get_json() inside the calling
* object scope ($this = button_new).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve and return the ontology structure context when the caller requests
*   it ($options->get_context), choosing between the full context and the
*   lightweight 'simple' variant used by list/portal views.
* - Return an empty data array: button_new is a pure UI action trigger with no
*   storable data of its own. Its HTML representation is served by a separate
*   PHP controller (button_delete.php), not this file.
* - Return a stdClass {context: array, data: array} via
*   common::build_element_json_output().
*
* Why context but no data:
*   button_new does not store or read values from the matrix. Its sole purpose
*   is to expose the "create a new record" action to the client, so the JSON
*   payload only carries the ontology structure (tipo, relations, properties,
*   permissions bitmask). The client uses the context to decide whether to
*   render the button at all (permissions > 0) and to supply request options
*   for the subsequent section_new API call. $data is always empty.
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside button_new::get_json() (inherited from button_common via common).
*   The variables $this (button_new), $options (stdClass), and SHOW_DEBUG
*   (compile-time constant) are injected by the caller via common::get_json();
*   no explicit argument passing is needed.
*
*   $options shape (populated by common::get_json() before the include):
*     - get_context    bool   whether to build the ontology structure context
*     - context_type   string 'simple' | 'default'
*     - get_data       bool   whether to resolve and return data entries
*                             (always produces an empty array for button_new)
*
* Data shape produced:
*   { context: [dd_object], data: [] }
*   The data array is always empty. The context array contains exactly one
*   dd_object whose permissions field reflects the caller's right to create
*   new records in the owning section (0 = denied, 1–3 = allowed with
*   increasing privilege).
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.button_new.php
* @see class.button_common.php
* @see class.common.php  common::get_json(), common::build_element_json_output()
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
/** @var button_new $this */
// JSON data component controller



// component configuration vars
// (!) $tipo, $section_tipo, and $mode are resolved here for structural
// parity with other JSON controllers and to allow future mode-specific
// handling. They are not consumed in the data block because button_new
// has no data to resolve.
	$tipo 				= $this->get_tipo();
	$section_tipo 		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo, $tipo);
	$mode				= $this->get_mode();



// context
// Accumulates dd_object entries describing this button's ontology structure.
// Normally contains exactly one entry; skipped entirely when
// $options->get_context is false (data-only requests).
	$context = [];

	if($options->get_context===true){
		switch ($options->context_type) {
			case 'simple':
				// Lightweight context variant: skips tools and nested buttons.
				// Used by list/portal wrappers that only need the ontology
				// structure (tipo, relations, properties, permissions) without
				// the full tool/button tree.
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Full context: includes tools and buttons for edit/search views.
				$context[] = $this->get_structure_context($permissions);
				break;
		}
	}//end if($options->get_context===true)




// data
// button_new carries no storable data; $data is always empty.
// The client obtains action authority from the permissions field in $context.
	$data = [];



// JSON string
// Assemble the final response object {context: array, data: array} and return
// it to common::get_json(), which serialises it for the API caller.
	return common::build_element_json_output($context, $data);
