/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {ui} from '../../../core/common/js/ui.js'
	import {render_edit_tool_upload} from './render_edit_tool_upload.js'
	import {render_mini_tool_upload} from './render_mini_tool_upload.js'
	import {upload} from '../../../core/services/service_upload_files/js/service_upload_files.js'

/**
* TOOL_UPLOAD
* Tool to translate contents from one language to other in any text component
*/
export const tool_upload = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.status			= null
	this.events_tokens	= null
	this.type			= null
	this.caller			= null

	this.max_size_bytes	= null

	return true
};//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_upload.prototype.render	= common.prototype.render
	tool_upload.prototype.destroy	= common.prototype.destroy
	tool_upload.prototype.refresh	= common.prototype.refresh
	tool_upload.prototype.edit		= render_edit_tool_upload.prototype.edit
	tool_upload.prototype.list		= render_edit_tool_upload.prototype.edit
	tool_upload.prototype.mini		= render_mini_tool_upload.prototype.mini



/**
* INIT
*/
tool_upload.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		// self.trigger_url = DEDALO_TOOLS_URL + "/tool_upload/trigger.tool_upload.php"

	// events
		event_manager.subscribe('upload_file_status_'+self.id, fn_update_file_status)
		function fn_update_file_status(options) {

			// DOM node fixed on render
				const progress_line	= self.progress_line
				const progress_info	= self.progress_info
				const response_msg	= self.response_msg

			// check
				if(!progress_line || !progress_info || !response_msg) {
					console.error('fn_update_file_status: unable to get base nodes (progress and message)')
					return
				}

			// progress
				progress_line.value		= options.value // percentage line
				progress_info.innerHTML	= options.msg // progress text info

			// messages
				if(options.value===false) {
					response_msg.innerHTML = options.msg
				}
				else if(options.value===100) {
					response_msg.innerHTML = 'Upload done. Processing file...'
					const spinner = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'spinner',
						parent			: response_msg
					})
				}
		}


	return common_init
};//end init



/**
* BUILD
*/
tool_upload.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// fetch system info
		const system_info = await get_system_info(self)
		// set as tool properties
			self.max_size_bytes			= system_info.max_size_bytes
			self.sys_get_temp_dir		= system_info.sys_get_temp_dir
			self.upload_tmp_dir			= system_info.upload_tmp_dir
			self.upload_tmp_perms		= system_info.upload_tmp_perms
			self.session_cache_expire	= system_info.session_cache_expire


	return common_build
};//end build_custom



/**
* GET_SYSTEM_INFO
* Call API to obtain useful system info
*/
const get_system_info = async function(self) {


	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'get_system_info'
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			const current_data_manager = new data_manager()
			current_data_manager.request({body : rqo})
			.then(function(response){
				dd_console("-> get_system_info API response:",'DEBUG',response);

				const result = response.result

				resolve(result)
			})
		})
};//end get_system_info



