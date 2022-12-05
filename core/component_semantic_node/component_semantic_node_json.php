<?php
// JSON data component controller


// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$section_tipo 	= $this->section_tipo;
	$lang 			= $this->lang;
	$tipo 			= $this->get_tipo();
	$properties 	= $this->get_properties() ?? new stdClass();


// data
	$context	= [];
	$data		= [];

	// context
		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_request_config
		);
		$context[] = $this->context;

	if($permissions>0) {

		$dato 			= $this->get_dato() ?? [];
		$row_locator 	= $this->row_locator;


		$value		= $this->get_dato_paginated();
		$section_id	= $this->get_parent();
		$limit		= $this->pagination->limit;
		$offset		= $this->pagination->offset;

		// data item
			$item = $this->get_data_item($value);
				// $item->parent_tipo			= $tipo;
				// $item->parent_section_id	= $section_id;
				$item->parent_section_tipo	= $this->get_parent_section_tipo();
				$item->parent_section_id	= $this->get_parent_section_id();

				// $item->from_component_tipo	= $tipo;
				$item->row_locator			= $row_locator;
				// fix pagination vars
					$pagination = new stdClass();
						$pagination->total	= count($dato);
						$pagination->limit	= $limit;
						$pagination->offset	= $offset;
				$item->pagination = $pagination;

			$data[] = $item;
		// subcontext data from layout_map items
		$subdatum = $this->get_subdatum($tipo, $value);

		$ar_subcontext	= $subdatum->context;
		foreach ($ar_subcontext as $current_context) {
			$context[] = $current_context;
		}

		$ar_subdata		= $subdatum->data;

		// subdata add
			if ($mode==='list') {
				foreach ($ar_subdata as $current_data) {

					$current_data->parent_tipo			= $tipo;
					$current_data->parent_section_id	= $section_id;

					$data[] = $current_data;
				}
			}else{
				foreach ($ar_subdata as $current_data) {
					$data[] =$current_data;
				}
			}


	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
