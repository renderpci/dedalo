<?php
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
				$item_context = $this->get_structure_context_simple($permissions, true);
				break;

			default:
				// item_context
					$item_context = $this->get_structure_context(
						$permissions,
						true // bool add_request_config
					);
				// target_sections add
					$target_sections		= [];
					$ar_target_section_tipo	= $this->get_ar_target_section_tipo();
					foreach ($ar_target_section_tipo as $current_section_tipo) {
						$current_section_tipo_permissions = common::get_permissions($current_section_tipo, $current_section_tipo);
						if ($current_section_tipo_permissions>0) {
							$target_sections[] = [
								'tipo'			=> $current_section_tipo,
								'label'			=> RecordObj_dd::get_termino_by_tipo($current_section_tipo, DEDALO_DATA_LANG, true, true),
								'permissions'	=> $current_section_tipo_permissions
							];
						}
					}
					$item_context->target_sections = $target_sections;
				break;
		}

		$context[] = $item_context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
			switch($mode) {

				case 'list':
				case 'tm':
					$value				= [ $this->get_value() ];
					break;

				case 'edit':
				default:
					$value				= $this->get_dato();
					$list_of_values		= $this->get_list_of_values(DEDALO_DATA_LANG);
					break;
			}

		// data item
			$item = $this->get_data_item($value);

			// datalist add if exits
			if (isset($list_of_values) && isset($list_of_values->result)) {
				$datalist = $list_of_values->result;

				$item->datalist = $datalist;
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
