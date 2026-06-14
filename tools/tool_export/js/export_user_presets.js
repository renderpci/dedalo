// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'



// vars
	// presets_section_tipo. Export presets section (mirrors search dd623). Reuses dd623 child components.
	export const presets_section_tipo					= 'dd1781'
	// component_json_preset_tipo. Where the export config blob is stored (component_json)
	const presets_component_json_tipo					= 'dd625'
	// component_section_value_tipo. Where the target section_tipo is stored (component_input_text)
	const presets_component_section_value_tipo			= 'dd642'
	// component_user_value_tipo. Where the owning user_id is stored (component_select)
	const presets_component_user_id_value_tipo			= 'dd654'
	// presets_component_name_value_tipo. Where the preset name is stored
	const presets_component_name_value_tipo				= 'dd624'
	// presets_component_public_value_tipo. Where the preset public value is stored
	const presets_component_public_value_tipo			= 'dd640'
	// presets_component_default_value_tipo. Where the preset default value is stored
	const presets_component_default_value_tipo			= 'dd641'



/**
* GET_TARGET_SECTION_TIPO
* Normalizes the tool's target_section_tipo (which can be an array) to the
* scalar value used as the preset scope (stored in dd642 and filtered on).
* @param object self - The tool_export instance
* @return string
*/
const get_target_section_tipo = function(self) {
	return Array.isArray(self.target_section_tipo)
		? self.target_section_tipo[0]
		: self.target_section_tipo
}//end get_target_section_tipo



/**
* BUILD_EXPORT_CONFIG
* Reads the tool's current UI state into the config blob stored in the preset
* (component_json dd625). This is the inverse of apply_export_preset.
* @param object self - The tool_export instance
* @return object config
*/
export const build_export_config = function(self) {

	const node = self.node || document

	// helper. read a checkbox state by class with a fallback
	const get_checked = (class_name, fallback) => {
		const el = node.querySelector('.' + class_name)
		return el ? el.checked : fallback
	}

	return {
		ar_ddo_to_export	: self.ar_ddo_to_export || [],
		data_format			: self.data_format || 'value',
		breakdown			: self.breakdown || 'default',
		fill_the_gaps		: get_checked('fill_the_gaps_check', true),
		value_with_parents	: get_checked('value_with_parents_check', false),
		show_tipo_in_label	: get_checked('show_tipo_in_label_check', false)
	}
}//end build_export_config



