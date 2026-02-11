// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global page_globals, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// import
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {create_source} from '../../common/js/common.js'



// vars
	export const presets_section_tipo					= 'dd623'
	export const temp_presets_section_tipo				= 'dd655'
	// component_json_preset_tipo. Where preset filter is stored (component_json)
	const presets_component_json_tipo					= 'dd625'
	// component_section_value_tipo. Where section_tipo is stored (component_input_text)
	const presets_component_section_value_tipo			= 'dd642'
	// component_user_value_tipo. Where user_id is stored (component_select)
	const presets_component_user_id_value_tipo			= 'dd654'
	// presets_component_name_value_tipo. Where preset name is stored
	const presets_component_name_value_tipo				= 'dd624'
	// presets_component_public_value_tipo. Where preset public value is stored
	const presets_component_public_value_tipo			= 'dd640'
	// presets_component_default_value_tipo. Where preset is default value is stored
	const presets_component_default_value_tipo			= 'dd641'
	// presets_component_save_arguments_value_tipo. Where preset save arguments value is stored
	const presets_component_save_arguments_value_tipo	= 'dd648'



/**
* GET_EDITING_PRESET_JSON_FILTER
* Retrieves the currently active search filter (temp preset) for the user.
* Matches the filter using the current section type and user ID.
* @param object self - The search instance
* @return promise object|null - The JSON filter object or null if not found
*/
export const get_editing_preset_json_filter = async function(self) {

	// source
		const source = create_source(self, 'search')
		// set / overwrite some properties
		source.tipo			= temp_presets_section_tipo
		source.section_tipo	= temp_presets_section_tipo
		source.model		= 'section'
		// config. set config options like read_only to allow custom server behaviors
		source.config = {
			// set the read_only to true, it will used to assign permissions to at least 1 in the target section and components.
			read_only : true
		}

	// cache
		if (self.component_json_data) {
			// data already is fixed
			const json_filter = self.component_json_data.value && self.component_json_data.value[0]
				? self.component_json_data.value[0]
				: null
			return json_filter
		}

	// sqo
		const sqo = {
			section_tipo	: [temp_presets_section_tipo],
			filter			: {
				"$and": [
					{
						q		: self.section_tipo,
						path	: [
							{
								name			: "Section tipo",
								component_tipo	: presets_component_section_value_tipo, // dd642,
								section_tipo	: temp_presets_section_tipo,
								model			: "component_input_text"
							}
						],
						type : "jsonb"
					},
					{
						q : {
							section_id		: '' + page_globals.user_id,
							section_tipo	: "dd128"
						},
						path : [
							{
								name			: "User",
								component_tipo	: presets_component_user_id_value_tipo, // dd654,
								section_tipo	: temp_presets_section_tipo,
								model			: "component_select"
							}
						],
						type : "jsonb"
					}
				]
			}
		}

	// show
		const show = {
			ddo_map : [{
				tipo			: presets_component_json_tipo, // dd625 component_json data
				section_tipo	: temp_presets_section_tipo,
				parent			: temp_presets_section_tipo
			}]
		}

	// rqo
		const rqo = {
			action : 'read',
			source	: source,
			sqo		: sqo,
			show	: show
		}

	// API request
		const api_response = await data_manager.request({
			body		: rqo,
			use_worker	: true
		})
		// debug
		if(SHOW_DEVELOPER===true) {
			console.log(`${self.model} [get_editing_preset_json_filter] api_response:`, api_response);
		}

	// response check
		if (!api_response || !api_response.result) {

			// api_errors.
				// It's important to set instance as api_errors because this
				// generates a temporal wrapper. Once solved the problem, (usually a not login scenario)
				// the instance could be built and rendered again replacing the temporal wrapper
				page_globals.api_errors.push(
					{
						error	: 'request', // error type
						msg		: `${self.model} build get_editing_preset_json_filter api_response: `+ (api_response.msg || api_response.error),
						trace	: 'search user preset get_editing_preset_json_filter'
					}
				)
				// debug
				if(SHOW_DEVELOPER===true) {
					console.error('SERVER: page_globals.api_errors:', page_globals.api_errors);
				}

			return null
		}

	// editing_preset
		const data					= api_response.result.data || []
		const component_json_data	= data.find(el => el.tipo===presets_component_json_tipo)

	// json_filter. existing section case
		if (component_json_data) {

			// fix value
			self.component_json_data = component_json_data

			// json_filter . component_json_data data.entries is an array, select the first entry
			const json_filter = component_json_data.entries && component_json_data.entries[0]
				? component_json_data.entries[0]
				: null

			return json_filter
		}

	// default_json_filter. no section exist case. Create a new one and get new the section_id
		const section_id = await create_new_search_preset({
			self			: self,
			section_tipo	: temp_presets_section_tipo
		})

		// default_json_filter create
		const json_filter = {"$and":[]}

		// fix fake value
		self.component_json_data = {
			tipo			: presets_component_json_tipo,
			section_tipo	: temp_presets_section_tipo,
			section_id		: section_id,
			value			: [json_filter]
		}

	return json_filter
}//end get_editing_preset_json_filter



