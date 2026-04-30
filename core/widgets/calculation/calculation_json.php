<?php
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
// JSON data component controller


// component configuration vars
	$permissions		= $this->get_component_permissions();
	$mode				= $this->get_mode();


// context
	$context = [];

	if($options->get_context===true && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				$context[] = $this->get_structure_context($permissions);
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Value
		switch ($mode) {

			case 'list':
				$value 	= $this->get_valor();
				break;

			case 'edit':
			default:
				$value 	= $this->get_data();
				break;
		}

		// data item
		$item  = $this->get_data_item($value);

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)


// JSON string
	return common::build_element_json_output($context, $data);
