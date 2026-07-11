// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import needed modules
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_media_versions} from './render_tool_media_versions.js' // self tool rendered (called from render common)



/**
* TOOL_MEDIA_VERSIONS (module)
*
* Media-version management tool for Dédalo v7.
*
* This tool renders as an overlay panel (opened from a media component's tool
* button) and gives administrators a grid-based UI to inspect, build, rotate,
* delete, and sync every quality version of a single media record. Quality
* versions are defined per-component-type in the ontology (e.g. 'original',
* 'normal', '404', 'thumb', 'audio' for component_av; 'original', 'medium',
* 'thumb' for component_image, etc.).
*
* Architecture overview
* ─────────────────────
* The constructor is a plain Dédalo prototype-based class.
* Lifecycle methods are mixed-in from tool_common (init, build, render) and
* common (refresh, destroy).  The concrete render method comes from
* render_tool_media_versions.prototype.edit.
*
* Key build-time computed properties (populated in build()):
*   • self.main_element      — the live component instance carrying the media
*                              data; its tipo/section_tipo/section_id are
*                              forwarded to every API call.
*   • self.files_info_db     — files_info array stored in DB (first data entry).
*   • self.files_info_disk   — files_info array returned by the server reading
*                              the actual filesystem (via get_files_info()).
*   • self.files_info_safe   — disk entries whose extension matches the
*                              component's expected extension.
*   • self.files_info_alternative — disk entries with a different extension
*                              (e.g. a .wav alongside a .mp4).
*   • self.files_info_original — disk entries whose quality is 'original'.
*   • self.ar_quality        — quality identifiers array pulled from the
*                              caller's context.features.ar_quality.
*   • self.file_info_normalized_name — the DB files_info entry whose file_name
*                              matches original_normalized_name; used to detect
*                              whether the original was auto-normalised on upload.
*
* Every mutating operation (delete_quality, build_version, conform_headers,
* rotate, sync_files, delete_version) hits the server via dd_tools_api
* tool_request and then calls self.refresh() so the UI reflects the new state.
*
* Registered API actions (see class.tool_media_versions.php::API_ACTIONS):
*   get_files_info, delete_quality, build_version, conform_headers,
*   rotate, sync_files, delete_version.
*
* Exported symbols:
*   tool_media_versions — constructor (prototype methods assigned below).
*/
export const tool_media_versions = function () {

	// Standard Dédalo component / tool properties
	// ─────────────────────────────────────────────

	/** @var {string|null} id - Unique instance identifier assigned by the instance manager. */
	this.id						= null

	/** @var {string|null} model - Component model name (e.g. 'tool_media_versions'). */
	this.model					= null

	/** @var {string|null} mode - Render mode ('edit', 'list', etc.). */
	this.mode					= null

	/** @var {HTMLElement|null} node - Top-level DOM node for this tool instance. */
	this.node					= null

	/** @var {Array|null} ar_instances - Child component instances loaded by build(). */
	this.ar_instances			= null

	/** @var {Array|null} events_tokens - Event subscription tokens; unsubscribed on destroy(). */
	this.events_tokens			= null

	/** @var {string|null} status - Instance lifecycle status ('active', 'destroyed', …). */
	this.status					= null

	/**
	* @var {HTMLElement|null} main_element - The resolved media component instance
	*   (component_av, component_image, component_pdf, …) that this tool operates on.
	*   Set during build() from ddo_map role='main_element'.
	*/
	this.main_element			= null

	/** @var {string|null} type - Tool type identifier. */
	this.type					= null

	/** @var {string|null} source_lang - Active source language code. */
	this.source_lang			= null

	/** @var {string|null} target_lang - Active target language code. */
	this.target_lang			= null

	/** @var {Array|null} langs - Available language codes. */
	this.langs					= null

	/** @var {Object|null} caller - The component or context that launched this tool. */
	this.caller					= null

	/**
	* @var {number|null} timer - setTimeout handle used by the async build_version
	*   polling loop (component_av only). Cleared in destroy() to avoid stale callbacks.
	*/
	this.timer					= null

	/**
	* @var {string|null} main_element_quality - When set before a refresh(), forces
	*   main_element to render in this specific quality (e.g. after a build_version
	*   completes). Reset to null after each use by the render layer.
	*/
	this.main_element_quality	= null

	/**
	* @var {Object} regenerate_options - Options forwarded to sync_files() on the
	*   server.  Currently the only flag is:
	*   • delete_normalized_files {boolean} — when true, the server deletes all
	*     derived/normalised files before regenerating them (destructive full rebuild).
	*   The checkbox in the sync UI toggles this flag directly.
	*/
	this.regenerate_options		= {
		delete_normalized_files : false
	}

	// Media-state properties — populated during build()
	// ──────────────────────────────────────────────────

	/**
	* @var {Array|undefined} files_info_db - The files_info array taken from the
	*   component's first data entry as stored in the DB.  Shape: array of objects
	*   with at minimum {quality, file_name, file_size, …}.
	*   Deliberately left undefined (not null) before build() so callers can
	*   distinguish "not yet loaded" from "loaded but empty".
	*/
	this.files_info_db

	/**
	* @var {Array|undefined} files_info_disk - The files_info array returned by the
	*   server after reading the actual filesystem.  See get_files_info() for the
	*   full per-entry shape.
	*/
	this.files_info_disk

	/**
	* @var {string|undefined} original_file_name - Raw filename of the originally
	*   uploaded file (before any normalisation), e.g. 'My Interview.mp4'.
	*/
	this.original_file_name

	/**
	* @var {string|undefined} original_normalized_name - Filename produced by the
	*   Dédalo upload normalisation step, e.g. 'rsc35_rsc167_238.mp4'.
	*   Used to locate the corresponding entry in files_info_db.
	*/
	this.original_normalized_name


	return true
}//end tool_media_versions



