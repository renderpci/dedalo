// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0

/**
 * TEST_REGISTRY
 * Single source of truth for client test suites and groups.
 *
 * Each suite maps to one iframe run (one Mocha file via frame_runner).
 * - area: JS module name under test/client/js/ (without .js)
 * - model: optional query param for parameterized suites (e.g. test_component_full)
 */

import {elements} from './elements.js'

/** Generic integration / infrastructure suites */
export const generic_suites = [
	'test_key_instances',
	'test_get_instance',
	'test_delete_instance',
	'test_components_lifecycle',
	'test_others_lifecycle',
	'test_instances_lifecycle',
	'test_event_manager',
	'test_components_data_changes',
	'test_components_activate',
	'test_components_render',
	'test_no_logged_error',
	'test_unknown_error',
	'test_page',
	'test_diffusion',
	'test_ts_object',
	'test_ts_object_extended',
	'test_component_common_changed_data',
	'test_additional_text_area',
	'test_section_record',
	'test_service_autocomplete',
	'test_service_time_machine'
]

/** Per-component lifecycle suites (one Mocha file per component type) */
export const lifecycle_suites = [
	'test_component_3d',
	'test_component_av',
	'test_component_check_box',
	'test_component_date',
	'test_component_email',
	'test_component_external',
	'test_component_filter',
	'test_component_filter_records',
	'test_component_geolocation',
	'test_component_image',
	'test_component_input_text',
	'test_component_info',
	'test_component_inverse',
	'test_component_iri',
	'test_component_json',
	'test_component_number',
	'test_component_password',
	'test_component_pdf',
	'test_component_portal',
	'test_component_portal_pagination',
	'test_component_publication',
	'test_component_radio_button',
	'test_component_relation_children',
	'test_component_relation_index',
	'test_component_relation_model',
	'test_component_relation_parent',
	'test_component_relation_related',
	'test_component_section_id',
	'test_component_security_access',
	'test_component_select',
	'test_component_select_lang',
	'test_component_svg',
	'test_component_text_area',
]

/** Per-tool suites (one Mocha file per tool under tools/) */
export const tool_suites = [
	'test_tool_qr',
	'test_tool_assistant',
	'test_tool_cataloging',
	'test_tool_dd_label',
	'test_tool_dev_template',
	'test_tool_diffusion',
	'test_tool_export',
	'test_tool_hierarchy',
	'test_tool_image_rotation',
	'test_tool_import_dedalo_csv',
	'test_tool_import_files',
	'test_tool_import_marc21',
	'test_tool_import_rdf',
	'test_tool_import_zotero',
	'test_tool_indexation',
	'test_tool_lang',
	'test_tool_lang_multi',
	'test_tool_media_versions',
	'test_tool_numisdata_epigraphy',
	'test_tool_numisdata_order_coins',
	'test_tool_ontology',
	'test_tool_ontology_parser',
	'test_tool_pdf_extractor',
	'test_tool_posterframe',
	'test_tool_print',
	'test_tool_propagate_component_data',
	'test_tool_subtitles',
	'test_tool_tc',
	'test_tool_time_machine',
	'test_tool_tr_print',
	'test_tool_transcription',
	'test_tool_update_cache',
	'test_tool_upload',
	'test_tool_user_admin',
]

/**
 * Test groups rendered in the sidebar.
 * Component group uses elements.js definitions routed through test_component_full.
 */
export const test_groups = [
	{
		id		: 'generic',
		title	: 'generic',
		type	: 'generic',
		suites	: generic_suites.map(name => ({ id: name, area: name }))
	},
	{
		id		: 'lifecycle',
		title	: 'life-cycle',
		type	: 'generic',
		suites	: lifecycle_suites.map(name => ({ id: name, area: name }))
	},
	{
		id		: 'tools',
		title	: 'tools',
		type	: 'generic',
		suites	: tool_suites.map(name => ({ id: name, area: name }))
	},
	{
		id		: 'component',
		title	: 'components',
		type	: 'component',
		suites	: elements.map(el => ({
			id		: el.model,
			area	: 'test_component_full',
			model	: el.model,
			tipo	: el.tipo,
			element	: el
		}))
	}
]

// @license-end