/**
* APPLY_EXPORT_PRESET
* Rebuilds the export tool UI from a saved config blob: restores the selected
* columns and the format/breakdown/option controls, then persists the result
* as the current working state (IndexedDB).
* @param object options
* {
* 	self : object (tool_export instance)
* 	config : object (export config blob, from load_export_preset)
* 	section_id : string|int (preset section_id)
* }
* @return promise bool
*/
export const apply_export_preset = async function(options) {

	// options
		const self			= options.self
		const config		= options.config || {}
		const section_id	= options.section_id

		const node					= self.node || document
		const user_selection_list	= self.user_selection_list

	// clear current selection (DOM + state)
		if (user_selection_list) {
			while (user_selection_list.hasChildNodes()) {
				user_selection_list.removeChild(user_selection_list.lastChild)
			}
		}
		self.ar_ddo_to_export = []

	// rebuild selected columns (same path as the IndexedDB restore loop)
		const ar_ddo = Array.isArray(config.ar_ddo_to_export)
			? config.ar_ddo_to_export
			: []
		for (let i = 0; i < ar_ddo.length; i++) {
			const ddo					= ar_ddo[i]
			const export_component_node	= await self.build_export_component(ddo)
			if (user_selection_list) {
				user_selection_list.appendChild(export_component_node)
			}
			self.ar_ddo_to_export.push(ddo)
		}

	// data_format
		if (config.data_format && ['value','grid_value','dedalo_raw'].includes(config.data_format)) {
			self.data_format = config.data_format
			localStorage.setItem('selected_data_format_export', config.data_format)
			const select_format = node.querySelector('.select_data_format_export')
			if (select_format) {
				select_format.value = config.data_format
			}
		}

	// breakdown
		if (config.breakdown && ['default','rows','columns'].includes(config.breakdown)) {
			self.breakdown = config.breakdown
			localStorage.setItem('selected_breakdown_export', config.breakdown)
			const select_breakdown = node.querySelector('.select_breakdown_export')
			if (select_breakdown) {
				select_breakdown.value = config.breakdown
			}
		}

	// option checkboxes (defaults match the render: fill_the_gaps on, others off)
		const set_checked = (class_name, value) => {
			const el = node.querySelector('.' + class_name)
			if (el) {
				el.checked = !!value
			}
		}
		set_checked('fill_the_gaps_check', config.fill_the_gaps !== false)
		set_checked('value_with_parents_check', config.value_with_parents === true)
		set_checked('show_tipo_in_label_check', config.show_tipo_in_label === true)

	// re-sync disabled states (breakdown only on grid_value; parents not on dedalo_raw)
		const select_breakdown = node.querySelector('.select_breakdown_export')
		if (select_breakdown) {
			select_breakdown.disabled = (self.data_format!=='grid_value')
		}
		const parents_check = node.querySelector('.value_with_parents_check')
		if (parents_check) {
			parents_check.disabled = (self.data_format==='dedalo_raw')
		}

	// persist the applied preset as the current working state
		await self.update_local_db_data()

	// mark the selected preset and reveal the save button
		self.user_preset_section_id = section_id
		if (self.button_save_preset) {
			self.button_save_preset.classList.remove('hide')
		}

	return true
}//end apply_export_preset



/**
* LOAD_USER_EXPORT_PRESETS
* Fetches the list of saved export presets for the current user and target
* section, returning a built section instance rendered with the
* 'export_user_presets' view.
* @param object self - The tool_export instance
* @return promise object - The section instance containing the presets list
*/
export const load_user_export_presets = async function(self) {

	// target_section_tipo. preset scope
		const target_section_tipo = get_target_section_tipo(self)

	// sqo
		const locator_user = {
			section_id		: '' + page_globals.user_id,
			section_tipo	: 'dd128'
		}
		const locator_public_true = {
			section_id			: '1',
			section_tipo		: 'dd64',
			from_component_tipo	: presets_component_public_value_tipo // 'dd640'
		}
		const filter = {
			"$and": [
				{
					q		: target_section_tipo,
					path	: [{
						component_tipo	: presets_component_section_value_tipo, // 'dd642',
						section_tipo	: presets_section_tipo, // 'dd1781'
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
								component_tipo	: presets_component_public_value_tipo, // 'dd640',
								section_tipo	: presets_section_tipo, // 'dd1781'
								model			: 'component_radio_button',
								name			: 'Public'
							}],
							type: 'jsonb'
						},
						{
							q		: locator_user,
							path	: [{
								component_tipo	: presets_component_user_id_value_tipo, // 'dd654',
								section_tipo	: presets_section_tipo, // 'dd1781'
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
				tipo : presets_section_tipo // 'dd1781'
			}],
			filter			: filter,
			limit			: 15,
			offset			: 0
		}

	// request_config
		const request_config = [{
			sqo			: sqo,
			api_engine	: 'dedalo',
			type		: 'main',
			show 		: {
				ddo_map : [{
					tipo			: presets_component_name_value_tipo, // 'dd624',
					section_tipo	: presets_section_tipo, // 'dd1781',
					parent			: presets_section_tipo // 'dd1781'
				}]
			}
		}]

	// section
		const instance_options = {
			model			: 'section',
			tipo			: presets_section_tipo, // 'dd1781'
			section_tipo	: presets_section_tipo, // 'dd1781'
			section_id		: null,
			mode			: 'list',
			lang			: page_globals.dedalo_data_lang,
			request_config	: request_config,
			add_show		: true,
			id_variant		: target_section_tipo + '_export_user_presets',
			inspector		: false, // (!) disable elements
			filter			: false, // (!) disable elements
			session_save	: true, // Set as true to save the session and preserve counter coherence
			view			: 'export_user_presets',
			caller			: self
		}
		const section = await get_instance(instance_options)
		await section.build(true)


	return section
}//end load_user_export_presets



/**
* EDIT_USER_EXPORT_PRESET
* Initializes a preset record in edit mode for the modal editor (name, public,
* default).
* @param object self - The tool_export instance
* @param int|string section_id - The ID of the preset to edit
* @return promise object - The initialized section instance
*/
export const edit_user_export_preset = async function(self, section_id) {

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			type		: 'main',
			show		: {
				ddo_map : [
					{
						tipo			: presets_component_name_value_tipo, // 'dd624',
						section_tipo	: presets_section_tipo, // 'dd1781'
						parent			: presets_section_tipo, // 'dd1781'
						properties : { show_interface : { tools : false } }
					},
					{
						tipo			: presets_component_public_value_tipo, // 'dd640',
						section_tipo	: presets_section_tipo, // 'dd1781'
						parent			: presets_section_tipo, // 'dd1781'
						properties : { show_interface : { tools : false } }
					},
					{
						tipo			: presets_component_default_value_tipo, // 'dd641',
						section_tipo	: presets_section_tipo, // 'dd1781'
						parent			: presets_section_tipo, // 'dd1781'
						properties : { show_interface : { tools : false } }
					}
				]
			}
		}]

	// section
		const instance_options = {
			model			: 'section',
			tipo			: presets_section_tipo, // 'dd1781'
			section_tipo	: presets_section_tipo, // 'dd1781'
			section_id		: section_id,
			mode			: 'edit',
			lang			: page_globals.dedalo_data_lang,
			request_config	: request_config,
			add_show		: true,
			session_save	: false, // Set as false to prevent overwrite of the current session
			id_variant		: presets_section_tipo +'_'+ section_id + '_export_user_preset_edit'
		}
		const section = await get_instance(instance_options)
		// filter search disallow
			section.filter = false
		// inspector disallow
			section.inspector = false
		// build
			await section.build(true)


	return section
}//end edit_user_export_preset



