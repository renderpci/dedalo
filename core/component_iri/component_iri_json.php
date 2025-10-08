<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();



// context
	$context = [];

	// if($options->get_context===true) { //  && $permissions>0
	// 	switch ($options->context_type) {
	// 		case 'simple':
	// 			// Component structure context_simple (tipo, relations, properties, etc.)
	// 			$context[] = $this->get_structure_context_simple($permissions);
	// 			break;

	// 		default:
	// 			// Component structure context (tipo, relations, properties, etc.)
	// 				$this->context = $this->get_structure_context($permissions, true);
	// 				$context[] = $this->context;
	// 			// add buttons
	// 				$context = array_merge($context, $this->get_structure_buttons($permissions));
	// 			break;
	// 	}
	// }//end if($options->get_context===true)

// Component structure context (tipo, relations, properties, etc.)
	$this->context = $this->get_structure_context($permissions, true);
	$context[] = $this->context;
// add buttons
	$context = array_merge($context, $this->get_structure_buttons($permissions));


// data
	$data = [];

	if($options->get_data===true && $permissions>0) {

		$start_time=start_time();

		// value
			switch ($mode) {
				case 'search':
					$value = [];
					break;
				case 'list':
				case 'tm':
				case 'edit':
				default:
					$value = $this->get_dato();
					break;
			}


		// get the counter
			$counter = $this->get_counter();

		// dataframe. If it exists, calculate the subdatum
			if ($mode!=='search') {

				// locators (using value key as section_id)
					$ar_locator	= [];
					$safe_value	= !empty($value) ? $value : [];
					foreach ($safe_value as $current_value) {

						// Check safe component IRI value. Expected format {"iri":"https://dedalo.es","title":"Dedalo","id":1}
						if (!isset($current_value->id)) {
							// skip old value to prevent to crash the application.
							debug_log(__METHOD__
								. " Ignored non valid value. Expected property 'id' but is not defined" . PHP_EOL
								. ' tipo: ' . $this->tipo . PHP_EOL
								. ' section_tipo: ' . $this->section_tipo . PHP_EOL
								. ' section_id: ' . $this->section_id . PHP_EOL
								. ' current_value: ' . to_string($current_value)
								, logger::ERROR
							);
							continue;
						}

						$locator = new locator();
							$locator->set_section_tipo($this->section_tipo);
							$locator->set_section_id($current_value->id);
						$ar_locator[] = $locator;
					}

				// Empty data
					// If the component has not data, create the locator to get the context of dataframe
					// with the counter, it will be used to show the fields to be filled by default.
					// if the dataframe has not its own context, is not possible to create the instance in client.


					if( empty($ar_locator) ){
						$locator = new locator();
							$locator->set_section_tipo($this->section_tipo);
							$locator->set_section_id($counter+1);
						$ar_locator[] = $locator;
					}

				// subdatum
					$subdatum = $this->get_subdatum($this->tipo, $ar_locator);

					$ar_subcontext = $subdatum->context;
					foreach ($ar_subcontext as $current_context) {
						$context[] = $current_context;
					}

					$ar_subdata = $subdatum->data;
					foreach ($ar_subdata as $sub_value) {
						$data[] = $sub_value;
					}
			}

		// data item
			$item  = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();

		// counter
			$item->counter = $counter;

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
