/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_edit_tool_upload} from './render_edit_tool_upload.js'
	import {render_mini_tool_upload} from './render_mini_tool_upload.js'


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
	tool_upload.prototype.edit		= render_tool_upload.prototype.edit



/**
* INIT
*/
tool_upload.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = DEDALO_TOOLS_URL + "/tool_upload/trigger.tool_upload.php"


	return common_init
};//end init



/**
* BUILD
*/
tool_upload.prototype.build = async function(autoload=false) {

	const self = this

	// fetch system info
		const system_info = await get_system_info(self)
		// set as tool properties
			self.max_size_bytes			= system_info.max_size_bytes
			self.sys_get_temp_dir		= system_info.sys_get_temp_dir
			self.upload_tmp_dir			= system_info.upload_tmp_dir
			self.upload_tmp_perms		= system_info.upload_tmp_perms
			self.session_cache_expire	= system_info.session_cache_expire

	// call generic common tool build
		const common_build = tool_common.prototype.build.call(this, autoload);


	return common_build
};//end build_custom



/**
* GET_SYSTEM_INFO
* Call trigger to obtain useful system info
*/
const get_system_info = async function(self) {


	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(arguments)
		const source = create_source(self, 'get_system_info')
		// add the necessary arguments used in the given function
		source.arguments = {}

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
				dd_console("-> get_system_info API response:",'DEBUG',response);

				const result = response.result

				resolve(result)
			})
		})
};//end get_system_info



/**
* UPLOAD_FILE
*/
tool_upload.prototype.upload_file = async function(file, content_data, response_msg, preview_image, progress_bar_container) {

	const self = this

	// collect needed caller data
		const component_tipo		= self.caller.tipo || null
		const section_tipo			= self.caller.section_tipo || null
		const section_id			= self.caller.section_id || null
		const quality				= self.caller.context.default_target_quality || null
		const target_dir			= self.caller.context.target_dir || null
		const allowed_extensions	= self.caller.context.allowed_extensions
		const caller_type			= self.caller.context.type
		console.log("self.caller.context:",self.caller.context);

	// check file extension
		const file_extension = file.name.split('.').pop().toLowerCase();
		if (!allowed_extensions.includes(file_extension)) {
			alert( get_label.extension_no_valida + ": \n" + file_extension + "\nUse any of: \n" + JSON.stringify(allowed_extensions) );
			return false
		}

	// check max file size
		const file_size_bytes = file.size
		if (file_size_bytes>self.max_size_bytes) {
			alert( get_label.fichero_demasiado_grande + " Max file size is " + Math.floor(self.max_size_bytes / (1024*1024)) + " MB and current file is " + Math.floor(file_size_bytes / (1024*1024)));
			return false
		}

	// elements
		const progress_info	= progress_bar_container.querySelector('.progress_info')
		const progress_line	= progress_bar_container.querySelector('.progress_line')
		const filedrag		= content_data.querySelector('.filedrag')

	// hide filedrag
		filedrag.classList.add('loading_file')

	// FormData build
		const fd = new FormData();
			  fd.append("mode", 			"upload_file");
			  fd.append("component_tipo", 	self.caller.tipo);
			  fd.append("section_tipo", 	self.caller.section_tipo);
			  fd.append("section_id", 		self.caller.section_id);
			  fd.append("quality", 			self.caller.context.default_target_quality);
			  // file
			  fd.append("fileToUpload", file);

	// upload_loadstart
		const upload_loadstart = function(evt) {
			preview_image.src 	   = ''
			progress_line.value    = 0;
			response_msg.innerHTML = '<span class="blink">Loading file '+file.name+'</span>'
		};//end upload_loadstart

	// upload_load
		const upload_load = function(evt) {
			response_msg.innerHTML = '<span class="blink">Processing file '+file.name+'</span>'
		};//end upload_load

	// upload_error
		const upload_error = function(evt) {
			response_msg.innerHTML = `<span class="error">${get_label.error_al_subir_el_archivo} ${file.name}</span>`
		};//end upload_error

	// upload_abort
		const upload_abort = function(evt) {
			response_msg.innerHTML = '<span class="error">User aborts upload</span>'
		};//end upload_abort

	// upload_progress
		const upload_progress = function(evt) {
			const percent = parseInt(evt.loaded/evt.total*100);
			// info line show numerical percentage of load
		    progress_info.innerHTML = 'Upload progress: ' + percent + ' %'
		    // progress line show graphic percentage of load
		    progress_line.value = percent
		};//end upload_progress

	// xhr_load
		const xhr_load = function(evt) {

			// parse response string as JSON
				const response = JSON.parse(evt.target.response);
				if (!response) {
					console.error("Error in XMLHttpRequest load response. Nothing is received");
					return false
				}

			// debug
				if(SHOW_DEBUG===true) {
					console.log("upload_file.XMLHttpRequest load response:", response);
				}

			// print message
				response_msg.innerHTML = response.msg

			// preview image
				if (response.preview_url) {
					preview_image.src = response.preview_url + '?' + (new Date().getTime())
				}

			// show filedrag
				filedrag.classList.remove("loading_file")

			// refresh component
				self.caller.refresh().then((refresh_reponse)=>{

				})

			// close modal. On close, modal destroy the caller (this tool)
				// setTimeout(()=>{
				// 	const modal_container = document.querySelector('dd-modal')
				// 	if (modal_container) {
				// 		modal_container._closeModal()
				// 	}
				// }, 20000)

			return true
		};//end xhr_load


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
			xhr.open("POST", self.trigger_url, true);

			// request header
			xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

			// send data
			xhr.send(fd);


	return true
};//end upload_file


