<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by area_common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var area_common $this */
/**
* AREA_COMMON JSON CONTROLLER
* Generic JSON API response builder for any area_* subclass that does not ship
* its own <class>_json.php file.
*
* This file is NOT a class. It is included by area_common::get_json() using PHP's
* include() inside the calling object's scope, so all instance methods of the
* concrete area subclass are available through $this without argument passing.
* The caller (area_common::get_json) also sets up $options (stdClass with boolean
* flags: get_context, get_data) before the include.
*
* This fallback controller is selected only when the concrete area class (e.g.
* area_resource, area_admin) does NOT have a matching <class>_json.php alongside
* its class file. Subclasses that ship their own JSON controller — such as
* area_thesaurus or area_graph — bypass this file entirely via the file_exists()
* check in area_common::get_json().
*
* Execution flow:
*   1. Read the area tipo, permission level, render mode, and ontology properties
*      for the current area instance.
*   2. If $options->get_context is true, build the standard structure-context object
*      (tipo, relations, properties, ddo, rqo) via get_structure_context(). Sets
*      from_parent = $tipo so the context builder treats the area as its own parent.
*   3. If $options->get_data is true AND the caller has non-zero read permissions,
*      build the data item carrying the dashboard payload:
*      a. Read optional dashboard configuration from ontology properties:
*         - properties->dashboard->disabled (bool)  — skips dashboard when true
*         - properties->dashboard->metrics (string[]) — metric names to include;
*           defaults to ['total'] when absent. Each name N dispatches to
*           area_common::metric_<N>($section_tipo).
*      b. Build an item stdClass with tipo, section_tipo (= tipo for areas), and
*         section_id (always null — areas have no row identity).
*      c. Attach the dashboard payload via area_common::get_dashboard_data().
*   4. Return the assembled {context, data} object via build_element_json_output().
*
* Dashboard payload structure (see area_common::get_dashboard_data()):
*   {
*     area_tipo    : "dd14",
*     area_label   : "Resources",
*     generated_at : 1731768000,
*     metrics      : ["total"],
*     sections     : [
*       { section_tipo: "rsc167", label: "Audiovisual", model: "section",
*         color: "#3b82f6", total: 4321, recent_7d: 7 },
*       ...
*     ],
*     activity_30d : { date_from: "…", date_to: "…", days: […], users: […],
*                      available_ranges: […] }
*   }
*
* Called by:
*   area_common::get_json()  →  include($fallback_path)  →  returns result
*
* @see class.area_common.php  area_common::get_json(), get_dashboard_data()
* @see class.common.php       common::build_element_json_output(), get_structure_context()
*/



// configuration vars
// Gather the three values used throughout this controller. $properties defaults
// to an empty stdClass so property-path reads (e.g. $properties->dashboard) are
// always safe without a prior isset() guard.
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();
	$properties		= $this->get_properties() ?? new stdClass();



// context
// Builds the structure-context object consumed by the client-side area builder
// to render the area's navigation chrome, DDO map, and search configuration.
	$context = [];
	if ($options->get_context === true) {

		// set self from_parent
		// Areas do not nest inside a different parent element, so the area's own
		// tipo serves as from_parent. This tells get_structure_context() to resolve
		// relations and DDO entries relative to the area itself.
			$this->from_parent = $tipo;

		// Component structure context (tipo, relations, properties, etc.)
		// add_rqo = true: include the request_query_object so the client can
		// reconstruct its default list query without a separate API call.
			$context[] = $this->get_structure_context(
				$permissions,
				true // add_rqo
			);
	}



// data
// The data array always contains exactly one item — the area's dashboard payload.
// It is skipped entirely when the caller has no read permissions (permissions === 0).
	$data = [];
	if ($options->get_data === true && $permissions > 0) {

		// metrics: read from ontology properties when defined, else default to ['total'].
		// This makes the dashboard extensible per-area without code changes:
		// add { "dashboard": { "metrics": ["total","by_year"] } } in the area ontology
		// properties and the matching `metric_<name>` method will be invoked.
		//
		// Two optional keys are read from properties->dashboard:
		//   - disabled (bool)    : set true to suppress the dashboard entirely (useful
		//                          for areas that render custom client-side content).
		//   - metrics (string[]) : ordered list of metric names; each name N must
		//                          correspond to a method `metric_<N>` on area_common
		//                          or the concrete subclass.
		$ar_metric_names	= null;
		$dashboard_disabled	= false;
		if (isset($properties->dashboard) && is_object($properties->dashboard)) {
			$dashboard_disabled = ($properties->dashboard->disabled ?? false) === true;
			if (!empty($properties->dashboard->metrics) && is_array($properties->dashboard->metrics)) {
				$ar_metric_names = $properties->dashboard->metrics;
			}
		}

		// item stub
		// section_tipo mirrors tipo because areas act as their own section context
		// (see area_common::get_section_tipo()). section_id is always null — areas
		// are not individual database rows; they represent the collection as a whole.
		$item = new stdClass();
			$item->tipo			= $tipo;
			$item->section_tipo	= $tipo; // for areas tipo === section_tipo (see area_common::get_section_tipo)
			$item->section_id	= null;

		// dashboard payload
		// Skipped when explicitly disabled in ontology properties to allow areas
		// that provide their own client-rendered content to opt out without a
		// code change.
		if ($dashboard_disabled === false) {
			$item->dashboard = $this->get_dashboard_data($ar_metric_names);
		}

		$data[] = $item;
	}



// JSON string
// Encodes {context, data} as a JSON string and wraps it in the standard
// Dédalo API envelope. The return value is the include() result consumed
// by area_common::get_json().
	return common::build_element_json_output($context, $data);
