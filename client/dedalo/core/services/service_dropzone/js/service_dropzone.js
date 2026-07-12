// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_API_URL */
/*eslint no-undef: "error"*/
// (!) DEDALO_ROOT_WEB is used at lines ~75 and ~78 but is NOT declared in the /*global*/ list
//     above. ESLint will flag these as undeclared globals. Extend /*global*/ when the
//     codebase-wide audit is performed — do NOT fix here.
// (!) SHOW_DEVELOPER is used at line ~147 inside get_system_info but is NOT declared in the
//     /*global*/ list above. Same note — extend the declaration during the audit.



/**
* SERVICE_DROPZONE
* Service layer that wraps the third-party Dropzone.js library for file uploads.
*
* Responsibilities:
* - Lazily loading the Dropzone CSS/JS bundle from DEDALO_ROOT_WEB/lib/dropzone/ on init.
* - Fetching server-side upload constraints (max size, temp dirs, chunk config) from the
*   dd_utils_api::get_system_info endpoint and caching them as own properties.
* - Providing a stable reset surface (reset_dropzone) so callers can clear the active
*   Dropzone instance between renders without destroying it.
* - Delegating actual DOM rendering to render_edit_service_dropzone (mixed in via the
*   prototype assignment block below).
*
* Typical callers: tool_import and any tool that needs a drag-and-drop upload UI.
* The `caller` property must be set to the host tool/component before build() is called.
*
* Key properties set during init / build (see each method for details):
*   max_size_bytes              {number}        PHP upload_max_filesize in bytes
*   sys_get_temp_dir            {string}        PHP sys_get_temp_dir() path
*   upload_tmp_dir              {string}        Configured user upload temp directory
*   upload_tmp_perms            {string}        Octal permissions string for upload_tmp_dir
*   session_cache_expire        {number}        Session expiry in minutes
*   upload_service_chunk_files  {number|null}   Chunk size in MB, or null if chunking is off
*   allowed_extensions          {Array<string>} Accepted MIME types / extensions
*   key_dir                     {string}        Server-side sub-directory key for uploads
*   component_option            {Array|null}    Optional list of target component ddos
*   file_processor              {Array|null}    Optional per-file processing pipeline list
*   active_dropzone             {Object|null}   Cached Dropzone.js instance
*/

// import
	import {data_manager} from '../../../common/js/data_manager.js'
	import {dd_console, load_style, load_script} from '../../../common/js/utils/index.js'
	import {common} from '../../../common/js/common.js'
	import {render_edit_service_dropzone} from './render_edit_service_dropzone.js'



/**
* SERVICE_DROPZONE
* Constructor for the service_dropzone instance.
* Initialises all instance properties to null; actual values are populated by
* init() (options-driven) and build() (server-driven via get_system_info).
* The caller must assign self.caller to the host tool before calling build().
*/
export const service_dropzone = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.caller				= null

	this.active_dropzone	= null  // Dropzone.js instance; created on first build, re-used on re-render
	this.max_size_bytes		= null  // populated by build() from get_system_info API response
	this.allowed_extensions	= null  // set from options.allowed_extensions in init()
	this.key_dir			= null  // server-side sub-directory key; passed as a Dropzone param on upload
	this.file_processor		= null  // optional pipeline list; drives the per-file processor <select>
}//end service_dropzone



/**
* COMMON FUNCTIONS
* Extend service_dropzone with shared lifecycle methods from common and the
* Dropzone-specific edit renderer from render_edit_service_dropzone.
*/
// prototypes assign
	service_dropzone.prototype.render	= common.prototype.render
	// destroy: tear down the Dropzone instance (it attaches drag/drop listeners to
	// document.body) before delegating to the generic destructor. Without this each
	// new service caller stacks another body-level Dropzone with all its listeners,
	// leaking globally and causing dropped files to fire on stale instances.
	service_dropzone.prototype.destroy	= function() {
		const self = this
		if (self.active_dropzone && typeof self.active_dropzone.destroy==='function') {
			try {
				self.active_dropzone.destroy()
			} catch (e) {
				console.warn('service_dropzone destroy: error destroying Dropzone', e)
			}
			self.active_dropzone = null
		}
		return common.prototype.destroy.call(self)
	}
	service_dropzone.prototype.refresh	= common.prototype.refresh
	service_dropzone.prototype.edit		= render_edit_service_dropzone.prototype.edit



