<?php
// JSON data component controller

// context
	$context = [];

		// Component structure context (tipo, relations, properties, etc.)
			$context[] = $this->get_structure_context();

// data
	$data = [];

		// Value
			#$value = $this->get_dato();
			$value = component_common::extract_component_dato_fallback($this, $lang=DEDALO_DATA_LANG, $main_lang=DEDALO_DATA_LANG_DEFAULT);
				#dump($value, ' value ++ '.to_string());

			$item = new stdClass();
				$item->section_id 			= $this->get_section_id();
				$item->tipo 				= $this->get_tipo();
				$item->from_component_tipo 	= isset($this->from_component_tipo) ? $this->from_component_tipo : $item->tipo;
				$item->section_tipo 		= $this->get_section_tipo();
				$item->value 				= $value;

			$data[] = $item;

// JSON string
	return common::build_element_json_output($context, $data);