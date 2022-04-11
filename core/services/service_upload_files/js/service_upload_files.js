/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	// import {get_instance, delete_instance} from '../../../core/common/js/instances.js'
	// import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	// import {data_manager} from '../../../core/common/js/data_manager.js'
	// import {common, create_source} from '../../../core/common/js/common.js'
	// import {tool_common} from '../../tool_common/js/tool_common.js'
	// import {render_edit_tool_upload} from './render_edit_tool_upload.js'
	// import {render_mini_tool_upload} from './render_mini_tool_upload.js'


/**
* SERVICE_UPLOAD
*
*/
export const service_upload_files = function () {

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
* UPLOAD
*/
export const upload = async function(options) {

	// options
		const id					= options.id // id done by the caller, used to send the events of progress
		const file					= options.file // object {name:'xxx.jpg',size:5456456}
		const resource_type_dir		= options.resource_type_dir // object {type: 'dedalo_config', value: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH'}
		const allowed_extensions	= options.allowed_extensions // array ['tiff', 'jpeg']
		const max_size_bytes		= options.max_size_bytes // int 352142

	return new Promise(function(resolve){

	// short vars
		const api_url	= DEDALO_CORE_URL + '/api/v1/json/'
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
		fd.append('resource_type_dir',		resource_type_dir);
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
			};//end upload_loadstart

		// upload_load.(finished)
			const upload_load = function() {
				// response_msg.innerHTML = '<span class="blink">Processing file '+file.name+'</span>'
				event_manager.publish('upload_file_status_'+id, {
					value	: 100,
					msg		: 'Loaded file ' + file.name
				})
			};//end upload_load

		// upload_error
			const upload_error = function() {
				// response_msg.innerHTML = `<span class="error">${get_label.error_al_subir_el_archivo} ${file.name}</span>`
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: `${get_label.error_al_subir_el_archivo} ${file.name}`
				})
			};//end upload_error

		// upload_abort
			const upload_abort = function() {
				// response_msg.innerHTML = '<span class="error">User aborts upload</span>'
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: `User aborts upload`
				})
			};//end upload_abort

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
			};//end upload_progress

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
				xhr.open("POST", api_url, true);

				// request header
				xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

			// send data
				xhr.send(fd);

	})
};//end upload


