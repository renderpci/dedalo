<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_email $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();
	$has_dataframe	= isset($properties->has_dataframe) && $properties->has_dataframe===true;



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
					$context[] = $this->get_structure_context_simple(
						$permissions,
						$has_dataframe // bool add_request_config (dataframe ddo must reach the client RQO)
					);
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
					$context[] = $this->get_structure_context(
						$permissions,
						$has_dataframe // bool add_request_config (dataframe ddo must reach the client RQO)
					);

				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
			switch ($mode) {

				case 'list':
				case 'tm':
					$value = $this->get_list_value();
					break;

				default:
					$value = $this->get_data_lang();
					break;
			}

		// dataframe. If it exists, calculate the subdatum (shared trait helper)
			$dataframe_subdatum = $this->build_dataframe_subdatum($value, $mode);
			if ($dataframe_subdatum!==null) {
				foreach ($dataframe_subdatum->context as $current_context) {
					$context[] = $current_context;
				}
				foreach ($dataframe_subdatum->data as $sub_value) {
					$data[] = $sub_value;
				}
			}

		// data item
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

			// counter. Used by edit views to build the provisional dataframe
			// render context (counter+1) for new blank rows
			if ($dataframe_subdatum!==null) {
				$item->counter = $dataframe_subdatum->counter;
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
