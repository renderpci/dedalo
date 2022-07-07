<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
	$lang			= $this->get_lang();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$item_context = $this->get_structure_context_simple($permissions);
				break;

			default:
				$item_context = $this->get_structure_context(
					$permissions,
					false, // add_request_config
					$callback = function($dd_object) {
						// add target_sections to the context
						$dd_object->set_target_sections(
							array_map(function($tipo) {
								return [
									'tipo'	=> $tipo,
									'label'	=> RecordObj_dd::get_termino_by_tipo($tipo, DEDALO_DATA_LANG, true, true)
								];
							}, $this->get_ar_target_section_tipo())
						);
					}
				);
				break;
		}

		$context[] = $item_context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
			switch ($modo) {
				case 'list':
					$value				= $this->get_list_value();
					break;

				case 'edit':
				default:
					$value				= $this->get_dato();
					$ar_list_of_values	= $this->get_ar_list_of_values();
					break;
			}

		// data item
			$item = $this->get_data_item($value);

		// datalist add if exits
			if (isset($ar_list_of_values) && isset($ar_list_of_values->result)) {
				$datalist = $ar_list_of_values->result;
				usort($datalist, function($a, $b) {
					return strcmp($a->label, $b->label);
				});
				$item->datalist = $datalist;
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
