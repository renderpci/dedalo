// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



/**
* TOOL_UPLOAD
* Upload-tool controller — orchestrates file uploads from the browser into a
* Dédalo component or tool caller.
*
* Responsibilities:
*  - Instantiates and owns a `service_upload` child that renders the file-picker
*    / drag-and-drop UI and fires the `upload_file_done_<id>` event when a file
*    has been staged to the server's temporary directory.
*  - On receipt of that event delegates to `upload_done` (in render_tool_upload)
*    to show the processing spinner and call `process_uploaded_file_controller`.
*  - `process_uploaded_file_controller` builds the RQO and dispatches it via the
*    exported free function `process_uploaded_file` to the `dd_tools_api` endpoint
*    (`action: 'tool_request'`, server method `process_uploaded_file`).
*  - Supports two caller types (resolved from `caller.context.type`):
*      • 'component' — after processing, a live preview of the updated component
*                       is rendered inside the tool window.
*      • 'tool'      — post-upload processing is handled server-side; no preview.
*
* Prototype chain:
*  - render/destroy/refresh inherited from tool_common / common.
*  - edit/list/mini/upload_done delegated to render_tool_upload.
*
* Main exports:
*  - tool_upload             — constructor (use via get_instance)
*  - process_uploaded_file   — standalone async helper; also used by external
*                               callers that need headless file processing without
*                               a full tool instance.
*/
// import
	import {get_instance} from '../../../core/common/js/instances.js'
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_upload} from './render_tool_upload.js'



/**
* TOOL_UPLOAD
* Constructor.  All properties are null-initialised here; real values are set
* during `init` (via tool_common) and `build`.
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
	this.service_upload = null

	this.max_size_bytes	= null
}//end tool_upload



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_upload.prototype.render		= tool_common.prototype.render
	tool_upload.prototype.destroy		= common.prototype.destroy
	tool_upload.prototype.refresh		= common.prototype.refresh
	// edit/list/mini all render the same upload-button view
	tool_upload.prototype.edit			= render_tool_upload.prototype.edit
	tool_upload.prototype.list			= render_tool_upload.prototype.edit
	tool_upload.prototype.mini			= render_tool_upload.prototype.edit
	// upload_done is the event handler called once service_upload signals completion
	tool_upload.prototype.upload_done	= render_tool_upload.prototype.upload_done



/**
* INIT
* Runs the generic tool_common initialisation and then subscribes to the
* `upload_file_done_<id>` event published by service_upload when a file has
* been fully staged to the server's temporary directory.
*
* The event handler arrow function captures `self` to avoid a `this`-binding
* problem inside the async callback chain.
*
* @param {Object} options - Standard tool init options forwarded to tool_common.
* @returns {Promise<boolean>} Resolves with the result returned by tool_common.init.
*/
tool_upload.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

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
* Runs the generic tool_common build step and then instantiates the
* `service_upload` child component, which provides the drag-and-drop file
* picker UI.
*
* `allowed_extensions` is read from `caller.context.features.allowed_extensions`
* (e.g. `['csv', 'jpg']`) and forwarded to service_upload so it can restrict
* which file types the browser file dialog accepts.
*
* The service_upload instance is added to `ar_instances` so that it is destroyed
* automatically when this tool is destroyed.
*
* @param {boolean} [autoload=false] - Whether to autoload data (forwarded to tool_common.build).
* @returns {Promise<boolean>} Resolves with the result returned by tool_common.build.
*/
tool_upload.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	try {

		// service_upload
			// get instance and init
			self.service_upload = await get_instance({
				model				: 'service_upload',
				mode				: 'edit',
				allowed_extensions	: self.caller.context.features.allowed_extensions, // like ['csv','jpg']
				caller				: self
			})
			// console.log("self.service_upload:",self.service_upload);
			self.ar_instances.push(self.service_upload)

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build_custom



/**
* PROCESS_UPLOADED_FILE_CONTROLLER
* Intermediate controller that assembles the options object for the API call and
* dispatches both the server request and the resulting event.
*
* This method is the link between the upload completion event (fired by
* service_upload via `upload_file_done_<id>`) and the `process_uploaded_file`
* free function that performs the actual API call.
*
* The `caller_type` value (from `caller.context.type`, e.g. 'tool' or
* 'component') is forwarded to the server so PHP can switch post-processing logic
* accordingly.
*
* `quality` and `target_dir` are optional overrides that redirect the server-side
* file placement; quality maps to a media quality directory (e.g. 'original'),
* and target_dir allows tools (like tool_import_dedalo_csv) to specify a
* custom destination folder via a config constant reference.
*
* After the API responds, publishes `process_uploaded_file_done_<id>` so that
* other subscribers (e.g. listening components) can react.
*
* @param {Object} file_data - File descriptor written by service_upload.
*   Example shape:
*   {
*     error     : 0,
*     extension : "tiff",
*     name      : "proclamacio.tiff",
*     size      : 184922784,
*     tmp_name  : "/hd/media/upload/service_upload/tmp/image/phpPJQvCp",
*     type      : "image/tiff"
*   }
* @param {Object} process_options - Extra processing flags forwarded to the server.
*   Example shape:
*   {
*     ocr      : true,
*     ocr_lang : 'lg-spa'
*   }
* @returns {Promise<Object>} Resolves with the raw API response object
*   (`{ result: bool, msg: string, errors?: string[] }`).
*/
tool_upload.prototype.process_uploaded_file_controller = async function(file_data, process_options) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'process_uploaded_file')

	// process_file_options
		const process_file_options = {
			file_data		: file_data,
			process_options : process_options,
			caller			: self,
			tipo			: self.caller.tipo,
			section_tipo	: self.caller.section_tipo,
			section_id		: self.caller.section_id,
			caller_type		: self.caller.context.type, // like 'tool' or 'component'. Switch different process actions on tool_upload class
			quality			: self.caller.context.target_quality || self.caller.context.features.default_target_quality || null, // only for components
			target_dir		: self.caller.context.target_dir || null // optional object like {type: 'dedalo_config', value: 'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH' // defined in config}
		}


	// call to the API, fetch data and get response
		const api_response = await process_uploaded_file( process_file_options )

	// events
		event_manager.publish('process_uploaded_file_done_' + self.id, api_response)


	return api_response
}//end process_uploaded_file_controller