/**
* COMMON FUNCTIONS
* Prototype methods mixed in from shared base classes.
*
* Concrete implementations for:
*   render  — delegates to tool_common base render (renders via self.edit()).
*   refresh — delegates to common base refresh (re-builds and re-renders in place).
*   edit    — the actual DOM-building render function (from render_tool_media_versions).
*/
// prototypes assign
	tool_media_versions.prototype.render	= tool_common.prototype.render
	tool_media_versions.prototype.refresh	= common.prototype.refresh
	tool_media_versions.prototype.edit		= render_tool_media_versions.prototype.edit



/**
* INIT
* Custom tool init — seeds instance properties and sets up caller context.
* Delegates to tool_common.prototype.init for the shared setup steps
* (options parsing, events_tokens initialisation, caller reconstruction
* when running in a detached window, etc.).
* @param {Object} options - Initialisation options forwarded from the tool launcher.
* @returns {Promise<boolean>} Resolves to the result of the common init.
*/
tool_media_versions.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD
* Custom tool build — resolves the main_element instance and computes all
* derived file-info properties used by the render layer.
*
* Execution order:
*   1. Calls tool_common.prototype.build() to load CSS, instantiate ddo_map
*      components, and fetch tool context from the API (dd1353/dd1324).
*   2. Locates the 'main_element' ddo entry in tool_config.ddo_map and
*      resolves it to a live component instance from ar_instances.
*   3. Applies any forced quality override (self.main_element_quality) to the
*      component context before rendering.
*   4. Reads file metadata from the component's data and the filesystem.
*
* After a successful build the following properties are set on self:
*   files_info_db, files_info_disk, original_file_name,
*   original_normalized_name, ar_quality, files_info_safe,
*   files_info_alternative, files_info_original, file_info_normalized_name.
*
* Errors in steps 2-4 are caught and stored in self.error; common_build is
* still returned so the tool can render an error state rather than crashing.
*
* @param {boolean} [autoload=false] - Passed through to tool_common.build();
*   when true the tool data are fetched on first render without an extra call.
* @returns {Promise<boolean>} Resolves to the result of the common build.
*/
tool_media_versions.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// files_info defaults. Guarantee always valid arrays so render never crashes
	// even if the data load below fails or returns early (rock-solid against
	// undefined files_info — the early returns and try/catch below can otherwise
	// leave these unset).
		self.files_info_db			= []
		self.files_info_disk		= []
		self.files_info_safe		= []
		self.files_info_alternative	= []
		self.files_info_original	= []

	try {

		// specific actions.. like fix main_element for convenience
			const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')
			if (!main_element_ddo) {
				console.warn('main_element_ddo not found in tool_config.ddo_map', self.tool_config.ddo_map)
				return common_build
			}

			self.main_element = self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)
			if (!self.main_element) {
				console.warn('main_element not found in ar_instances', self.ar_instances)
				return common_build
			}


			// self.main_element_quality.
			// (!) It's used to force a specific quality for main_element before render the component
				if (self.main_element_quality) {
					self.main_element.context.features.quality = self.main_element_quality
				}

		// main_element. fix important vars about
			const data	= self.main_element.data || {}
			const entries	= data.entries || []

			// files info from DB data
				self.files_info_db = entries[0]?.files_info || []

			// files info real (read from disk)
				self.files_info_disk = await self.get_files_info() || []

			// original_file_name
				self.original_file_name = entries[0]?.original_file_name

			// original_normalized_name
				self.original_normalized_name = entries[0]?.original_normalized_name

			// ar_quality
				self.ar_quality	= self.caller?.context?.features?.ar_quality

			// files_info_safe. filtered by allowed extension
				const main_extension = self.main_element.context?.features?.extension
				self.files_info_safe = self.files_info_disk && main_extension
					? self.files_info_disk.filter(el => el.extension===main_extension)
					: []

			// files_info_alternative. filtered by alternative extension
				// Entries whose extension differs from the primary one, e.g. a .wav
				// audio track alongside the main .mp4 video file.
				self.files_info_alternative = self.files_info_disk && main_extension
					? self.files_info_disk.filter(el => el.extension!==main_extension)
					: []

			// files_info_original
				// All disk entries whose quality is exactly 'original' (the source file
				// before any transcoding). Used by render_file_delete to allow deletion
				// of the original upload without needing it to be in files_info_safe.
				self.files_info_original = self.files_info_disk
					? self.files_info_disk.filter(el => el.quality==='original')
					: []

			// self.file_info_normalized_name
				// Finds the DB record for the normalised filename so the render layer
				// can flag when the stored name differs from the one on disk.
				self.file_info_normalized_name = self.original_normalized_name
					? self.files_info_db?.find(el => el.file_name===self.original_normalized_name)
					: null

	} catch (error) {
		self.error = error
		console.error(error)
	}

	return common_build
}//end build