/**
* LOAD_USER_SEARCH_PRESETS
* Fetches the list of saved search presets for the current user and section.
* @param object self - The search instance
* @return promise object - The section instance containing the presets list
*/
export const load_user_search_presets = async function(self) {

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
		const fiter = {
			"$and": [
				{
					q		: self.section_tipo,
					path	: [{
						component_tipo	: presets_component_section_value_tipo, // 'dd642',
						section_tipo	: presets_section_tipo, // 'dd623'
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
								section_tipo	: presets_section_tipo, // 'dd623'
								model			: 'component_radio_button',
								name			: 'Public'
							}],
							type: 'jsonb'
						},
						{
							q		: locator_user,
							path	: [{
								component_tipo	: presets_component_user_id_value_tipo, // 'dd654',
								section_tipo	: presets_section_tipo, // 'dd623'
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
				tipo : presets_section_tipo // 'dd623'
			}],
			filter			: fiter,
			limit			: 15,
			offset			: 0
		}

	// request_config
		const request_config = [{
			sqo			: sqo,
			api_engine	: 'dedalo',
			type		: 'main',
			show	: {
				ddo_map :[{
					tipo			: presets_component_name_value_tipo, // 'dd624',
					section_tipo	: presets_section_tipo, // 'dd623',
					parent			: presets_section_tipo // 'dd623'
				}]
			}
		}]

	// section
		const instance_options = {
			model			: 'section',
			tipo			: presets_section_tipo, // 'dd623'
			section_tipo	: presets_section_tipo, // 'dd623'
			section_id		: null,
			mode			: 'list',
			lang			: page_globals.dedalo_data_lang,
			request_config	: request_config,
			add_show		: true,
			id_variant		: self.section_tipo + '_search_user_presets',
			inspector		: false, // (!) disable elements
			filter			: false, // (!) disable elements
			session_save	: true, // Set as true to save the session and preserve counter coherence
			view			: 'search_user_presets',
			caller			: self
		}
		const section = await get_instance(instance_options)
		await section.build(true)


	return section
}//end load_user_search_presets



/**
* EDIT_USER_SEARCH_PRESET
* Initializes a preset record in edit mode for the modal editor.
* @param object self - The search instance
* @param int|string section_id - The ID of the preset to edit
* @return promise object - The initialized section instance
*/
export const edit_user_search_preset = async function(self, section_id) {

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			type		: 'main',
			show		: {
				ddo_map :[
					{
						tipo			: presets_component_name_value_tipo, // 'dd624',
						section_tipo	: presets_section_tipo, // 'dd623'
						parent			: presets_section_tipo, // 'dd623'
						properties : {
							show_interface : {
								tools : false
							}
						}
					},
					{
						tipo			: presets_component_public_value_tipo, // 'dd640',
						section_tipo	: presets_section_tipo, // 'dd623'
						parent			: presets_section_tipo, // 'dd623'
						properties : {
							show_interface : {
								tools : false
							}
						}
					},
					{
						tipo			: presets_component_default_value_tipo, // 'dd641',
						section_tipo	: presets_section_tipo, // 'dd623'
						parent			: presets_section_tipo, // 'dd623'
						properties : {
							show_interface : {
								tools : false
							}
						}
					},
					{
						tipo			: presets_component_save_arguments_value_tipo, // 'dd648',
						section_tipo	: presets_section_tipo, // 'dd623'
						parent			: presets_section_tipo, // 'dd623'
						properties : {
							show_interface : {
								tools : false
							}
						}
					}
				]
			}
		}]

	// section
		const instance_options = {
			model			: 'section',
			tipo			: presets_section_tipo, // 'dd623'
			section_tipo	: presets_section_tipo, // 'dd623'
			section_id		: section_id,
			mode			: 'edit',
			lang			: page_globals.dedalo_data_lang,
			request_config	: request_config,
			add_show		: true,
			session_save	: false, // Set as false to prevent overwrite of the current session
			id_variant		: self.section_tipo +'_'+ section_id + '_search_user_preset_edit'
		}
		const section = await get_instance(instance_options)
		// filter search disallow
			section.filter = false
		// inspector disallow
			section.inspector = false
		// build
			await section.build(true)


	return section
}//end edit_user_search_preset



