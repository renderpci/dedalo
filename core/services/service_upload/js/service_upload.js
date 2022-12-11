/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../common/js/event_manager.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	// // import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {dd_console} from '../../../common/js/utils/index.js'
	// import {ui} from '../../../common/js/ui.js'
	import {common} from '../../../common/js/common.js'
	import {render_edit_service_upload} from './render_edit_service_upload.js'



/**
* SERVICE_UPLOAD
* Common service to manage basic upload files
* It is used by tools like 'service_upload', 'tool_import' and more
*/
export const service_upload = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.caller				= null

	this.max_size_bytes		= null
	this.allowed_extensions	= null

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend functions from common
*/
// prototypes assign
	service_upload.prototype.render		= common.prototype.render
	service_upload.prototype.destroy	= common.prototype.destroy
	service_upload.prototype.refresh	= common.prototype.refresh
	service_upload.prototype.edit		= render_edit_service_upload.prototype.edit



/**
* INIT
*/
service_upload.prototype.init = async function(options) {

	const self = this

	// call the generic common init
		const common_init = await common.prototype.init.call(this, options);

	// fix
		self.model				= options.model || 'service_upload'
		self.allowed_extensions	= options.allowed_extensions || []

	// events
		self.events_tokens.push(
			event_manager.subscribe('upload_file_status_'+self.id, fn_update_file_status)
		)
		function fn_update_file_status(options) {

			// options
				const msg	= options.msg
				const value	= options.value

			// DOM node fixed on render
				const progress_info	= self.progress_info
				const progress_line	= self.progress_line
				const response_msg	= self.response_msg

			// progress
				if (progress_info) {
					progress_info.innerHTML	= msg // progress text info
				}
				if (progress_line) {
					progress_line.value = value // percentage line
				}

			// messages
				if (response_msg) {
					if(value===false) {
						response_msg.innerHTML = msg
					}
					else if(value===100) {
						response_msg.innerHTML = 'Upload done.'
					}
				}
		}


	return common_init
}//end init



/**
* BUILD
*/
service_upload.prototype.build = async function(autoload=false) {

	const self = this

	// fetch system info
		const system_info = await get_system_info(self)
		// set as tool properties
			self.max_size_bytes			= system_info.max_size_bytes
			self.sys_get_temp_dir		= system_info.sys_get_temp_dir
			self.upload_tmp_dir			= system_info.upload_tmp_dir
			self.upload_tmp_perms		= system_info.upload_tmp_perms
			self.session_cache_expire	= system_info.session_cache_expire

	return true
}//end build_custom



/**
* GET_SYSTEM_INFO
* Call API to obtain useful system info
*/
const get_system_info = async function() {

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'get_system_info'
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				dd_console("-> get_system_info API response:",'DEBUG',response);

				const result = response.result

				resolve(result)
			})
		})
}//end get_system_info



