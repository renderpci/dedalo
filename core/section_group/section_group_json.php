<?php
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
// JSON data for section_group controller



// configuration vars
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo,$tipo);


// context
	$context = [];

	if($options->get_context===true && $permissions>0){

		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$current_context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Element structure context (tipo, relations, properties, etc.)
				$current_context = $this->get_structure_context($permissions);
				break;
		}

		// set add_label value based on former model (false for section_group_div)
		$legacy_model	= ontology_node::get_legacy_model_by_tipo($tipo);
		$no_label	= [
			'section_group_div'
		];
		$current_context->add_label = !in_array($legacy_model, $no_label);

		// add
		$context[] = $current_context;
	}//end if($options->get_context===true)



// data
	$data = [];


// JSON string
	return common::build_element_json_output($context, $data);
