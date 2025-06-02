<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0
		switch ($options->context_type) {
			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$context[] = $this->get_structure_context_simple($permissions);
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
					$context[] = $this->get_structure_context($permissions);

				// add buttons
					$context = array_merge($context, $this->get_structure_buttons($permissions));
				break;
		}
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
			switch ($mode) {
				case 'list':
				case 'tm':
				case 'edit':
				default:
					$value = $this->get_dato();
					break;
			}

		// data item
			$item  = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

		// Transliterate components
		// the main lang is set to nolan, the component has translatable property set to false.
		// if the component has with_lang_versions = true in properties
		// it could be transliterate to other languages (translatable with the tool_lang)
		// transliterate_value is used to inform the users than this data has a translation
		// or inside the tool_lang, inform what is the original data in nolan.
			$with_lang_versions	= $this->with_lang_versions;
			if($with_lang_versions===true) {

				$original_lang = $this->lang;

				// if the original_lang is nolan change to get the transliterable data in current data lang.
				// if the original_lang is any lang set to nolan (is use into translate component inside tool_lang)
				$tranliterable_lang = ($original_lang === DEDALO_DATA_NOLAN)
					? DEDALO_DATA_LANG
					: DEDALO_DATA_NOLAN;

				$this->set_lang($tranliterable_lang);
				$item->transliterate_value = $this->get_dato();

				// restore the component lang to the original value
				$this->set_lang($original_lang);
			}

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
