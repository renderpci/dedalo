// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



/**
* PRINT_LAYOUT_PRESETS
*
* Persistence layer for tool_print layout templates. A template is an ordinary
* section record (LAYOUTS_SECTION_TIPO) holding:
*   - the layout blob          (component_json,        LAYOUT_COMPONENT_JSON_TIPO)
*   - the template name         (component_input_text,  LAYOUT_NAME_TIPO)
*   - the target section_tipo   (component_input_text,  LAYOUT_SECTION_VALUE_TIPO)  <- SQO filter key
*   - the owning user           (component_select,      LAYOUT_USER_TIPO)
*   - the public/shared flag     (component_radio_button, LAYOUT_PUBLIC_TIPO)
*   - the default flag           (component_radio_button, LAYOUT_DEFAULT_TIPO)
*
* All writes go through the generic core data API (create / save / delete), each
* already permission- and scope-checked server-side — no bespoke tool endpoint.
* Directly adapted from tools/tool_export/js/export_user_presets.js.
*
* (!) ONTOLOGY CONSTANTS — provided by the project lead. The section is dd25 and
* it reuses the same shared component tipos as the export/search presets. If dd25
* turns out to define its own equivalent components, change them here only.
*/

	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'

	// monotonic counter → unique id_variant for fresh (uncached) layout-list reads
	let query_counter = 0



// ontology constants (single source of truth) ------------------------------

	// LAYOUTS_SECTION_TIPO. Section that stores the layout-template records.
	export const LAYOUTS_SECTION_TIPO			= 'dd25'
	// LAYOUT_COMPONENT_JSON_TIPO. Where the layout blob is stored (component_json).
	const LAYOUT_COMPONENT_JSON_TIPO			= 'dd625'
	// LAYOUT_NAME_TIPO. Where the template name is stored (component_input_text).
	const LAYOUT_NAME_TIPO						= 'dd624'
	// LAYOUT_SECTION_VALUE_TIPO. Where the target section_tipo is stored (component_input_text). SQO filter key.
	const LAYOUT_SECTION_VALUE_TIPO				= 'dd642'
	// LAYOUT_USER_TIPO. Where the owning user_id locator is stored (component_select).
	const LAYOUT_USER_TIPO						= 'dd654'
	// LAYOUT_PUBLIC_TIPO. Where the public/shared flag is stored (component_radio_button).
	const LAYOUT_PUBLIC_TIPO					= 'dd640'
	// LAYOUT_DEFAULT_TIPO. Where the default flag is stored (component_radio_button).
	const LAYOUT_DEFAULT_TIPO					= 'dd641'



/**
* GET_TARGET_SECTION_TIPO
* Normalizes the tool's target_section_tipo (which can be an array) to the
* scalar value used as the template scope (stored in LAYOUT_SECTION_VALUE_TIPO
* and filtered on).
* @param object self - The tool_print instance
* @return string
*/
const get_target_section_tipo = function(self) {
	return Array.isArray(self.target_section_tipo)
		? self.target_section_tipo[0]
		: self.target_section_tipo
}//end get_target_section_tipo



/**
* LIST_USER_LAYOUTS
* Fetches the saved layout templates available to the current user for the
* current target section (own templates + public ones), returning a built
* section instance rendered with the generic list ddo (template name).
* @param object self - The tool_print instance
* @return promise object - The section instance containing the templates list
*/
export const list_user_layouts = async function(self) {

	// target_section_tipo. template scope
		const target_section_tipo = get_target_section_tipo(self)

	// sqo. target section AND (public OR owned by current user)
		const locator_user = {
			section_id		: '' + page_globals.user_id,
			section_tipo	: 'dd128'
		}
		const locator_public_true = {
			section_id			: '1',
			section_tipo		: 'dd64',
			from_component_tipo	: LAYOUT_PUBLIC_TIPO
		}
		const filter = {
			"$and": [
				{
					q		: target_section_tipo,
					path	: [{
						component_tipo	: LAYOUT_SECTION_VALUE_TIPO,
						section_tipo	: LAYOUTS_SECTION_TIPO,
						model			: 'component_input_text',
						name			: 'Section tipo'
					}],
					type: 'jsonb'
				},
				{
					"$or": [
						{
							q		: locator_public_true,
							path	: [{
								component_tipo	: LAYOUT_PUBLIC_TIPO,
								section_tipo	: LAYOUTS_SECTION_TIPO,
								model			: 'component_radio_button',
								name			: 'Public'
							}],
							type: 'jsonb'
						},
						{
							q		: locator_user,
							path	: [{
								component_tipo	: LAYOUT_USER_TIPO,
								section_tipo	: LAYOUTS_SECTION_TIPO,
								model			: 'component_select',
								name			: 'User'
							}],
							type: 'jsonb'
						}
					]
				}
			]
		}
		const sqo = {
			select			: [],
			section_tipo	: [{
				tipo : LAYOUTS_SECTION_TIPO
			}],
			filter			: filter,
			limit			: 50,
			offset			: 0
		}

	// request_config. show the template name in the list
		const request_config = [{
			sqo			: sqo,
			api_engine	: 'dedalo',
			type		: 'main',
			show 		: {
				ddo_map : [{
					tipo			: LAYOUT_NAME_TIPO,
					section_tipo	: LAYOUTS_SECTION_TIPO,
					parent			: LAYOUTS_SECTION_TIPO
				}]
			}
		}]

	// section (list mode)
		const instance_options = {
			model			: 'section',
			tipo			: LAYOUTS_SECTION_TIPO,
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: null,
			mode			: 'list',
			lang			: page_globals.dedalo_data_lang,
			request_config	: request_config,
			add_show		: true,
			id_variant		: target_section_tipo + '_print_layouts',
			inspector		: false,
			filter			: false,
			session_save	: true,
			caller			: self
		}
		const section = await get_instance(instance_options)
		await section.build(true)


	return section
}//end list_user_layouts



