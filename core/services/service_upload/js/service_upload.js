// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/



/**
* SERVICE_UPLOAD
* Generic multi-part file upload service for the Dédalo v7 platform.
*
* Responsibilities:
* - Negotiates PHP upload limits with the server via `dd_utils_api::get_system_info`.
* - Validates file extension and size client-side before any network traffic.
* - Splits large files into configurable-size chunks (DEDALO_UPLOAD_SERVICE_CHUNK_FILES MB)
*   and pipelines up to DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT simultaneous XHR connections.
* - Retries failed chunks up to 3 times with a 5-second back-off.
* - Joins chunks server-side via `dd_utils_api::join_chunked_files_uploaded` when all
*   parts have arrived.
* - Publishes `upload_file_status_<id>` and `upload_file_done_<id>` events so callers
*   (render_edit_service_upload, tool_import, component_av, …) can update their UI without
*   tight coupling to this class.
* - Attaches SEC-008 CSRF tokens to every XHR request both as a header
*   (X-Dedalo-Csrf-Token) and as a form-field fallback for proxy environments.
*
* Consumers instantiate `service_upload`, call `init(options)` → `build()` → `render()`,
* then let the rendered UI call `upload_file()` automatically on file-selection or drop.
* The standalone `upload()` export may also be called directly by tools that manage
* their own file-picking UI (e.g. tool_import_dedalo_csv).
*
* Main exports:
* - `service_upload` constructor / prototype — the primary instantiable service class.
* - `upload` — the low-level, standalone upload function (chunked or single-shot).
*/

// import
	import { event_manager } from '../../../common/js/event_manager.js'
	import { data_manager } from '../../../common/js/data_manager.js'
	import { dd_console,JSON_parse_safely } from '../../../common/js/utils/index.js'
	import { common, create_source } from '../../../common/js/common.js'
	import { render_edit_service_upload } from './render_edit_service_upload.js'



/**
* SERVICE_UPLOAD
* Constructor for the file-upload service instance.
*
* All properties are initialised to null here; they are populated by
* `init()` (from common + upload-specific options) and `build()` (from the
* server's system-info response).
*
* Key properties set after `init()`:
* - `id`                  {string}  — unique instance id used as event-name suffix.
* - `caller`              {Object}  — the component or tool that owns this service;
*                                     MANDATORY — init() logs an error if absent.
* - `allowed_extensions`  {Array}   — lowercase extension whitelist, e.g. ['jpg','tiff'].
* - `key_dir`             {string|null} — server-side directory key that routes the
*                                     uploaded file to the correct storage path.
* - `max_concurrent`      {number}  — cap on simultaneous XHR chunk connections
*                                     (default 50, overridden by DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT).
* - `progress_info`       {HTMLElement} — set by render_edit_service_upload; receives text updates.
* - `progress_line`       {HTMLElement} — <progress> element; receives numeric % updates.
* - `response_msg`        {HTMLElement} — receives final success/error text.
*
* Additional properties set after `build()` (values sourced from PHP ini / config):
* - `max_size_bytes`      {number}  — PHP upload_max_filesize expressed in bytes.
* - `sys_get_temp_dir`    {string}  — server system temp directory.
* - `upload_tmp_dir`      {string}  — PHP upload_tmp_dir ini value.
* - `upload_tmp_perms`    {number}  — octal permissions of upload_tmp_dir.
* - `session_cache_expire`{number}  — PHP session.cache_expire in minutes.
* - `upload_service_chunk_files` {number|boolean} — chunk size in MB, or false = disabled.
* - `pdf_ocr_engine`      {boolean} — whether a server-side OCR engine is configured.
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

	this.max_concurrent 	= null
}//end page



/**
* COMMON FUNCTIONS
* Extend instance with shared prototype methods from common / render modules.
*/
// prototypes assign
	service_upload.prototype.render		= common.prototype.render
	service_upload.prototype.destroy	= common.prototype.destroy
	service_upload.prototype.refresh	= common.prototype.refresh
	service_upload.prototype.edit		= render_edit_service_upload.prototype.edit



