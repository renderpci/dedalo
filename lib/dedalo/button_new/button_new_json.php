<?php
// JSON data component controller



// component configuration vars
	$tipo 				= $this->get_tipo();	
	$section_tipo 		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo, $tipo); 	
	$modo				= $this->get_modo();



// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);
	
	}//end if($options->get_context===true)



// context_simple
	if($options->get_context_simple===true){

		// Component structure context_simple (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context_simple($permissions);

	}//end if($options->get_context_simple===true)



// data
	$data = [];



// JSON string
	return common::build_element_json_output($context, $data);