// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../../common/js/event_manager.js'
	import {data_manager} from '../../../common/js/data_manager.js'
	import {dd_console,JSON_parse_safely} from '../../../common/js/utils/index.js'
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
* @param object options
* @return bool
*/
service_upload.prototype.init = async function(options) {

	const self = this

	// call the generic common init
		const common_init = await common.prototype.init.call(this, options);

	// fix
		self.model				= options.model || 'service_upload'
		self.allowed_extensions	= options.allowed_extensions || []
		self.key_dir			= options.key_dir || null

	// check
		if (!self.caller) {
			console.error('Caller is mandatory for service_upload:', self);
		}

	// events
		const upload_file_status_handler = (options) => {
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
		self.events_tokens.push(
			event_manager.subscribe('upload_file_status_'+self.id, upload_file_status_handler)
		)


	return common_init
}//end init



/**
* BUILD
* @param bool autoload
* @return bool
*/
service_upload.prototype.build = async function(autoload=false) {

	const self = this

	// fetch system info
		const system_info = await get_system_info(self)
		// set as tool properties
			self.max_size_bytes				= system_info.max_size_bytes
			self.sys_get_temp_dir			= system_info.sys_get_temp_dir
			self.upload_tmp_dir				= system_info.upload_tmp_dir
			self.upload_tmp_perms			= system_info.upload_tmp_perms
			self.session_cache_expire		= system_info.session_cache_expire
			self.upload_service_chunk_files	= system_info.upload_service_chunk_files
			self.pdf_ocr_engine				= system_info.pdf_ocr_engine


	return true
}//end build_custom



/**
* GET_SYSTEM_INFO
* Call API to obtain useful system info
* @return object response
* 	API response
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
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_system_info API response:",'DEBUG',response);
				}

				const result = response.result

				resolve(result)
			})
		})
}//end get_system_info



/**
* UPLOAD
* @param object options
* @return object response
*/
export const upload = async function(options) {

	// options
		const id					= options.id // id done by the caller, used to send the events of progress
		const file					= options.file // object {name:'xxx.jpg',size:5456456}
		const key_dir				= options.key_dir // object {type: 'dedalo_config', value: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH'}
		const allowed_extensions	= options.allowed_extensions // array ['tiff', 'jpeg']
		const max_size_bytes		= options.max_size_bytes // int 352142
		const tipo					= options.tipo // self.caller.caller.tipo, like service_upload.tool_upload.component_image.tipo


	return new Promise(function(resolve){

		// short vars
			const api_url	= DEDALO_API_URL
			const response	= {
				result : false
			}

		// check file extension
			const file_extension = file.name.split('.').pop().toLowerCase();
			if (!allowed_extensions.includes(file_extension)) {
				alert( get_label.invalid_extension + ": \n" + file_extension + "\nUse any of: \n" + JSON.stringify(allowed_extensions) );
				resolve(response)
				return false
			}

		// check max file size
			const file_size_bytes = file.size
			if (file_size_bytes>max_size_bytes) {
				alert( get_label.filesize_is_too_big + " Max file size is " + Math.floor(max_size_bytes / (1024*1024)) + " MB and current file is " + Math.floor(file_size_bytes / (1024*1024)));
				resolve(response)
				return false
			}

		// FormData build
			// 	const fd = new FormData();
			// 	fd.append('key_dir',		key_dir);
			// 	// fd.append('allowed_extensions', 	JSON.stringify(allowed_extensions));
			// 	// file
			// 	fd.append('fileToUpload', file);

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
				// response_msg.innerHTML = `<span class="error">${get_label.error_on_upload_file} ${file.name}</span>`
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: `${get_label.error_on_upload_file} ${file.name}`
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
			const loaded = []
			const upload_progress = function(options) {

				const event			= options.event
				const chunk_index	= options.chunk_index
				const total_chunks	= options.total_chunks

				const current_chunk_loaded = parseInt(event.loaded/event.total*100);
				loaded[chunk_index] = current_chunk_loaded;
				const sum = loaded.reduce((first, second) => first + second);

				const percent = Math.round(sum/total_chunks);
				// info line show numerical percentage of load
			    event_manager.publish('upload_file_status_'+id, {
					value	: percent,
					msg		: `Upload progress: ${percent} %`
				})
				if(percent === 100){
					upload_load()
				}
			}//end upload_progress

		// xhr_load
			const files_chunked		= []
			const count_uploaded	= []
			const xhr_load = function(evt) {

				// debug
					if(SHOW_DEBUG===true) {
						console.log('xhr_load evt:', evt);
					}

				// parse response string as JSON
					const api_response = JSON_parse_safely(evt.target.response);
					if (!api_response) {
						console.error("Error in XMLHttpRequest load response. Invalid response is received");
						if (evt.target.responseText) {
							response.msg = evt.target.responseText
						}
						resolve(response)
						return false
					}

				// check if the file uploaded is a chunk
					const file_data = api_response.file_data
					// if upload is chunked it is necessary join the files in the server before resolve the upload
					if(file_data && file_data.chunked) {
						// get the index
						const chunk_index = file_data.chunk_index

						files_chunked[chunk_index] = file_data.tmp_name
						count_uploaded.push(file_data.chunk_index)
						// get filename of every chunk
						const total_chunks = parseInt( file_data.total_chunks)
						// finished upload all chunks
						if(count_uploaded.length === total_chunks){

							service_upload.prototype.join_chunked_files({
								file_data		: file_data,
								files_chunked	: files_chunked
							})
							.then(function(api_response){
								resolve(api_response)
								return true
							})
						}
					}else{
						resolve(api_response)
						return true
					}
			}//end xhr_load

		// chunk_file
			const chunk_file = function (file) {

				const file_size		= file.size;
				// break into xMB chunks
				const size			= DEDALO_UPLOAD_SERVICE_CHUNK_FILES || 80; // maximum size for chunks
				const chunk_size	= size*1024*1024;
				let start			= 0;
				const total_chunks	= Math.ceil(file_size / chunk_size);

				for (let i = 0; i < total_chunks; i++) {

					const check_end = start + chunk_size
					const end = (file_size - check_end < 0)
						? file_size
						: check_end;
					const chunk = slice(file, start, end);

					send_chunk({
						chunk			: chunk,
						chunk_index		: i,
						total_chunks	: total_chunks,
						start			: start,
						end				: end,
						file_size		: file_size
					});

					start += chunk_size;
				}
			}

		// slice the file
			function slice(file, start, end) {
				const slice = file.mozSlice
					? file.mozSlice
					: file.webkitSlice
						? file.webkitSlice
						: file.slice
							? file.slice
							: function(){};

				return slice.bind(file)(start, end);
			}

		// send the chunk files to server
			function send_chunk(options) {

				const chunked 		= true
				const chunk			= options.chunk
				const chunk_index	= options.chunk_index
				const total_chunks	= options.total_chunks
				const start			= options.start
				const end			= options.end
				const file_size		= options.file_size

				const formdata = new FormData();
				const xhr = new XMLHttpRequest();

				xhr.open('POST', api_url, true);

				const chunk_end = end-1;

				// Content-Range: bytes 0-999999/4582884
				const contentRange = "bytes "+ start +"-"+ chunk_end +"/"+ file_size;
				xhr.setRequestHeader("Content-Range",contentRange);

				// request header
				xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

					formdata.append('key_dir', key_dir);
					formdata.append('file_name', file.name);
					formdata.append('chunked', chunked);
					formdata.append('start', start);
					formdata.append('end', end);
					formdata.append('chunk_index', chunk_index);
					formdata.append('total_chunks', total_chunks);
					formdata.append('file_to_upload', chunk);

				// upload_loadstart (the upload begins)
					xhr.upload.addEventListener("loadstart", upload_loadstart, false);

				// upload_error (the upload ends in error)
					// xhr.upload.addEventListener("error", upload_error, false);
					xhr.upload.addEventListener("error", function(evt) {
						upload_error(evt)
						console.error('evt:', evt);
						console.log('chunk:', chunk);
						// clearInterval(intervalTimer);
						setTimeout(function(){
							send_chunk(options)
						}, 5000)
					}, false);

				// upload_abort (the upload has been aborted by the user)
					xhr.upload.addEventListener("abort", upload_abort, false);

				// progress
					xhr.upload.addEventListener("progress", function(event) {
						 upload_progress({
							event			: event,
							chunk_index		: chunk_index,
							total_chunks	: total_chunks
						 })
					}, false);

				// xhr_load (the XMLHttpRequest ends successfully)
					xhr.addEventListener("load", xhr_load, false);

				xhr.send(formdata);
			}//end send_chunk

		// send the entire file to server
			function send(options) {

				const chunked = false

				const formdata = new FormData();
				const xhr = new XMLHttpRequest();

				xhr.open('POST', api_url, true);

				// request header
				xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

					formdata.append('key_dir', key_dir);
					formdata.append('file_name', file.name);
					formdata.append('chunked', chunked);
					formdata.append('file_to_upload', file);
					formdata.append('tipo', tipo);

				// upload_load file (the upload ends successfully)
					// xhr.upload.addEventListener("load", upload_load, false);

				// upload_loadstart (the upload begins)
					xhr.upload.addEventListener("loadstart", upload_loadstart, false);

				// upload_error (the upload ends in error)
					xhr.upload.addEventListener("error", upload_error, false);

				// upload_abort (the upload has been aborted by the user)
					xhr.upload.addEventListener("abort", upload_abort, false);

				// progress
					xhr.upload.addEventListener("progress", function(event){
						 upload_progress({
							event			: event,
							chunk_index		: 1,
							total_chunks	: 1
						 })
					}, false);

				// xhr_load (the XMLHttpRequest ends successfully)
					xhr.addEventListener("load", xhr_load, false);

				xhr.send(formdata);
			}//end send

		// chunk_file on end, else send next chunk
			if (DEDALO_UPLOAD_SERVICE_CHUNK_FILES > 0) {
				chunk_file(file, key_dir)
			}else{
				send()
			}
	})//end promise
}//end upload



/**
* UPLOAD_FILE
* Upload selected file to server using the API and when is done, process the target file
* calling caller component across process_uploaded_file tool method
* @param object options
* @return object response
*/
service_upload.prototype.upload_file = async function(options) {

	const self = this

	// options
		const file = options.file;

	// short vars
		const allowed_extensions	= self.allowed_extensions
		const key_dir				= self.key_dir
			? self.key_dir
			: self.caller.context.features && self.caller.context.features.key_dir
				? self.caller.context.features.key_dir
				: self.caller.caller.context.features && self.caller.caller.context.features.key_dir
					? self.caller.caller.context.features.key_dir
					: (self.caller.caller.model || null) // like 'image'

	// upload (using service upload)
		const api_response = await upload({
			id					: self.id, // id done by the caller, used to send the events of progress
			file				: file, // object {name:'xxx.jpg',size:5456456}
			key_dir				: key_dir, // string like 'image' used to target dir
			allowed_extensions	: allowed_extensions, // array ['tiff', 'jpeg']
			max_size_bytes		: self.max_size_bytes, // int 352142
			tipo				: self.caller.caller?.tipo || null
		})
		if (!api_response.result) {
			console.error("Error on api_response:", api_response);
			return {
				result	: false,
				msg		: api_response.msg || 'Error on api_response'
			}
		}

	// event upload_file_done_
		event_manager.publish('upload_file_done_' + self.caller.id, {
			file_data		: api_response.file_data,
			process_options	: self.process_options
		})


	return api_response
}//end upload_file



/**
* GET_SYSTEM_INFO
* Call API to obtain useful system info
* @param object options
* @return object response
*/
service_upload.prototype.join_chunked_files = async function(options) {

	// options
		const file_data		= options.file_data
		const files_chunked	= options.files_chunked

	// rqo
		const rqo = {
			dd_api	: 'dd_utils_api',
			action	: 'join_chunked_files_uploaded',
			options	: {
				file_data		: file_data,
				files_chunked	: files_chunked
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 5, // try
				timeout : 10 * 1000 // 10 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_system_info API response:",'DEBUG',response);
				}
				resolve(response)
			})
		})
}//end get_system_info



// @license-end
