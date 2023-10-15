// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
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
* TOOL_MEDIA_VERSIONS
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
}//end tool_media_versions



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
* @param object options
* @return bool
*/
tool_media_versions.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool
*/
tool_media_versions.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// specific actions.. like fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

			// self.main_element_quality.
			// (!) It's used to force a specific quality for main_element before render the component
				if (self.main_element_quality) {
					self.main_element.context.features.quality = self.main_element_quality
				}

		// fix important vars
			self.ar_quality	= self.caller.context.features.ar_quality
			// datalist. main component dato
			self.datalist	= self.main_element.data.datalist
			// files_info_safe. filtered by allowed extension
			self.files_info_safe = self.main_element.data.value[0] && self.main_element.data.value[0].files_info
				? self.main_element.data.value[0].files_info.filter(el => el.extension===self.main_element.context.features.extension)
				: []
			// files_info_safe. filtered by allowed extension
			self.files_info_alternative = self.main_element.data.value[0] && self.main_element.data.value[0].files_info
				? self.main_element.data.value[0].files_info.filter(el => el.extension!==self.main_element.context.features.extension)
				: []

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* GET_FILES_INFO
* Check every quality file exists
* Note that 'files_info' is called 'datalist' in caller and main component data
* @return promise
* 	resolve: result (array of objects)
* 	sample:
* [
    {
        "quality": "original",
        "file_exist": true,
        "file_name": "rsc35_rsc167_238.mp4",
        "file_path": "/path/dedalo/media/av/original/rsc35_rsc167_238.mp4",
        "file_url": "/v6/media/av/original/rsc35_rsc167_238.mp4",
        "file_size": 13975035,
        "file_time": {...}
    },
    {
        "quality": "404",
        "file_exist": true,
        "file_name": "rsc35_rsc167_238.mp4",
        "file_path": "/path/dedalo/media/av/404/rsc35_rsc167_238.mp4",
        "file_url": "/v6/media/av/404/rsc35_rsc167_238.mp4",
        "file_size": 14455274,
        "file_time": {...}
    },
    {
        "quality": "audio",
        "file_exist": false,
        "file_name": null,
        "file_path": null,
        "file_url": null,
        "file_size": null,
        "file_time": null
    }
* ]
*/
tool_media_versions.prototype.get_files_info = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_files_info')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body		: rqo,
				use_worker	: true
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_files_info API response:",'DEBUG',response);
				}

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
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'delete_file')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> delete_file API response:",'DEBUG',response);
				}

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
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'build_version')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> build_version API response:",'DEBUG',response);
				}

				if (response.result===false && response.msg) {
					alert(response.msg);
				}

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
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'conform_headers')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> conform_headers API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end conform_headers



/**
* ROTATE
* 	Apply a rotation process to the selected file
* @param string quality
* @param string|int degrees
* 	-90 / 90
* @return promise
* 	resolve: array of objects
*/
tool_media_versions.prototype.rotate = async function(quality, degrees) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'rotate')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality,
				degrees			: degrees
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> rotate API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end rotate



// @license-end

