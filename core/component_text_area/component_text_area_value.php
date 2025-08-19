<?php declare(strict_types=1);

// Process different values of the component_text_area
// split the dato into columns, it depends of the format_column.
// format_columns allowed: av, pdf, svg, geo, text

	// component data
		$full_raw_text	= $data[0] ?? '';
		if (empty($full_raw_text)) {
			$dato_fallback = $this->extract_component_dato_fallback(
				DEDALO_DATA_LANG, // lang
				DEDALO_DATA_LANG_DEFAULT // main_lang
			);
			$full_raw_text	= $dato_fallback[0] ?? '';
		}

	// short vars
		$locator		= $this->locator; // the locator used to instance the text_area with full properties as tag_id
		$section_tipo	= $locator->section_tipo;
		$section_id		= $locator->section_id;
		$component_tipo	= $locator->component_tipo ?? null;
		$tag_id			= $locator->tag_id ?? null;
		$lang			= DEDALO_DATA_LANG;

	// context
		$permissions		= $this->get_component_permissions();
		$structure_context	= $this->get_structure_context( $permissions );
		$tools				= $structure_context->tools ?? [];

	// tag_type from locator relation type
		switch ($locator->type) {
			case DEDALO_RELATION_TYPE_INDEX_TIPO:
				$tag_type = 'index';
				break;
			case DEDALO_RELATION_TYPE_STRUCT_TIPO:
				$tag_type = 'struct';
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

	// fragment
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
				$value_fragment	= common::truncate_html(
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
		}else{
			$tag_id = '';
			// $value_fragment	= $this->get_value_fragment(220);
			// $value_fragment	= $this->get_list_value((object)['max_chars'=>220]);
			$value_fragment	= common::truncate_html(
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

	// data
		// reset data
		$data = [];
		switch ($format_columns) {

			case 'av':

				// tc info
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

					$tc_in_secs		= OptimizeTC::TC2seg($tc_in);
					$tc_out_secs	= OptimizeTC::TC2seg($tc_out);
					$duration_secs	= $tc_out_secs - $tc_in_secs;
					$duration_tc	= OptimizeTC::seg2tc($duration_secs);

					$section_top_tipo	= $locator->section_top_tipo ?? null;
					$section_top_id		= $locator->section_top_id ?? null;

				// tool_indexation_context. This component have a 'tool_indexation' tool
					$tool_indexation_context = array_find($tools, function($el){
						return $el->name==='tool_indexation';
					}) ?? new stdClass();

				// columns
					// section_id
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'record_link',
							'class_list'	=> 'record_link',
							'value'			=> [(object)[
								'section_id'	=> $section_id,
								'section_tipo'	=> $section_tipo
							]] // array value
						]);

					// tag_id
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

					// button_tool_indexation
						// cell
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

					// button_tool_transcription

						// tool_transcription_context. Using related component av context (17-01-2024)
							$component_av_tipo	= $this->get_related_component_av_tipo(); // 'rsc35';
							$component_av_model	= RecordObj_dd::get_modelo_name_by_tipo($component_av_tipo,true);
							$component_av		= component_common::get_instance(
								$component_av_model, // string model
								$component_av_tipo, // string tipo
								$this->section_id, // string section_id
								$this->mode, // string mode
								DEDALO_DATA_NOLAN, // string lang
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

					// button_av_player
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

					// text_fragment
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'text_fragment',
							'value'			=> [$text_fragment] // array value
						]);

					// tc_in
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'tc_in',
							'value'			=> [$tc_in] // array value
						]);

					// tc_out
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'tc_out',
							'value'			=> [$tc_out] // array value
						]);

					// duration_tc
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'duration_tc',
							'value'			=> [$duration_tc] // array value
						]);

					// button_download_av
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

					// button_download_av with watermark
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
				// section_id
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'record_link',
						'class_list'	=> 'record_link',
						'value'			=> [(object)[
							'section_id'	=> $section_id,
							'section_tipo'	=> $section_tipo
						]] // array value
					]);
				// tag_id
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'text',
						'class_list'	=> 'tag_id',
						'value'			=> [$tag_id] // array value
					]);
				// text_fragment
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'text',
						'class_list'	=> 'text_fragment',
						'value'			=> [$text_fragment] // array value
					]);
				break;

			default:
				// section_id
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'record_link',
						'class_list'	=> 'record_link',
						'value'			=> [(object)[
							'section_id'	=> $section_id,
							'section_tipo'	=> $section_tipo
						]] // array value
					]);
				// text_fragment
					$data[] = new dd_grid_cell_object((object)[
						'type'			=> 'column',
						'cell_type'		=> 'text',
						'class_list'	=> 'text_fragment',
						'value'			=> [$text_fragment] // array value
					]);
				break;
		}//end switch ($format_columns)



	return $data;
