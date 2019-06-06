<?php
// JSON data section_tab controller


// configuration vars
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo,$tipo);


// context
	$context = [];

		// Element structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);

// data
	$data = [];

// JSON string
	return common::build_element_json_output($context, $data);