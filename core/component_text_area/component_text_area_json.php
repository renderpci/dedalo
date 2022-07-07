<?php
// JSON data component controller



// component configuration vars
	$permissions	= $this->get_component_permissions();
	$modo			= $this->get_modo();
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

		switch ($modo) {

			case 'edit':
				// toolbar_buttons base
					$this->context->toolbar_buttons = [];

				// person
					if(isset($properties->tags_persons)) {
						// toolbar_buttons add
							$this->context->toolbar_buttons[] = 'button_person';
							$this->context->toolbar_buttons[] = 'button_note';
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

				// Notes. Add the section_tipo for the annotations
					$this->context->notes_section_tipo		= DEDALO_NOTES_SECTION_TIPO;
					$this->context->notes_publication_tipo	= DEDALO_NOTES_PUBLICATION_TIPO;

				// av_player
					$this->context->av_player = (object)[
						'av_play_pause_code'	=> 'Escape', // ESC
						'av_insert_tc_code'		=> 'F2', // F2
						'av_rewind_seconds'		=> 3
					];
				break;

			default:
				break;
		}

		$context[] = $this->context;
	}//end if($options->get_context===true)



// data
	$data = [];

	if($options->get_data===true && $permissions>0){

		$dato = $this->get_dato();

		// value
			switch ($modo) {

				case 'list':
					$value	= component_common::extract_component_dato_fallback($this, DEDALO_DATA_LANG, DEDALO_DATA_LANG_DEFAULT);
					$total	= count($value)>0 ? count($value) : 1;
					foreach ($value as $key => $current_value) {
						$value[$key] = !empty($current_value)
							? common::truncate_html( ceil(200/$total), $current_value, true)
							: '';
					}
					// check value fallback
					if (!empty($dato) && (empty($value[0]) && $value[0]!=='')) {
						$value[0] = 'Error on extract_component_dato_fallback ['.$lang.'] for '.json_encode($dato);
					}
					$fallback_value = null; // not necessary here because value is already fallback
					break;

				case 'edit':
				default:
					// person. tags for persons
					// get the tags for persons, will be used when the text_area need include the "person that talk" in transcription
						if(isset($properties->tags_persons)) {

							// related_sections add
								$related_sections = $this->get_related_sections();
								$related_sections = $related_sections;

							// tags_persons
								$tags_persons = [];
								// related_sections
								$obj_data_sections = array_find($related_sections->data, function($el){
									return $el->typo==='sections';
								});
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


					$value			= $dato;
					$fallback_value	= (empty($value) || isset($value[0]) && empty($value[0]) || ($value[0]==='<br data-mce-bogus="1">') || !isset($patata))
						? (function(){
							$dato_fallback	= component_common::extract_component_dato_fallback($this, $lang=DEDALO_DATA_LANG, $main_lang=DEDALO_DATA_LANG_DEFAULT);
							$value			= !empty($dato_fallback[0])
								? common::truncate_html(700, $dato_fallback[0], true) // $maxLength, $html, $isUtf8=true
								: '';
							if (!empty($value) && strlen($value)<strlen($dato_fallback[0])) {
								$value .= ' ...';
							}
							return $value;
						  })()
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
			if(isset($properties->tags_persons) && $modo==='edit') {
				$item->related_sections	= $related_sections;
				$item->tags_persons		= $tags_persons;
			}
			if(isset($properties->tags_index) && $modo==='edit') {
				$item->tags_index = $tags_index;
			}
			if(isset($properties->tags_notes) && $modo==='edit') {
				$item->tags_notes = $tags_notes;
			}


		$data[] = $item;
	}//end if($options->get_data===true && $permissions>0)



// JSON string
	return common::build_element_json_output($context, $data);
