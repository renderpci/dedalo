<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }



// configuration vars
	$tipo			= $this->tipo;
	$section_tipo	= $this->section_tipo;
	$section_id		= $this->section_id;
	$mode			= $this->mode;
	$sqo			= $this->sqo;
	$count			= $this->count;
	$permissions	= common::get_permissions($section_tipo, $tipo);
	$file_name		= $mode;

// default value empty
	$json = common::build_element_json_output([], []);

// calculated value based on permissions and mode
	if($permissions>0) {

		switch($mode) {

			case 'edit':
				$ar_inverse_references 	= $this->get_inverse_references($sqo);

				// note that result is already an object with properties context and data
				$json = ($count===true)
					? $ar_inverse_references
					: $this->get_relation_list_obj($ar_inverse_references);
				break;
		}
	}

return $json;
