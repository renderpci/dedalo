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
				$this->context = $this->get_structure_context_simple($permissions, true);
				break;

			default:
				// this->context
					$this->context = $this->get_structure_context(
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
								'tipo'				=> $current_section_tipo,
								'label'				=> ontology_node::get_label_by_tipo($current_section_tipo, DEDALO_DATA_LANG, true, true),
								// section permissions, general access to the target section, it will be able to edit or not the section
								'permissions'		=> $current_section_tipo_permissions,
								// get permissions of the button new of the target section, it will be able to add or not new item in the target section.
								'permissions_new'	=> security::get_section_new_permissions( $current_section_tipo )
							];
						}
					}
					$this->context->target_sections = $target_sections;
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

		// add item to data
			$data[] = $item;

		// subdatum
		// subdatum is necessary only for components that has dataframe
			if ( !empty($value) && !empty($this->context->request_config) ) {
				$request_config = $this->context->request_config;
				$has_dataframe = array_find($request_config[0]->show->ddo_map, function( $item ){
					return $item->model === 'component_dataframe';
				});

				if(!empty($has_dataframe)){

					// subdatum
					$subdatum = $this->get_subdatum($this->tipo, $value);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
