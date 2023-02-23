<?php
// Process different values of the component_text_area
// split the dato in columns, it depends of the format_column.
// format_columns allowed: av, pdf, svg, geo, text

	// component data
		$full_raw_text	= $data[0] ?? '';
		if (empty($full_raw_text)) {
			$dato_fallback = component_common::extract_component_dato_fallback(
				$this,
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
				debug_log(__METHOD__." Making fallback to index because rel_locator->type is NOT DEFINED in locator ".to_string($locator), logger::ERROR);
				$tag_type = 'index';
				break;
		}

	// fragment
		if(isset($tag_id)){
			$fragment_info	= component_text_area::get_fragment_text_from_tag(
				$tag_id,
				$tag_type,
				$full_raw_text
			);
		}else{
			$fragment_info = $this->get_value_fragment(100);
			$tag_id = '';
		}

		$text_fragment	= $fragment_info[0] ?? '';

	// data
		switch ($format_columns) {
			case 'pdf':
				// section_id
					$cell_id = new dd_grid_cell_object();
						$cell_id->set_type('column');
						$cell_id->set_cell_type('text');
						$cell_id->set_value([$section_id]); // array value
				// tag_id
					$cell_tag_id = new dd_grid_cell_object();
						$cell_tag_id->set_type('column');
						$cell_tag_id->set_cell_type('text');
						$cell_tag_id->set_value([$tag_id]); // array value
				// text_fragment
					$cell_text_fragment = new dd_grid_cell_object();
						$cell_text_fragment->set_type('column');
						$cell_text_fragment->set_cell_type('text');
						$cell_text_fragment->set_value([$text_fragment]); // array value
				// data
					$data = [
						$cell_id,
						$cell_tag_id,
						$cell_text_fragment,
					];
				break;

			case 'av':
			default:
				// reset data
				$data = [];

				// tc info
					$tag_in_pos		= $fragment_info[1] ?? 0;
					$tag_out_pos	= $fragment_info[2] ?? 0;
					$tc_in			= OptimizeTC::optimize_tcIN($full_raw_text, false, $tag_in_pos, $in_margin=0);
					$tc_out			= OptimizeTC::optimize_tcOUT($full_raw_text, false, $tag_out_pos, $in_margin=100);

					$tc_in_secs		= OptimizeTC::TC2seg($tc_in);
					$tc_out_secs		= OptimizeTC::TC2seg($tc_out);
					$duration_secs	= $tc_out_secs - $tc_in_secs;
					$duration_tc	= OptimizeTC::seg2tc($duration_secs);

					$section_top_tipo	= $locator->section_top_tipo ?? null;
					$section_top_id		= $locator->section_top_id ?? null;

				// columns
					// section_id
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'section_id',
							'value'			=> [$section_id] // array value
						]);

					// tag_id
						$data[] = new dd_grid_cell_object((object)[
							'type'			=> 'column',
							'cell_type'		=> 'text',
							'class_list'	=> 'tag_id',
							'value'			=> [$tag_id] // array value
						]);

					// button_tool_indexation
						// tool_context. This component have a 'tool_indexation' tool
							$tool_indexation_context = array_find($tools, function($el){
								return $el->name==='tool_indexation';
							});
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
						// tool_context. Use the processes section here because component_text_area do not have 'tool_transcription' tool
							$transcription_section = section::get_instance(
								$section_id, // string|null section_id
								'oh81' // string section_tipo
							);
							$transcription_section_context	= $transcription_section->get_structure_context( 1 );
							$transcription_section_tools	= $transcription_section_context->tools ?? [];
							$tool_transcription_context		= array_find($transcription_section_tools, function($el){
								return $el->name==='tool_transcription';
							});
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
								// 'options'		=> (object)[
								// 	'tool_name'			=> 'tool_transcription',
								// 	'section_tipo'		=> $section_tipo,
								// 	'section_id'		=> $section_id,
								// 	'component_tipo'	=> $component_tipo,
								// 	'tag_id'			=> $tag_id,
								// 	'section_top_tipo'	=> $section_top_tipo,
								// 	'section_top_id'	=> $section_top_id
								// ]
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
		}//end switch ($format_columns)



	return $data;
