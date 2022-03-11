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
			// Note that 'tab' ontology items are mapped as 'section_tab' to reduce polution
			// Now, set context specific params to each one
			$real_model	= RecordObj_dd::get_real_model_name_by_tipo($tipo);
			if ($real_model==='tab') {

				// view (tab)
					$current_context->view = 'tab';

			}else{

				// view (section_tab)
					$current_context->view = 'section_tab';

				// children
					$current_context->children = [];
					$RecordObj_dd	= new RecordObj_dd($tipo);
					$children_tipo	= $RecordObj_dd->get_ar_childrens_of_this();
					foreach ($children_tipo as $child_tipo) {
						$current_context->children[] = (object)[
							'tipo'	=> $child_tipo,
							'label'	=> RecordObj_dd::get_termino_by_tipo($child_tipo)
						];
					}
			}

			$context[] = $current_context;
		}//end if($options->get_context===true)

// data
	$data = [];

// JSON string
	return common::build_element_json_output($context, $data);