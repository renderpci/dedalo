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
	$mode			= $this->get_mode();
	$permissions	= $this->get_section_permissions();

	$context	= [];
	$data		= [];

	if($permissions>0){

		// Context

		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_rqo
		);
		$context[] = $this->context;

		// Data

		$value = $this->section_records;

		// subdata add
		$subdatum_options = (object)[
			'skip_subdatum' => ['component_portal']
		];
		$subdatum = $this->get_subdatum($tipo, $value, $subdatum_options);

		$ar_subcontext = $subdatum->context;
		foreach ($ar_subcontext as $current_context) {
			$context[] = $current_context;
		}

		$ar_subdata	= $subdatum->data;
		foreach ($ar_subdata as $sub_value) {
			$data[] = $sub_value;
		}

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
