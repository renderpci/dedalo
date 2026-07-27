<?php

function get_valor($model, $custom_arguments, $output){

	$process = new stdClass();

	switch($model){
		case 'component_3d':
		case 'component_av':
		case 'component_image':
		case 'component_pdf':
		case 'component_svg':
			break;
		case 'component_check_box':
			break;
		case 'component_date':
			break;
		case 'component_dataframe':
			break;
		case 'component_email':
			break;
		case 'component_external':
			break;
		case 'component_filter':
			break;
		case 'component_geolocation':
			break;
		case 'component_info':
			break;
		case 'component_input_text':
			break;
		case 'component_inverse':
			break;
		case 'component_iri':
			break;
		case 'component_json':
			break;
		case 'component_portal':
			break;
		case 'component_autocomplete':
			break;
		case 'component_autocomplete_hi':
		case 'component_autocomplete_ts':
			break;
		case 'component_publication':  
			break;
		case 'component_relation_children':
		case 'component_relation_index':
		case 'component_relation_model':
		case 'component_relation_parent':
		case 'component_relation_related':
			break;
		case 'component_section_id':
		case 'component_select':    
		case 'component_select_lang':
		case 'component_radio_button':
			break;
		case 'component_text_area':     
			break;
	}
	
}
