<?php declare(strict_types=1);
/**
 * COMPONENT_TEXT_AREA VALUE PROCESSOR
 * Builds the array of dd_grid_cell_object columns for one indexation-list row.
 *
 * This file is a procedural include, not a class. It is executed via
 * `include 'component_text_area_value.php'` inside
 * component_text_area::get_grid_value() when the component is in
 * 'indexation_list' mode. The calling method supplies all variables through
 * the current object's scope ($this) plus two local variables:
 *
 *   $data            array   — raw data items from get_data_lang(); element 0
 *                              is expected to hold the rich-text value object.
 *   $format_columns  string  — controls which column layout to build:
 *                              'av'  → 11 columns for audio/video transcription rows
 *                              'pdf' → 3 columns for PDF document rows
 *                              (default) → 2 columns for plain-text rows
 *
 * Implicit $this context (from component_text_area::get_grid_value):
 *   $this->locator         — object carrying section_tipo, section_id,
 *                            component_tipo, tag_id, type, section_top_tipo,
 *                            section_top_id
 *   $this->section_tipo    — string section tipo of the host record
 *   $this->section_id      — int|string section ID of the host record
 *   $this->mode            — string (always 'indexation_list' in this path)
 *   $this->lang            — string current language code
 *
 * Output (returned via `return $data`):
 *   array of dd_grid_cell_object — one object per column, in display order.
 *   Each cell carries 'type', 'cell_type', 'class_list', and a 'value' array.
 *   The caller (get_grid_value) assigns this array to
 *   dd_grid_cell_object::set_value().
 *
 * Column layouts by format_columns:
 *   'av'  (11 cols): record_link | tag_id button | indexation button |
 *                    transcription button | AV player button |
 *                    text_fragment | tc_in | tc_out | duration_tc |
 *                    download (no watermark) | download (watermark)
 *   'pdf' (3 cols):  record_link | tag_id text | text_fragment
 *   default (2 cols): record_link | text_fragment
 *
 * @package Dédalo
 * @subpackage Core
 * @see component_text_area::get_grid_value()
 */

	// COMPONENT DATA: Extract raw text value with fallback to default language
	// get_data_lang() may return nothing when the current lang has no data yet;
	// in that case fall back to the platform default language so the indexation
	// row always has something to display and to extract a text fragment from.
		$full_raw_text	= $data[0]->value ?? '';
		if ( empty($full_raw_text) ) {
			$data_fallback = $this->get_component_data_fallback(
				DEDALO_DATA_LANG, // lang
				DEDALO_DATA_LANG_DEFAULT // main_lang
			);
			$full_raw_text	= $data_fallback[0]->value ?? '';
		}

	// SHORT VARS: Extract locator properties for easy access
	// $locator is the relation locator object that binds this indexation row to
	// the text-area tag. It is populated by indexation_grid before calling
	// get_grid_value, and contains at minimum: section_tipo, section_id, tag_id,
	// type (relation type constant like DEDALO_RELATION_TYPE_INDEX_TIPO).
		$locator		= $this->locator;
		$section_tipo	= $locator->section_tipo;
		$section_id		= $locator->section_id;
		$component_tipo	= $locator->component_tipo ?? null;
		$tag_id			= $locator->tag_id ?? null;
		$lang			= DEDALO_DATA_LANG;

	// CONTEXT: Get permissions and available tools
	// Tools are read from structure_context (ontology node config) so that
	// action buttons (tool_indexation, tool_transcription) can be rendered
	// with the correct label, module_path, and context object from the ontology.
		$permissions		= $this->get_component_permissions();
		$structure_context	= $this->get_structure_context( $permissions );
		$tools				= $structure_context->tools ?? [];

	// TAG_TYPE: Determine tag type (index) from locator relation type
	// Currently only DEDALO_RELATION_TYPE_INDEX_TIPO ('dd96') is handled.
	// Any other relation type falls through to the same 'index' default but
	// emits an ERROR log to flag the unexpected condition. This switch is
	// structured to allow future extension (e.g. 'person', 'reference').
		switch ($locator->type) {
			case DEDALO_RELATION_TYPE_INDEX_TIPO:
				$tag_type = 'index';
				break;
			default:
				debug_log(__METHOD__
					." Making fallback to index because rel_locator->type is NOT DEFINED in locator " . PHP_EOL
					.' locator:' . json_encode($locator, JSON_PRETTY_PRINT)
					, logger::ERROR
				);
				$tag_type = 'index';
				break;
		}

	// FRAGMENT: Extract text fragment based on tag_id
	// When a tag_id is present the locator points to a specific in/out tag pair
	// in the raw HTML text. get_fragment_text_from_tag() returns an object with
	// the enclosed plain text and the byte positions of the surrounding tags —
	// the positions are used by OptimizeTC to calculate accurate timecodes.
	// If the tag cannot be found (e.g. tag was deleted and its state is 'd')
	// we fall back to a 220-character truncation of the full text so the row
	// is not left blank.
		if(isset($tag_id)) {
			$fragment_info = component_text_area::get_fragment_text_from_tag(
				$tag_id,
				$tag_type,
				$full_raw_text
			);
			if (is_null($fragment_info)) {
				debug_log(__METHOD__
					. " Empty fragment info object. Check your tag_id, maybe the state is 'deleted'. Falling back to minimal fragment text " . PHP_EOL
					. ' tag_id: ' . to_string($tag_id)
					, logger::ERROR
				);
				// $value_fragment	= $this->get_value_fragment(220);
				// $value_fragment	= $this->get_list_value((object)['max_chars'=>220]);
				$value_fragment	= component_string_common::truncate_html(
					220,
					$full_raw_text,
					true // isUtf8
				);
				$value_fragment	= !empty($value_fragment)
					? TR::deleteMarks($value_fragment)
					: '';
				// Build a minimal fragment_info stub so the rest of the pipeline
				// (especially the 'av' timecode path) does not need extra null guards.
				$fragment_info	= (object)[
					'text'			=> $value_fragment,
					'tag_in_pos'	=> null,
					'tag_out_pos'	=> null,
					'tag_in'		=> null,
					'tag_out'		=> null
				];
			}
		}else{
			// No tag_id: the locator is a bare section reference without a
			// specific text annotation. Generate a plain truncated excerpt.
			$tag_id = '';
			// $value_fragment	= $this->get_value_fragment(220);
			// $value_fragment	= $this->get_list_value((object)['max_chars'=>220]);
			$value_fragment	= component_string_common::truncate_html(
				220,
				$full_raw_text,
				true // isUtf8
			);
			$value_fragment	= !empty($value_fragment)
				? TR::deleteMarks($value_fragment)
				: '';
			$fragment_info	= (object)[
				'text'			=> $value_fragment,
				'tag_in_pos'	=> null,
				'tag_out_pos'	=> null,
				'tag_in'		=> null,
				'tag_out'		=> null
			];
		}

		$text_fragment	= $fragment_info->text ?? '';

	// DATA OUTPUT: Build grid columns based on format_columns
	// $data is reused here as the output array — the caller assigned the raw
	// database data to it before the include; after this switch $data holds the
	// rendered dd_grid_cell_object columns instead.
		// Reset data array for output
		$data = [];
		switch ($format_columns) {

			case 'av':

				// TIMECODE INFO: Calculate TC in/out and duration from fragment tags
				// OptimizeTC searches the surrounding raw text to find the nearest
				// valid timecode markup relative to the tag position. Using the tag
				// string (tag_in / tag_out) is the preferred approach; the
				// position-based alternatives (commented out above each call) are
				// kept for reference but were superseded because byte offsets can
				// shift after HTML encoding differences.
					$tag_in_pos		= $fragment_info->tag_in_pos  ?? 0;
					$tag_out_pos	= $fragment_info->tag_out_pos ?? 0;

					// $tc_in = OptimizeTC::optimize_tc_in(
					// 	$full_raw_text, // string text
					// 	null, // string|null indexIN
					// 	(int)$tag_in_pos, // int|null start_position
					// 	0 // int in_margin
					// );
					$tc_in = $fragment_info->tag_in
						? OptimizeTC::optimize_tc_in(
							$full_raw_text, // string text
							$fragment_info->tag_in, // string|null indexIN
							null, // int|null start_position
							0 // int in_margin
						  )
						: null;

					// $tc_out = OptimizeTC::optimize_tc_out(
					// 	$full_raw_text, // string text
					// 	null, // string|null indexOUT
					// 	(int)$tag_out_pos, // int|null end_position
					// 	100 // int in_margin
					// );
					$tc_out = $fragment_info->tag_out
						? OptimizeTC::optimize_tc_out(
							$full_raw_text, // string text
							$fragment_info->tag_out, // string|null indexOUT
							null, // int|null end_position
							100 // int in_margin
						  )
						: null;

					// Convert TC strings to seconds for the AV player options,
					// then derive a human-readable duration string.
					$tc_in_secs		= OptimizeTC::TC2seg($tc_in);
					$tc_out_secs	= OptimizeTC::TC2seg($tc_out);
					$duration_secs	= $tc_out_secs - $tc_in_secs;
					$duration_tc	= OptimizeTC::seg2tc($duration_secs);

					// section_top_tipo / section_top_id identify the portal's
					// parent record (e.g. the interview container) when the
					// indexation row comes from a nested portal. They are forwarded
					// to tool_transcription so it can open the AV viewer at the
					// correct parent context.
					$section_top_tipo	= $locator->section_top_tipo ?? null;
					$section_top_id		= $locator->section_top_id ?? null;

				// TOOL CONTEXT: Get tool_indexation context for button actions
				// array_find scans the tools array from structure_context for the
				// entry whose ->name matches 'tool_indexation'. The context object
				// carries label, module_path and other display properties defined
				// in the ontology. Falls back to an empty stdClass so downstream
				// null-coalesces on ->label etc. still work without guards.
					$tool_indexation_context = array_find($tools, function($el){
						return $el->name==='tool_indexation';
					}) ?? new stdClass();

				// COLUMNS: Build grid cells for AV format output
					// Column 1: Section record link
					// Rendered by the client as a clickable icon/link that opens
					// the source section record (the interview or document).
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'record_link',
							'class_list'	=> 'record_link',
							'value'			=> [(object)[
								'section_id'	=> $section_id,
								'section_tipo'	=> $section_tipo
							]] // array value
						]);

					// Column 2: Tag ID button (opens tool_indexation)
					// Displays the raw tag ID value and triggers tool_indexation
					// focused on this specific tag so the editor can edit the
					// index annotation directly from the search result row.
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'button',
							'class_list'	=> 'tag_id',
							// 'value'		=> [$tag_id] // array value
							'value'			=> [(object)[
								'class_list'	=> 'button tag_id',
								'label'			=> (label::get_label('open') ?? 'Open') .' '. ($tool_indexation_context->label ?? ''),
								'value'			=> [$tag_id], // array value
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'open_tool',
									'module_path'	=> '../../../tools/tool_common/js/tool_common.js',
									'options'		=> (object)[
										'caller'		=> (object)[
											'tipo'			=> $this->section_tipo,
											'section_tipo'	=> $this->section_tipo,
											'section_id'	=> $this->get_section_id(),
											'mode'			=> $this->get_mode(),
											'model'			=> 'section', // expected caller section in tool_indexation
											'lang'			=> $this->get_lang()
										],
										'caller_options' => (object)[
											'tag_id'		=> $tag_id
										],
										'tool_context'	=> $tool_indexation_context
									]
								]
							]]
						]);

					// Column 3: Tool indexation button
					// A second button for opening tool_indexation, without the
					// tag_id pre-selection in caller_options — intended for
					// general indexation access to the whole record rather than
					// jumping to a specific annotation.
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'button',
							'class_list'	=> 'button_indexation',
							'value'			=> [(object)[
								'class_list'	=> 'button label',
								'label'			=> (label::get_label('open') ?? 'Open') .' '. ($tool_indexation_context->label ?? ''),
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'open_tool',
									'module_path'	=> '../../../tools/tool_common/js/tool_common.js',
									'options'		=> (object)[
										'caller'		=> (object)[
											'tipo'			=> $this->section_tipo,
											'section_tipo'	=> $this->section_tipo,
											'section_id'	=> $this->get_section_id(),
											'mode'			=> $this->get_mode(),
											'model'			=> 'section', // expected caller section in tool_indexation
											'lang'			=> $this->get_lang()
										],
										'tool_context'	=> $tool_indexation_context
									]
								]
							]]
						]); // array value

					// Column 4: Tool transcription button
					// Opens tool_transcription via the AV component's own tool
					// context (not the text_area's), because transcription is
					// a function of the AV component. The AV component is found
					// via get_related_component_av_tipo() which walks the ontology
					// for a 'related' link to component_av from this component.
					// (!) The tag_id forwarded to the caller here is the indexation
					// tag_id, not a transcription-specific identifier. Whether
					// tool_transcription uses or ignores it is a known open question
					// — see the '???????' inline comment in the options object.
						// Get transcription tool context from related AV component
							$component_av_tipo	= $this->get_related_component_av_tipo(); // 'rsc35';
							$component_av_model	= ontology_node::get_model_by_tipo($component_av_tipo,true);
							$component_av		= component_common::get_instance(
								$component_av_model, // string model
								$component_av_tipo, // string tipo
								$this->section_id, // string section_id
								$this->mode, // string mode
								DEDALO_DATA_NOLAN, // string lang (lang-neutral: AV has no translatable data)
								$this->section_tipo // string section_tipo
							);
							$av_structure_context		= $component_av->get_structure_context( 1 );
							$av_tools					= $av_structure_context->tools ?? [];
							$tool_transcription_context	= array_find($av_tools, function($el){
								return $el->name==='tool_transcription';
							}) ?? new stdClass();

						// cell
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'button',
							'class_list'	=> 'button_transcription',
							'value'			=> [(object)[
							'class_list'	=> 'button document',
							'label' 		=> (label::get_label('open') ?? 'Open') .' '. ($tool_transcription_context->label ?? ''),
							'action'		=> (object)[
								'event'			=> 'click',
								'method'		=> 'open_tool',
								'module_path'	=> '../../../tools/tool_common/js/tool_common.js',
								'options'		=> (object)[
									'caller' 		=> (object)[
										'tipo'				=> $this->section_tipo,
										'section_tipo'		=> $this->section_tipo,
										'section_id'		=> $this->get_section_id(),
										'tag_id'			=> $tag_id, // ??????? How to deal with tag_id ??????
										'mode'				=> $this->get_mode(),
										'model'				=> 'section', // expected caller section in tool_indexation
										'lang'				=> $this->get_lang(),
										'section_top_tipo'	=> $section_top_tipo,
										'section_top_id'	=> $section_top_id
									],
									'tool_context' 	=> $tool_transcription_context
								]
							]]
						]]); // array value

					// Column 5: AV player button
					// Launches the inline AV player (component_av.js::open_av_player)
					// with tc_in_secs / tc_out_secs so playback starts and stops
					// exactly at the annotated fragment boundaries.
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'button',
							'class_list'	=> 'button_av_player',
							'value'			=> [(object)[
								'class_list'	=> 'button film',
								'label' 		=> (label::get_label('open') ?? 'Open') . ' av',
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'open_av_player',
									'module_path'	=> '../../component_av/js/component_av.js',
									'options'		=> (object)[
										'section_tipo'		=> $section_tipo,
										'section_id'		=> $section_id,
										'component_tipo'	=> $this->get_related_component_av_tipo(),
										'tc_in_secs'		=> $tc_in_secs,
										'tc_out_secs'		=> $tc_out_secs
									]
								]
							]
						]]); // array value

					// Column 6: Text fragment content
					// The plain-text excerpt extracted from the region bounded by
					// the tag pair. TR::deleteMarks() has already stripped all
					// Dédalo custom markup; any remaining HTML is preserved for the
					// client renderer.
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'text_fragment',
							'value'			=> [$text_fragment] // array value
						]);

					// Column 7: Timecode IN
					// HH:MM:SS.mmm string of the start of the annotated fragment,
					// as resolved by OptimizeTC from the tag_in mark.
					// Null when no tag_in was present in the locator.
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'tc_in',
							'value'			=> [$tc_in] // array value
						]);

					// Column 8: Timecode OUT
					// HH:MM:SS.mmm string of the end of the annotated fragment.
					// Null when no tag_out was present in the locator.
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'tc_out',
							'value'			=> [$tc_out] // array value
						]);

					// Column 9: Duration timecode
					// Derived as tc_out_secs - tc_in_secs then converted back to
					// a TC string. When either bound is null, OptimizeTC::TC2seg
					// returns 0, so duration will equal the non-null bound's value
					// (or 0 if both are null).
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'duration_tc',
							'value'			=> [$duration_tc] // array value
						]);

					// Column 10: Download AV fragment button (no watermark)
					// Triggers component_av.js::download_av_fragment which calls
					// the server to cut the AV file to [tc_in_secs, tc_out_secs].
					// DEDALO_AV_QUALITY_DEFAULT ('404') selects the encoding preset.
					// The 'watermark' class modifier is added only when $watermark===true
					// so the client can style the button accordingly.
						$watermark = false;
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'button',
							'class_list'	=> 'button_download_av' . ($watermark===true ? ' watermark' : ''),
							'value'			=> [(object)[
								'class_list'	=> 'button download',
								'label'			=> (label::get_label('download') ?? 'Download') .' '. (label::get_label('fragment') ?? 'fragment'),
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'download_av_fragment',
									'module_path'	=> '../../component_av/js/component_av.js',
									'options'		=> (object)[
										'tipo'			=> $this->get_related_component_av_tipo(),
										'section_tipo'	=> $section_tipo,
										'section_id'	=> $section_id,
										'tag_id'		=> $tag_id,
										'lang'			=> $lang,
										'tc_in_secs'	=> $tc_in_secs,
										'tc_out_secs'	=> $tc_out_secs,
										'quality'		=> DEDALO_AV_QUALITY_DEFAULT,
										'watermark'		=> $watermark
									]
								]
							]]
						]);

					// Column 11: Download AV fragment button (with watermark)
					// Same as column 10 but $watermark=true triggers the server to
					// overlay a configurable watermark image on the rendered video.
					// The 'watermark' CSS class is appended to button_download_av
					// so the client can visually distinguish the two download buttons.
						$watermark = true;
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'button',
							'class_list'	=> 'button_download_av' . ($watermark===true ? ' watermark' : ''),
							'value'			=> [(object)[
								'class_list'	=> 'button download',
								'label'			=> (label::get_label('download') ?? 'Download') .' '. (label::get_label('fragment') ?? 'fragment') .' (Watermark)',
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'download_av_fragment',
									'module_path'	=> '../../component_av/js/component_av.js',
									'options'		=> (object)[
										'tipo'			=> $this->get_related_component_av_tipo(),
										'section_tipo'	=> $section_tipo,
										'section_id'	=> $section_id,
										'tag_id'		=> $tag_id,
										'lang'			=> $lang,
										'tc_in_secs'	=> $tc_in_secs,
										'tc_out_secs'	=> $tc_out_secs,
										'quality'		=> DEDALO_AV_QUALITY_DEFAULT,
										'watermark'		=> $watermark
									]
								]
							]]
						]);
				break;

			case 'pdf':
				// PDF FORMAT: 3 columns (section_link, tag_id, text_fragment)
				// Used when the indexation row comes from a PDF-linked section.
				// The tag_id column identifies the specific annotation within the
				// PDF document (page/paragraph reference embedded in the tag).
				// Column 1: Section record link
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'record_link',
						'class_list'	=> 'record_link',
						'value'			=> [(object)[
							'section_id'	=> $section_id,
							'section_tipo'	=> $section_tipo
						]] // array value
					]);
				// Column 2: Tag ID text
				// Displays the raw tag identifier so users can cross-reference
				// the index result with the annotation marker in the PDF viewer.
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'text',
						'class_list'	=> 'tag_id',
						'value'			=> [$tag_id] // array value
					]);
				// Column 3: Text fragment content
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'text',
						'class_list'	=> 'text_fragment',
						'value'			=> [$text_fragment] // array value
					]);
				break;

			default:
				// DEFAULT FORMAT: 2 columns (section_link, text_fragment)
				// Fallback for plain text sections (no AV, no PDF).
				// Column 1: Section record link
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'record_link',
						'class_list'	=> 'record_link',
						'value'			=> [(object)[
							'section_id'	=> $section_id,
							'section_tipo'	=> $section_tipo
						]] // array value
					]);
				// Column 2: Text fragment content
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'text',
						'class_list'	=> 'text_fragment',
						'value'			=> [$text_fragment] // array value
					]);
				break;
		}//end switch ($format_columns)



	return $data;
