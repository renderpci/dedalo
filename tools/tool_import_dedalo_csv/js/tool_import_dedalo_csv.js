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
* Client-side controller for the Dédalo CSV bulk-import tool.
*
* This module owns the data-layer responsibilities of the import tool:
* - Fetching the list of CSV files already staged in the server's per-user upload
*   directory (DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH/<user_id>/).
* - Deleting a staged CSV file before import.
* - Querying the component list of a target section (for the column mapper).
* - Moving a freshly uploaded temp file to its definitive location.
* - Triggering the actual import run (background process) and polling its progress
*   via SSE through render_tool_import_dedalo_csv.
*
* All DOM rendering is delegated to render_tool_import_dedalo_csv (edit, upload_done).
* Lifecycle scaffolding (render, destroy, refresh) is mixed in from tool_common /
* common. Every API call goes through data_manager.request() to dd_tools_api with
* action 'tool_request', matching the server-side API_ACTIONS allowlist.
*
* @see class.tool_import_dedalo_csv.php  — server-side counterpart
* @see render_tool_import_dedalo_csv.js  — DOM rendering and process-stream handling
*/
export const tool_import_dedalo_csv = function () {

	// Standard fields shared by all tool/component instances (populated by tool_common.init).
	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null // child instances (service_upload); destroyed on tool destroy
	this.events_tokens	= null // event_manager subscriptions; released on destroy
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null // the section instance that opened this tool

	// Tool-specific fields.
	this.csv_files_list	= null // {Array} fetched by load_csv_files_list; each entry is a file descriptor object
}//end tool_import_dedalo_csv



