<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_password $this */
// JSON data component controller
//
// Builds the JSON API response for component_password. This file is
// included by common::get_json() and executes within the component_password
// instance scope ($this). The response follows the standard
// {context:[], data:[]} envelope produced by
// common::build_element_json_output().
//
// Security contract — real password data NEVER leaves the server through
// this controller:
//   - The stored Argon2id hash is read from the database via get_data(),
//     but only its 'id' field is preserved in $value (to allow saves back
//     to the same DB row).
//   - The 'value' field in the API response is always replaced with
//     component_password::$fake_value ('****************').
//   - The permission guard ($permissions > 0) is still applied so
//     unprivileged callers receive an empty $data array.
//
// @see component_password::$fake_value
// @see component_password::set_data()
// @see common::build_element_json_output()



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$this->context = $this->get_structure_context($permissions);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// internal data
		// get_data() returns the raw stored datum (Argon2id hash or legacy AES
		// blob). Only the 'id' field of the first element is carried forward so
		// the client can reference the correct DB row on a subsequent save.
		// The 'value' field is intentionally replaced with fake_value below.
		$internal_data = $this->get_data();

		// value - this value will not be sent to the front end in any case
		// SEC: the actual stored credential is discarded here. fake_value is
		// the sentinel string '****************' defined in component_password.
		// The 'id' from $internal_data[0] is retained so subsequent set_data()
		// calls can update the correct matrix row (null when no row exists yet).
		$value = [(object)[
			'id' => $internal_data[0]->id ?? null,
			'value' => $this->fake_value
		]];

		// data item
			$item = $this->get_data_item($value);

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