/**
* DESTROY
* Alias of common.destroy
* @param {boolean} [delete_self=true]
* 	On true, Delete self instance events, paginator, services, inspector, filter and instance
* @param {boolean} [delete_dependencies=false]
* 	On true, Call to destroy all associated instances (ar_instances)
* @param {boolean} [remove_dom=false]
* 	On true, removes the instance DOM node
* @returns {Promise<Object>} Resolve object result
*/
tool_media_versions.prototype.destroy = async function(delete_self=true, delete_dependencies=false, remove_dom=false) {

	const self = this

	// clear timeout
		// (!) Must be cleared before delegating to common.destroy to prevent the
		// build_version polling callback from firing after the instance is gone.
		if (self.timer) {
			clearTimeout(self.timer);
		}

	// call the generic common tool destroy
		const common_destroy = await common.prototype.destroy.call(this, delete_self, delete_dependencies, remove_dom);


	return common_destroy
}//end destroy



/**
* GET_FILES_INFO
* Asks the server to read the filesystem and return a status entry for every
* configured quality version of the media file managed by self.main_element.
*
* Unlike the 'files_info' stored in the component's DB record (which may be
* stale), this call always reflects the actual on-disk state — a file can be
* reported as non-existent even when the DB thinks it is present, which is the
* condition that triggers the "unsync" warning in the render layer.
*
* The result is cached in self.files_info_disk during build() and referenced
* throughout the render layer via self.files_info_safe / files_info_alternative.
*
* Dispatches to: class.tool_media_versions.php::get_files_info()
*
* @returns {Promise<Array>} Resolves with an array of file-info objects.
*   Each entry has the shape:
*   {
*     quality       {string}         - Quality key (e.g. 'original', '404', 'audio').
*     file_exist    {boolean}        - true when the file is present on disk.
*     file_name     {string|null}    - Basename of the file, or null if missing.
*     file_path     {string|null}    - Absolute server path, or null if missing.
*     file_url      {string|null}    - Public URL path, or null if missing.
*     file_size     {number|null}    - File size in bytes, or null if missing.
*     file_time     {Object|null}    - File modification time object, or null if missing.
*     extension     {string|null}    - File extension (e.g. 'mp4', 'jpg').
*   }
*/
tool_media_versions.prototype.get_files_info = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_files_info')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id
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
					dd_console("-> get_files_info API response:",'DEBUG',response);
				}

				// always resolve an array so callers never receive undefined
				const result = Array.isArray(response?.result)
					? response.result // array of objects
					: []

				resolve(result)
			})
		})
}//end get_files_info



