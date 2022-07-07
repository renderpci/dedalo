<?php
// JSON data component controller
// if(SHOW_DEBUG===true) $start_time = start_time();
// error_log('input text json .......................................................');


// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
	$properties		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		$add_rqo = isset($properties->unique) ? true : false;
		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context_simple($permissions, $add_rqo);
				$context[]		= $this->context;
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context($permissions, $add_rqo);
				$context[]		= $this->context;

				// add buttons
				$context = array_merge($context, $this->get_structure_buttons($permissions));
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		// value
		switch ($modo) {

			case 'list':
				$value			= $this->get_list_value();
				$fallback_value	= component_common::extract_component_dato_fallback(
					$this,
					DEDALO_DATA_LANG, // lang
					DEDALO_DATA_LANG_DEFAULT // main_lang
				);
				break;

			case 'search':
				$value			= [];
				$fallback_value	= false;
				break;

			case 'edit':
			default:
				$value			= $this->get_dato();
				$fallback_value	= component_common::extract_component_dato_fallback(
					$this,
					DEDALO_DATA_LANG, // lang
					DEDALO_DATA_LANG_DEFAULT // main_lang
				);
				break;
		}

		// activity exceptions
			if ($this->get_section_tipo()===DEDALO_ACTIVITY_SECTION_TIPO) {
				// activity 'Where' case
					if ($this->tipo==='dd546') {
						$first_value = reset($value);
						if (is_array($first_value)) {
							$first_value = reset($first_value);
							// dump($value, ' value ++ '.$this->section_id.' - '.to_string($modo));
							debug_log(__METHOD__." Fixed bad data (array of arrays) in $this->tipo - $this->section_id ".to_string(), logger::DEBUG);
						}
						$term = RecordObj_dd::get_termino_by_tipo($first_value, DEDALO_DATA_LANG, true, true);
						$term = strip_tags($term);
						$value = [$term . ' ['. $first_value."]"];
					}
				// activity 'Data' case
					if ($this->tipo==='dd551') {
						$value = [json_encode($value, JSON_UNESCAPED_SLASHES|JSON_PRETTY_PRINT)];
					}elseif (!is_array($value)) {
						$value = [$value];
					}
			}

		// data item
			$item  = $this->get_data_item($value);
				$item->parent_tipo				= $this->get_tipo();
				$item->parent_section_id		= $this->get_section_id();
				$item->fallback_value			= $fallback_value;
				// $item->fallback_lang_applied	= $fallback_lang_applied ?? false;

		// Debug
			// if(SHOW_DEBUG===true) {
			// 	$debug = new stdClass();
			// 		$debug->exec_time = exec_time_unit($start_time,'ms')." ms";

			// 	$item->debug = $debug;
			// }


		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