/**
* UPLOAD_FILE COPY DES
*/
	// tool_upload.prototype.upload_file = async function(file, content_data, response_msg, preview_image, progress_bar_container) {

	// 	const self = this

	// 	// collect needed caller data
	// 		const component_tipo		= self.caller.tipo || null
	// 		const section_tipo			= self.caller.section_tipo || null
	// 		const section_id			= self.caller.section_id || null
	// 		const quality				= self.caller.context.target_quality || self.caller.context.default_target_quality || null
	// 		const target_dir			= self.caller.context.target_dir || null
	// 		const allowed_extensions	= self.caller.context.allowed_extensions
	// 		const caller_type			= self.caller.context.type
	// 		console.log("self.caller.context:",self.caller.context);

	// 	// check file extension
	// 		const file_extension = file.name.split('.').pop().toLowerCase();
	// 		if (!allowed_extensions.includes(file_extension)) {
	// 			alert( get_label.extension_no_valida + ": \n" + file_extension + "\nUse any of: \n" + JSON.stringify(allowed_extensions) );
	// 			return false
	// 		}

	// 	// check max file size
	// 		const file_size_bytes = file.size
	// 		if (file_size_bytes>self.max_size_bytes) {
	// 			alert( get_label.fichero_demasiado_grande + " Max file size is " + Math.floor(self.max_size_bytes / (1024*1024)) + " MB and current file is " + Math.floor(file_size_bytes / (1024*1024)));
	// 			return false
	// 		}

	// 	// elements
	// 		const progress_info	= progress_bar_container.querySelector('.progress_info')
	// 		const progress_line	= progress_bar_container.querySelector('.progress_line')
	// 		const filedrag		= content_data.querySelector('.filedrag')

	// 	// hide filedrag
	// 		filedrag.classList.add('loading_file')

	// 	// FormData build
	// 		const fd = new FormData();
	// 		fd.append('mode', 				'upload_file');
	// 		fd.append('component_tipo', 	component_tipo);
	// 		fd.append('section_tipo', 		section_tipo);
	// 		fd.append('section_id', 		section_id);
	// 		fd.append('quality', 			quality);
	// 		fd.append('caller_type', 		caller_type);
	// 		fd.append('target_dir', 		JSON.stringify(target_dir));
	// 		fd.append('allowed_extensions', JSON.stringify(allowed_extensions));
	// 		// file
	// 		fd.append('fileToUpload', file);


	// 		// upload_loadstart
	// 			const upload_loadstart = function() {
	// 				if (preview_image) {
	// 					preview_image.src = ''
	// 				}
	// 				progress_line.value		= 0;
	// 				response_msg.innerHTML	= '<span class="blink">Loading file '+file.name+'</span>'
	// 			};//end upload_loadstart

	// 		// upload_load (load is complete)
	// 			const upload_load = function() {
	// 				// response_msg.innerHTML = '<span class="blink">Processing file '+file.name+'</span>'
	// 				response_msg.innerHTML = '<span>File uploaded '+file.name+'</span>'

	// 			};//end upload_load

	// 		// upload_error
	// 			const upload_error = function() {
	// 				response_msg.innerHTML = `<span class="error">${get_label.error_al_subir_el_archivo} ${file.name}</span>`
	// 			};//end upload_error

	// 		// upload_abort
	// 			const upload_abort = function() {
	// 				response_msg.innerHTML = '<span class="error">User aborts upload</span>'
	// 			};//end upload_abort

	// 		// upload_progress
	// 			const upload_progress = function(evt) {
	// 				const percent = parseInt(evt.loaded/evt.total*100);
	// 				// info line show numerical percentage of load
	// 			    progress_info.innerHTML = 'Upload progress: ' + percent + ' %'
	// 			    // progress line show graphic percentage of load
	// 			    progress_line.value = percent
	// 			};//end upload_progress

	// 		// xhr_load
	// 			const xhr_load = function(evt) {

	// 				// parse response string as JSON
	// 					let response = null
	// 					try {
	// 						response = JSON.parse(evt.target.response);
	// 					} catch (error) {
	// 						alert(evt.target.response)
	// 						console.warn("response:",evt.target.response);
	// 						console.error(error)
	// 					}
	// 					if (!response) {
	// 						console.error("Error in XMLHttpRequest load response. Invalid response is received");
	// 						return false
	// 					}

	// 				// debug
	// 					if(SHOW_DEBUG===true) {
	// 						console.log("upload_file.XMLHttpRequest load response:", response);
	// 					}

	// 				// print message
	// 					response_msg.innerHTML = response.msg

	// 				// preview image
	// 					if (preview_image && response.preview_url) {
	// 						preview_image.src = response.preview_url + '?' + (new Date().getTime())
	// 					}

	// 				// show filedrag
	// 					filedrag.classList.remove("loading_file")

	// 				// refresh caller (usually a component)
	// 					self.caller.refresh()


	// 				return true
	// 			};//end xhr_load


	// 		// XMLHttpRequest
	// 			const xhr = new XMLHttpRequest();

	// 			// upload
	// 				// upload_loadstart (the upload begins)
	// 				xhr.upload.addEventListener("loadstart", upload_loadstart, false);

	// 				// upload_load file (the upload ends successfully)
	// 				xhr.upload.addEventListener("load", upload_load, false);

	// 				// upload_error (the upload ends in error)
	// 				xhr.upload.addEventListener("error", upload_error, false);

	// 				// upload_abort (the upload has been aborted by the user)
	// 				xhr.upload.addEventListener("abort", upload_abort, false);

	// 				// progress
	// 				xhr.upload.addEventListener("progress", upload_progress, false);

	// 			// hxr
	// 				// xhr_load (the XMLHttpRequest ends successfully)
	// 				xhr.addEventListener("load", xhr_load, false);

	// 				// open connection
	// 				xhr.open("POST", self.trigger_url, true);

	// 				// request header
	// 				xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

	// 			// send data
	// 				xhr.send(fd);




	// 	return true
	// };//end upload_file



/**
* UPLOAD_FILE
* Upload selected file to server using the API and when is done, process the target file
* calling caller component across process_uploaded_file tool method
* @param object options
*/
tool_upload.prototype.upload_file = async function(options) {

	const self = this

	// options
		const file = options.file

	// short vars
		const resource_type_dir		= self.caller.context.resource_type_dir || null
		const allowed_extensions	= self.caller.context.allowed_extensions

	// upload (using service upload)
		const api_response = await upload({
			id					: self.id, // id done by the caller, used to send the events of progress
			file				: file, // object {name:'xxx.jpg',size:5456456}
			resource_type_dir	: resource_type_dir, // string like 'image'
			allowed_extensions	: allowed_extensions, // array ['tiff', 'jpeg']
			max_size_bytes		: self.max_size_bytes // int 352142
		})
		if (!api_response.result) {
			console.log("Error on api_response:", api_response);
			return false
		}

	// process upload file (return promise)
		const result = await self.process_uploaded_file(api_response.file_data)


	return result
};//end upload_file



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
tool_upload.prototype.process_uploaded_file = function(file_data) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'process_uploaded_file')
		// add the necessary arguments used in the given function
		source.arguments = {
			file_data		: file_data,
			tipo			: self.caller.tipo,
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			quality			: self.caller.context.target_quality || self.caller.context.default_target_quality || null
			// caller_type	: self.caller.context.type
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
				dd_console("-> process_uploaded_file API response:",'DEBUG', response);

				resolve(response)
			})
		})
};
