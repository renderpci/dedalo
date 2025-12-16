<?php
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$mode			= $this->get_mode();
	$permissions	= $this->get_section_permissions();

	$context	= [];
	$data		= [];

	if($permissions>0){

		// Context

		$this->context = $this->get_structure_context(
			$permissions,
			true // bool add_rqo
		);
		$context[] = $this->context;

		// Data

		$value = $this->section_records;

		// subdata add
		$subdatum_options = (object)[
			'skip_subdatum' => ['component_portal']
		];
		$subdatum = $this->get_subdatum($tipo, $value, $subdatum_options);

		$ar_subcontext = $subdatum->context;
		foreach ($ar_subcontext as $current_context) {
			$context[] = $current_context;
		}

		$ar_subdata	= $subdatum->data;
		foreach ($ar_subdata as $sub_value) {
			$data[] = $sub_value;
		}

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
