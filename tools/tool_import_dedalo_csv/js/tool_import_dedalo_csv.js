/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	// import {ui} from '../../../core/common/js/ui.js'
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
	this.main_component	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null

	this.csv_files_list = null


	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// render : using common render entry point
	tool_import_dedalo_csv.prototype.render		= common.prototype.render
	// destroy: using common destroy method
	tool_import_dedalo_csv.prototype.destroy	= common.prototype.destroy
	// refresh: using common refresh method
	tool_import_dedalo_csv.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_import_dedalo_csv.prototype.edit		= render_tool_import_dedalo_csv.prototype.edit



/**
* INIT
* Custom tool init
*/
tool_import_dedalo_csv.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		// self.lang	= options.lang // page_globals.dedalo_data_lang
		// self.langs	= page_globals.dedalo_projects_default_langs
		// self.etc	= options.etc


	return common_init
};//end init



/**
* BUILD
* Custom tool build
*/
tool_import_dedalo_csv.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// set allowed_extensions
		self.context.allowed_extensions	= ['csv']
		self.context.target_dir			= {
			type	: 'dedalo_config',
			value	: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH' // defined in config
		}

	// load files list from dir (defined in Dédalo config file constants DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH)
		self.csv_files_list = await self.load_csv_files_list()

	// tool_upload
		self.tool_upload = await self.load_tool_upload()
		// store to destroy on close modal
		self.ar_instances.push(self.tool_upload)

	return common_build
};//end build_custom



/**
* LOAD_CSV_FILES_LIST
*/
tool_import_dedalo_csv.prototype.load_csv_files_list = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_csv_files')
		// add the necessary arguments used in the given function
		source.arguments = {
			// dir : use default as fallback (DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH)
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
				dd_console("-> load_csv_files_list API response:",'DEBUG',response);

				const result = response.result // array of objects

				// user messages
					// const msg_type = (response.result===false) ? 'error' : 'ok'
					//if (trigger_response.result===false) {
						// ui.show_message(buttons_container, response.msg, msg_type)
					//}

				// reload target lang
					// const target_component = self.ar_instances.find(el => el.tipo===self.main_component.tipo && el.lang===target_lang)
					// target_component.refresh()
					// dd_console('target_component', 'DEBUG', target_component)

				resolve(result)
			})
		})
};//end load_csv_files_list



/**
* LOAD_TOOL_UPLOAD
* @return instance tool_upload
*/
tool_import_dedalo_csv.prototype.load_tool_upload = async function() {

	const self = this

	// intance_options
		const intance_options = {
			caller			: self,
			mode			: 'mini',
			model			: 'tool_upload',
			label			: 'Tool upload',
			type			: 'tool',
			section_tipo	: self.caller.tipo,
			context			: self.context,
			tool_config		: {
				ddo_map : []
			}
		}

	// instance load / recover
		const tool_instance = await get_instance(intance_options)

	// build
		await tool_instance.build(true)


	return tool_instance
};//end load_tool_upload



/**
* REMOVE_FILE
* @param object item
* @return promise
*/
tool_import_dedalo_csv.prototype.remove_file = function(item) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'delete_csv_file')
		// add the necessary arguments used in the given function
		source.arguments = {
			file_name : item.name
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
				dd_console("-> remove_file API response:",'DEBUG',response);

				const result = response.result // array of objects

				// user messages
					// const msg_type = (response.result===false) ? 'error' : 'ok'
					// if (response.result===false) {
					// 	ui.show_message(self.user_msg_container, response.msg, msg_type)
					// }

				resolve(result)
			})
		})
};//end remove_file



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
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'import_files')
		// add the necessary arguments used in the given function
		source.arguments = {
			files				: files,
			time_machine_save	: time_machine_save
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
				dd_console("-> import_files API response:",'DEBUG',response);

				resolve(response)
			})
		})
};//end import_files


