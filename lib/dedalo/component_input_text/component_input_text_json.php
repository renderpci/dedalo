<?php
// JSON data component controller



// component configuration vars
	$permissions		= $this->get_component_permissions();
	$modo				= $this->get_modo();



// context
	$context = [];

	if($options->get_context===true){

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context($permissions);

		// add buttons
			$context = array_merge($context, $this->get_structure_buttons($permissions));

	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){
		$element_start_time=microtime(1);
				
		// Value
		$value = null;
		switch ($modo) {
			case 'edit':
				$value = $this->get_dato();
				break;
			case 'list':
				$value = component_common::extract_component_dato_fallback($this, $lang=DEDALO_DATA_LANG, $main_lang=DEDALO_DATA_LANG_DEFAULT);
				break;
		}
		
		if(!empty($value)){
			
			$item = new stdClass();
				$item->section_id 		= $this->get_section_id();
				$item->section_tipo 	= $this->get_section_tipo();
				$item->tipo 			= $this->get_tipo();
				$item->from_parent 		= isset($this->from_parent) ? $this->from_parent : $item->tipo;				
				$item->value 			= $value;

			// debug
				if(SHOW_DEBUG===true) {									
					$item->debug_time_data = exec_time_unit($element_start_time,'ms')." ms";
				}

			$data[] = $item;
		}

	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);