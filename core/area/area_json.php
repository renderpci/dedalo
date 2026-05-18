<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();
	$properties		= $this->get_properties() ?? new stdClass();



// context
	$context = [];
	if($options->get_context===true) {

		// set self from_parent
			$this->from_parent = $tipo;

		// Component structure context (tipo, relations, properties, etc.)
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
			$item->dashboard = $this->get_dashboard_data($ar_metric_names);
		}

		$data[] = $item;

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
