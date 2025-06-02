<?php
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$mode			= $this->get_mode();
	$permissions	= $this->get_section_permissions();

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

	// 			// if ($mode==='tm99') {
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

		if ($mode==='tm') {

			// context. Section context is a normal context like in any other mode
				$this->context = $this->get_structure_context(
					$permissions,
					true // bool add_rqo
				);
				$context[] = $this->context;

			$record = $this->get_record();
			if (!empty($record)) {

				// full record with all columns as
				// [{"id":"6098668","bulk_process_id":null,"section_id":"1684","section_tipo":"rsc170","tipo":"rsc1166","lang":"lg-eng",..}]
				$value_tm = [$record];

				// subcontext. Is specific for tm and is calculated in class section
					$subdatum = $this->get_tm_subdatum($tipo, $value_tm);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$current_context->mode ='tm';
						$context[] = $current_context;
					}

					$ar_subdata	= $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
			}

		}else{

			$this->context = $this->get_structure_context(
				$permissions,
				true // bool add_rqo
			);
			$context[] = $this->context;

			// subdata
				// default locator build with this section params
					$section_id		= $this->get_section_id();
					$section_tipo	= $this->get_tipo();

			if(!empty($section_id)) {

				$locator = new locator();
				 	$locator->set_section_tipo($section_tipo);
				 	$locator->set_section_id($section_id);

				$value = [$locator];

				// section self data
					// $item = new stdClass();
					// 	$item->typo						= 'section';
					// 	$item->section_tipo				= $this->tipo;
					// 	$item->tipo						= $this->tipo;
					// 	$item->value					= $value;
					// 	// section creation / modification data
					// 	$item->created_date				= $this->get_created_date();
					// 	$item->modified_date			= $this->get_modified_date();
					// 	$item->created_by_user_name		= $this->get_created_by_user_name();
					// 	$item->modified_by_user_name	= $this->get_modified_by_user_name();

					// $data[] = $item;

				// subdata add
					$subdatum_options = (object)[
						'skip_subdatum' => ['component_portal']
					];
					$subdatum = $this->get_subdatum($tipo, $value, $subdatum_options);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata	= $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
			}
		}
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
