<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();
	$section_tipo 		= $this->section_tipo;
	$lang 				= $this->lang;
	$tipo 				= $this->get_tipo();



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

	if($options->get_data===true && $permissions>0){

		$dato = $this->get_dato();

		// Value
		$value = [];
		foreach ($dato as $dato_item) {			
			$dato_item->model = RecordObj_dd::get_modelo_name_by_tipo($item->tipo,true);
			$value[] = $dato_item;
		}
						
		// data item
		$item  = $this->get_data_item($value);

		$data[] = $item;
			
	}//end if $options->get_data===true && $permissions>0



// JSON string
	return common::build_element_json_output($context, $data);