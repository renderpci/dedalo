<?php

function get_dato($model, $custom_arguments, $output, $output_options, $ddo_map){

	$process = new stdClass();

	switch($model){
		case 'component_3d':
		case 'component_av':
		case 'component_image':
		case 'component_pdf':
		case 'component_svg':
		case 'component_check_box':
			if($ddo_map){
				$process->ddo_map = $ddo_map;
			}
			$process->output_format = 'json';  
			break;
		case 'component_date':

			if($output === "split_date_range" && isset($output_options)){
				$date_format 	= $output_options->date_format ?? "date";
				$selected_key 	= $output_options->selected_key ?? 0;
				$selected_date 	= $output_options->selected_date ?? "start";

				$select = [$selected_date];
				$keys = [$selected_key];
				
				// date_format
					switch ($date_format) {
						case 'year':
							// 'y' = RAW year (no zero-pad): v6 date_format "year" emits "-72",
							// not "-072". The 'date'/'full' patterns below keep padded 'Y'
							// (full date strings DO pad, e.g. "-094-00-00 00:00:00").
							$pattern	= "y";
							break;
						case 'unix_timestamp':
							$pattern	= "unix_timestamp";
							break;
						case 'time':
							$pattern	= "H:i:s";
							break;
						case 'date':
							$pattern	= "Y-m-d";
							break;
						case 'full':
						default:
							$pattern	= "Y-m-d H:i:s";
							break;
					}
					
				$parser_process =(object)[											
					'parser' => [
						(object)[
							'fn' => 'parser_date::string_date',
							'options' => (object)[
								'select' => $select,
								'keys' => $keys,
								'pattern' => $pattern
							]
						]
					],
					'output_format' => 'string'							
				];

				$process = $parser_process;
				if($ddo_map){
					$process->ddo_map = $ddo_map;
				}
				$process->output_sample = "2026-02-26";
				break;
			}

			if($ddo_map){
				$process->ddo_map = $ddo_map;
			}
			$process->output_format = 'json'; 
			break;
		case 'component_dataframe':
		case 'component_email':
		case 'component_external':
		case 'component_filter':
		case 'component_geolocation':
		case 'component_info':
		case 'component_input_text':
		case 'component_inverse':
		case 'component_iri':	
		case 'component_json':
		case 'component_publication':
		case 'component_section_id':
		case 'component_text_area':
			if($ddo_map){
				$process->ddo_map = $ddo_map;
			}
			$process->output_format = 'json'; 
			break;
		// RELATION-FAMILY get_dato: the component stores LOCATORS, and v6's get_dato returns them
		// verbatim. Grouped with the scalar components above, they emitted `output_format:json`
		// with no locator parser — and a relation ddo with no parser resolves to NULL by design
		// (the oracle wire shape), so games.body_references published [null] against v6's full
		// locator objects. v6_raw_dato republishes the STORED locator: v6 key order, no per-item
		// `id`, section_id back to its published string form.
		case 'component_portal':
		case 'component_autocomplete':
		case 'component_autocomplete_hi':
		case 'component_autocomplete_ts':
		case 'component_relation_children':
		case 'component_relation_index':
		case 'component_relation_model':
		case 'component_relation_parent':
		case 'component_relation_related':
		case 'component_select':
		case 'component_select_lang':
		case 'component_radio_button':

			$parser_process = (object)[
				'parser' => [
					(object)[
						'fn'      => 'parser_locator::get_locator',
						'options' => (object)['v6_raw_dato' => true]
					]
				],
				"output_format" => "json"
			];
			if($ddo_map){
				$parser_process->ddo_map = $ddo_map;
			}
			$process = $parser_process;
			break;

		case 'relation_list':

			$parser_process = (object)[
				'parser' => [
					(object)['fn' => 'parser_locator::get_locator']
				],
				"output_format" => "json"
			];
			if($ddo_map){
				$parser_process->ddo_map = $ddo_map;
			}
			$process = $parser_process;
			$process->output_sample = [(object)[ "section_id" => "1", "section_tipo" => "55"]];

			break;
	}


	return $process;
	
}
