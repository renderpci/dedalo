<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_radio_button $this */
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context = $this->get_structure_context_simple($permissions,true);
				break;

			default:
				// item_context
					$this->context = $this->get_structure_context(
						$permissions,
						true // add_request_config
					);

				// target_sections add
					$target_sections = array_map(function($tipo) {
						return [
							'tipo'	=> $tipo,
							'label'	=> ontology_node::get_term_by_tipo($tipo, DEDALO_DATA_LANG, true, true)
						];
					}, $this->get_ar_target_section_tipo());
					$this->context->set_target_sections($target_sections);
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
			switch($mode) {
				case 'list':
					$value = $this->get_list_value();
					break;
				case 'tm':
					if ( isset($this->caller_dataframe) ) {
						// inside dataframe case
						// dataframe needs the data and the datalist of the component when it's in tm mode to re-build his scenario
						$value		= $this->get_data_lang();
						$datalist	= $this->get_list_of_values(DEDALO_DATA_LANG)->result ?? [];
					}else{
						// regular time machine data case
						$value = $this->get_list_value();
					}
					break;
				case 'edit':
				default:
					$value		= $this->get_data_lang();
					$datalist	= $this->get_list_of_values(DEDALO_DATA_LANG)->result ?? [];
					break;
			}

		// data item
			$item = $this->get_data_item($value);

			// datalist add if exits
			if (isset($datalist)) {
				$item->datalist = $datalist;
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
