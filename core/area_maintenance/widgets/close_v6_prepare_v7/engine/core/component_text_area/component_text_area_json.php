<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
/** @var component_text_area $this */
// JSON data component controller
//
// Execution contract:
//   - Included by component_common::get_json() inside a component_text_area instance scope.
//   - $options: stdClass injected by the caller, carrying:
//       ->get_context  bool  — whether to build and return the structure context
//       ->get_data     bool  — whether to build and return the component data
//       ->context_type string — 'simple' or 'default'
//   - Returns: JSON string produced by common::build_element_json_output().
//
// This file orchestrates the two-layer (context + data) response for
// component_text_area. The context layer carries ontology structure, toolbar
// buttons, and edit-mode features; the data layer carries the actual rich-text
// data items (and any associated dataframe subdatum).
//
// Notable specialisations vs. simpler component JSON controllers:
//   - Edit mode assembles a $this->context->toolbar_buttons list driven by
//     ontology property flags (tags_persons, tags_reference, tags_draw, geo).
//   - Edit mode injects $this->context->features: a bag of well-known constants
//     needed by the JS editor (notes/references section tipos, AV player keys).
//   - Edit mode optionally resolves related_sections and tags_persons when the
//     component is configured for person-tag transcription workflows.
//   - 'tm' (time-machine) mode adds extra identity fields to the data item so
//     the client can reconstruct the originating time-machine note record.
//   - 'list' and 'tm' modes retrieve a compressed value via get_list_value()
//     with a 200-char fallback; 'edit' retrieves get_data_lang() with a 700-char
//     fallback, then runs fix_broken_index_tags() when index or draw tags are
//     present (data integrity repair on read, not on save).
//   - If the component has a dataframe configured (has_dataframe property), the
//     shared build_dataframe_subdatum() trait is called to expand subdatum
//     context/data entries into the same response arrays.



// component configuration vars
// Read the five config variables used throughout both the context and data sections.
// $has_dataframe is derived from $properties->has_dataframe and drives whether
// build_dataframe_subdatum() runs and whether the structure context must include
// the dataframe request_config.
	$permissions	= $this->get_component_permissions();
	$mode			= $this->get_mode();
	$lang			= $this->get_lang();
	$properties		= $this->get_properties();
	$has_dataframe	= isset($properties->has_dataframe) ? $properties->has_dataframe : false;



