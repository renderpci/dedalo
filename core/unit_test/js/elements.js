// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0




/**
* ELEMENTS
* List of components to test
* Defines components that will be test
*/



import * as fn from './data.js'



export const elements = []



// components general values
export const section_tipo	= 'test3'
export const section_id		= 1
export const mode			= 'edit'
export const lang			= 'lg-eng'
export const permissions	= 2



// component_3d
	elements.push({
		model				: 'component_3d',
		tipo				: 'test26',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_3d_data, // return array
		new_value_params	: [section_tipo, section_id, 'test26'],
		new_value_action	: 'set_data'
		// test_save		: false
	})

// component_av
	elements.push({
		model				: 'component_av',
		tipo				: 'test94',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_av_data, // return array
		new_value_params	: [section_tipo, section_id, 'test94'],
		new_value_action	: 'set_data'
		// test_save		: false
	})

// button
	// elements.push({
	// 	model			: 'button',
	// 	tipo			: 'test212',
	// 	section_tipo	: section_tipo,
	// 	section_id		: section_id,
	// 	mode			: mode,
	// 	lang			: page_globals.dedalo_data_nolan,
	// 	new_value		: fn.random_string,
	// 	test_save		: false
	// })

// component_calculation -to disappear-  (WORKING HERE)

// component_check_box
	elements.push({
		model				: 'component_check_box',
		tipo				: 'test88',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['dd501','test88']
	})

// component_date
	elements.push({
		model			: 'component_date',
		tipo			: 'test145',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: page_globals.dedalo_data_nolan,
		new_value		: fn.random_date
	})

// component_email
	elements.push({
		model			: 'component_email',
		tipo			: 'test208',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: page_globals.dedalo_data_nolan,
		new_value		: fn.random_email
	})

// component_external -zenon- (WORKING HERE)

// component_filter_master
	elements.push({
		model				: 'component_filter_master',
		tipo				: 'test70',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: [section_tipo,'test70'] // [section_tipo, from_component_tipo, paginated_key]
	})

// component_filter_records
	elements.push({
		model				: 'component_filter_records',
		tipo				: 'test69',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_filter_records,
		new_value_params	: [] // [section_tipo, from_component_tipo, paginated_key]
	})

// component_filter
	elements.push({
		model				: 'component_filter',
		tipo				: 'test101',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: [section_tipo,'test101'] // [section_tipo, from_component_tipo, paginated_key]
	})

// component_geolocation
	elements.push({
		model				: 'component_geolocation',
		tipo				: 'test100',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_geolocation,
		new_value_params	: [] // [section_tipo, from_component_tipo, paginated_key]
	})

// component grouper/sync ?????? (WORKING HERE)

// component_image
	elements.push({
		model				: 'component_image',
		tipo				: 'test99',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_image_data,
		new_value_params	: [],
		new_value_action	: 'set_data'
		// test_save		: false
	})

// component_info -widgets- (WORKING HERE)

// component_input_text
	elements.push({
		model			: 'component_input_text',
		tipo			: 'test52',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: lang,
		new_value		: fn.random_string
	})

// component_inverse -section_id from caller-
	elements.push({
		model			: 'component_inverse',
		tipo			: 'test68',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: lang, // is nolan ?
		test_save		: false
	})

// component_ip -to disappear- (WORKING HERE)

// component_iri
	elements.push({
		model			: 'component_iri',
		tipo			: 'test140',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: lang, // is nolan ?
		new_value		: fn.random_iri_data
	})

// component_json
	elements.push({
		model			: 'component_json',
		tipo			: 'test18',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: page_globals.dedalo_data_nolan,
		new_value		: fn.random_json
	})

// component_number
	elements.push({
		model			: 'component_number',
		tipo			: 'test211',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: page_globals.dedalo_data_nolan,
		new_value		: fn.random_number
	})

// component_password
	elements.push({
		model			: 'component_password',
		tipo			: 'test152',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: page_globals.dedalo_data_nolan,
		new_value		: fn.random_string,
		test_save		: false
	})

// component_pdf
	elements.push({
		model				: 'component_pdf',
		tipo				: 'test85',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: lang,
		new_value			: fn.random_pdf_data,
		new_value_params	: [],
		new_value_action	: 'set_data'
		// test_save		: false
	})

// component_portal (basic v5 config)
	elements.push({
		model				: 'component_portal',
		tipo				: 'test80',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['test38', 'test80', 0] // [section_tipo, from_component_tipo, paginated_key]
	})

// component_publication
	elements.push({
		model				: 'component_publication',
		tipo				: 'test92',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['dd64','test92']
	})

// component_radio_button
	elements.push({
		model				: 'component_radio_button',
		tipo				: 'test87',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['dd501','test87']
	})

// component_relation_children
	elements.push({
		model				: 'component_relation_children',
		tipo				: 'test201',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.custom_locator,
		new_value_params	: [
			section_tipo, // section_tipo
			2, // section_id
			'test201', // from_component_tipo
			'dd48' // type
		],
		test_save			: true
	})

// component_relation_index
	elements.push({
		model				: 'component_relation_index',
		tipo				: 'test25',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['es1','test25'],
		test_save			: false
		// test_exclude		: [
		// 	'save data equals'
		// ]
	})

// component_relation_model
	elements.push({
		model				: 'component_relation_model',
		tipo				: 'test169',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['es2','test169']
	})

// component_relation_parent
	elements.push({
		model				: 'component_relation_parent',
		tipo				: 'test71',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['es1','test71'],
		test_save			: true
	})

// component_relation_related
	elements.push({
		model				: 'component_relation_related',
		tipo				: 'test54', //  'test56',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: [section_tipo,'test54']
	})

// component_section_id
	elements.push({
		model			: 'component_section_id',
		tipo			: 'test102',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: page_globals.dedalo_data_nolan,
		new_value		: fn.random_string,
		test_save		: false
	})

// component_security_access
	elements.push({
		model				: 'component_security_access',
		tipo				: 'test157',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_security_access
	})

// component_select
	elements.push({
		model				: 'component_select',
		tipo				: 'test91',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['es1','test91']
	})

// component_select_lang
	elements.push({
		model				: 'component_select_lang',
		tipo				: 'test89',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_locator,
		new_value_params	: ['lg1','test89']
	})

// component_svg
	elements.push({
		model				: 'component_svg',
		tipo				: 'test177',
		section_tipo		: section_tipo,
		section_id			: section_id,
		mode				: mode,
		lang				: page_globals.dedalo_data_nolan,
		new_value			: fn.random_svg_data,
		new_value_action	: 'set_data'
		// test_save		: false
	})

// component_text_area
	elements.push({
		model			: 'component_text_area',
		tipo			: 'test17',
		section_tipo	: section_tipo,
		section_id		: section_id,
		mode			: mode,
		lang			: lang,
		new_value		: fn.random_string
	})



// @license-end