/**
* DELETE_QUALITY
* Deletes all files belonging to a given quality version of the media record,
* permanently removing them from disk (the server also updates the component's
* stored files_info).
*
* A browser confirm() dialog is shown before the request is sent.  If the user
* cancels, the method returns false without making any API call.
*
* Dispatches to: class.tool_media_versions.php::delete_quality()
*
* (!) This is a destructive, irreversible operation — the files cannot be
* recovered unless rebuilt from the original via build_version().
*
* @param {string} quality - Quality key to delete (e.g. 'normal', '404').
* @returns {Promise<Array>|false} Resolves with the server result array,
*   or false when the user cancelled the confirm dialog.
*/
tool_media_versions.prototype.delete_quality = async function(quality) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'delete_quality')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> delete_quality API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end delete_quality



/**
* BUILD_VERSION
* Triggers transcoding / re-encoding of the media file for the specified
* quality level.  The server builds the new version from the 'original' file
* using the component's configured encoding parameters for that quality.
*
* Passes async:true so the server kicks off the transcoding job and returns
* immediately (result===true) rather than waiting for completion.  The render
* layer is responsible for polling get_files_info() until the file appears on
* disk (see render_build_version() in render_tool_media_versions.js).
*
* A browser confirm() dialog is shown before the request is sent.  If the user
* cancels, the method returns false without making any API call.
*
* The request uses a 1-hour timeout because transcoding large video files can
* take a very long time on underpowered servers — even in async mode the server
* may queue the job synchronously for some component types.
*
* Dispatches to: class.tool_media_versions.php::build_version()
*
* (!) Requires an 'original' file to exist on disk.  If it does not, the server
* returns result===false with a descriptive msg.
*
* @param {string} quality - Target quality key (e.g. 'normal', '404', 'audio').
* @returns {Promise<Array>|false} Resolves with the server result array,
*   or false when the user cancelled the confirm dialog.
*/
tool_media_versions.prototype.build_version = async function(quality) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'build_version')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality,
				async			: true
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> build_version API response:",'DEBUG',response);
				}

				if (response.result===false && response.msg) {
					alert('Error: ' + response.msg);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end build_version



/**
* CONFORM_HEADERS
* 	Creates a new version from original in given quality rebuilding headers
*
* Re-processes an existing quality file to fix its container / codec header
* (e.g. moves the moov atom to the beginning of an MP4 for pseudo-streaming,
* or repairs a malformed WebM index).  Only relevant for component_av; the
* register.json specific_actions map restricts this action to that model.
*
* A browser confirm() dialog is shown before the request is sent.  If the user
* cancels, the method returns false without making any API call.
*
* Uses a 1-hour timeout because large video files can take a long time to
* re-mux even without re-encoding.
*
* Dispatches to: class.tool_media_versions.php::conform_headers()
*
* @param {string} quality - Quality key whose headers should be re-written.
* @returns {Promise<Array>|false} Resolves with the server result array,
*   or false when the user cancelled the confirm dialog.
*/
tool_media_versions.prototype.conform_headers = async function(quality) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'conform_headers')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> conform_headers API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end conform_headers



