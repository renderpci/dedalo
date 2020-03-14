<?php
// JSON data controller



// configuration vars
	$tipo				= $this->get_tipo();
	$permissions		= common::get_permissions($tipo, $tipo);
	$modo				= $this->get_modo();



// context
	$context = [];


	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions, $sqo_context=false);

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// value - get the hierarchy configurationb nodes to build the root terms
			$value = $this->get_hierarchy_sections();; // $this->get_data_items();

		$item = new stdClass();
			$item->tipo 				= $this->get_tipo();
			$item->value 				= $value;

	
		// subdata add
			 $data[] = $item;

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
