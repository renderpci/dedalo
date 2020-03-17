<?php
// JSON data controller



// configuration vars
	$tipo				= $this->get_tipo();
	$permissions		= common::get_permissions($tipo, $tipo);
	$modo				= $this->get_modo();



// context
	$context = [];


	if($options->get_context===true){

			$hierarchy_children_tipo = DEDALO_HIERARCHY_CHILDREN_TIPO;
			
		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions, $sqo_context=false);

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// hierarchy_sections - get the hierarchy configurationb nodes to build the root terms
			$terms_are_model = isset($this->build_options->terms_are_model) ? $this->build_options->terms_are_model : false;
			$hierarchy_sections = $this->get_hierarchy_sections(null,null,$terms_are_model); // $this->get_data_items();

		// typologies
			$ar_tipologies_section_id = [];
			$ar_typologies = [];
			foreach ($hierarchy_sections as $hierarchy_data) {
				if (!in_array($hierarchy_data->typology_section_id, $ar_tipologies_section_id)) {
					$ar_tipologies_section_id[] = $hierarchy_data->typology_section_id;
					$typology = new stdClass();
						$typology->section_id	= $hierarchy_data->typology_section_id;
						$typology->type			= 'typology';
						$typology->label 		= $this->get_typology_name($hierarchy_data->typology_section_id);
						$typology->order 		= $this->get_typology_order($hierarchy_data->typology_section_id);
					
					$ar_typologies[] = $typology;
				}
			}

			$value = array_merge($ar_typologies,$hierarchy_sections);

		$item = new stdClass();
			$item->tipo 				= $this->get_tipo();
			$item->value 				= $value;

	
		// subdata add
			 $data[] = $item;

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
