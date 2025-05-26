// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
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

	// allowed models
	this.ar_allowed		= [
		'component_av',
		'component_3d'
	]

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_posterframe.prototype.render	= tool_common.prototype.render
	tool_posterframe.prototype.destroy	= common.prototype.destroy
	tool_posterframe.prototype.refresh	= common.prototype.refresh
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
}//end init



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
}//end build_custom



/**
* GET_AR_IDENTIFYING_IMAGE
* Call to API to get values to identifying_image selector options
* (used to fullfil the identifying_image selector options)
* @return array self.ar_identifying_image
*/
tool_posterframe.prototype.get_ar_identifying_image = async function() {

	self.ar_identifying_image = self.ar_identifying_image || await self.get_ar_identifying_image();

	return self.ar_identifying_image
}//end get_ar_identifying_image



/**
* CREATE_POSTERFRAME
* 	Creates a new posterframe file from current_time overwriting old file if exists
* @param float current_time
* 	From main_element video current_time value
* @return promise > bool
*/
tool_posterframe.prototype.create_posterframe = async function() {

	const self = this

	// allowed_components
		if (!self.ar_allowed.includes(self.main_element.model)) {
			console.error('Not supported model:', self.main_element.model);
			return false
		}

	// execute 'create_posterframe' in client side by component
		const result = await self.main_element.create_posterframe()

	// refresh
		if (self.main_element.data?.posterframe_url===page_globals.fallback_image) {
			// initial no posterframe case
			await self.main_element.refresh()
		}

		// return bool
		return result
}//end create_posterframe



/**
* DELETE_POSTERFRAME
* 	Delete the posterframe file
* @return bool
*/
tool_posterframe.prototype.delete_posterframe = async function() {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// allowed_components
		if (!self.ar_allowed.includes(self.main_element.model)) {
			console.error('Not supported model:', self.main_element.model);
			return false
		}

	// exec delete
		const result = await self.main_element.delete_posterframe()

	// return bool
	return result
}//end delete_posterframe



/**
* GET_AR_IDENTIFYING_IMAGE
* 	Get identifying_image elements possibles from section inverse locators
* 	Used by identifying_image selector in render
* @return promise > array
*/
tool_posterframe.prototype.get_ar_identifying_image = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_ar_identifying_image')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_ar_identifying_image API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end get_ar_identifying_image



/**
* CREATE_IDENTIFYING_IMAGE
* 	Create a new identifying image in target portal based on current item_value selection ad av current_time
* @return promise > array
*/
tool_posterframe.prototype.create_identifying_image = async function(item_value, current_time) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'create_identifying_image')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				item_value		: item_value,
				current_time	: current_time
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 120 * 1000 // 120 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> create_identifying_image API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end create_identifying_image



// @license-end