/**
* LOAD_EXPORT_PRESET
* Retrieves the export config blob for a specific saved preset.
* @param object options
* @param string options.section_id - The ID of the preset to load
* @return promise object - The export config blob
*/
export const load_export_preset = async function(options) {

	// options
		const section_id = options.section_id

	// component
		const instance_options = {
			tipo			: presets_component_json_tipo, // dd625
			section_tipo	: presets_section_tipo, // dd1781
			section_id		: section_id,
			model			: 'component_json',
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan
		}
		const component = await get_instance(instance_options)
		await component.build(true)
		const entries = component.data.entries

	// config blob
		// component_json entries are stored as wrapper objects {id, value}; the
		// actual config payload lives under .value. Unwrap it, but tolerate an
		// already-unwrapped entry (one that carries the payload directly).
		let config = (entries && entries[0])
			? entries[0]
			: {} // default empty config
		if (
			config && typeof config==='object' && !Array.isArray(config)
			&& !('ar_ddo_to_export' in config)
			&& config.value && typeof config.value==='object'
		) {
			config = config.value
		}


	return config
}//end load_export_preset



/**
* CREATE_NEW_EXPORT_PRESET
* Creates a new export preset record in the database, storing the target
* section_tipo, the owning user and the current export config blob.
* @param object options
* @param object options.self - The tool_export instance
* @param string options.section_tipo - The export presets section (dd1781)
* @return promise string|bool - The new section ID or false on error
*/
export const create_new_export_preset = async function(options) {

	// options
		const self			= options.self
		const section_tipo	= options.section_tipo // dd1781

	// short vars
		const locator_user	= {
			section_id		: '' + page_globals.user_id,
			section_tipo	: 'dd128'
		}
		const target_section_tipo	= get_target_section_tipo(self)
		const config				= build_export_config(self)

	// data_manager. create
		const rqo = {
			action	: 'create',
			source	: {
				section_tipo : section_tipo
			}
		}
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})

		if (!api_response.result || api_response.result <= 0) {
			console.error('Error on create new export preset section. api_response:', api_response);
			return false
		}

		const new_section_id = api_response.result

	// save the preset components in parallel
		const save_promises = []

		// save target section_tipo value (dd642)
		save_promises.push(
			(async () => {
				const component_instance_section_tipo = await get_instance({
					tipo			: presets_component_section_value_tipo, // 'dd642',
					model			: 'component_input_text',
					section_tipo	: section_tipo,
					section_id		: new_section_id,
					mode			: 'edit'
				})
				await component_instance_section_tipo.build(true)
				await component_instance_section_tipo.save([{
					action	: 'insert',
					id		: null,
					value	: { value: target_section_tipo }
				}])
			})()
		)

		// save user value (dd654)
		save_promises.push(
			(async () => {
				const component_instance_user = await get_instance({
					tipo			: presets_component_user_id_value_tipo, // 'dd654',
					model			: 'component_select',
					section_tipo	: section_tipo,
					section_id		: new_section_id,
					mode			: 'edit'
				})
				await component_instance_user.build(true)
				await component_instance_user.save([{
					action	: 'insert',
					id		: null,
					value	: locator_user
				}])
			})()
		)

		// save current export config blob (dd625)
		save_promises.push(
			(async () => {
				const component_instance_json = await get_instance({
					tipo			: presets_component_json_tipo, // 'dd625',
					model			: 'component_json',
					section_tipo	: section_tipo,
					section_id		: new_section_id,
					mode			: 'edit'
				})
				await component_instance_json.build(true)
				await component_instance_json.save([{
					action	: 'insert',
					id		: null,
					value	: config
				}])
			})()
		)

		await Promise.all(save_promises)


	return new_section_id
}//end create_new_export_preset



