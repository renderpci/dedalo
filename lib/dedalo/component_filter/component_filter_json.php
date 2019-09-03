<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();



// context
	$context = [];

	if($options->get_context===true){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;
			
			default:
				$context[] = $this->get_structure_context($permissions);
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// Value
		switch ($modo) {
			case 'list':
				$value = $this->get_valor(null,'array');
				break;			
			case 'edit':
			default:
				$value = $this->get_dato();
				$ar_projects_for_current_section = $this->get_ar_projects_for_current_section();
				break;
		}

		// data item
		$item  = $this->get_data_item($value);

		// datalist
		if (isset($ar_projects_for_current_section)) {

			$item->datalist = [];
			foreach ($ar_projects_for_current_section as $user_project) {

				$project_value = new stdClass();
					$project_value->section_id 		= $user_project->locator->section_id;
					$project_value->section_tipo 	= $user_project->locator->section_tipo;

				$project = new stdClass();
					$project->value 				= $project_value;
					$project->label 				= $user_project->label;
					$project->section_id 			= $user_project->locator->section_id;

				$item->datalist[] = $project;
			}
		}

		$data[] = $item;

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);