/**
* ROTATE
* 	Apply a rotation process to the selected file
*
* Physically re-encodes the image/video file at the given quality with the
* specified degree of rotation applied.  Only relevant for component_image;
* the register.json specific_actions map restricts this action to that model.
*
* (!) This is a DESTRUCTIVE operation: the existing quality file is overwritten
* in place.  There is no automatic backup; ensure the original quality is still
* intact before rotating derived versions.
*
* A browser confirm() dialog is shown before the request is sent.  If the user
* cancels, the method returns false without making any API call.
*
* Dispatches to: class.tool_media_versions.php::rotate()
*
* @param {string} quality - Quality key of the file to rotate.
* @param {string|number} degrees - Rotation angle; typically -90 (left) or 90 (right).
* @returns {Promise<Array>|false} Resolves with the server result array,
*   or false when the user cancelled the confirm dialog.
*/
tool_media_versions.prototype.rotate = async function(quality, degrees) {

	const self = this

	// confirm dialog
		if ( !confirm( (get_label.sure || 'Sure?') ) ) {
			return false
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'rotate')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality,
				degrees			: degrees
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> rotate API response:",'DEBUG',response);
				}

				const result = response.result // array of objects

				resolve(result)
			})
		})
}//end rotate



/**
* SYNC_FILES
* 	Regenerate the component to force sync files between DB and HD
*
* Calls the server's regenerate_component() method for self.main_element.  This
* re-scans the filesystem, re-builds the files_info DB record, and optionally
* rebuilds all derived files (when regenerate_options.delete_normalized_files is
* true).
*
* Use when the DB's files_info array is out of sync with the actual disk state
* (indicated by the "unsync" warning in the render layer comparing
* self.files_info_db and self.files_info_disk).
*
* Unlike delete_quality/build_version, this method does NOT show a confirm()
* dialog — the confirmation is handled in the render layer before calling here.
*
* Uses a 1-hour timeout because a full regeneration with delete_normalized_files
* includes re-encoding all quality versions.
*
* Dispatches to: class.tool_media_versions.php::sync_files()
*
* @returns {Promise<Object>} Resolves with the raw API response object
*   ({result: boolean, msg: string}).
*/
tool_media_versions.prototype.sync_files = async function() {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'sync_files')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo				: self.main_element.tipo,
				section_tipo		: self.main_element.section_tipo,
				section_id			: self.main_element.section_id,
				regenerate_options	: self.regenerate_options
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> sync_files API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end sync_files



/**
* DELETE_VERSION
* 	Delete the selected file version
*
* Deletes a single file identified by the (quality, extension) pair.  This is
* more granular than delete_quality(), which removes ALL files for a quality
* regardless of extension.  For example, a component_av record may have both
* an .mp4 and a .webm at the '404' quality level; delete_version() removes
* only one of them.
*
* The thumb quality is handled as a special case server-side (via
* component::delete_thumb()) because the thumb always has a single canonical
* extension that does not need to be specified separately.
*
* Unlike delete_quality(), this method does NOT show a confirm() dialog —
* the confirmation is handled in the render layer (render_file_versions) before
* calling here.
*
* Uses a 20-second timeout (file deletion is near-instant compared to
* transcoding operations).
*
* Dispatches to: class.tool_media_versions.php::delete_version()
*
* @param {string} quality - Quality key of the file to delete.
* @param {string} extension - File extension to disambiguate when multiple
*   files exist for the same quality (e.g. 'mp4', 'webm').
* @returns {Promise<Object>} Resolves with the raw API response object
*   ({result: boolean, msg: string, errors: Array}).
*/
tool_media_versions.prototype.delete_version = async function(quality, extension) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'delete_version')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				tipo			: self.main_element.tipo,
				section_tipo	: self.main_element.section_tipo,
				section_id		: self.main_element.section_id,
				quality			: quality,
				extension		: extension
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 20 * 1000 // 20 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> delete_version API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end delete_version



// @license-end
