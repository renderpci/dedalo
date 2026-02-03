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

				// reference
					if(isset($properties->tags_reference)) {
						// toolbar_buttons add
							$this->context->toolbar_buttons[] = 'reference';
					}

				// draw
					if(isset($properties->tags_draw)) {
						// toolbar_buttons add
							$this->context->toolbar_buttons[] = 'button_draw';
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
					$related_component_geolocation = ontology_node::get_ar_tipo_by_model_and_relation(
						$this->tipo, // tipo
						'component_geolocation', // model name
						'related', // relation_type
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
						'references_component_model'	=> ontology_node::get_model_by_tipo(DEDALO_TS_REFERENCES_COMPONENT_TIPO,true),
						// av_player
						'av_player'						=> (object)[
							'av_play_pause_code'	=> 'Escape', // ESC
							'av_insert_tc_code'		=> 'F2', // F2
							'av_rewind_seconds'		=> 3
						]
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

		$start_time=start_time();

		// value
			switch ($mode) {

				case 'list':
				case 'tm':
					$value			= $this->get_list_value();
					$fallback_value	= empty($value)
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
								$obj_data_sections = array_find($related_sections->data ?? [], function($el){
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

					$value = $this->get_data_lang() ?? [];

					// fix broken tags
						if (isset($properties->tags_index) || isset($properties->tags_draw) && !empty($value)) {
							$value = array_map(function($item){
								if (!empty($item->value)) {
									$response = $this->fix_broken_index_tags($item->value);
									$item->value = $response->result;
									return $item;
								}
								return $item;
							}, $value);
						}

					// fallback_value. Is used to create a placeholder to display a reference data to the user
						$fallback_value	= $this->is_empty_data( $value )
							? $this->get_fallback_edit_value((object)['max_chars'=>700])
							: null;
					break;
			}

		// data item
			$item = $this->get_data_item($value);

			// another data to add
				$item->parent_tipo			= $this->get_tipo();
				$item->fallback_value		= $fallback_value;
				// When the component is used in time machine mode
				// it will use the parent_section_id and parent_section_tipo from the value
				// to build the target section in client side
				// @see: class.tm_record.php
				// @see: view_note_text_area.js
				if ($mode === 'tm') {
					// set the parent_section_id and parent_section_tipo to the item
					$item->parent_section_id	= $value[0]->parent_section_id ?? null;
					$item->parent_section_tipo	= DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO;
					// remove the parent_section_id from the value
					unset($item->entries[0]->parent_section_id);		

					// created_by_user_id. Used for time machine notes user verification
					$item->created_by_user_id = abs(intval($this->section_id))>0
						? $this->get_my_section_record()->get_created_by_user_id()
						: null;
					// set the matrix_id as section_id
					$item->matrix_id = $this->section_id;

				}


				// optional data to add
				if(isset($properties->tags_persons) && $mode==='edit') {
					$item->related_sections	= $related_sections;
					$item->tags_persons		= $tags_persons;
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
