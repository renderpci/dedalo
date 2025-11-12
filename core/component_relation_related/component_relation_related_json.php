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


	// if($options->get_context===true && $permissions>0){
	// 	switch ($options->context_type) {
	// 		case 'simple':
	// 			// Component structure context_simple (tipo, relations, properties, etc.)
	// 			$context[] = $this->get_structure_context_simple($permissions, $add_rqo=true);
	// 			break;

	// 		default:

	// 			// Component structure context (tipo, relations, properties, etc.)
	// 				$current_context = $this->get_structure_context($permissions, $add_rqo=true);

	// 				$context[] = $current_context;

	// 			// subcontext from element layout_map items (from_parent_tipo, parent_grouper)
					// $ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
	// 				foreach ($ar_subcontext as $current_context) {
	// 					$context[] = $current_context;
	// 				}
	// 			break;
	// 	}
	// }//end if($options->get_context===true)



// data
	$context	= [];
	$data		= [];

	// context
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


	if($permissions>0) {

		$start_time=start_time();

		// get the data into DDBB
			$data_value = $this->get_data_lang();

			$value		= $this->get_dato_paginated();
			$section_id	= $this->get_section_id();
			$limit		= $this->pagination->limit;
			$offset		= $this->pagination->offset;

		// data item
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $tipo;
				$item->parent_section_id	= $section_id;

		if (!empty($data_value)) {

			// pagination. Fix pagination vars
				$pagination = new stdClass();
					$pagination->total	= count($data_value);
					$pagination->limit	= $limit;
					$pagination->offset	= $offset;
				$item->pagination = $pagination;

			// data add
				$data[] = $item;

			// subdatum
				$subdatum = $this->get_subdatum($tipo, $value);

			// subcontext add
				$ar_subcontext	= $subdatum->context;
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}

			// subdata add
				$ar_subdata	= $subdatum->data;
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
		}//end if (!empty($data_value))


		// references
			// get the references calculated by relations with other sections. Return array
			if ($mode!=='search') {
				$references = $this->get_calculated_references();
				// references. Add to item if exists
				if (!empty($references)) {
					$item->references = $references;
				}
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}


		$data[] = $item;
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