/**
* QUERY_LAYOUTS
* Lists the templates available for the current target section, for the picker.
* dd25 only persists the dd625 blob, so we read every dd25 record's blob and
* filter client-side: same target_section_tipo AND (public OR owned by the user).
* @param object self - The tool_print instance
* @return promise array of { section_id, name }
*/
export const query_layouts = async function(self) {

	const target	= get_target_section_tipo(self)
	const user_id	= '' + page_globals.user_id

	// resolve every dd25 record id (read the blob component so datum carries the
	// section_ids of the existing records)
		const section = await get_instance({
			model			: 'section',
			tipo			: LAYOUTS_SECTION_TIPO,
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: null,
			mode			: 'list',
			lang			: page_globals.dedalo_data_nolan,
			request_config	: [{
				sqo			: { section_tipo:[{ tipo: LAYOUTS_SECTION_TIPO }], limit: 500, offset: 0 },
				api_engine	: 'dedalo',
				type		: 'main',
				show		: { ddo_map: [{ tipo: LAYOUT_COMPONENT_JSON_TIPO, section_tipo: LAYOUTS_SECTION_TIPO, parent: LAYOUTS_SECTION_TIPO }] }
			}],
			add_show		: true,
			// unique id_variant + session_save:false → always a FRESH fetch so
			// newly created/deleted templates appear immediately (no stale cache)
			id_variant		: 'print_layouts_' + (++query_counter),
			inspector		: false,
			filter			: false,
			session_save	: false
		})
		await section.build(true)

		const data	= (section.datum && Array.isArray(section.datum.data)) ? section.datum.data : []
		const ids	= [...new Set(
			data.filter(el => el && el.section_tipo===LAYOUTS_SECTION_TIPO && el.section_id!==undefined)
				.map(el => '' + el.section_id)
		)]

		try { section.destroy() } catch (e) { /* noop */ }

	// load each blob and filter (target + owner/public)
		const list = []
		for (let i = 0; i < ids.length; i++) {
			const id	= ids[i]
			const blob	= await load_layout({ section_id: id })
			if (!blob || typeof blob!=='object') continue
			if (blob.target_section_tipo && blob.target_section_tipo!==target) continue
			const is_public	= blob.visibility==='public'
			const is_owner	= ('' + (blob.owner_user_id ?? '')) === user_id
			if (!is_public && !is_owner) continue
			list.push({ section_id: id, name: blob.name || ('Template ' + id) })
		}


	return list
}//end query_layouts



/**
* LOAD_LAYOUT
* Retrieves the layout blob for a specific saved template.
* @param object options
* @param string options.section_id - The ID of the template to load
* @return promise object|null - The layout blob, or null if empty
*/
export const load_layout = async function(options) {

	// options
		const section_id = options.section_id

	// component_json (lg-nolan)
		const instance_options = {
			tipo			: LAYOUT_COMPONENT_JSON_TIPO,
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: section_id,
			model			: 'component_json',
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan
		}
		const component = await get_instance(instance_options)
		await component.build(true)
		const entries = component.data.entries

	// blob. component_json entries are stored as wrapper objects {id, value};
	// the layout payload lives under .value. Unwrap it but tolerate an
	// already-unwrapped entry (one carrying the payload directly).
		let layout = (entries && entries[0])
			? entries[0]
			: null
		if (
			layout && typeof layout==='object' && !Array.isArray(layout)
			&& !('pages' in layout)
			&& layout.value && typeof layout.value==='object'
		) {
			layout = layout.value
		}


	return layout
}//end load_layout



