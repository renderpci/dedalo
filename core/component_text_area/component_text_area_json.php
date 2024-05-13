<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();
	$properties		= $this->get_properties();



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context_simple($permissions);
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context($permissions);


				// add buttons
				//	$context = array_merge($context, $this->get_structure_buttons($permissions));
				break;
		}

		switch ($mode) {

			case 'edit':
				// toolbar_buttons base
					$this->context->toolbar_buttons = [];

				// person
					if(isset($properties->tags_persons)) {
						// toolbar_buttons add
							$this->context->toolbar_buttons[] = 'button_person';
							$this->context->toolbar_buttons[] = 'button_note';
					}

				// lang (related_component_lang)
					$original_lang = $this->get_original_lang();
					if (!empty($original_lang)) {
						if (!property_exists($this->context, 'options')) {
							$this->context->options = new stdClass();
						}
						// set original lang
						$this->context->options->related_component_lang = $original_lang;
					}

				// geo
					$related_component_geolocation = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation(
						$this->tipo, // tipo
						'component_geolocation', // model name
						'termino_relacionado', // relation_type
						true // search_exact
					);
					if(!empty($related_component_geolocation)){
						$this->context->toolbar_buttons[] = 'button_geo';
						$this->context->toolbar_buttons[] = 'button_note';
					}

				// features
					$this->context->features = (object)[
						// Notes. Add the section_tipo for the annotations
						'notes_section_tipo'			=> DEDALO_NOTES_SECTION_TIPO,
						'notes_publication_tipo'		=> DEDALO_NOTES_PUBLICATION_TIPO,
						// References. Add the section_tipo for the virtual references
						'references_section_tipo'		=> DEDALO_TS_REFERENCES_SECTION_TIPO,
						'references_component_tipo'		=> DEDALO_TS_REFERENCES_COMPONENT_TIPO,
						'references_component_model'	=> RecordObj_dd::get_modelo_name_by_tipo(DEDALO_TS_REFERENCES_COMPONENT_TIPO,true),
						// av_player
						'av_player'						=> (object)[
							'av_play_pause_code'	=> 'Escape', // ESC
							'av_insert_tc_code'		=> 'F2', // F2
							'av_rewind_seconds'		=> 3
						]
					];

				// // Notes. Add the section_tipo for the annotations
				// 	$this->context->notes_section_tipo		= DEDALO_NOTES_SECTION_TIPO;
				// 	$this->context->notes_publication_tipo	= DEDALO_NOTES_PUBLICATION_TIPO;

				// // References. Add the section_tipo for the virtual references
				// 	$this->context->references_section_tipo		= DEDALO_TS_REFERENCES_SECTION_TIPO;
				// 	$this->context->references_component_tipo	= DEDALO_TS_REFERENCES_COMPONENT_TIPO;
				// 	$this->context->references_component_model	= RecordObj_dd::get_modelo_name_by_tipo(DEDALO_TS_REFERENCES_COMPONENT_TIPO,true);

				// // av_player
				// 	$this->context->av_player = (object)[
				// 		'av_play_pause_code'	=> 'Escape', // ESC
				// 		'av_insert_tc_code'		=> 'F2', // F2
				// 		'av_rewind_seconds'		=> 3
				// 	];
				break;

			default:
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		// value
			switch ($mode) {

				case 'list':
				case 'tm':
					$value			= $this->get_list_value();
					$fallback_value	= (empty($value[0]) || $this->is_empty($value[0]))
						? $this->get_fallback_list_value((object)['max_chars'=>200])
						: null;
					break;

				case 'edit':
				default:
					// person. tags for persons
					// get the tags for persons, will be used when the text_area need include the "person that talk" in transcription
						if(isset($properties->tags_persons)) {

							// related_sections add
								$related_sections = $this->get_related_sections();

							// tags_persons
								$tags_persons = [];
								// related_sections
								$obj_data_sections = array_find($related_sections->data, function($el){
									return $el->typo==='sections';
								}) ?? new stdClass();
								$ar_related_sections = $obj_data_sections->value ?? [];
								// tags_persons_config
								$tags_persons_config = $properties->tags_persons;
								foreach ($tags_persons_config as $related_section_tipo => $current_value) {
									$ar_tags_persons =  $this->get_tags_persons($related_section_tipo, $ar_related_sections);
									$tags_persons = array_merge($tags_persons, $ar_tags_persons);
								}
						}
					// indexation
						if(isset($properties->tags_index)) {
							$tags_index = $this->get_component_indexations_terms();
						}
					// notes
						if(isset($properties->tags_notes)) {
							$tags_notes = $this->get_annotations();
						}

					$value = $this->get_dato();

					// fix broken tags
						if (isset($properties->tags_index) && !empty($value)) {
							$value = array_map(function($raw_text){
								if (!empty($raw_text)) {
									$response = $this->fix_broken_index_tags($raw_text);
									return $response->result;
								}
								return $raw_text;
							}, (array)$value);
						}

					// fallback_value. Is used to create a placeholder to display a reference data to the user
						$fallback_value	= (empty($value[0]) || ($value[0]==='<br data-mce-bogus="1">'))
							? $this->get_fallback_edit_value((object)['max_chars'=>700])
							: null;
					break;
			}


		// data item
			$item = $this->get_data_item($value);

			// another data to add
				$item->parent_tipo			= $this->get_tipo();
				$item->parent_section_id	= $this->get_section_id();
				$item->fallback_value		= $fallback_value;

				// optional data to add
				if(isset($properties->tags_persons) && $mode==='edit') {
					$item->related_sections	= $related_sections;
					$item->tags_persons		= $tags_persons;
				}
				if(isset($properties->tags_index) && $mode==='edit') {
					$item->tags_index = $tags_index;
				}
				if(isset($properties->tags_notes) && $mode==='edit') {
					$item->tags_notes = $tags_notes;
				}

		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
