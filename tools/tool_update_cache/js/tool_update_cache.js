/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
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
	this.main_component	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null

	this.component_list = null


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_update_cache.prototype.render	= common.prototype.render
	// destroy							: using common destroy method
	tool_update_cache.prototype.destroy	= common.prototype.destroy
	// refresh							: using common refresh method
	tool_update_cache.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_update_cache.prototype.edit	= render_tool_update_cache.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_update_cache.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)



	return common_init
};//end init



/**
* BUILD
* Custom tool build
*/
tool_update_cache.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);


	// specific actions.. like fix main_component for convenience
		self.component_list = await self.get_component_list()


	return common_build
};//end build_custom



/**
* GET_COMPONENT_LIST
* 	Get the llist of section components selectables to update cache
* @return promise > bool
*/
tool_update_cache.prototype.get_component_list = function() {

	const self = this

	const section_tipo = self.caller.section_tipo

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_component_list')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_tipo : section_tipo
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> get_component_list API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
};//end get_component_list



/**
* update_cache
* 	Get the llist of section components selectables to update cache
* @return promise > bool
*/
tool_update_cache.prototype.update_cache = function(ar_component_tipo) {

	const self = this

	const section_tipo = self.caller.section_tipo

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'update_cache')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_tipo		: section_tipo,
			ar_component_tipo	: ar_component_tipo,
			lang				: page_globals.dedalo_application_lang
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> update_cache API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
};//end update_cache
