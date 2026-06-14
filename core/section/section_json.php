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
		// Note: a 'skip_subdatum' option was passed here historically but was never
		// implemented by get_subdatum; removed to avoid a false affordance.
		$subdatum = $this->get_subdatum($tipo, $value);

		// subcontext add. get_subdatum already dedups internally; guard here against
		// items colliding with the already-added section context (tipo+section_tipo+mode)
		$context = common::merge_unique_context($context, $subdatum->context);

		$ar_subdata	= $subdatum->data;
		foreach ($ar_subdata as $sub_value) {
			$data[] = $sub_value;
		}

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
