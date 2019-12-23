<?php
// JSON data for section_group_div controller


// configuration vars
	// section_group_div don't has permisions, it's only a <div> element container for create group boxes in the dom
	// it used only for order and possition the components inside it
	$permissions		= 1;


// context
	$context = [];

		// Element structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);

// data
	$data = [];


// JSON string
	return common::build_element_json_output($context, $data);