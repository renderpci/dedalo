<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$section_tipo	= $this->section_tipo;
	$lang			= $this->lang;
	$tipo			= $this->get_tipo();
	$properties		= $this->get_properties() ?? new stdClass();



// context
	$context = [];

	$this->context = $this->get_structure_context(
		$permissions,
		true // bool add_request_config
	);

	// properties : show_interface set as false to prevent + button creation in client
		$properties = $this->context->properties ?? new stdClass();
		$properties->show_interface = $properties->show_interface ?? new stdClass();
		$properties->show_interface->button_add = false;
		$this->context->properties = $properties;

	$context[] = $this->context;



// data
	$data = [];

	if($permissions>0) {

		$start_time=start_time();

		$data_value = $this->get_data_lang();

		if (!empty($data_value)) {

			$value		= $this->get_dato_paginated();
			$section_id	= $this->get_parent();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

			// data item
				$item = $this->get_data_item($value);
					$item->parent_tipo			= $tipo;
					$item->parent_section_id	= $section_id;
					// fix pagination vars
						$pagination = new stdClass();
							$pagination->total	= count($data_value);
							$pagination->limit	= $limit;
							$pagination->offset	= $offset;
					$item->pagination = $pagination;

				$data[] = $item;

			// subdatum
				$subdatum = $this->get_subdatum($tipo, $value);

				// add subcontext
				$ar_subcontext = $subdatum->context;
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}

				// add subdata
				$ar_subdata = $subdatum->data;
				if ($mode==='list' || $mode==='tm') {
					foreach ($ar_subdata as $current_data) {

						$current_data->parent_tipo			= $tipo;
						$current_data->parent_section_id	= $section_id;

						$data[] = $current_data;
					}
				}else{
					foreach ($ar_subdata as $current_data) {
						$data[] = $current_data;
					}
				}

			// errors. Add specific class static errors
				if (!empty(component_relation_parent::$errors)) {
					$item->errors = component_relation_parent::$errors;
				}
		}//end if (!empty($data_value))

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
