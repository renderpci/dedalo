// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_update_cache} from './render_tool_update_cache.js' // self tool rendered (called from render common)



/**
* TOOL_UPDATE_CACHE
* Tool to make interesting things
*/
export const tool_update_cache = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null

	// selected_tipos: array of selected tipos as ['rsc187','rsc185'..]
	this.selected_tipos		= []
	// regenerate_options: user selected regenerate_options as {'rsc178':{"delete_normalized_files":true}}
	this.regenerate_options	= {}

	// full list of components context from API tool call
	this.components_list = []

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_update_cache.prototype.render	= tool_common.prototype.render
	tool_update_cache.prototype.destroy	= common.prototype.destroy
	tool_update_cache.prototype.refresh	= common.prototype.refresh
	tool_update_cache.prototype.edit	= render_tool_update_cache.prototype.edit



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_update_cache.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload
* @return bool common_build
*/
tool_update_cache.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// specific actions.. like fix main_element for convenience
		self.components_list = await self.get_components_list()


	return common_build
}//end build_custom



/**
* GET_COMPONENTS_LIST
* 	Get the list of section components available to update cache
* @return promise
* 	resolve array result
*/
tool_update_cache.prototype.get_components_list = async function() {

	const self = this

	const section_tipo = self.caller.section_tipo

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
		// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_component_list')

	// options
		const options = {
			ar_section_tipo				: [section_tipo],
			use_real_sections			: false,
			skip_permissions			: true,
			ar_tipo_exclude_elements	: null,
			ar_components_exclude		: [] // force to get all components
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: options
		}

	// call to the API, fetch data and get response
		const response = await data_manager.request({
			body : rqo
		})

		if(SHOW_DEVELOPER===true) {
			dd_console("-> get_component_list API response:",'DEBUG',response);
		}

		const components_list = response.result // array of objects


	return components_list
}//end get_components_list



/**
* UPDATE_CACHE
* Get the list of section components available to update cache
* @return promise > bool
*/
tool_update_cache.prototype.update_cache = function() {

	const self = this

	// short vars
		const section_tipo			= self.caller.section_tipo
		const selected_tipos		= self.selected_tipos
		const regenerate_options	= self.regenerate_options

	// components_selection. Compose user components selection adding regenerate_options
		const components_selection = []
		const selected_tipos_length = selected_tipos.length
		for (let i = 0; i < selected_tipos_length; i++) {

			const tipo = selected_tipos[i]

			components_selection.push({
				tipo				: tipo,
				regenerate_options	: regenerate_options[tipo] || null
			})
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'update_cache')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options : {
				background_running		: true, // set run in background CLI
				section_tipo			: section_tipo,
				components_selection	: components_selection,
				lang					: page_globals.dedalo_application_lang
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				use_worker	: true,
				body		: rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> update_cache API response:",'DEBUG',response);
				}

				// const result = response.result // array of objects

				resolve(response)
			})
		})
}//end update_cache



// @license-end
