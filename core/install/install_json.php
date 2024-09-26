<?php
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= 1;
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context(
				$permissions,
				false // bool add_rqo
			);
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		$value = new stdClass();

		// data item
			$item  = $this->get_data_item($value);

		$data[] = $item;
	}//end if $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);