/**
* PROCESS_UPLOADED_FILE
* Standalone async function that builds a `dd_tools_api` RQO and sends it to the
* server to move a staged temporary file to its definitive location and run any
* component-specific post-processing (EXIF extraction, AV probing, OCR, etc.).
*
* This function is exported so that external callers (e.g. other tools that
* orchestrate uploads without a full tool_upload instance) can trigger server-side
* processing directly.
*
* The server timeout is deliberately set to 3600 seconds to accommodate very large
* files and slow OCR / AV transcoding pipelines.
*
* (!) Guard: if `caller.model` is not 'tool_upload' the function logs an error and
* returns `false` immediately.  This prevents misuse when the function is called
* standalone without a properly constructed tool_upload instance as caller.
*
* (!) `SHOW_DEVELOPER` is referenced at line 247 but is NOT declared in the
* `/*global*\/` header at the top of this file.  This will trigger an
* `eslint no-undef` error.  Do not fix the code here — the global is available at
* runtime via page_globals but the linter directive should be updated to include
* `SHOW_DEVELOPER`.
*
* @param {Object} options - Full options object.
*   {
*     file_data : {
*       error     : {number}  0 on success, non-zero on PHP-side upload error
*       extension : {string}  lowercase file extension, e.g. "tiff"
*       name      : {string}  original filename
*       size      : {number}  byte size
*       tmp_name  : {string}  absolute server path of the staged temp file
*       type      : {string}  MIME type, e.g. "image/tiff"
*     },
*     process_options : {
*       ocr      : {boolean}  [optional] trigger OCR after upload
*       ocr_lang : {string}   [optional] language tag, e.g. "lg-spa"
*     },
*     caller       : {Object}  tool_upload instance — must have model==='tool_upload'
*     tipo         : {string}  component tipo, e.g. "rsc29"
*     section_tipo : {string}  section tipo, e.g. "rsc170"
*     section_id   : {string}  section record id, e.g. "1"
*     caller_type  : {string}  'tool' or 'component'; controls server-side processing branch
*     quality      : {string|null}  target quality directory (e.g. 'original'); null for default
*     target_dir   : {Object|null}  custom destination dir spec (e.g.
*                    {type:'dedalo_config', value:'DEDALO_TOOL_IMPORT_DEDALO_CSV_FOLDER_PATH'})
*   }
* @returns {Promise<Object|boolean>} Resolves with the API response object
*   (`{ result: bool, msg: string, errors?: string[], debug?: Object }`)
*   or `false` when the guard check fails.
*/
export const process_uploaded_file = async function( options ) {

	const file_data			= options.file_data
	const process_options	= options.process_options
	const caller			= options.caller
	const tipo				= options.tipo
	const section_tipo		= options.section_tipo
	const section_id		= options.section_id
	const caller_type		= options.caller_type // like 'tool' or 'component'. Switch different process actions on tool_upload class
	const quality			= options.quality || null // only for components
	const target_dir		= options.target_dir || null

	if(caller.model !=='tool_upload'){
		console.error("Error caller is not a tool upload:", caller);
		return false
	}
	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(caller, 'process_uploaded_file')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				file_data		: file_data,
				process_options : process_options,
				tipo			: tipo,
				section_tipo	: section_tipo,
				section_id		: section_id,
				caller_type		: caller_type, // like 'tool' or 'component'. Switch different process actions on tool_upload class
				quality			: quality,
				target_dir		: target_dir
			}
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo,
			retries : 1, // one try only
			timeout : 3600 * 1000 // 3600 secs waiting response
		})

	// debug
		if(SHOW_DEVELOPER===true) {
			dd_console("-> process_uploaded_file API api_response:",'DEBUG', api_response);
		}


	return api_response
}//end process_uploaded_file




// @license-end
