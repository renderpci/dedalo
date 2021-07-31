<?php
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$modo			= $this->get_modo();



// context
	$context	= [];
	$data		= [];
	
	// if($options->get_context===true  && $permissions>0 && empty($context)){
	// 	switch ($options->context_type) {
			
	// 		case 'simple':

	// 			// Component structure context_simple (tipo, relations, properties, etc.)
	// 				$context[] = $this->get_structure_context_simple($permissions, $add_rqo=false);
	// 			break;

	// 		default:
				
	// 			// if ($modo==='tm99') {
	// 			// 	// Component structure context (tipo, relations, properties, etc.)
	// 			// 		$context = $this->get_tm_context($permissions);					
	// 			// }else{

	// 			// section structure context (tipo, relations, properties, etc.)
	// 				$context[] = $this->get_structure_context($permissions, $add_rqo=true);
			
	// 			// subcontext from element layout_map items (from_parent_tipo, parent_grouper)
	// 				$ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);					
	// 				foreach ($ar_subcontext as $current_context) {
	// 					$context[] = $current_context;
	// 				}
	// 			break;
	// 	}

	// 	$this->context = $context;
	// }//end if($options->get_context===true)


	if($permissions>0){

		if ($modo==='tm') {

			// context
				// section context is a normal context like in any other mode
				$this->context = $this->get_structure_context($permissions, $add_rqo=true);
				$context[] = $this->context;

				// subcontext. Is specific for tm and is calculated in class section
				$ar_subcontext = $this->get_tm_context($permissions);
				foreach ($ar_subcontext as $current_context) {
					$context[] = $current_context;
				}
			
			// subdata. Is specific for tm and is calculated in class section
				$data = $this->get_tm_ar_subdata();

		}else{

			$this->context = $this->get_structure_context($permissions, $add_rqo=true);
			$context[] = $this->context;

			// subdata
				// default locator build with this section params
					$section_id		= $this->get_section_id();
					$section_tipo	= $this->get_tipo();

					$locator = new locator();
					 	$locator->set_section_tipo($section_tipo);
					 	$locator->set_section_id($section_id);

					$value = [$locator];

				// subdata add
					$subdatum = $this->get_subdatum($tipo, $value);
					
					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata	= $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
		}
			// dump($context, ' context ++ '.to_string());
			// dump($data, ' data ++ '.to_string());

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
