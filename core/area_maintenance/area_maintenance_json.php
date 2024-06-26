<?php
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$mode			= $this->get_mode();



// context
	$context = [];


	if($options->get_context===true) {

		// set self from_parent
			$this->from_parent = $tipo;

		// Element structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context(
				$permissions,
				true // add_rqo
			);

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
			$value = [];

		// item value
			$item = $this->get_data_item($value);

		// datalist (list of widgets)
			$item->datalist	= $this->get_ar_widgets();

		// data add
			 $data[] = $item;

	}//end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
