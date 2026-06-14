<?php declare(strict_types=1);
/**
* COMPONENT_EXTERNAL — JSON CONTROLLER
* Included-file controller that builds the JSON context+data response for a
* component_external instance. Executed via common::get_json() inside the
* calling object scope ($this = component_external).
*
* Responsibilities:
* - Guard against direct HTTP access (SEC-026 §9.3).
* - Resolve the ontology structure context when the caller requests it
*   ($options->get_context), choosing between the full context and the
*   lightweight 'simple' variant used by list/portal views.
* - Resolve the component data for the current render mode by fetching it
*   from a configured remote API (e.g. ZENON, library catalogs):
*     'list' / 'tm' — get_list_value() returns a compact representation
*                     suitable for read-only table cells and Time Machine diff
*                     views (delegates to get_data_lang() internally).
*     'edit' (default) — get_data_lang() returns the full fetched-and-mapped
*                     value array for the current language.
*   NOTE: unlike most components, the "stored" data here is synthesised on
*   every request from a remote API call (load_data_from_remote()). The
*   matrix row is never written to directly; set_data() on component_external
*   would persist to the 'misc' column, but that is not the normal path.
* - Return the assembled {context: array, data: array} object via
*   common::build_element_json_output().
*
* Execution context:
*   This file is NOT a class or function — it is an include-script evaluated
*   inside component_external::get_json() (inherited from component_common
*   via common). The variables $this (component_external), $options (stdClass
*   with boolean flags), and SHOW_DEBUG (compile-time constant) are injected
*   by the caller; no explicit argument passing is needed.
*
*   $options shape (set by common::get_json before the include):
*     - get_context       bool   whether to build the ontology structure context
*     - context_type      string 'simple' | 'default'
*     - get_data          bool   whether to resolve and return data entries
*     - get_request_config bool  (unused by this controller)
*
* Data shape produced (one item in $data):
*   {
*     section_id         : string,
*     section_tipo       : string,
*     tipo               : string,
*     mode               : string,
*     lang               : string,
*     from_component_tipo: string,
*     entries            : array|null   // mapped remote values, or null when
*                                       // the remote is unavailable or the
*                                       // fields_map has no 'dato' entry
*   }
*
* The entries array contains the value(s) extracted from the remote API
* response according to the component's ontology fields_map. When the remote
* host is down or the entity is flagged unavailable in $_SESSION, entries is
* null and the caller renders an empty / placeholder display.
*
* Called by:
*   common::get_json()  →  includes this file  →  returns result
*
* @see class.component_external.php
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
/** @var component_external $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$this->context = $this->get_structure_context($permissions);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		$start_time=start_time();

		// value
			switch ($mode) {

				case 'list':
				case 'tm':
					$value = $this->get_list_value();
					break;

				case 'edit':
				default:
					$value = $this->get_data_lang();
					break;
			}

		// data item
			$item = $this->get_data_item($value);

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