/**
* CREATE_NEW_LAYOUT
* Creates a new layout-template record: target section_tipo, owning user, name
* and the current layout blob.
* @param object options
* @param object options.self - The tool_print instance
* @param string options.name - Template name
* @param object options.layout - The layout blob to store
* @return promise string|bool - The new section_id, or false on error
*/
export const create_new_layout = async function(options) {

	// options
		const self		= options.self
		const name		= options.name || 'Untitled'
		const layout	= options.layout || {}

	// all template metadata lives INSIDE the blob (dd25 only persists the
	// component_json dd625): name, target section, owner, visibility. The
	// picker reads + filters these client-side (see query_layouts).
		layout.name				= name
		layout.target_section_tipo	= get_target_section_tipo(self)
		layout.owner_user_id		= '' + page_globals.user_id
		layout.visibility			= layout.visibility || 'user'

	// create the section record
		const rqo = {
			action	: 'create',
			source	: {
				section_tipo : LAYOUTS_SECTION_TIPO
			}
		}
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})

		if (!api_response.result || api_response.result <= 0) {
			console.error('Error on create new print layout section. api_response:', api_response);
			return false
		}

		const new_section_id = api_response.result

	// save ONLY the layout blob (dd625) — it carries all metadata
		const cmp = await get_instance({
			tipo			: LAYOUT_COMPONENT_JSON_TIPO,
			model			: 'component_json',
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: new_section_id,
			mode			: 'edit'
		})
		await cmp.build(true)
		await cmp.save([{ action:'insert', id:null, value: layout }])


	return new_section_id
}//end create_new_layout



/**
* SAVE_LAYOUT
* Saves the layout blob to an existing template record. Uses 'set_data' to
* replace the whole entries array (the blob is monovalue), preventing entry
* duplication.
* @param object options
* @param string options.section_id - The template record id
* @param object options.layout - The layout blob
* @return promise object|bool - The API response or false on error
*/
export const save_layout = async function(options) {

	// options
		const section_id	= options.section_id
		const layout		= options.layout

	// verify
		if (!section_id) {
			console.error('save_layout: invalid section_id:', section_id);
			return false
		}

	// rqo. save (set_data replaces the entire entries array)
		const rqo = {
			action	: 'save',
			source	: {
				tipo			: LAYOUT_COMPONENT_JSON_TIPO,
				section_tipo	: LAYOUTS_SECTION_TIPO,
				section_id		: section_id,
				lang			: page_globals.dedalo_data_nolan,
				type			: 'component'
			},
			data	: {
				changed_data : [
					{
						action	: 'set_data',
						id		: null,
						value	: [ { value : layout } ]
					}
				]
			}
		}

	// API request
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})

		if (!api_response.result) {
			console.error(`Error on save print layout (${section_id}). api_response:`, api_response);
			return false
		}

		if(SHOW_DEBUG===true) {
			console.log('Print layout saved!', api_response);
		}


	return api_response
}//end save_layout



/**
* UPDATE_LAYOUT_NAME
* Renames an existing template (component_input_text, set_data).
* @param object options
* @param string options.section_id
* @param string options.name
* @return promise object|bool
*/
export const update_layout_name = async function(options) {

	const section_id	= options.section_id
	const name			= options.name

	if (!section_id) {
		console.error('update_layout_name: invalid section_id:', section_id);
		return false
	}

	const rqo = {
		action	: 'save',
		source	: {
			tipo			: LAYOUT_NAME_TIPO,
			section_tipo	: LAYOUTS_SECTION_TIPO,
			section_id		: section_id,
			lang			: page_globals.dedalo_data_lang,
			type			: 'component'
		},
		data	: {
			changed_data : [
				{ action:'set_data', id:null, value:[ { value : name } ] }
			]
		}
	}

	return await data_manager.request({ body: rqo, use_worker: true })
}//end update_layout_name



/**
* DELETE_LAYOUT
* Deletes a layout-template record.
* @param string section_id - The ID of the template to delete
* @return promise object|bool - The API response or false on error
*/
export const delete_layout = async function(section_id) {

	if (!section_id) {
		console.error('delete_layout: invalid section_id:', section_id);
		return false
	}

	// use the proven section.delete_section() (same path the export tool uses):
	// it builds the correct source via create_source and the delete_record sqo.
	const section = await get_instance({
		model			: 'section',
		tipo			: LAYOUTS_SECTION_TIPO,
		section_tipo	: LAYOUTS_SECTION_TIPO,
		section_id		: section_id,
		mode			: 'list',
		lang			: page_globals.dedalo_data_lang,
		id_variant		: 'print_layout_delete_' + section_id,
		session_save	: false
	})
	await section.build(true)

	const ok = await section.delete_section({
		sqo	: {
			section_tipo		: [ LAYOUTS_SECTION_TIPO ],
			filter_by_locators	: [{ section_tipo: LAYOUTS_SECTION_TIPO, section_id: section_id }],
			limit				: 1
		},
		delete_mode					: 'delete_record',
		delete_diffusion_records	: false
	})

	try { section.destroy() } catch (e) { /* noop */ }


	return ok
}//end delete_layout



// @license-end
