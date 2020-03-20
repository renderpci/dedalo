<?php
// JSON data controller



// configuration vars
	$tipo				= $this->get_tipo();
	$permissions		= common::get_permissions($tipo, $tipo);
	$modo				= $this->get_modo();
	$search_action 		= $this->search_action;


// context
	$context = [];


	if($options->get_context===true){
			
		// Component structure context (tipo, relations, properties, etc.)
			$current_context = $this->get_structure_context($permissions, $sqo_context=true);

		// section_tipo. Adaptation of the context with the specific ddo and sqo for used them into the filter.
		// set the section_tipo with the area_tipo, it will be used to store presets of the search (area_tipo will use as section_tipo)
			$current_context->section_tipo = $tipo;
		
	
		$context[] = $current_context;
		
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

		// search_action			
			if (!empty($search_action) && $search_action->action==='search') {
				// search rows
				$result = $this->search_thesaurus( $search_action->search_query_object );				
				$item->ts_search = $result;	
			}
		

		// subdata add
			$data[] = $item;
			
	}// end if $permissions > 0
	
	


// JSON string
	return common::build_element_json_output($context, $data);