/**
* LOAD_SEARCH_PRESET
* Retrieves the JSON filter data for a specific saved preset.
* @param object options
* @param string options.section_id - The ID of the preset to load
* @return promise object - The JSON filter object
*/
export const load_search_preset = async function(options) {

	// options
		const section_id = options.section_id

	// component
		const instance_options = {
			tipo			: presets_component_json_tipo, // dd625
			section_tipo	: presets_section_tipo, // dd623
			section_id		: section_id,
			model			: 'component_json',
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan
		}
		const component = await get_instance(instance_options)
		await component.build(true)
		const entries = component.data.entries

	// json_filter
		const json_filter = (entries && entries[0])
			? entries[0]
			: {"$and":[]} // default


	return json_filter
}//end load_search_preset



/**
* CREATE_NEW_SEARCH_PRESET
* Creates a new search preset record in the database.
* Stores the current section type, user ID, and current filter state.
* @param object options
* @param object options.self - The search instance
* @param string options.section_tipo - The section type for the preset (user or temp)
* @return promise string|bool - The new section ID or false on error
*/
export const create_new_search_preset = function(options) {

	// options
		const self			= options.self
		const section_tipo	= options.section_tipo // temp or user preset section

	// short vars
		const locator_user	= {
			section_id		: '' + page_globals.user_id,
			section_tipo	: 'dd128'
		}

	return new Promise(async function(resolve){

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
			if (api_response.result && api_response.result>0) {

				const new_section_id = api_response.result

				const save_promises = []

				// save section_tipo value
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
							const changed_data_section = [{
								action	: 'insert',
								key		: 0,
								value	: {value: self.section_tipo}
							}]
							await component_instance_section_tipo.save(changed_data_section)
						})()
					)

				// save user value
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
							const changed_data_user = [{
								action	: 'insert',
								key		: 0,
								value	: locator_user
							}]
							await component_instance_user.save(changed_data_user)
						})()
					)

				// save current DOM filter
					save_promises.push(
						(async () => {
							const component_instance_user = await get_instance({
								tipo			: presets_component_json_tipo, // 'dd625',
								model			: 'component_json',
								section_tipo	: section_tipo,
								section_id		: new_section_id,
								mode			: 'edit'
							})
							await component_instance_user.build(true)

							// parse current DOM filter for save it
							const json_filter_parsed = self.parse_dom_to_json_filter({
								save_arguments : true
							})

							const json_filter = json_filter_parsed.filter
							if (json_filter) {
								const changed_data_user = [{
									action	: 'insert',
									key		: 0,
									value	: json_filter
								}]
								await component_instance_user.save(changed_data_user)
							}
						})()
					)

				await Promise.all(save_promises)

				resolve(new_section_id)
			}else{
				console.error('Error on create new preset section. api_response: ', api_response);
				resolve(false)
			}
	})
}//end create_new_search_preset



/**
* SAVE_PRESET
* Saves the current filter structure to a specific preset record.
* @param object options
* @param object options.self - The search instance
* @param string options.section_tipo - The section type of the preset
* @param string options.section_id - The ID of the preset record
* @return promise object - The API response
*/
export const save_preset = async function(options) {

	// options
		const self			= options.self
		const section_tipo	= options.section_tipo
		const section_id	= options.section_id

		if (!section_tipo || !section_id) {
			console.error('Invalid section_tipo or section_id:', section_tipo, section_id );
			return
		}
	// filter value
		const filter_obj = await self.parse_dom_to_json_filter({}).filter

	return new Promise(async function(resolve){

		// rqo. save
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
							action	: 'update',
							key		: 0,
							value	: { value : filter_obj }
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
				console.error(`Error on create save preset section (${section_tipo} - ${section_id}). api_response: `, api_response);
			}

		// Update cache with the new filter
		// Used when user back from a tool and open the search
		// if the cache is not refresh the data search changes will be accumulated into the components
			self.component_json_data.value = [filter_obj]

		resolve(api_response)
	})
}//end save_preset



/**
* SAVE_TEMP_PRESET
* Saves the current interface state to the user's temporary preset.
* @param object self - The search instance
* @return promise object - The API response
*/
export const save_temp_preset = async function(self) {

	// check self.component_json_data
		if (!self.component_json_data) {
			console.error('Invalid component_json_data:', self.component_json_data );
			return
		}

	return save_preset({
		self			: self,
		section_tipo	: self.component_json_data.section_tipo,
		section_id		: self.component_json_data.section_id
	})
}//end save_temp_preset



/**
* DELETE_USER_SEARCH_PRESET
* Deletes a search preset from the database.
* @param string section_id - The ID of the preset to delete
* @return promise object - The API response
*/
export const delete_user_search_preset = async function(section_id) {

	// check
		if (!section_id) {
			console.error('Invalid section_id:', section_id);
			return false
		}

	// rqo
		const rqo = {
			action	: 'delete',
			source	: {
				section_tipo	: presets_section_tipo, // 'dd623'
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
}//end delete_user_search_preset



// @license-end
