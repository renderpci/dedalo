<?php
// JSON data component controller


// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();


// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);

	}//end if($options->get_context===true)


// data
	$data = [];
	$value_data = [];

	if($options->get_data===true && $permissions>0){

		$ar_list_of_values	= $this->get_ar_list_of_values2();
		$dato 				= $this->get_dato();
		$tipo 				= $this->get_tipo();

		foreach ($ar_list_of_values->result as $key => $item) {

			$label   = (string)$item->label;
			$locator = (object)clone $item->value;

			if (!property_exists($locator, 'type')) {
				$locator->type = DEDALO_RELATION_TYPE_LINK;
			}
			if (!property_exists($locator, 'from_component_tipo')) {
				$locator->from_component_tipo = $tipo;
			}

			if (in_array($locator, $dato)) {	# dato is array always
				$checked = true;
			}else{
				$checked = false;
			}

			$list_item = new stdClass();
				$list_item->label 			= $label;
				$list_item->locator 		= $locator;
				$list_item->checked 		= $checked;

			$value_data[]= $list_item;
		}

		// Value
		$item = new stdClass();
			$item->section_id 			= $this->get_section_id();
			$item->tipo 				= $this->get_tipo();
			$item->from_component_tipo 	= isset($this->from_component_tipo) ? $this->from_component_tipo : $item->tipo;
			$item->section_tipo 		= $this->get_section_tipo();
			$item->value 				= $value_data; //$this->get_dato();

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)


// JSON string
	return common::build_element_json_output($context, $data);