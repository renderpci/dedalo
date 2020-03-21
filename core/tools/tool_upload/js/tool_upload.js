// import
	import {data_manager} from '../../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../../common/js/instances.js'
	import {common} from '../../../common/js/common.js'
	import {tool_common} from '../../../tool_common/js/tool_common.js'
	import {render_tool_upload} from './render_tool_upload.js'



/**
* TOOL_UPLOAD
* Tool to translate contents from one language to other in any text component
*/
export const tool_upload = function () {

	this.id
	this.model
	this.mode
	this.node
	this.ar_instances
	this.status
	this.events_tokens
	this.type
	this.caller

	this.max_size_bytes

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_upload.prototype.render 		= common.prototype.render
	tool_upload.prototype.destroy 		= common.prototype.destroy
	tool_upload.prototype.edit 			= render_tool_upload.prototype.edit



/**
* INIT
*/
tool_upload.prototype.init = async function(options) {

	const self = this

	// set the self specific vars not defined by the generic init (in tool_common)
		self.trigger_url = DEDALO_CORE_URL + "/tools/tool_upload/trigger.tool_upload.php"

	// call the generic commom tool init
		const common_init = tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD
*/
tool_upload.prototype.build = async function(autoload=false) {

	const self = this

	// call generic commom tool build
		const common_build = tool_common.prototype.build.call(this, autoload);

	// fetch system info
		const system_info = await get_system_info(self)


	return common_build
}//end build_custom



/**
* GET_SYSTEM_INFO
* Call trigger to obtain useful system info
*/
const get_system_info = async function(self) {

	// errors
		const handle_errors = function(response) {
			if (!response.ok) {
				throw Error(response.statusText);
			}
			return response;
		}

	// trigger call
		const trigger_response = await fetch(
	 		self.trigger_url,
	 		{
				method		: 'POST',
				mode		: 'cors',
				cache		: 'no-cache',
				credentials	: 'same-origin',
				headers		: {'Content-Type': 'application/json'},
				redirect	: 'follow',
				referrer	: 'no-referrer',
				body		: JSON.stringify({
					mode : 'get_system_info'
				})
			})
			.then(handle_errors)
			.then(response => response.json()) // parses JSON response into native Javascript objects
			.catch(error => {
				console.error("!!!!! REQUEST ERROR: ",error)
				return {
					result 	: false,
					msg 	: error.message,
					error 	: error
				}
			});

	// set
		self.max_size_bytes 		= trigger_response.result.max_size_bytes
		self.sys_get_temp_dir 		= trigger_response.result.sys_get_temp_dir
		self.upload_tmp_dir 		= trigger_response.result.upload_tmp_dir
		self.upload_tmp_perms 		= trigger_response.result.upload_tmp_perms
		self.session_cache_expire 	= trigger_response.result.session_cache_expire


	return trigger_response.result
}//end get_system_info



/**
* UPLOAD_FILE
*/
tool_upload.prototype.upload_file = async function(file, content_data, response_msg, preview_image, progress_bar_container) {

	const self = this

	// check file extension
		const allowed_extensions = self.caller.context.allowed_extensions
		const file_extension 	 = file.name.split('.').pop().toLowerCase();
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

	// elemenmts
		const progress_info = progress_bar_container.querySelector('.progress_info')
		const progress_line = progress_bar_container.querySelector('.progress_line')
		const filedrag 		= content_data.querySelector('.filedrag')

	// hide filedrag
		filedrag.classList.add("loading_file")

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
		}//end upload_loadstart

	// upload_load
		const upload_load = function(evt) {
			response_msg.innerHTML = '<span class="blink">Processing file '+file.name+'</span>'
		}//end upload_load

	// upload_error
		const upload_error = function(evt) {
			response_msg.innerHTML = `<span class="error">${get_label.error_al_subir_el_archivo} ${file.name}</span>`
		}//end upload_error

	// upload_abort
		const upload_abort = function(evt) {
			response_msg.innerHTML = '<span class="error">User aborts upload</span>'
		}//end upload_abort

	// upload_progress
		const upload_progress = function(evt) {
			const percent = parseInt(evt.loaded/evt.total*100);
			// info line show numerical percentage of load
		    progress_info.innerHTML = 'Upload progress: ' + percent + ' %'
		    // progress line show graphic percentage of load
		    progress_line.value = percent
		}//end upload_progress

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
			xhr.open("POST", self.trigger_url, true);
	console.log("file.name:",file);
			// request header
			xhr.setRequestHeader("X-File-Name", file.name);

			// send data
			xhr.send(fd);


	return true
}//end upload_file