// context
	$context = [];

	if($options->get_context===true) { //  && $permissions>0

		switch ($options->context_type) {

			case 'simple':
				// Component structure context_simple (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context_simple(
					$permissions,
					$has_dataframe
				);
				break;

			default:
				// Component structure context (tipo, relations, properties, etc.)
				$this->context	= $this->get_structure_context(
					$permissions,
					$has_dataframe
				);
				break;
		}

		switch ($mode) {

			case 'edit':
				// toolbar_buttons base
				// Start with an empty array; each property flag below pushes the
				// buttons that the WYSIWYG editor toolbar must display for this
				// component instance. The client reads context->toolbar_buttons
				// to configure the editor toolbar at render time.
					$this->context->toolbar_buttons = [];

				// person
				// tags_persons property is present when the text area is used for
				// oral-history transcription and needs a "person" toolbar button so
				// the editor can insert speaker/interviewee tags.
					if(isset($properties->tags_persons)) {
						// toolbar_buttons add
							$this->context->toolbar_buttons[] = 'button_person';
							$this->context->toolbar_buttons[] = 'button_note';
					}

				// reference
				// tags_reference enables inline bibliographic/scholarly reference
				// insertion from the thesaurus references section.
					if(isset($properties->tags_reference)) {
						// toolbar_buttons add
							$this->context->toolbar_buttons[] = 'reference';
					}

				// draw
				// tags_draw enables the SVG-drawing annotation toolbar button,
				// used in image-transcription and manuscript-markup workflows.
					if(isset($properties->tags_draw)) {
						// toolbar_buttons add
							$this->context->toolbar_buttons[] = 'button_draw';
					}

				// lang (related_component_lang)
				// When a related component_select_lang controls which language this
				// text area records, inject that language into context->options so
				// the client displays it for reference. get_original_lang() returns
				// null when no lang-override component is configured.
					$original_lang = $this->get_original_lang();
					if (!empty($original_lang)) {
						if (!isset($this->context->options)) {
							$this->context->options = new stdClass();
						}
						// set original lang
						$this->context->options->related_component_lang = $original_lang;
					}

				// geo
				// If the ontology declares an 'exact' related component_geolocation,
				// expose the geo toolbar button so the editor can insert geo tags
				// that will be linked to that companion component's data.
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
				// A bag of well-known constants and configuration values forwarded
				// to the JS editor so it can construct notes, references, and AV
				// timecode interactions without additional API calls.
				// notes_section_tipo / notes_publication_tipo: the section tipos
				//   for inline annotation records (rsc326 = notes, rsc399 = publication).
				// references_section_tipo / references_component_tipo: the section
				//   and component tipos for bibliographic virtual reference tags
				//   (rsc425 / rsc426). references_component_model is resolved here
				//   so the client does not need an extra ontology lookup.
				// av_player: keyboard codes and rewind distance used by the
				//   synchronized AV player in transcription mode.
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
		// Select the appropriate value retrieval strategy based on mode:
		//   list/tm  — lightweight truncated strings for display grids, with a
		//              200-char cross-language fallback when the preferred lang is empty.
		//   edit/default — full rich-text data from the current language, with a
		//              700-char fallback for the placeholder preview.
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
					// When the component is configured for oral-history transcription
					// (tags_persons property present), resolve the speaker/interviewee
					// tag list and the related sections needed to populate the person
					// insertion panel in the editor toolbar.
					// This block runs only in 'edit' mode to avoid the cost during
					// read-only list rendering.
						// get the tags for persons, will be used when the text_area need include the "person that talk" in transcription
						if(isset($properties->tags_persons)) {

							// related_sections add
								$related_sections = $this->get_related_sections();

							// tags_persons
							// Walk each configured related-section tipo from
							// properties->tags_persons (keyed by section tipo),
							// resolve its person records, and merge them all into
							// $tags_persons for injection into the data item below.
								$tags_persons = [];
								// related_sections
								// array_find locates the 'sections' typed entry inside
								// the related_sections data array; its ->value holds the
								// array of related section locators.
								$obj_data_sections = array_find($related_sections->data ?? [], function($el){
									return $el->typo==='sections';
								}) ?? new stdClass();
								$ar_related_sections = $obj_data_sections->value ?? [];
								// tags_persons_config
								$tags_persons_config = $properties->tags_persons;
								foreach ($tags_persons_config as $related_section_tipo => $current_value) {
									$ar_tags_persons =  $this->get_tags_persons($related_section_tipo, $ar_related_sections);
									$tags_persons = [...$tags_persons, ...$ar_tags_persons];
								}
						}

					$value = $this->get_data_lang() ?? [];

					// fix broken tags
					// When the component has index or draw tags, run the tag-integrity
					// repair pass on every data item before sending to the client.
					// This is a read-path guard: corrupted in/out tag pairs (e.g. an
					// indexIn without its matching indexOut) are silently healed so the
					// editor does not see inconsistent markup. The condition uses a
					// logical-AND precedence issue — tags_index || (tags_draw && !empty)
					// — but correcting it is outside the doc-only scope.
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
					// is_empty_data() considers all items empty (including '<p></p>' garbage
					// from CKEditor) before requesting the cross-language fallback.
						$fallback_value	= $this->is_empty_data( $value )
							? $this->get_fallback_edit_value((object)['max_chars'=>700])
							: null;
					break;
			}

			// dataframe. If it exists, calculate the subdatum (shared trait helper)
			// When has_dataframe is true, build_dataframe_subdatum() returns an object
			// containing additional context entries (dataframe schema rows) and data
			// entries (dataframe value rows). Both are spliced directly into the
			// shared $context and $data arrays so the client receives them in a single
			// response. The counter on the data item tells the client how many
			// existing rows exist so it can render a provisional blank row.
			$dataframe_subdatum = $this->build_dataframe_subdatum($value, $mode);
			if ($dataframe_subdatum!==null) {
				foreach ($dataframe_subdatum->context as $current_context) {
					$context[] = $current_context;
				}
				foreach ($dataframe_subdatum->data as $sub_value) {
					$data[] = $sub_value;
				}
			}

		// data item
			$item = $this->get_data_item($value);

			// counter. Used by edit views to build the provisional dataframe
			// render context (counter+1) for new blank rows
			if ($dataframe_subdatum!==null) {
				$item->counter = $dataframe_subdatum->counter;
			}

			// another data to add
			// parent_tipo lets the client identify which component owns this data item,
			// required for nested/portal contexts where multiple components share a
			// response array. fallback_value provides a cross-language placeholder.
				$item->parent_tipo			= $this->get_tipo();
				$item->fallback_value		= $fallback_value;
				// When the component is used in time machine mode
				// it will use the parent_section_id and parent_section_tipo from the value
				// to build the target section in client side
				// @see: class.tm_record.php
				// @see: view_note_text_area.js
				if ($mode === 'tm') {
					// set the parent_section_id and parent_section_tipo to the item
					// The time-machine note is stored under a dedicated section tipo
					// (DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO = rsc832). The client
					// uses parent_section_tipo to navigate back to the originating note.
					$item->parent_section_id	= $value[0]->parent_section_id ?? null;
					$item->parent_section_tipo	= DEDALO_TIME_MACHINE_NOTES_SECTION_TIPO;
					// remove the parent_section_id from the value
					// Unset the duplicated field from the first entry to avoid
					// redundancy; the canonical value lives in $item->parent_section_id.
					unset($item->entries[0]->parent_section_id);

					// created_by_user_id. Used for time machine notes user verification
					// Fetched only when section_id is a valid positive integer;
					// abs() guards against the negative-section-id sentinel that some
					// TM record contexts use. The user ID lets the JS layer decide
					// whether the current user may edit the displayed note.
					$item->created_by_user_id = abs(intval($this->section_id))>0
						? $this->get_my_section_record()->get_created_by_user_id()
						: null;
					// set the matrix_id as section_id
					// matrix_id preserves the original section_id string (which may be
					// a non-numeric TM key) for the client to store alongside the
					// resolved numeric parent_section_id.
					$item->matrix_id = $this->section_id;

				}


				// optional data to add
				// Inject person-tag context only in edit mode — list/tm views do not
				// render the person-tag insertion panel.
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
// Serialise the accumulated context and data arrays to the standard
// Dédalo JSON envelope understood by the client data_manager layer.
	return common::build_element_json_output($context, $data);
