/*global page_globals, */
/*eslint no-undef: "error"*/


// import
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'



// vars
const presets_section_tipo = 'dd623'



/**
* LOAD_USER_SEARCH_PRESETS
* Get section search presets records
* On click on search presets list, load all user presets from db to get the list names
* @param object self
* @return object section
* 	section instance
*/
export const load_user_search_presets = async function(self) {

	// sqo
		const locator_user = {
			section_id		: page_globals.user_id,
			section_tipo	: 'dd128'
		}
		const locator_public_true = {
			section_id			: '1',
			section_tipo		: 'dd64',
			from_component_tipo	: 'dd640'
		}
		const fiter = {
			"$and": [
				{
					q		: [ self.section_tipo ],
					path	: [{
						component_tipo	: 'dd642',
						section_tipo	: presets_section_tipo, // 'dd623'
						model			: 'component_input_text',
						name			: 'Section tipo'
					}],
					type: 'jsonb'
				},
				{
					"$or": [
						{
							q		: [ locator_public_true ],
							path	: [{
								component_tipo	: 'dd640',
								section_tipo	: presets_section_tipo, // 'dd623'
								model			: 'component_radio_button',
								name			: 'Public'
							}],
							type: 'jsonb'
						},
						{
							q		: [ locator_user ],
							path	: [{
								component_tipo	: 'dd654',
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
			limit			: 10,
			filter			: fiter,
			section_tipo	: [{
				tipo : presets_section_tipo // 'dd623'
			}]
		}

	// request_config
		const request_config = [{
			sqo			: sqo,
			api_engine	: 'dedalo',
			type		: 'main',
			show	: {
				ddo_map :[{
					tipo			: 'dd624',
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
			add_show 		: true,
			id_variant		: self.section_tipo + '_search_user_presets'
		}
		const section = await instances.get_instance(instance_options)
		await section.build(true)

	// fix user_presets_section
		self.user_presets_section = section

	// section. render another node of component caller and append to container
		section.render_views.push(
			{
				view	: 'search_user_presets',
				mode	: 'list',
				render	: 'view_search_user_presets',
				path 	: '../../search/js/view_search_user_presets.js'
			}
		)
		section.context.view	= 'search_user_presets'
		section.filter			= false
		section.caller			= self


	return section
}//end load_user_search_presets



/**
* EDIT_USER_SEARCH_PRESET
* Builds a presets section in edit mode with given section_id
* @param object self
* @param int section_id
* @return object section
* 	section instance
*/
export const edit_user_search_preset = async function(self, section_id) {

	// request_config
		const request_config = [{
			api_engine	: 'dedalo',
			type		: 'main',
			show	: {
				ddo_map :[
					{
						tipo			: 'dd624',
						section_tipo	: presets_section_tipo, // 'dd623'
						parent			: presets_section_tipo, // 'dd623'
						properties : {
							show_interface : {
								tools : false
							}
						}
					},
					{
						tipo			: 'dd640',
						section_tipo	: presets_section_tipo, // 'dd623'
						parent			: presets_section_tipo, // 'dd623'
						properties : {
							show_interface : {
								tools : false
							}
						}
					},
					{
						tipo			: 'dd641',
						section_tipo	: presets_section_tipo, // 'dd623'
						parent			: presets_section_tipo, // 'dd623'
						properties : {
							show_interface : {
								tools : false
							}
						}
					},
					{
						tipo			: 'dd648',
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
			add_show 		: true,
			id_variant		: self.section_tipo +'_'+ section_id + '_search_user_preset'
		}
		const section = await instances.get_instance(instance_options)
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
* Get DDBB data from component_json in presets section with given section_id
* On click arrow button in search presets list, load preset from db and apply to current canvas
* @return true
*/
export const load_search_preset = async function(options) {

	// options
		const section_id = options.section_id

	// component
		const instance_options = {
			tipo			: 'dd625',
			section_tipo	: presets_section_tipo, // 'dd623',
			section_id		: section_id,
			model			: 'component_json',
			mode			: 'edit',
			lang			: page_globals.dedalo_data_nolan
		}
		const component = await instances.get_instance(instance_options)
		await component.build(true)
		const value = component.data.value

	// json_filter
		const json_filter = (value || value[0])
			? value[0]
			: {"$and":[]} // default


	return json_filter
}//end load_search_preset



/**
* NEW_SEARCH_PRESET
* Creates a new presets section records adding section_tipo and user_id
* On click new button in search presets list, load preset from db and apply to current canvas
* @param object options
* @return promise
* 	Resolve section_id
*/
export const new_search_preset = function(options) {

	// options
		const self = options.self

	// short vars
		const section_tipo	= self.section_tipo
		const locator_user	= {
			section_id		: page_globals.user_id,
			section_tipo	: 'dd128'
		}

	return new Promise(async function(resolve){

		// data_manager. create
			const rqo = {
				action	: 'create',
				source	: {
					section_tipo : presets_section_tipo // 'dd623'
				}
			}
			const api_response = await data_manager.request({
				body : rqo
			})
			if (api_response.result && api_response.result>0) {

				const new_section_id = api_response.result
				console.log('new_section_id:', new_section_id);

				// set section_tipo value
					const component_instance_section_tipo = await instances.get_instance({
						tipo			: 'dd642',
						model			: 'component_input_text',
						section_tipo	: presets_section_tipo, // 'dd623'
						section_id		: new_section_id,
						mode			: 'edit'
					})
					await component_instance_section_tipo.build(true)
					const changed_data_section = [{
						action	: 'insert',
						key		: 0,
						value	: section_tipo
					}]
					await component_instance_section_tipo.save(changed_data_section)

				// set user value
					const component_instance_user = await instances.get_instance({
						tipo			: 'dd654',
						model			: 'component_select',
						section_tipo	: presets_section_tipo, // 'dd623'
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

				resolve(new_section_id)
			}else{
				console.error('Error on create new preset section. api_response: ', api_response);
			}
	})
}//end new_search_preset
