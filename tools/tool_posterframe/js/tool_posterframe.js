/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_posterframe} from './render_tool_posterframe.js' // self tool rendered (called from render common)



/**
* TOOL_POSTERFRAME
* Tool to make interesting things
*/
export const tool_posterframe = function () {

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


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_posterframe.prototype.render	= tool_common.prototype.render
	// destroy							: using common destroy method
	tool_posterframe.prototype.destroy	= common.prototype.destroy
	// refresh							: using common refresh method
	tool_posterframe.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_posterframe.prototype.edit		= render_tool_posterframe.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_posterframe.prototype.init = async function(options) {

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
tool_posterframe.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
		// main_element
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
};//end build_custom



/**
* GET_AR_IDENTIFYING_IMAGE
* Call to API to get values to identifying_image selector options
* (used to fullfil the identifying_image selector options)
* @return array self.ar_identifying_image
*/
tool_posterframe.prototype.get_ar_identifying_image = async function() {

	self.ar_identifying_image = self.ar_identifying_image || await self.get_ar_identifying_image();

	return self.ar_identifying_image
};//end get_ar_identifying_image



/**
* CREATE_POSTERFRAME
* 	Creates a new posterframe file from current_time overwriting old file if exists
* @param float current_time
* 	Fom main_element video current_time value
* @return promise > bool
*/
tool_posterframe.prototype.create_posterframe = function(current_time) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'create_posterframe')
		// add the necessary arguments used in the given function
		source.arguments = {
			tipo			: self.main_element.tipo,
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id,
			current_time	: current_time
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> create_posterframe API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
};//end create_posterframe



/**
* DELETE_POSTERFRAME
* 	Delete the posterframe file
* @return promise > array
*/
tool_posterframe.prototype.delete_posterframe = async function() {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.seguro || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'delete_posterframe')
		// add the necessary arguments used in the given function
		source.arguments = {
			tipo			: self.main_element.tipo,
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> delete_posterframe API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
};//end delete_posterframe



/**
* GET_AR_IDENTIFYING_IMAGE
* 	Get identifying_image elements possibles from section inverse locators
* 	Used by identifying_image selector in render
* @return promise > array
*/
tool_posterframe.prototype.get_ar_identifying_image = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_ar_identifying_image')
		// add the necessary arguments used in the given function
		source.arguments = {
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> get_ar_identifying_image API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
};//end get_ar_identifying_image



/**
* CREATE_IDENTIFYING_IMAGE
* 	Create a new idenfifing image in target portal based on current item_value selection ad av current_time
* @return promise > array
*/
tool_posterframe.prototype.create_identifying_image = async function(item_value, current_time) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.seguro || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'create_identifying_image')
		// add the necessary arguments used in the given function
		source.arguments = {
			tipo			: self.main_element.tipo,
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id,
			item_value		: item_value,
			current_time	: current_time
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> create_identifying_image API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
};//end create_identifying_image