/**
* COMMON FUNCTIONS
* Extend tool_import_dedalo_csv with shared prototype methods from tool_common,
* common, and the render module.
*
* render / destroy / refresh come from the shared bases unchanged.
* edit and upload_done are provided by render_tool_import_dedalo_csv so that
* all DOM-building logic stays in the render module while the tool controller
* (this file) remains data-focused.
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
* Custom tool initialisation. Delegates the bulk of the work to the generic
* tool_common.prototype.init (which sets id, model, mode, context, ar_instances,
* events_tokens, etc.) and then wires the tool-specific event subscription.
*
* The 'upload_file_done_<id>' event is published by service_upload once a file
* transfer completes. Subscribing here ensures upload_done() is called on the
* correct tool instance regardless of how many tool panels are open simultaneously.
*
* @param {Object} options - Initialisation options forwarded from get_instance / render
* @returns {Promise<boolean>} Resolves with the boolean result of tool_common.init
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
		// Subscribe to the upload completion event keyed by this tool's id so
		// that upload_done() is only triggered for uploads belonging to this instance.
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
* Custom tool build. Delegates to tool_common.prototype.build for the shared
* scaffolding (context load, ddo rendering), then performs two tool-specific
* setup steps:
*
* 1. Fetches the list of CSV files already in the server staging directory and
*    stores it in self.csv_files_list. This list drives the file-picker UI in
*    render_tool_import_dedalo_csv.prototype.edit.
*
* 2. Creates and initialises a service_upload instance (restricted to .csv files,
*    scoped to the 'csv' key_dir) and registers it in self.ar_instances so it is
*    cleaned up when the tool is destroyed.
*
* Any failure inside the try block stores the error on self.error and logs it;
* the common_build result is still returned so the caller can detect init failure.
*
* @param {boolean} [autoload=false] - When true, tool_common.build triggers data auto-load
* @returns {Promise<boolean>} Resolves with the boolean result of tool_common.build
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
			// (!) key_dir 'csv' scopes uploads to the CSV staging sub-directory;
			// allowed_extensions enforces server-side validation to .csv only.
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
}//end build



/**
* LOAD_CSV_FILES_LIST
* Fetches the list of CSV files currently staged in the per-user upload directory
* on the server. The directory path is resolved server-side from the constant
* DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH (typically DEDALO_MEDIA_PATH/import/files/<user_id>/).
*
* The response is an array of file-descriptor objects. Each descriptor has at
* minimum: { name, dir, n_records, n_columns, file_info, sample_data,
* sample_data_errors, ar_columns_map }. The render module augments each object
* with UI state properties (checked, section_tipo, bulk_process_label, etc.).
*
* The 'options' body is intentionally left empty so the server falls back to the
* default configured path; a custom 'dir' could be passed here if needed.
*
* (!) SHOW_DEVELOPER is used for debug logging but is not declared in the file's
* global directive — see flags.
*
* @returns {Promise<Array>} Resolves with the array of file-descriptor objects
*   returned by server-side tool_import_dedalo_csv::get_csv_files()
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
* Deletes a staged CSV file from the server's per-user upload directory and
* clears any persisted import-process state for this tool from the local IndexedDB.
*
* Clearing local DB state (process_import_dedalo_csv / status) is important because
* check_process_data() in the render module reads that key on every full render to
* resume a live import. If stale state were left behind after a file delete, the next
* render could try to reconnect to a process that no longer exists.
*
* The server-side handler (tool_import_dedalo_csv::delete_csv_file) validates the
* resolved path against the user's staging directory before deleting, so callers do
* not need to sanitise item.name themselves.
*
* @param {Object} item - File-descriptor object from csv_files_list; must have a
*   {string} item.name property matching the file's basename on disk
* @returns {Promise<*>} Resolves with response.result from the server (typically true
*   on success or an error object on failure)
*/
tool_import_dedalo_csv.prototype.remove_file = function(item) {

	const self = this

	// remove of local database the process connection
	// Wipe any pending-process state so that check_process_data() does not try to
	// resume a non-existent import after the file has been deleted.
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
* Dispatches the bulk-import request to the server and resolves with the full API
* response (including pid and pfile) so the caller can open an SSE progress stream.
*
* background_running:true instructs the server (process_runner.php) to fork the import
* as a background process and return the PID immediately. The actual import can take
* many minutes for large datasets; the 3600-second timeout and retries:1 prevent the
* worker from giving up while still sending exactly one request.
*
* Each element of 'files' is a plain object assembled by the render module:
* {
*   file              : {string}  basename of the staged CSV file
*   section_tipo      : {string}  target section tipo (e.g. 'oh1')
*   ar_columns_map    : {Array}   column-to-component mapping built by the column mapper UI;
*                                 each entry: { tipo, model, label, checked, mapped_to [, decimal] }
*   bulk_process_label: {string}  human-readable name for the bulk-process record (dd800)
* }
*
* @param {Array}   files             - Array of file-descriptor objects (see above)
* @param {boolean} time_machine_save - When true, the server saves a time-machine snapshot
*   for every record touched, enabling per-record revert. Defaults to true in the UI.
* @returns {Promise<Object>} Resolves with the full API response object; on success
*   response.result===true and response.pid/response.pfile identify the background process
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
* Retrieves the list of importable components for a given section tipo and caches
* the result on this instance so repeated calls for the same section_tipo skip the
* network round-trip (important because the column mapper calls this on every
* section_tipo change triggered by the user).
*
* On success, response.result is an array of component-descriptor objects:
*   { value: 'oh25', label: 'Title', model: 'component_input_text' }
*
* On failure (unknown tipo, etc.), response.result is falsy and response.msg carries
* the human-readable error. In that case this method resolves with
*   { list: false, label: false, msg: '...' }
* so callers can display the error without throwing.
*
* The on-instance cache (self.resolved_section_components_list) is a plain object
* keyed by section_tipo. It is not cleared between renders; if the section's schema
* changes while the tool is open, the user must close and reopen the tool.
*
* (!) The cache check returns the cached value directly (not wrapped in a new Promise).
* Callers that use .then() on the return value must handle both a plain-object fast-
* path and a Promise — which works because .then() on a non-thenable is simply
* ignored by await/Promise.resolve.
*
* @param {string} section_tipo - The ontology tipo of the target section (e.g. 'oh1')
* @returns {Promise<Object>|Object} Resolves with { list: Array|false, label: string|false, msg: string }
*/
tool_import_dedalo_csv.prototype.get_section_components_list = function(section_tipo) {

	const self = this

	// cache results
	// Lazily initialise the cache object; return immediately on a cache hit to
	// avoid a redundant network request when the user edits the same section_tipo field.
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
					// error path: return a sentinel so callers can show the server error
					// without having to catch a rejection
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
* Moves a freshly uploaded temporary CSV file from the service_upload staging area
* to the tool's definitive per-user directory (DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH/<user_id>/)
* and parses its header row to populate the column-map metadata.
*
* This is called automatically by upload_done() (mixed in from render_tool_import_dedalo_csv)
* immediately after service_upload fires 'upload_file_done_<id>'. The file_data object
* is the raw descriptor returned by service_upload after a successful transfer:
* {
*   error     : {number} 0 = success (PHP UPLOAD_ERR_* codes)
*   extension : {string} e.g. "csv"
*   name      : {string} original filename, e.g. "exported_oral-history_-1-oh1.csv"
*   size      : {number} bytes
*   tmp_name  : {string} absolute server path to the uploaded temp file,
*                        e.g. "/hd/media/upload/service_upload/tmp/image/phpPJQvCp"
*   type      : {string} MIME type, e.g. "text/csv"
* }
*
* Note: the sample file_data shown in the original doc-block used a .tiff example —
* the actual files processed by this tool are always .csv. The shape of the descriptor
* is the same regardless of file type because it comes from the generic service_upload.
*
* On success, response.result is the new file-descriptor object (same shape as entries
* in csv_files_list) that the render layer uses to refresh the file list.
*
* @param {Object} file_data - Upload descriptor from service_upload (see above)
* @returns {Promise<Object>} Resolves with the full API response; response.result is the
*   new file descriptor on success, or falsy with response.msg on failure
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
