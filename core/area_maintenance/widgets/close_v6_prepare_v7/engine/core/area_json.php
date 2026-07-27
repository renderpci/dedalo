<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/**
* JSON data controller for the 'area' model (area_json.php).
*
* Included by common::get_json() inside the calling object scope, so
* $this refers to the area instance. $options is the stdClass produced by
* common::get_json() from the caller's $request_options (flags: get_context,
* get_data, get_request_config).
*
* This controller is specific to the concrete 'area' model (dd25 and its
* siblings that use model='area'). Area subclasses that do not ship their own
* <class>_json.php fall back to area_common_json.php via the override in
* area_common::get_json().
*
* Response shape (returned to common::get_json as an object):
*   {
*     context: [ dd_object ]  — structural metadata for the client area builder
*     data:    [ item ]       — dashboard payload or [] when suppressed
*   }
*
* Data item shape:
*   {
*     tipo:         string        — area tipo (e.g. 'dd25')
*     section_tipo: string        — same as tipo (for areas, tipo === section_tipo)
*     section_id:   null          — areas have no section_id; null is intentional
*     dashboard?:   object        — omitted when dashboard.disabled === true in properties
*   }
*
* Dashboard can be suppressed or configured per-area via the ontology
* properties object:
*   { "dashboard": { "disabled": true } }
*   { "dashboard": { "metrics": ["total", "recent_7d"] } }
*
* @see area_common::get_json()        — fallback dispatcher for subclasses
* @see area_common::get_dashboard_data() — assembles the dashboard payload
* @see common::build_element_json_output() — wraps context+data into response
* @see common::get_json()             — caller; provides $this, $options scope
*
* @var area $this
*/



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();
	$properties		= $this->get_properties() ?? new stdClass();



// context
	$context = [];
	if($options->get_context===true) {

		// set self from_parent
		// Areas use their own tipo as the navigation parent so that the client
		// area builder can derive the correct ddo/sqo tree root.
			$this->from_parent = $tipo;

		// Component structure context (tipo, relations, properties, etc.)
		// add_rqo=true attaches the request_config (RQO) to the context, which
		// the client needs to resolve default filters and display options.
			$context[] = $this->get_structure_context(
				$permissions,
				true // add_rqo
			);
	}//end if($options->get_context===true)



// data
	$data = [];
	if($options->get_data===true && $permissions>0){

		// Dashboard payload (basic metrics by descendant section).
		// Opt-out per-area via ontology properties: { "dashboard": { "disabled": true } }
		// Custom metric list via:                   { "dashboard": { "metrics": ["total", ...] } }
		$ar_metric_names	= null;
		$dashboard_disabled	= false;
		if (isset($properties->dashboard) && is_object($properties->dashboard)) {
			$dashboard_disabled = ($properties->dashboard->disabled ?? false) === true;
			if (!empty($properties->dashboard->metrics) && is_array($properties->dashboard->metrics)) {
				$ar_metric_names = $properties->dashboard->metrics;
			}
		}

		$item = new stdClass();
			$item->tipo			= $tipo;
			$item->section_tipo	= $tipo; // areas: tipo === section_tipo
			$item->section_id	= null;

		if ($dashboard_disabled === false) {
			// get_dashboard_data() walks the ontology children, counts records per
			// section, and computes activity metrics. $ar_metric_names=null defaults
			// to ['total']; pass a custom list from properties to add extra metrics.
			$item->dashboard = $this->get_dashboard_data($ar_metric_names);
		}

		$data[] = $item;

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
