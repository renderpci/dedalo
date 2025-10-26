<?php
// JSON data section_tab controller


// configuration vars
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo, $tipo);


// context
	$context = [];

		if($options->get_context===true && $permissions>0) {

			// Element structure context (tipo, relations, properties, etc.)
				$current_context = $this->get_structure_context($permissions);

			// tab / section_tab specific
			// Note that 'tab' ontology items are mapped as 'section_tab' to reduce pollution
			// Now, set context specific params to each one
			$legacy_model	= ontology_node::get_legacy_model_by_tipo($tipo);
			if ($legacy_model==='tab') {

				// view (tab)
					$current_context->view = 'tab';

			}else{

				// view (section_tab)
					$current_context->view = 'section_tab';

				// children
					$current_context->children = [];
					$ontology_node	= ontology_node::get_instance($tipo);
					$children_tipo	= $ontology_node->get_ar_children_of_this();

					// get the valid tabs of the section
					$valid_tabs = section::get_ar_children_tipo_by_model_name_in_section(
						$section_tipo,
						['section_tab','tab'],
						true,
						true,
						true,
						true
					);

					foreach ($children_tipo as $child_tipo) {
						if(!in_array($child_tipo, $valid_tabs)){
							continue;
						}
						$current_context->children[] = (object)[
							'tipo'	=> $child_tipo,
							'label'	=> ontology_node::get_term_by_tipo($child_tipo, DEDALO_APPLICATION_LANG)
						];
					}
			}

			$context[] = $current_context;
		}//end if($options->get_context===true)

// data
	$data = [];

// JSON string
	return common::build_element_json_output($context, $data);