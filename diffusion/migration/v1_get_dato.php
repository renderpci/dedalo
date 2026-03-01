<?php

function get_dato($model, $custom_arguments, $output){

	switch($model){
		case 'component_3d':
		case 'component_av':
		case 'component_image':
		case 'component_pdf':
		case 'component_svg':
		case 'component_check_box':
		case 'component_date':
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
		case 'component_portal':
		case 'component_autocomplete':
		case 'component_autocomplete_hi':
		case 'component_autocomplete_ts':
		case 'component_publication':
		case 'component_relation_children':
		case 'component_relation_index':
		case 'component_relation_model':
		case 'component_relation_parent':
		case 'component_relation_related':
		case 'component_section_id':
		case 'component_select': 
		case 'component_select_lang':
		case 'component_radio_button':		
		case 'component_text_area':
			$process = new stdClass();
				$process->output_format = 'json';  
			break;
	}


	return $process;
	
}
