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

		// subcontext from element layout_map items
			$ar_subcontext = $this->get_ar_widgets();
			foreach ($ar_subcontext as $current_context) {
				$context[] = $current_context;
			}

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// value
			$value = []; // $this->get_data_items();

		// subdata add
			 $data = $value;

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
