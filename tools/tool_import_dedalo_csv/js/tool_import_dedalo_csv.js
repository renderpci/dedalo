// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_dedalo_csv} from './render_tool_import_dedalo_csv.js' // self tool rendered (called from render common)



/**
* TOOL_IMPORT_DEDALO_CSV
* Tool to make interesting things
*/
export const tool_import_dedalo_csv = function () {

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

	this.csv_files_list	= null
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_dedalo_csv.prototype.render			= tool_common.prototype.render
	tool_import_dedalo_csv.prototype.destroy		= common.prototype.destroy
	tool_import_dedalo_csv.prototype.refresh		= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_import_dedalo_csv.prototype.edit			= render_tool_import_dedalo_csv.prototype.edit
	tool_import_dedalo_csv.prototype.upload_done	= render_tool_import_dedalo_csv.prototype.upload_done



/**
* INIT
* Custom tool init
* @param object options
* @return bool common_init
*/
tool_import_dedalo_csv.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		// self.lang	= options.lang // page_globals.dedalo_data_lang
		// self.langs	= page_globals.dedalo_projects_default_langs
		// self.etc		= options.etc

	// events
		const upload_file_done_handler = (options) => {
			self.upload_done(options)
		}
		self.events_tokens.push(
			event_manager.subscribe('upload_file_done_' + self.id, upload_file_done_handler)
		)


	return common_init
}//end init



/**
* BUILD
* Custom tool build
* @param bool autoload = false
* @return bool common_build
*/
tool_import_dedalo_csv.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// set allowed_extensions
			// self.context.features.allowed_extensions	= ['csv']
			// self.context.features.target_dir			= {
			// 	type	: 'dedalo_config',
			// 	value	: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH' // defined in config
			// }

		// load files list from dir (defined in Dédalo config file constants DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH)
			self.csv_files_list = await self.load_csv_files_list()

		// service_upload
			// get instance and init
			self.service_upload = await get_instance({
				model				: 'service_upload',
				mode				: 'edit',
				allowed_extensions	: ['csv'],
				caller				: self,
				key_dir 			: 'csv'
			})
			// console.log("self.service_upload:",self.service_upload);
			// store to destroy on close modal
			self.ar_instances.push(self.service_upload)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* LOAD_CSV_FILES_LIST
* Call to API and get the list of uploaded CSV files
* @return promise
* 	Resolve array result
*/
tool_import_dedalo_csv.prototype.load_csv_files_list = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_csv_files')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options : {
				// dir : use default as fallback (DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH)
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
					dd_console("-> load_csv_files_list API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end load_csv_files_list



/**
* REMOVE_FILE
* @param object item
* @return promise
*/
tool_import_dedalo_csv.prototype.remove_file = function(item) {

	const self = this

	// remove of local database the process connection
		data_manager.delete_local_db_data(
			'process_import_dedalo_csv', // like 'make_backup_process'
			'status' // string table
		)

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'delete_csv_file')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				file_name : item.name
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> remove_file API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end remove_file



/**
* IMPORT_FILES
* @param array files
* 	Array of objects
* @param bool time_machine_save
* 	Default true
* @return promise
*/
tool_import_dedalo_csv.prototype.import_files = function(files, time_machine_save) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'import_files')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				background_running	: true,
				files				: files,
				time_machine_save	: time_machine_save
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				use_worker	: true,
				body		: rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> import_files API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end import_files



/**
* GET_SECTION_COMPONENTS_LIST
* @param string section_tipo
* @return promise
*/
tool_import_dedalo_csv.prototype.get_section_components_list = function(section_tipo) {

	const self = this

	// cache results
		self.resolved_section_components_list = self.resolved_section_components_list || {}
		if (self.resolved_section_components_list[section_tipo]) {
			return self.resolved_section_components_list[section_tipo]
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_section_components_list')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				section_tipo : section_tipo
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
					dd_console("-> get_section_components_list API response:",'DEBUG',response);
				}

				if (!response.result) {
					resolve({
						list	: false,
						label	: false,
						msg		: response.msg
					})
					return
				}

				// cache result
				self.resolved_section_components_list[section_tipo] = {
					list	: response.result,
					label	: response.label,
					msg		: response.msg
				}

				resolve(self.resolved_section_components_list[section_tipo])
			})
		})
}//end get_section_components_list



/**
* PROCESS_UPLOADED_FILE
* Simply moves previously uploaded temp file to the definitive location and name
* @param object file_data
* Sample:
* {
*	error: 0
*	extension: "tiff"
*	name: "proclamacio.tiff"
*	size: 184922784
*	tmp_name: "/hd/media/upload/service_upload/tmp/image/phpPJQvCp"
*	type: "image/tiff"
* }
* @return promise
* 	object response
*/
tool_import_dedalo_csv.prototype.process_uploaded_file = function(file_data) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'process_uploaded_file')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				file_data : file_data
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				use_worker	: true,
				body		: rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> process_uploaded_file API response:",'DEBUG', response);
				}

				resolve(response)
			})
		})
}//end process_uploaded_file



// @license-end