/**
* INIT
* Initialises the service_upload instance.
*
* Delegates generic Dédalo instance setup to `common.prototype.init`, then applies
* upload-specific configuration.  Also subscribes to `upload_file_status_<id>` events
* so that any change in upload progress updates the progress bar and response message
* elements that are attached to `self` by `render_edit_service_upload`.
*
* The `upload_file_status` handler distinguishes three states via `options.value`:
*   - `false`  → error/abort: writes `options.msg` into `response_msg`.
*   - `100`    → complete: writes "Upload done." into `response_msg`.
*   - 0–99     → in-progress: updates `progress_line.value` and `progress_info.innerHTML`.
*
* (!) `options.caller` is mandatory.  Without a caller the service cannot resolve
* `key_dir` during `upload_file()` and the upload will be misconfigured.
*
* @param {Object} options - Initialisation options forwarded from the owning caller.
*   @param {string}  [options.model='service_upload'] - Model name used for URL/icon resolution.
*   @param {Array}   [options.allowed_extensions=[]]  - Lowercase file extensions whitelist.
*   @param {string|null} [options.key_dir=null]       - Server directory routing key.
* @returns {Promise<boolean>} Result of common.prototype.init (true on success).
*/
service_upload.prototype.init = async function(options) {

	const self = this

	// call the generic common init
		const common_init = await common.prototype.init.call(this, options);

	// fix
		self.model				= options.model || 'service_upload'
		self.allowed_extensions	= options.allowed_extensions || []
		self.key_dir			= options.key_dir || null
		// Read the global constant injected by dd_core_api; fall back to 50
		// if the constant was not yet defined when this module loaded.
		self.max_concurrent 	= typeof DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT === 'undefined'
			? 50
			: DEDALO_UPLOAD_SERVICE_MAX_CONCURRENT

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
* Fetches PHP server configuration needed by the upload UI and stores it on the instance.
*
* Called once after `init()`.  Issues a single API call (`dd_utils_api::get_system_info`)
* to retrieve upload limits and environment details that are only known server-side
* (PHP ini values, temp-dir paths, OCR engine availability, chunk-file setting).
*
* After `build()` returns, `self.max_size_bytes` is safe to use in extension/size
* validation, and `self.upload_service_chunk_files` controls whether chunked transfer
* is activated during `upload_file()`.
*
* @param {boolean} [autoload=false] - Unused; present for interface parity with common.build.
* @returns {Promise<boolean>} Always resolves to `true` once server info is stored.
*/
service_upload.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

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

	// status update
		self.status = 'built'


	return true
}//end build_custom



