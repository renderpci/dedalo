<?php
// JSON data controller



// configuration vars
	$tipo				= $this->get_tipo();
	$permissions		= common::get_permissions($tipo, $tipo);
	$modo				= $this->get_modo();



// context
	$context = [];


	if($options->get_context===true  && $permissions>0){

		// Component structure context (tipo, relations, properties, etc.)
			$context = $this->get_context();

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// subdata
			$data = $this->get_ar_subdata();

	}// end if $permissions > 0


	
// JSON string
	return common::build_element_json_output($context, $data);
