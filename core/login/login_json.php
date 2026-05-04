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
	$permissions	= 1;
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context(
				$permissions,
				false // bool add_rqo
			);

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		$value = new stdClass();
			// $value->dedalo_application_langs = DEDALO_APPLICATION_LANGS;

		// data item
			$item  = $this->get_data_item($value);

		$data[] = $item;

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
