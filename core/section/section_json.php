<?php
// JSON data controller



// configuration vars
	$tipo			= $this->get_tipo();
	$permissions	= common::get_permissions($tipo, $tipo);
	$modo			= $this->get_modo();



// context
	$context = [];


	if($options->get_context===true  && $permissions>0){
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				if ($modo==='tm') {
					// Component structure context (tipo, relations, properties, etc.)
						$context = $this->get_tm_context($permissions);
					
				}else{
					// Component structure context (tipo, relations, properties, etc.)
						$context[] = $this->get_structure_context($permissions, $add_request_config=true);
					
					// subcontext from element layout_map items (from_parent_tipo, parent_grouper)
						$ar_subcontext = $this->get_ar_subcontext($tipo, $tipo);
						foreach ($ar_subcontext as $current_context) {
							$context[] = $current_context;
						}
					}
				
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		if ($modo==='tm') {
			
			// subdata add
				$data = $this->get_tm_ar_subdata();

		}else{

			// subdata
				// default locator build with this section params
					$section_id		= $this->get_section_id();
					$section_tipo	= $this->get_tipo();

					$locator = new locator();
					 	$locator->set_section_tipo($section_tipo);
					 	$locator->set_section_id($section_id);

					$value = [$locator];

				// subdata add
					$data = $this->get_ar_subdata($value);
		}

	}// end if $permissions > 0



// JSON string
	return common::build_element_json_output($context, $data);
