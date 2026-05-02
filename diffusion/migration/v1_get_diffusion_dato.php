<?php

function get_diffusion_dato($model, $custom_arguments, $process_dato_arguments, $output, $ddo_map=null){

    $process = new stdClass();

	switch($model){
		case 'component_3d':
		case 'component_av':
		case 'component_image':
		case 'component_pdf':
		case 'component_svg':
		case 'component_section_id':
		case 'component_date':
		case 'component_email':
		case 'component_external':
		case 'component_geolocation':
		case 'component_input_text':
		case 'component_iri':
		case 'component_json':
		case 'component_text_area':
			break;

		case 'component_info':

			$argument = $custom_arguments[0];
			$parser_options = new stdClass();
			if(isset($argument->widget_name)){
				$parser_options->widget_name = $argument->widget_name;
			}
			if(isset($argument->select)){
				$parser_options->select = $argument->select;
			}
			if(isset($argument->value_format)){
				$parser_options->keys = [0];
			}

			$parser_process = (object)[
				'parser' => [
					(object)[
						'fn' => 'parser_info::widget',
						'options' => $parser_options
					]
				],
				'output_format' => 'string'							
			];
			$process = $parser_process;
			$process->output_sample = "0.6";
			break;


		case 'component_publication':
		case 'component_select':
		case 'component_select_lang':
		case 'component_portal':
		case 'component_autocomplete':
		case 'component_autocomplete_hi':
		case 'component_filter':
		case 'component_autocomplete_ts':
		case 'component_relation_children':
		case 'component_relation_index':
		case 'component_relation_model':
		case 'component_relation_parent':
		case 'component_relation_related':
		case 'component_check_box':
		case 'component_radio_button':
		case 'component_inverse':
		case 'component_dataframe':

			$parser_process = (object)[					
				'parser' => [
					(object)[
						'fn' => 'parser_locator::get_section_id'
					]
				],
				"output_format" => "json"
			];

			$merge_option = 'pipe';
			if ($output === 'merged') {
				$merge_option = null;
			} else if ($output === 'merged_group') {
				$merge_option = 'flat';
			} else if ($output === 'merged_unique') {
				$merge_option = 'unique';
			}

			if ($merge_option !== null) {
				$parser_process->parser[] = (object)[
					'fn' => 'parser_helper::merge',
					'options' => (object)[
						'merge' => $merge_option
					]
				];
			}

			if($ddo_map){
				$parser_process->ddo_map = $ddo_map;
			}
			$process = $parser_process;
			$process->output_sample = ["1","55"];
			break;

		case 'relation_list':

			$filter_section 		= $process_dato_arguments->filter_section ?? "";
			$filter_component 		= $process_dato_arguments->filter_component ?? "";
			$format 				= $process_dato_arguments->format ?? "";

			break;
		
	}

	return $process;
	
}
