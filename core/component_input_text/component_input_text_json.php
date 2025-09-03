<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$properties		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		$unique			= isset($properties->unique) ? $properties->unique : false;
		$has_dataframe	= isset($properties->has_dataframe) ? $properties->has_dataframe : false;

		$add_rqo = ($unique || $has_dataframe)
			? true
			: false;

		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context_simple(
					$permissions,
					$add_rqo
				);
				$context[] = $this->context;
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context(
					$permissions,
					$add_rqo
				);
				$context[] = $this->context;

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
				$value			= $this->get_list_value();
				$fallback_value	= $this->extract_component_dato_fallback(
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
				$fallback_value	= $this->extract_component_dato_fallback(
					DEDALO_DATA_LANG, // lang
					DEDALO_DATA_LANG_DEFAULT // main_lang
				);

				// @v7 test
				// $value = json_decode('
				// 	[
				// 		{
				// 	      "id": 1,
				// 	      "lang": "lg-eng",
				// 	      "value": "The one id: 1"
				// 	    },
				// 	    {
				// 	      "id": 2,
				// 	      "lang": "lg-eng",
				// 	      "value": "The one id: 2"
				// 	    }
				//     ]
				// ');
				// $fallback_value	= json_decode('
				// 	[
				// 		{
				// 	      "id": 1,
				// 	      "lang": "lg-spa",
				// 	      "value": "El uno id: 1"
				// 	    },
				// 	    {
				// 	      "id": 2,
				// 	      "lang": "lg-spa",
				// 	      "value": "El uno id: 2"
				// 	    }
				//     ]
				// ');

				// 	dump($value, ' value ++ '.to_string($this->lang));
				// 	dump($fallback_value, ' fallback_value ++ '.to_string($this->lang));
				break;
		}

		// activity exceptions
			if ($this->get_section_tipo()===DEDALO_ACTIVITY_SECTION_TIPO) {
				// activity 'Where' case
					if ($this->tipo==='dd546') {
						$first_value = reset($value);
						if (is_array($first_value)) {
							$first_value = reset($first_value);
							// dump($value, ' value ++ '.$this->section_id.' - '.to_string($mode));
							debug_log(__METHOD__." Fixed bad data (array of arrays) in $this->tipo - $this->section_id ".to_string(), logger::DEBUG);
						}
						$term = ontology_node::get_term_by_tipo($first_value, DEDALO_DATA_LANG, true, true) ?? '';
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

		// dataframe. If it exists, calculate the subdatum
			if ($has_dataframe===true && $mode!=='search') {

				// locators (using value key as section_id)
					$ar_locator	= [];
					$safe_value	= !empty($value) ? $value : [null];
					foreach ($safe_value as $key => $literal) {

						$locator = new locator();
							$locator->set_section_tipo($this->section_tipo);
							$locator->set_section_id($key);
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
			$item = $this->get_data_item($value);
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();
				$item->fallback_value		= $fallback_value;

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

		// $item->fallback_lang_applied	= $fallback_lang_applied ?? false;

		// debug
			if(SHOW_DEBUG===true) {
				metrics::add_metric('data_total_time', $start_time);
				metrics::add_metric('data_total_calls');

				/*
				@v7 test
				*/
				// load_matrix_db_manager @v7
					// $matrix_db_manager = matrix_db_manager::get_instance($this->section_tipo, $this->section_id);
					// $section_data = $matrix_db_manager->load();
					// // dump($section_data, ' section_data //////////////////////////////////////////////////////////// ++ '.to_string());

				// update_matrix_db_manager @v7
					// $matrix_db_manager = matrix_db_manager::get_instance($this->section_tipo, $this->section_id);
					// $res = $matrix_db_manager->update(
					// 	[
					// 		'iri' => [
					// 			'test3333' => [
					// 				[
					// 					'id' => 4,
					// 					'value' => 'Test for write column iri ++ 5'
					// 				]
					// 			]
					// 		],
					// 		'geo' => null
					// 	]
					// );
					// // dump($res, ' res ++ '.to_string("$this->section_tipo, $this->section_id"));

				// insert_matrix_db_manager @v7
					// $matrix_db_manager = matrix_db_manager::get_instance($this->section_tipo, $this->section_id);
					// $res = $matrix_db_manager->insert(
					// 	[
					// 		'data' => [
					// 			'test3333' => [
					// 				[
					// 					'id' => 4,
					// 					'value' => 'Test for write column iri + INSERT'
					// 				]
					// 			]
					// 		]
					// 	]
					// );
					// dump($res, ' res insert_matrix_db_manager ++ '.to_string("$this->section_tipo, $this->section_id"));
			}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
