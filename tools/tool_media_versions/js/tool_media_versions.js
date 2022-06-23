/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_media_versions} from './render_tool_media_versions.js' // self tool rendered (called from render common)



/**
* tool_media_versions
* Tool to make interesting things
*/
export const tool_media_versions = function () {

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

	this.main_element_quality = null


	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_media_versions.prototype.render	= tool_common.prototype.render
	// destroy : using common destroy method
	tool_media_versions.prototype.destroy	= common.prototype.destroy
	// refresh: using common refresh method
	tool_media_versions.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_media_versions.prototype.edit		= render_tool_media_versions.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_media_versions.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = `${DEDALO_TOOLS_URL}/${self.model}/trigger.${self.model}.php`;


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return promise
* 	resolve: bool
*/
tool_media_versions.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

			// self.main_element_quality.
			// (!) It's used to force a specific main_element quality before render the component
				if (self.main_element_quality) {
					self.main_element.context.quality = self.main_element_quality
				}

		// fix important vars
			self.ar_quality	= self.caller.context.ar_quality
			self.files_info	= self.caller.data.datalist

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_FILES_INFO
* Check if every quality file exists
* Note that files_info is called 'datalist' in caller component data
* @return promise
* 	resolve: array of objects
*/
tool_media_versions.prototype.get_files_info = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_files_info')
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
				dd_console("-> get_files_info API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end get_files_info



/**
* DELETE_FILE
* Delete version of given quality
* @param string quality
* @return promise
* 	resolve: array of objects
*/
tool_media_versions.prototype.delete_file = async function(quality) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.seguro || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'delete_file')
		// add the necessary arguments used in the given function
		source.arguments = {
			tipo			: self.main_element.tipo,
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id,
			quality			: quality
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
				dd_console("-> delete_file API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end delete_file



/**
* BUILD_VERSION
* Creates a new version from original in given quality
* @param string quality
* @return promise
* 	resolve: array of objects
*/
tool_media_versions.prototype.build_version = async function(quality) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.seguro || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'build_version')
		// add the necessary arguments used in the given function
		source.arguments = {
			tipo			: self.main_element.tipo,
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id,
			quality			: quality
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
				dd_console("-> build_version API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end build_version



/**
* CONFORM_HEADERS
* 	Creates a new version from original in given quality rebuilding headers
* @param string quality
* @return promise
* 	resolve: array of objects
*/
tool_media_versions.prototype.conform_headers = async function(quality) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.seguro || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'conform_headers')
		// add the necessary arguments used in the given function
		source.arguments = {
			tipo			: self.main_element.tipo,
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id,
			quality			: quality
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
				dd_console("-> conform_headers API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end conform_headers



/**
* ROTATE
* 	Apply a rotation process to the selected file
* @param string quality
* @param string degrees
* 	-90 / 90
* @return promise
* 	resolve: array of objects
*/
tool_media_versions.prototype.rotate = async function(quality, degrees) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.seguro || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'rotate')
		// add the necessary arguments used in the given function
		source.arguments = {
			tipo			: self.main_element.tipo,
			section_tipo	: self.main_element.section_tipo,
			section_id		: self.main_element.section_id,
			quality			: quality,
			degrees			: degrees
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
				dd_console("-> rotate API response:",'DEBUG',response);

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end rotate
