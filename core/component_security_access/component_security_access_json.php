<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_security_access $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		$add_rqo = isset($properties->unique) ? true : false;
		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple(
					$permissions,
					$add_rqo
				);
				break;

			default:

				// Component structure context (tipo, relations, properties, etc.)
					$this->context = $this->get_structure_context(
						$permissions,
						$add_rqo
					);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		$user_id = logged_user_id();

		// value
			switch ($mode) {
				case 'list':
				case 'tm':
					$value		= $this->get_list_value();
					break;

				case 'edit':
				default:
					$value			= $this->get_data_lang();
					$datalist		= $this->get_datalist($user_id);
					$changes_files	= hierarchy::get_simple_schema_changes_files();
					break;
			}
		// data item
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

			// datalist
			if (isset($datalist)) {
				$item->datalist = $datalist;
			}

			// changes_files
			if (isset($changes_files)) {
				$item->changes_files = $changes_files;
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