/**
* UPLOAD
*/
export const upload = async function(options) {

	// options
		const id					= options.id // id done by the caller, used to send the events of progress
		const file					= options.file // object {name:'xxx.jpg',size:5456456}
		const resource_type			= options.resource_type // object {type: 'dedalo_config', value: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH'}
		const allowed_extensions	= options.allowed_extensions // array ['tiff', 'jpeg']
		const max_size_bytes		= options.max_size_bytes // int 352142

	return new Promise(function(resolve){

	// short vars
		const api_url	= DEDALO_API_URL
		const response = {result:false}

	// check file extension
		const file_extension = file.name.split('.').pop().toLowerCase();
		if (!allowed_extensions.includes(file_extension)) {
			alert( get_label.extension_no_valida + ": \n" + file_extension + "\nUse any of: \n" + JSON.stringify(allowed_extensions) );
			resolve(response)
			return false
		}

	// check max file size
		const file_size_bytes = file.size
		if (file_size_bytes>max_size_bytes) {
			alert( get_label.fichero_demasiado_grande + " Max file size is " + Math.floor(max_size_bytes / (1024*1024)) + " MB and current file is " + Math.floor(file_size_bytes / (1024*1024)));
			resolve(response)
			return false
		}

	// FormData build
		const fd = new FormData();
		fd.append('resource_type',		resource_type);
		// fd.append('allowed_extensions', 	JSON.stringify(allowed_extensions));
		// file
		fd.append('fileToUpload', file);


		// upload_loadstart
			const upload_loadstart = function() {
				// progress_line.value		= 0;
				// response_msg.innerHTML	= '<span class="blink">Loading file '+file.name+'</span>'
				event_manager.publish('upload_file_status_'+id, {
					value	: 0,
					msg		: 'Loading file ' + file.name
				})
			}//end upload_loadstart

		// upload_load.(finished)
			const upload_load = function() {
				// response_msg.innerHTML = '<span class="blink">Processing file '+file.name+'</span>'
				event_manager.publish('upload_file_status_'+id, {
					value	: 100,
					msg		: 'Loaded file ' + file.name
				})
			}//end upload_load

		// upload_error
			const upload_error = function() {
				// response_msg.innerHTML = `<span class="error">${get_label.error_al_subir_el_archivo} ${file.name}</span>`
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: `${get_label.error_al_subir_el_archivo} ${file.name}`
				})
			}//end upload_error

		// upload_abort
			const upload_abort = function() {
				// response_msg.innerHTML = '<span class="error">User aborts upload</span>'
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: `User aborts upload`
				})
			}//end upload_abort

		// upload_progress
			const upload_progress = function(evt) {
				const percent = parseInt(evt.loaded/evt.total*100);
				// info line show numerical percentage of load
			    // progress_info.innerHTML = 'Upload progress: ' + percent + ' %'
			    // progress line show graphic percentage of load
			    // progress_line.value = percent
			    event_manager.publish('upload_file_status_'+id, {
					value	: percent,
					msg		: `Upload progress: ${percent} %`
				})
			}//end upload_progress

		// xhr_load
			const xhr_load = function(evt) {

				// parse response string as JSON
					// let response = null
					try {
						const api_response = JSON.parse(evt.target.response);

						if (!api_response) {
							console.error("Error in XMLHttpRequest load response. Invalid response is received");
							resolve(response)
							return false
						}
						// debug
							if(SHOW_DEBUG===true) {
								console.log("upload_file.XMLHttpRequest load response:", api_response);
							}


						resolve(api_response) //api_response
						return true

					} catch (error) {
						alert(evt.target.response)
						console.warn("response:",evt.target.response);
						console.error(error)

						resolve(response)
						return false
					}

				// print message
					// response_msg.innerHTML = response.msg

			}//end xhr_load


		// XMLHttpRequest
			const xhr = new XMLHttpRequest();

			// upload
				// upload_loadstart (the upload begins)
				xhr.upload.addEventListener("loadstart", upload_loadstart, false);

				// upload_load file (the upload ends successfully)
				xhr.upload.addEventListener("load", upload_load, false);

				// upload_error (the upload ends in error)
				xhr.upload.addEventListener("error", upload_error, false);

				// upload_abort (the upload has been aborted by the user)
				xhr.upload.addEventListener("abort", upload_abort, false);

				// progress
				xhr.upload.addEventListener("progress", upload_progress, false);

			// hxr
				// xhr_load (the XMLHttpRequest ends successfully)
				xhr.addEventListener("load", xhr_load, false);

				// open connection
				xhr.open("POST", api_url, true);

				// request header
				xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

			// send data
				xhr.send(fd);

	})
}//end upload



/**
* UPLOAD_FILE
* Upload selected file to server using the API and when is done, process the target file
* calling caller component across process_uploaded_file tool method
* @param object options
*/
service_upload.prototype.upload_file = async function(options) {

	const self = this

	// options
		const file = options.file

	// short vars
		const resource_type = self.caller.context.features
			? self.caller.context.features.resource_type
			: (self.caller.model || null) // like 'image'
		const allowed_extensions = self.allowed_extensions

	// upload (using service upload)
		const api_response = await upload({
			id					: self.id, // id done by the caller, used to send the events of progress
			file				: file, // object {name:'xxx.jpg',size:5456456}
			resource_type		: resource_type, // string like 'image' used to target dir
			allowed_extensions	: allowed_extensions, // array ['tiff', 'jpeg']
			max_size_bytes		: self.max_size_bytes // int 352142
		})
		if (!api_response.result) {
			console.log("Error on api_response:", api_response);
			return {
				result	: false,
				msg		: api_response.msg || 'Error on api_response'
			}
		}

	// event
		event_manager.publish('upload_file_done_' + self.caller.id, {
			file_data : api_response.file_data
			// api_response : api_response
		})


	return api_response
}//end upload_file



/**
* PROCESS_UPLOADED_FILE
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
*/
	// service_upload.prototype.process_uploaded_file = function(file_data) {

	// 	const self = this

	// 	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// 	// this generates a call as my_tool_name::my_function_name(arguments)
	// 		const source = create_source(self, 'process_uploaded_file')
	// 		// add the necessary arguments used in the given function
	// 		source.arguments = {
	// 			file_data		: file_data,
	// 			tipo			: self.caller.tipo,
	// 			section_tipo	: self.caller.section_tipo,
	// 			section_id		: self.caller.section_id,
	// 			caller_type		: self.caller.context.type, // like 'tool' or 'component'. Switch different process actions on service_upload class
	// 			quality			: self.caller.context.features.target_quality || self.caller.context.features.default_target_quality || null, // only for components
	// 			target_dir		: self.caller.context.features.target_dir || null // optional object like {type: 'dedalo_config', value: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH' // defined in config}
	// 		}

	// 	// rqo
	// 		const rqo = {
	// 			dd_api	: 'dd_tools_api',
	// 			action	: 'tool_request',
	// 			source	: source
	// 		}

	// 	// call to the API, fetch data and get response
	// 		return new Promise(function(resolve){

	// 			data_manager.request({body : rqo})
	// 			.then(function(response){
	// 				dd_console("-> process_uploaded_file API response:",'DEBUG', response);

	// 				resolve(response)
	// 			})
	// 		})
	// };


