<?php
// Process different values of the component_text_area
// split the dato in columns, it depends of the format_column.
// format_columns allowed: av, pdf, svg, geo, text

	// short vars
		$locator		= $this->locator; // the locator used to instance the text_area with full properties as tag_id
		$section_tipo	= $locator->section_tipo;
		$section_id		= $locator->section_id;
		$component_tipo	= $locator->component_tipo ?? null;
		$tag_id			= $locator->tag_id ?? null;
		$full_raw_text	= $data[0] ?? '';

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
			$fragment_info	= component_text_area::get_fragment_text_from_tag($tag_id, $tag_type, $full_raw_text);
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

				// tc
					$tag_in_pos  	= $fragment_info[1];
					$tag_out_pos 	= $fragment_info[2];
					$tc_in 		 	= OptimizeTC::optimize_tcIN($full_raw_text, false, $tag_in_pos, $in_margin=0);
					$tc_out 	 	= OptimizeTC::optimize_tcOUT($full_raw_text, false, $tag_out_pos, $in_margin=100);

					$tcin_secs		= OptimizeTC::TC2seg($tc_in);
					$tcout_secs		= OptimizeTC::TC2seg($tc_out);
					$duration_secs	= $tcout_secs - $tcin_secs;
					$duration_tc	= OptimizeTC::seg2tc($duration_secs);

					$section_top_tipo	= $locator->section_top_tipo ?? null;
					$section_top_id		= $locator->section_top_id ?? null;

				// columns
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
					// button_tool_indexation
						$cell_button_tool_indexation = new dd_grid_cell_object();
							$cell_button_tool_indexation->set_type('column');
							$cell_button_tool_indexation->set_cell_type('button');
							$cell_button_tool_indexation->set_value([(object)[
								'class_list'	=> 'button indexation',
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'open_tool',
									'module_path'	=> '../../../tools/tool_common/js/tool_common.js',
									'options'		=> (object)[
										'tool_name'			=> 'tool_indexation',
										'section_tipo'		=> $section_tipo,
										'section_id'		=> $section_id,
										'component_tipo'	=> $component_tipo,
										'tag_id'			=> $tag_id,
										'section_top_tipo'	=> $section_top_tipo,
										'section_top_id'	=> $section_top_id
									]
								]
							]]); // array value
					// button_tool_transcription
						$cell_button_tool_transcription = new dd_grid_cell_object();
							$cell_button_tool_transcription->set_type('column');
							$cell_button_tool_transcription->set_cell_type('button');
							$cell_button_tool_transcription->set_value([(object)[
								'class_list'	=> 'button tr',
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'open_tool',
									'module_path'	=> '../../../tools/tool_common/js/tool_common.js',
									'options'		=> (object)[
										'tool_name'			=> 'tool_transcription',
										'section_tipo'		=> $section_tipo,
										'section_id'		=> $section_id,
										'component_tipo'	=> $component_tipo,
										'tag_id'			=> $tag_id,
										'section_top_tipo'	=> $section_top_tipo,
										'section_top_id'	=> $section_top_id
									]
								]
							]]); // array value
					// button_av_player
						$cell_button_av_player = new dd_grid_cell_object();
							$cell_button_av_player->set_type('column');
							$cell_button_av_player->set_cell_type('button');
							$cell_button_av_player->set_value([(object)[
								'class_list'	=> 'button film',
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'open_player',
									'module_path'	=> '../../component_av/js/component_av.js',
									'options'		=> (object)[
										'section_tipo'		=> $section_tipo,
										'section_id'		=> $section_id,
										'component_tipo'	=> $this->get_related_component_av_tipo(),
										'tc_in'				=> $tcin_secs,
										'tc_out'			=> $tcout_secs,
									]
								]
							]]); // array value
					// text_fragment
						$cell_text_fragment = new dd_grid_cell_object();
							$cell_text_fragment->set_type('column');
							$cell_text_fragment->set_cell_type('text');
							$cell_text_fragment->set_value([$text_fragment]); // array value
					// tc_in
						$cell_tc_in = new dd_grid_cell_object();
							$cell_tc_in->set_type('column');
							$cell_tc_in->set_cell_type('text');
							$cell_tc_in->set_value([$tc_in]); // array value
					// tc_out
						$cell_tc_out = new dd_grid_cell_object();
							$cell_tc_out->set_type('column');
							$cell_tc_out->set_cell_type('text');
							$cell_tc_out->set_value([$tc_out]); // array value
					// duration_tc
						$cell_duration_tc = new dd_grid_cell_object();
							$cell_duration_tc->set_type('column');
							$cell_duration_tc->set_cell_type('text');
							$cell_duration_tc->set_value([$duration_tc]); // array value
					// button_download_av
						$cell_button_download_av = new dd_grid_cell_object();
							$cell_button_download_av->set_type('column');
							$cell_button_download_av->set_cell_type('button');
							$cell_button_download_av->set_value([(object)[
								'class_list'	=> 'button download',
								'action'		=> (object)[
									'event'			=> 'click',
									'method'		=> 'download_av_fragment',
									'module_path'	=> '../../component_av/js/component_av.js',
									'options'		=> (object)[
										'section_tipo'		=> $section_tipo,
										'section_id'		=> $section_id,
										'component_tipo'	=> $this->get_related_component_av_tipo(),
										'tc_in'				=> $tc_in,
										'tc_out'			=> $tc_out,
									]
								]
							]]); // array value
				// data
					$data = [
						$cell_id,
						$cell_tag_id,
						$cell_button_tool_indexation,
						$cell_button_tool_transcription,
						$cell_button_av_player,
						$cell_text_fragment,
						$cell_tc_in,
						$cell_tc_out,
						$cell_duration_tc,
						$cell_button_download_av
					];
				break;
		}//end switch ($format_columns)



	return $data;


