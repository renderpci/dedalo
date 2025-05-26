// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_diffusion} from './render_tool_diffusion.js' // self tool rendered (called from render common)



/**
* TOOL_DIFFUSION
*/
export const tool_diffusion = function () {

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

	this.diffusion_info = null
	this.skip_publication_state_check


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_diffusion.prototype.render		= tool_common.prototype.render
	tool_diffusion.prototype.destroy	= common.prototype.destroy
	tool_diffusion.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_diffusion.prototype.edit		= render_tool_diffusion.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_diffusion.prototype.init = async function(options) {

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
tool_diffusion.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
			self.diffusion_info = await self.get_diffusion_info()

		 // fix value
			self.resolve_levels = self.diffusion_info.resolve_levels ?? 1

		// fix skip_publication_state_check value
			self.skip_publication_state_check = self.diffusion_info.skip_publication_state_check ?? 1

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_DIFFUSION_INFO
* 	Get the information needed to build user options
* @return promise > bool
*/
tool_diffusion.prototype.get_diffusion_info = function() {

	const self = this

	// short vars
		const section		= self.caller
		const section_tipo	= section.section_tipo

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_diffusion_info')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options : {
				section_tipo : section_tipo
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEBUG===true) {
					console.log('-> get_diffusion_info API response:', response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end get_diffusion_info



/**
* EXPORT
* Exec diffusion export command on API
* @param object options
* @return promise
* 	resolve object api_response
*/
tool_diffusion.prototype.export = function(options) {

	const self = this

	// options
		const diffusion_element_tipo	= options.diffusion_element_tipo
		const resolve_levels			= options.resolve_levels || self.resolve_levels

	// sort vars
		const mode							= self.caller.mode
		const section_tipo					= self.caller.section_tipo
		const section_id					= self.caller.section_id || null
		const skip_publication_state_check	= self.skip_publication_state_check

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'export')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options : {
				background_running				: true, // set run in background CLI
				section_tipo					: section_tipo,
				section_id						: section_id,
				mode							: mode,
				diffusion_element_tipo			: diffusion_element_tipo,
				resolve_levels					: resolve_levels,
				skip_publication_state_check	: skip_publication_state_check
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){
			// request
			data_manager.request({
				use_worker	: true,
				body		: rqo,
				retries : 1, // one try only
				timeout : 10 * 1000 // 10 secs waiting response
			})
			.then(function(api_response){
				resolve(api_response)
			})
		})
}//end export



/**
* ON_CLOSE_ACTIONS
* Executes specific action on close the tool
* @param string open_as
* 	modal | window
* @return promise: bool
*/
tool_diffusion.prototype.on_close_actions = async function(open_as) {

	const self = this

	if (open_as==='modal') {
		// self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions



// @license-end
