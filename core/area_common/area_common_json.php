<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by area_common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var area_common $this */
// Generic JSON controller for any area_* subclass that does not ship its own
// <class>_json.php. Provides:
//  - context: standard structure context (used by client area builder)
//  - data:    a single item carrying the dashboard payload (when permissions allow)



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();
	$properties		= $this->get_properties() ?? new stdClass();



// context
	$context = [];
	if ($options->get_context === true) {

		// set self from_parent
			$this->from_parent = $tipo;

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context(
				$permissions,
				true // add_rqo
			);
	}



// data
	$data = [];
	if ($options->get_data === true && $permissions > 0) {

		// metrics: read from ontology properties when defined, else default to ['total'].
		// This makes the dashboard extensible per-area without code changes:
		// add { "dashboard": { "metrics": ["total","by_year"] } } in the area ontology
		// properties and the matching `metric_<name>` method will be invoked.
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
			$item->section_tipo	= $tipo; // for areas tipo === section_tipo (see area_common::get_section_tipo)
			$item->section_id	= null;

		if ($dashboard_disabled === false) {
			$item->dashboard = $this->get_dashboard_data($ar_metric_names);
		}

		$data[] = $item;
	}



// JSON string
	return common::build_element_json_output($context, $data);