/**
* GET_SYSTEM_INFO
* Queries the server for PHP environment values that are not available on the client.
*
* The returned object shape mirrors `dd_utils_api::get_system_info()`:
* ```json
* {
*   "max_size_bytes":           <number>,
*   "sys_get_temp_dir":         <string>,
*   "upload_tmp_dir":           <string>,
*   "upload_tmp_perms":         <number>,
*   "session_cache_expire":     <number>,  // minutes
*   "upload_service_chunk_files": <number|false>,
*   "pdf_ocr_engine":           <boolean>
* }
* ```
* Called internally by `build()`.  Not exported.
*
* @returns {Promise<Object>} Resolved system-info object from the API response's `result` field.
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
* Low-level file upload driver.  Validates the file, then either sends it as a
* single XHR POST or splits it into chunks depending on DEDALO_UPLOAD_SERVICE_CHUNK_FILES.
*
* Chunked mode:
*   Files are sliced into `chunk_size`-byte blobs.  Each blob is enqueued via
*   `add_to_queue` / `process_queue`, which maintains a sliding window of
*   `max_concurrent` concurrent XHR connections.  Failed chunks are retried up to
*   `max_retry` (3) times with a 5-second delay.  Once ALL chunks are confirmed
*   uploaded (`count_uploaded.length === total_chunks`), the chunks are joined
*   server-side via `join_chunked_files`.
*
* Single-shot mode (DEDALO_UPLOAD_SERVICE_CHUNK_FILES falsy):
*   A single XHR POST carries the entire file.  Progress events still fire so the
*   UI behaves identically to chunked mode.
*
* Events published on `upload_file_status_<id>`:
*   - `{ value: 0,    msg: 'Loading file <name>' }`   — upload started
*   - `{ value: N,    msg: 'Upload progress: N %' }`  — 0 < N < 100
*   - `{ value: 100,  msg: 'Loaded file <name>' }`    — upload complete
*   - `{ value: false, msg: '<error text>' }`          — error or abort
*
* The per-request Content-Range header follows RFC 7233:
*   `bytes <start>-<end-1>/<total>` (end is exclusive in the slice call, inclusive in the header).
*
* SEC-008: Every XHR carries `window.page_globals.csrf_token` both as the
*   `X-Dedalo-Csrf-Token` request header and as a `csrf_token` form field so that
*   the server can validate the token even when a reverse proxy strips custom headers.
*
* (!) `alert()` is used for extension/size validation errors — this is existing
*   behaviour; do not replace with console.warn without verifying the UX contract
*   with callers.
*
* @param {Object} options - Upload configuration.
*   @param {Object}  options.self               - The service_upload instance (used for context only;
*                                                 events are keyed on `id`, not `self`).
*   @param {string}  options.id                 - Unique identifier appended to event names.
*   @param {File}    options.file               - The browser File object to upload.
*   @param {string}  options.key_dir            - Server-side directory routing key.
*   @param {Array}   options.allowed_extensions  - Lowercase file-extension whitelist.
*   @param {number}  options.max_size_bytes      - Maximum allowed file size in bytes.
*   @param {string|null} options.tipo            - Ontology tipo of the owning component, if any.
*   @param {number|false} options.max_concurrent - Max simultaneous XHR connections; falsy = unlimited.
* @returns {Promise<Object>} API response object.  On success: `{ result: true, file_data: {...} }`.
*   On extension/size failure resolves immediately with `{ result: false }`.
*/
export const upload = async function(options) {

	// options
		const self 					= options.self
		const id					= options.id // id done by the caller, used to send the events of progress
		const file					= options.file // object {name:'xxx.jpg',size:5456456}
		const key_dir				= options.key_dir // object {type: 'dedalo_config', value: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH'}
		const allowed_extensions	= options.allowed_extensions // array ['tiff', 'jpeg']
		const max_size_bytes		= options.max_size_bytes // int 352142
		const tipo					= options.tipo // self.caller.caller.tipo, like service_upload.tool_upload.component_image.tipo
		const max_concurrent 		= options.max_concurrent

	return new Promise( async function(resolve){

		// short vars
			const api_url	= DEDALO_API_URL
			const response	= {
				result : false
			}

			const queue				= [];
			let active_count		= 0;
			let total_chunks		= 0;
			let file_size 			= 0;

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
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: `${get_label.error_on_upload_file} ${file.name}`
				})
			}//end upload_error

		// upload_abort
			const upload_abort = function() {
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: `User aborts upload`
				})
			}//end upload_abort

		// upload_try
			// when a network error happens, the upload try to resume, if the resume success, the error message will change to show the current state.
			const upload_try = function() {
				event_manager.publish('upload_file_status_'+id, {
					value	: false,
					msg		: 'Trying to upload file ' + file.name
				})
			}//end upload_try

		// upload_progress
			// Update the upload state and progress bar
			const loaded = []
			let last_percent = -1
			const upload_progress = function(options) {

				const event			= options.event
				const chunk_index	= options.chunk_index
				const total_chunks	= options.total_chunks

				const current_chunk_loaded = parseInt(event.loaded/event.total*100);
				loaded[chunk_index] = current_chunk_loaded;
				const sum = loaded.reduce((first, second) => first + second);

				const percent = Math.round(sum/total_chunks);
				// skip publishing if the percentage has not changed to avoid redundant DOM updates
				if(percent === last_percent){
					return
				}
				last_percent = percent

				// info line show numerical percentage of load
			    event_manager.publish('upload_file_status_'+id, {
					value	: percent,
					msg		: `Upload progress: ${percent} %`
				})
				if(percent === 100){
					upload_load()
				}
			}//end upload_progress

		// on_xhr_load
			// check if the upload was done, and process the result in the server
			// if the process use a chunk files, join the chunks previously.
			const files_chunked		= []
			const count_uploaded	= []
			const on_xhr_load = function(evt) {

				// debug
					if(SHOW_DEBUG===true) {
						console.log('on_xhr_load evt:', evt);
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
			}//end on_xhr_load

		// process_queue
			// Fire a maximum of request define in the config.php
			// If the max_concurrent is achieve stop to open new connections.
			const process_queue = async function(){
				// stop if the max_councurrent is achieve
				if ( (max_concurrent && active_count >= max_concurrent) || queue.length === 0) {
					return;
				}
				// get the next queue chunk to open the connection
				active_count++;
				const { chunk, chunk_index, start, end, resolve, reject } = queue.shift();

				try {
					// open de connection and send the current chunk
					const result = await send_chunk({
						chunk		: chunk,
						chunk_index	: chunk_index,
						start		: start,
						end			: end
					});
					resolve(result);
				} catch (error) {
					reject(error);
				} finally {
					active_count--;
					process_queue();
				}
			}

		// add_to_queue
			const add_to_queue = async function( options ){
				const { chunk, chunk_index, start, end } = options
				return new Promise((resolve, reject) => {
					queue.push({ chunk, chunk_index, start, end, resolve, reject });
					process_queue();
				});
			}

		// chunk_file
			const chunk_file = async function (file) {

				file_size			= file.size;
				// break into xMB chunks
				const size			= DEDALO_UPLOAD_SERVICE_CHUNK_FILES || 80; // maximum size for chunks
				const chunk_size	= size*1024*1024;
				let start			= 0;
				total_chunks		= Math.ceil(file_size / chunk_size);
				// store all promises for every chunk
				const upload_promises = [];
				for (let i = 0; i < total_chunks; i++) {

					const check_end = start + chunk_size
					const end = (file_size - check_end < 0)
						? file_size
						: check_end;
					const chunk = slice(file, start, end);

					const current_promise = add_to_queue({
						chunk		: chunk,
						chunk_index	: i,
						start		: start,
						end			: end
					});
					upload_promises.push(current_promise)

					start += chunk_size;
				}
				// fire all promises, (the max_concurrent will limit the connections)
				await Promise.all(upload_promises);

				console.log('All promises done !', upload_promises);
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

				// options
				const chunk			= options.chunk
				const chunk_index	= options.chunk_index
				const start			= options.start
				const end			= options.end
				const retry_number	= options.retry_number || 0

				const chunked 		= true
				const max_retry		= 3

				return new Promise(function(resolve){

					const xhr = new XMLHttpRequest();

					xhr.open('POST', api_url, true);

					// Content-Range: bytes 0-999999/4582884
					const chunk_end = end-1;
					const contentRange = "bytes "+ start +"-"+ chunk_end +"/"+ file_size;
					xhr.setRequestHeader("Content-Range",contentRange);

					// request header
					xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

					// SEC-008: CSRF token. The upload action is not in the
					// server-side CSRF_EXEMPT_ACTIONS allowlist, so every chunk
					// must echo the per-session token. data_manager.request
					// updates `window.page_globals.csrf_token` from each API
					// response; reuse it here.
					if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
						xhr.setRequestHeader("X-Dedalo-Csrf-Token", window.page_globals.csrf_token);
					}

					// FormData
					const formdata = new FormData();
						formdata.append('key_dir', key_dir);
						formdata.append('file_name', file.name);
						formdata.append('chunked', chunked);
						formdata.append('start', start);
						formdata.append('end', end);
						formdata.append('chunk_index', chunk_index);
						formdata.append('total_chunks', total_chunks);
						formdata.append('file_to_upload', chunk);
						// SEC-008: also send the CSRF token as a form field. The
						// server reads it from $rqo->options->csrf_token as a
						// fallback when the X-Dedalo-Csrf-Token header is dropped
						// by an intermediary (proxy / CORS).
						if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
							formdata.append('csrf_token', window.page_globals.csrf_token);
						}

					// upload_error (the upload ends in error)
						xhr.upload.addEventListener("error", function(evt) {
							upload_error(evt)
							console.error('xhr.upload error evt:', evt);
							console.log('xhr.upload error chunk:', chunk);

							if (retry_number <= max_retry) {

								const next_retry = retry_number + 1
								console.log(`Retry attempt ${next_retry}/${max_retry}`);

								const result_retry = new Promise(function(resolve, reject){
									setTimeout( function(){
										// Clean up current XHR to prevent memory leaks
										xhr.onreadystatechange = null;
										xhr.upload.onerror = null;
										xhr.abort();
										upload_try()

										 // Retry with updated options
										const updated_options = {
											...options,
											retry_number: next_retry
										};

										// fire the upload
										send_chunk(updated_options)
											.then(resolve)
											.catch(reject);

									}, 5000)
								})
								resolve( result_retry )
							}else {
								// Max retries exceeded - reject with meaningful error
								const error = new Error(`Upload failed after ${max_retry} retries`);
								error.chunk = chunk;
								error.event = evt;
								reject(error);
							}
						}, false);

					// upload_abort (the upload has been aborted by the user)
						const abort_handler = (e) => {
							console.error('xhr.upload abort');
							upload_abort(e)
							reject(e)
						}
						xhr.upload.addEventListener("abort", abort_handler, false);

					// progress
						xhr.upload.addEventListener("progress", function(event) {
							 upload_progress({
								event			: event,
								chunk_index		: chunk_index,
								total_chunks	: total_chunks
							 })
						}, false);

					// on_xhr_load (the XMLHttpRequest ends successfully)
						const load_handler = (e) => {
							console.log('xhr.upload loaded chunk: ', chunk_index);
							on_xhr_load(e)
							resolve(e)
						}
						xhr.addEventListener("load", load_handler, false);

					xhr.send(formdata);
				})
			}//end send_chunk


		// send the entire file to server
			function send(options) {

				const chunked = false

				const xhr = new XMLHttpRequest();

				xhr.open('POST', api_url, true);

				// request header
				xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));

				// SEC-008: CSRF token (see send_chunk for rationale).
				if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
					xhr.setRequestHeader("X-Dedalo-Csrf-Token", window.page_globals.csrf_token);
				}

				const formdata = new FormData();
					formdata.append('key_dir', key_dir);
					formdata.append('file_name', file.name);
					formdata.append('chunked', chunked);
					formdata.append('file_to_upload', file);
					formdata.append('tipo', tipo);
					// SEC-008: CSRF token form-field fallback (see send_chunk).
					if (typeof window !== 'undefined' && window.page_globals && window.page_globals.csrf_token) {
						formdata.append('csrf_token', window.page_globals.csrf_token);
					}

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

				// on_xhr_load (the XMLHttpRequest ends successfully)
					xhr.addEventListener("load", on_xhr_load, false);

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
* High-level upload entry-point called by the service's own render layer
* (`file_selected` in render_edit_service_upload.js) or by tool callers that
* have already obtained a File object.
*
* Resolves the server-side `key_dir` routing key using a three-level fallback
* cascade (in order of precedence):
*   1. `self.key_dir` — explicitly set during `init()`.
*   2. `self.caller.context.features.key_dir` — owning component's feature config.
*   3. `self.caller.caller.context.features.key_dir` — grandparent component's feature config.
*   4. `self.caller.caller.model` — grandparent model name used as a directory key (e.g. 'image').
*
* After a successful upload, publishes `upload_file_done_<caller.id>` with:
*   `{ file_data: <Object>, process_options: <Object> }`
* so that the owning component can trigger server-side post-processing
* (e.g. component_av media pipeline, tool_import_dedalo_csv row processing).
*
* On upload failure returns `{ result: false, msg: <string> }` without publishing
* the done event, so callers can surface the error independently.
*
* @param {Object} options - Upload options.
*   @param {File} options.file - The browser File object selected or dropped by the user.
* @returns {Promise<Object>} API response from the underlying `upload()` call.
*   Shape: `{ result: boolean, file_data?: Object, msg?: string }`.
*/
service_upload.prototype.upload_file = async function(options) {

	const self = this

	// options
		const file = options.file;

	// short vars
		const allowed_extensions	= self.allowed_extensions
		// Resolve the server-side directory routing key via a waterfall:
		// self.key_dir → caller features → caller.caller features → caller.caller model name.
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
			tipo				: self.caller?.caller?.tipo || null,
			max_concurrent 		: self.max_concurrent // int | false, limit the open connections with the server
		})
		if (!api_response.result) {
			console.error("Error on api_response:", api_response);
			return {
				result	: false,
				msg		: api_response.msg || 'Error on api_response'
			}
		}

	// event upload_file_done_
		event_manager.publish('upload_file_done_' + self.caller?.id, {
			file_data		: api_response.file_data,
			process_options	: self.process_options
		})


	return api_response
}//end upload_file



/**
* JOIN_CHUNKED_FILES
* Instructs the server to concatenate all uploaded chunk temp-files into a
* single final file after all parts have arrived.
*
* Delegates to `dd_utils_api::join_chunked_files_uploaded` via `data_manager.request`.
* Called internally from `on_xhr_load` (inside `upload()`) once
* `count_uploaded.length === total_chunks`.
*
* The request is configured with up to 5 retries and a 10-second timeout per
* attempt to account for slow disk I/O on large files.
*
* @param {Object} options - Join options.
*   @param {Object} options.file_data     - The `file_data` object from the last
*                                           chunk's API response (carries metadata
*                                           such as `original_name`, `total_chunks`,
*                                           `tmp_dir`).
*   @param {Array}  options.files_chunked - Ordered array of server-side temp-file
*                                           paths, indexed by chunk_index.
* @returns {Promise<Object>} Full API response: `{ result: boolean, file_data?: Object, msg: string }`.
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