/**
* INIT
* Initialises this service_dropzone instance from the caller-supplied options and
* lazily loads the third-party Dropzone.js library (JS + CSS).
*
* The Dropzone bundle is loaded in parallel via Promise.all so that build() can
* safely reference the global `Dropzone` constructor without race conditions.
*
* (!) DEDALO_ROOT_WEB is referenced here but is NOT declared in the global
*     header of this file — ESLint will report a no-undef violation.
*
* @param {Object} options                         - Caller-supplied configuration.
* @param {Array<string>} [options.allowed_extensions=[]] - Accepted MIME types or
*   file extensions forwarded to the Dropzone `acceptedFiles` option.
* @param {string} options.key_dir                 - Server-side sub-directory key
*   used by the API to route uploaded files to the correct location.
* @param {Array|null} [options.component_option]  - Optional list of target
*   component ddos offered to the user as a destination <select>.
* @param {Array|null} [options.file_processor]    - Optional list of processing
*   pipeline descriptors ({function_name, function_name_label, default}) used to
*   populate the per-file processor <select> in the render layer.
* @returns {Promise<boolean>} Result of common.prototype.init (true on success).
*/
service_dropzone.prototype.init = async function(options) {

	const self = this

	// call the generic common init
		const common_init = await common.prototype.init.call(this, options);

	// fix
		self.allowed_extensions	= options.allowed_extensions || []
		self.key_dir			= options.key_dir
		self.component_option	= options.component_option
		self.file_processor		= options.file_processor

	// load dependence JS/CSS
		// Both assets are fetched in parallel; build() must not run until this
		// resolves because it depends on the global `Dropzone` constructor.
		const load_promises = []

		const lib_js_file = DEDALO_ROOT_WEB + '/lib/dropzone/dist/min/dropzone.min.js'
		load_promises.push( load_script(lib_js_file) )

		const lib_css_file = DEDALO_ROOT_WEB + '/lib/dropzone/dist/min/dropzone.min.css'
		load_promises.push( load_style(lib_css_file) )

		await Promise.all(load_promises).then(async function(response){
			console.log("dropzone load promise:",response);
		})


	return common_init
}//end init



/**
* BUILD
* Fetches server-side upload constraints, caches them as own properties, and
* resets any existing Dropzone instance ready for (re-)rendering.
*
* This must be called after init() and before render(), because the render layer
* (render_edit_service_dropzone) reads the properties populated here (max_size_bytes,
* upload_service_chunk_files, etc.) to build the info panel and configure Dropzone.
*
* (!) End-label below reads 'build_custom' but the method is named 'build' — the
*     label is stale. Leaving as-is per doc-only rule; fix with a code change.
*
* @param {boolean} [autoload=false] - Reserved for future use; currently unused.
* @returns {Promise<boolean>} Always resolves to true once the build is complete.
*/
service_dropzone.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// fetch system info
		// Retrieves PHP runtime constraints from the server so the UI can display
		// accurate limits and the Dropzone can enforce the correct max file size.
		const system_info = await get_system_info(self)
		// set as tool properties
			self.max_size_bytes				= system_info.max_size_bytes
			self.sys_get_temp_dir			= system_info.sys_get_temp_dir
			self.upload_tmp_dir				= system_info.upload_tmp_dir
			self.upload_tmp_perms			= system_info.upload_tmp_perms
			self.session_cache_expire		= system_info.session_cache_expire
			self.upload_service_chunk_files	= system_info.upload_service_chunk_files

	// reset dropzone
		// Clear any files queued in a previous render cycle before the new UI is built.
		self.reset_dropzone()

	// status update
		self.status = 'built'


	return true
}//end build_custom



/**
* GET_SYSTEM_INFO
* Calls the dd_utils_api::get_system_info endpoint and returns the server's PHP
* runtime upload configuration as a plain object.
*
* The result object shape (all values are server-authoritative):
*   {number}      max_size_bytes              — upload_max_filesize in bytes
*   {string}      sys_get_temp_dir            — PHP sys_get_temp_dir() path
*   {string}      upload_tmp_dir              — configured user upload temp dir
*   {string}      upload_tmp_perms            — octal permissions of upload_tmp_dir
*   {number}      session_cache_expire        — session expiry in minutes
*   {number|null} upload_service_chunk_files  — chunk size in MB, or null if off
*
* prevent_lock is set so this non-mutating probe does not block concurrent requests.
*
* (!) SHOW_DEVELOPER is referenced inside the response handler but is NOT declared
*     in the global header — ESLint will flag it as no-undef. Do not fix here.
*
* @returns {Promise<Object>} Resolves with the result sub-object from the API response.
*/
const get_system_info = async function() {

	// rqo
		const rqo = {
			dd_api			: 'dd_utils_api',
			action			: 'get_system_info',
			prevent_lock	: true
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
* RESET_DROPZONE
* Clears all files from the active Dropzone instance without destroying it.
* Preserves the Dropzone configuration so the same instance can be reused on
* subsequent renders (avoids re-initialising Dropzone.js event listeners).
*
* Returns false (a no-op) when no Dropzone instance exists yet — callers should
* treat false as "nothing to reset" rather than as an error condition.
*
* @returns {boolean} true when files were cleared; false when no active Dropzone exists.
*/
service_dropzone.prototype.reset_dropzone = function () {

	const self = this

	if (self.active_dropzone) {
		self.active_dropzone.removeAllFiles();
		return true
	}

	return false
}//end reset_drop_zone



// @license-end
