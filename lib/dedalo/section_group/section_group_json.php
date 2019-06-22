<?php
// JSON data for section_group controller



// configuration vars
	$tipo				= $this->get_tipo();
	$section_tipo		= $this->get_section_tipo();
	$permissions		= common::get_permissions($section_tipo,$tipo);



// context
	$context = [];

		// Element structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);
			
		// subcontext from element layout_map items
			$ar_subcontext = $this->get_ar_subcontext();
			foreach ($ar_subcontext as $current_context) {
				if($current_context->tipo === 'oh15' || $current_context->tipo === 'oh14' )
				$context[] = $current_context;
			}



// data
	$data = [];



// JSON string
	return common::build_element_json_output($context, $data);