<?php declare(strict_types=1);



/**
* GET_ELEMENTS
* @return array $elements
*/
function get_elements() : array {

	// components general values
		$section_tipo	= 'test3';
		$section_id		= 1;
		$mode			= 'edit';
		$lang			= DEDALO_DATA_LANG; // 'lg-eng';
		// $permissions	= 2;

	$elements = [
		(object)[
			'model'				=> 'component_3d',
			'tipo'				=> 'test26',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'random_3d_data', // return array
			'new_value_params'	=> [$section_tipo, $section_id, 'test26']
		],
		(object)[
			'model'			=> 'component_av',
			'tipo'			=> 'test94',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_av_data',
		],
		(object)[
			'model'				=> 'component_check_box',
			'tipo'				=> 'test88',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['dd501','test88',3]
		],
		(object)[
			'model'			=> 'component_date',
			'tipo'			=> 'test145',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_date'
		],
		(object)[
			'model'			=> 'component_email',
			'tipo'			=> 'test208',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_email'
		],
		(object)[
			'model'				=> 'component_filter_master',
			'tipo'				=> 'test70',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> [$section_tipo,'test70',2]
		],
		(object)[
			'model'			=> 'component_filter_records',
			'tipo'			=> 'test69',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_filter_records'
		],
		(object)[
			'model'				=> 'component_filter',
			'tipo'				=> 'test101',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> [$section_tipo,'test101',2]
		],
		(object)[
			'model'			=> 'component_geolocation',
			'tipo'			=> 'test100',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_geolocation',
		],
		(object)[
			'model'			=> 'component_image',
			'tipo'			=> 'test99',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_image_data',
		],
		(object)[
			'model'			=> 'component_input_text',
			'tipo'			=> 'test52',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'ar_random_string',
		],
		(object)[
			'model'			=> 'component_inverse',
			'tipo'			=> 'test68',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'test_save'		=> false
		],
		(object)[
			'model'			=> 'component_iri',
			'tipo'			=> 'test140',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_iri_data'
		],
		(object)[
			'model'			=> 'component_json',
			'tipo'			=> 'test18',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_json'
		],
		(object)[
			'model'			=> 'component_number',
			'tipo'			=> 'test211',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'ar_random_number'
		],
		(object)[
			'model'			=> 'component_password',
			'tipo'			=> 'test152',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang
		],
		(object)[
			'model'			=> 'component_pdf',
			'tipo'			=> 'test85',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_pdf_data'
		],
		(object)[
			'model'				=> 'component_portal',
			'tipo'				=> 'test80',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['test38','test80',2]
		],
		(object)[
			'model'				=> 'component_publication',
			'tipo'				=> 'test92',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['dd64','test92',2]
		],
		(object)[
			'model'				=> 'component_radio_button',
			'tipo'				=> 'test87',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['dd501','test87',2]
		],
		(object)[
			'model'				=> 'component_relation_children',
			'tipo'				=> 'test201',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> [
				$section_tipo, // section_tipo
				'test201', // from_component_tipo
				0, // max random int (not used)
				DEDALO_RELATION_TYPE_CHILDREN_TIPO, // 'dd48', // type
				2 // custom section_id
			]
		],
		(object)[
			'model'				=> 'component_relation_index',
			'tipo'				=> 'test25',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['es1','test25',50],
			'test_save'			=> false
		],
		(object)[
			'model'				=> 'component_relation_model',
			'tipo'				=> 'test169',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['es2','test169',5]
		],
		(object)[
			'model'				=> 'component_relation_parent',
			'tipo'				=> 'test71',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['test3','test71',0,'dd47',3],
			'test_save'			=> false
		],
		(object)[
			'model'				=> 'component_relation_related',
			'tipo'				=> 'test54',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> [$section_tipo,'test54',3]
		],
		(object)[
			'model'			=> 'component_section_id',
			'tipo'			=> 'test102',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_string',
			'test_save'		=> false
		],
		(object)[
			'model'			=> 'component_security_access',
			'tipo'			=> 'test157',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_security_access'
		],
		(object)[
			'model'				=> 'component_select',
			'tipo'				=> 'test91',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['es1','test91',10]
		],
		(object)[
			'model'				=> 'component_select_lang',
			'tipo'				=> 'test89',
			'section_tipo'		=> $section_tipo,
			'section_id'		=> $section_id,
			'mode'				=> $mode,
			'lang'				=> $lang,
			'new_value'			=> 'ar_random_locator',
			'new_value_params'	=> ['lg1','test89',3]
		],
		(object)[
			'model'			=> 'component_svg',
			'tipo'			=> 'test177',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'random_svg_data'
		],
		(object)[
			'model'			=> 'component_text_area',
			'tipo'			=> 'test17',
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'mode'			=> $mode,
			'lang'			=> $lang,
			'new_value'		=> 'ar_random_string'
		]
	];

	return $elements;
}//end get_elements
