<?php
// JSON data component controller

// context
	$context = [];

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context();

// data
	$data = [];

// JSON string
	return common::build_element_json_output($context, $data);