/**
* SAVE_EXPORT_PRESET
* Saves the current export config blob to an existing preset record.
* Uses 'set_data' to replace the whole entries array (preset is monovalue),
* preventing entry duplication.
* @param object options
* @param object options.self - The tool_export instance
* @param string options.section_tipo - The export presets section (dd1781)
* @param string options.section_id - The ID of the preset record
* @return promise object|bool - The API response or false on error
*/
export const save_export_preset = async function(options) {

	// options
		const self			= options.self
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id

	// verify vars
		if (!section_tipo || !section_id) {
			console.error('Invalid section_tipo or section_id:', section_tipo, section_id);
			return false
		}

	// current config blob
		const config = build_export_config(self)

	// rqo. save (set_data replaces the entire entries array)
		const rqo = {
			action	: 'save',
			source	: {
				tipo			: presets_component_json_tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				lang			: page_globals.dedalo_data_nolan,
				type			: 'component'
			},
			data	: {
				changed_data : [
					{
						action	: 'set_data',
						id		: null,
						value	: [ { value : config } ]
					}
				]
			}
		}

	// API request
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})

	// error check
		if (!api_response.result) {
			console.error(`Error on save export preset (${section_tipo} - ${section_id}). api_response:`, api_response);
			return false
		}

		// debug
		if(SHOW_DEBUG===true) {
			console.log('Export preset saved!', api_response);
		}


	return api_response
}//end save_export_preset



/**
* DELETE_USER_EXPORT_PRESET
* Deletes an export preset from the database.
* @param string section_id - The ID of the preset to delete
* @return promise object|bool - The API response or false on error
*/
export const delete_user_export_preset = async function(section_id) {

	// check
		if (!section_id) {
			console.error('Invalid section_id:', section_id);
			return false
		}

	// rqo
		const rqo = {
			action	: 'delete',
			source	: {
				section_tipo	: presets_section_tipo, // 'dd1781'
				section_id		: section_id,
				model			: 'section'
			}
		}

	// API request
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})


	return api_response
}//end delete_user_export_preset



// @license-end
