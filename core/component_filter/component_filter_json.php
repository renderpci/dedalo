<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();


// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$item_context = $this->get_structure_context_simple($permissions);
				break;

			default:
				// item_context
					$item_context = $this->get_structure_context(
						$permissions,
						false // bool add_request_config
					);
				// target_sections add
					$target_sections = array_map(function($tipo) {
						return [
							'tipo'	=> $tipo,
							'label'	=> ontology_node::get_term_by_tipo($tipo, DEDALO_DATA_LANG, true, true)
						];
					}, $this->get_ar_target_section_tipo());
					$item_context->set_target_sections($target_sections);
				break;
		}

		$context[] = $item_context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
			switch ($mode) {

				case 'list':
				case 'tm':
					$value		= $this->get_list_value();
					break;

				case 'edit':
				default:
					$value		= $this->get_data_lang();
					$datalist	= $this->get_datalist();
					break;
			}

		// data item
			$item = $this->get_data_item($value);

			// datalist
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
