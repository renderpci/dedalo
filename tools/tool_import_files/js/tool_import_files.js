// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



/**
* TOOL_IMPORT_FILES (module)
* Batch media-file importer tool for Dédalo v7.
*
* Provides a drag-and-drop interface for uploading media files (images, audio-video,
* PDFs) to the server and importing them into section records.  The tool is triggered
* from a component's toolbar button (typically a component_portal) and runs as either
* a modal overlay or a standalone browser window (controlled by `open_as` in the
* ontology properties).
*
* Architecture overview:
*   - `tool_import_files` — the main tool constructor; extends `tool_common` lifecycle
*       (init → build → render → destroy).
*   - Two service sub-instances are created during build:
*       • `service_dropzone`    — handles file drag-and-drop, chunked upload to a
*                                 temporary server directory, and the per-file UI rows.
*       • `service_tmp_section` — renders a temporary "phantom" section whose input
*                                 components let the user fill in metadata fields that
*                                 will be propagated to each imported section record.
*   - The actual server-side work is dispatched via `import_files()`, which calls
*     `tool_import_files::import_files()` (PHP) as a background CLI process, then
*     streams progress back through a Server-Sent Events (SSE) endpoint
*     (`dd_utils_api::get_process_status`).
*
* tool_config.ddo_map roles consumed by this tool (configured in ontology properties):
*   - 'target_component'   — the media component (image / av / pdf) that receives files.
*   - 'target_date'        — optional date component populated from file EXIF metadata.
*   - 'target_filename'    — optional text component for the original filename.
*   - 'input_component'    — form fields shown in the import UI; values propagate to
*                            every new section created by the import.
*   - 'component_option'   — portal/sub-section routing options surfaced in the UI.
*
* Import modes (tool_config.import_mode):
*   - 'default'           — files are added to the section already linked to the caller.
*   - 'section'           — a fresh child section is created for each uploaded file.
*   - 'section_resource'  — files land directly in a resource section (e.g. rsc170).
*
* File-naming strategies (tool_config.import_file_name_mode, resolved in render):
*   - null / default      — each file creates an independent section.
*   - 'enumerate'         — numeric filename prefix encodes the target section_id.
*   - 'named'             — files sharing the same base name reuse one section.
*   - 'match'             — numeric prefix matches an existing section that is updated.
*   - 'match_freename'    — full filename matched against stored names in target section.
*
* Exports:
*   tool_import_files — the tool constructor (prototype-extended below).
*/



// import
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_import_files} from './render_tool_import_files.js'



/**
* TOOL_IMPORT_FILES
* Constructor for the batch media-file import tool.
*
* All instance properties are initialised to null / empty here; they are populated
* by `init()` (tool_common base) and `build()` (overridden below).
*/
export const tool_import_files = function () {

	// --- core lifecycle properties (seeded by tool_common.prototype.init) ---

	/** @var {string|null} id - Unique instance key in the instances registry. */
	this.id						= null

	/** @var {string|null} model - Tool model name: 'tool_import_files'. */
	this.model					= null

	/** @var {string|null} mode - Render mode, always 'edit' for this tool. */
	this.mode					= null

	/** @var {HTMLElement|null} node - Root DOM node after render(). */
	this.node					= null

	/** @var {Array|null} ar_instances - Child component instances (service_dropzone, service_tmp_section). */
	this.ar_instances			= null

	/** @var {string|null} status - Lifecycle status: 'initializing' | 'initialized' | 'building' | 'built'. */
	this.status					= null

	/** @var {Array|null} events_tokens - PubSub subscription tokens; stored for teardown in destroy(). */
	this.events_tokens			= null

	/** @var {string|null} type - Instance classifier; always 'tool' (set in tool_common.init). */
	this.type					= null

	// --- language properties (unused by this tool but required by tool_common interface) ---

	/** @var {string|null} source_lang - Source language for translation (not used by this tool). */
	this.source_lang			= null

	/** @var {string|null} target_lang - Target language for translation (not used by this tool). */
	this.target_lang			= null

	/** @var {Array|null} langs - Available language list (not used by this tool). */
	this.langs					= null

	// --- caller reference ---

	/**
	* @var {Object|null} caller - The component or section instance that triggered this tool.
	*   Used to derive `key_dir` (upload subdirectory) and to refresh the record on close.
	*/
	this.caller					= null

	// --- tool-specific properties ---

	/**
	* @var {string|null} key_dir - Upload subdirectory token, derived in init() as
	*   `caller.tipo + '_' + caller.section_tipo` (e.g. 'oh17_oh1').
	*   The server sanitizes this value via `sanitize_key_dir()` before any filesystem use.
	*/
	this.key_dir				= null

	/**
	* @var {HTMLElement|null} tool_contanier - (!) Typo in identifier: should be 'tool_container'.
	*   Reference to the tool's wrapper container element.  Not used in this file; may be
	*   set by render_tool_import_files or an external caller.
	*/
	this.tool_contanier			= null

	/**
	* @var {Array} files_data - Array of Dropzone file objects currently staged for import.
	*   Each entry is a Dropzone file descriptor extended with tool-specific properties:
	*     - name           {string}      — URL-encoded filename sent to the server.
	*     - file_processor {string|null} — selected processor function name, or null.
	*     - component_option {string}    — tipo of the target portal/component option.
	*     - previewElement {HTMLElement} — Dropzone-managed DOM node for the file row.
	*   Populated by service_dropzone; read by `import_files()` and the import button handler.
	*/
	this.files_data				= []

	// --- service sub-instances ---

	/**
	* @var {Object|null} service_dropzone - Instance of `service_dropzone` (mode: 'edit').
	*   Manages the drag-and-drop zone, chunked file upload to the server's tmp directory,
	*   and the per-file preview rows in the UI.  Created in build().
	*/
	this.service_dropzone		= null

	/**
	* @var {Object|null} service_tmp_section - Instance of `service_tmp_section` (mode: 'edit').
	*   Renders a temporary phantom section that lets the user fill in metadata fields
	*   (input_component entries from ddo_map) to be propagated to every imported record.
	*   Created in build().
	*/
	this.service_tmp_section	= null
}//end tool_import_files



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	tool_import_files.prototype.render	= tool_common.prototype.render
	tool_import_files.prototype.destroy	= common.prototype.destroy
	tool_import_files.prototype.refresh	= common.prototype.refresh
	tool_import_files.prototype.edit	= render_tool_import_files.prototype.edit



/**
* INIT
* Custom tool init.
*
* Delegates to `tool_common.prototype.init` for the shared lifecycle bootstrap
* (caller resolution, tool_config parsing, events_tokens setup), then derives
* `key_dir` — the server-side upload subdirectory token — from the caller's
* tipo and section_tipo.  `key_dir` is also passed to `service_dropzone` in
* `build()` so that uploaded files are isolated per caller component+section.
*
* @param {Object} options - Initialisation options forwarded verbatim to tool_common.init.
*   @see tool_common.prototype.init for the full options contract.
* @returns {Promise<boolean>} Resolves with the value returned by tool_common.init
*   (true on success, false if already initialised or options are invalid).
*/
tool_import_files.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// upload_manager_init
		self.key_dir = self.caller.tipo + '_' + self.caller.section_tipo


	return common_init
}//end init



/**
* BUILD
* Custom tool build.
*
* Overrides the standard tool build to suppress automatic ddo_map instantiation
* (the default `tool_common.prototype.build` would create instances for every entry
* in `tool_config.ddo_map`, but this tool must first create a temporary phantom
* section and therefore controls its own instantiation order).
*
* Steps performed:
*   1. Calls `tool_common.prototype.build` with a no-op `load_ddo_map` override so
*      the base build loads tool CSS and fetches the registered context without
*      touching the ddo_map entries.
*   2. Fetches the context object of the 'target_component' ddo_map entry (the media
*      component that will receive the uploaded files) and stores it as
*      `self.target_component_context`.  The context carries `features.ar_quality` and
*      `features.default_target_quality`, which drive the quality selector in the UI.
*   3. Enriches `tool_config.file_processor` entries with localised labels via
*      `self.get_tool_label(el.function_name)` so the processor selector can display
*      human-readable names.
*   4. Instantiates `service_dropzone` (handles file drag-and-drop and chunked upload).
*   5. Instantiates `service_tmp_section` (renders phantom input components for
*      per-import metadata, using ddo_map entries whose role is 'input_component').
*
* (!) The `load_ddo_map` override returns an empty array intentionally.  ddo_map
* elements are managed through service_dropzone and service_tmp_section instead,
* which avoids duplicate builds and ensures the correct section_id context.
*
* @param {boolean} [autoload=false] - When true, fetches the tool's registered context
*   from the API (component_json dd1353 inside tool-registered section dd1324).
*   Forwarded to `tool_common.prototype.build`.
* @returns {Promise<boolean>} Resolves true on success; the `self.error` property is
*   set and logged if any service fails to instantiate.
*/
tool_import_files.prototype.build = async function(autoload=false) {

	const self = this

	// common_build. call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload, {
			load_ddo_map : () => { return []} // prevents to auto load ddo_map
		});

	try {

		// load_target_component
		const load_target_component_context = async function() {

			// ddo_map load all role 'input_component' elements inside ddo_map
			// Locate the single 'target_component' entry to fetch its server context,
			// which contains media features (ar_quality, default_target_quality).
			const target_component = self.tool_config.ddo_map.find(el => el.role==='target_component')
			const element_context_response = await data_manager.get_element_context({
				tipo			: target_component.tipo,
				section_tipo	: target_component.section_tipo
			})

			return element_context_response.result[0] || null
		}//end load_target_component_context
		self.target_component_context = await load_target_component_context()

		// Service DropZone
			if(self.tool_config.file_processor){
				// Enrich each file processor definition with its localised label so the
				// processor selector can display human-readable option text.
				self.tool_config.file_processor.map(el => {
					el.function_name_label = self.get_tool_label(el.function_name)
				});
			}
			// init service dropzone
			self.service_dropzone = await get_instance({
				model				: 'service_dropzone',
				mode				: 'edit',
				caller				: self,
				allowed_extensions	: self.allowed_extensions || [],
				key_dir				: self.key_dir,
				component_option	: self.tool_config.ddo_map.filter(el => el.role === 'component_option'),
				file_processor		: self.tool_config.file_processor || null
			})

		// Service tmp_section
			// Build the phantom input-component section from the 'input_component' ddo_map entries.
			// These entries define the metadata fields visible in the import panel (e.g. title,
			// description) whose values are captured and attached to every imported section record.
			const tmp_section_ddo_map = self.tool_config.ddo_map.filter(el => el.role==='input_component')
			self.service_tmp_section = await get_instance({
				model	: 'service_tmp_section',
				mode	: 'edit',
				caller	: self,
				ddo_map	: tmp_section_ddo_map
			})

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



/**
* IMPORT_FILES
* Dispatches the server-side import job and returns the API response.
*
* Constructs an RQO for `dd_tools_api::tool_request` that invokes the static PHP method
* `tool_import_files::import_files($options)` as a background CLI process
* (`background_running: true`).  The server queues the job, returns a process handle
* `{ pid, pfile }` immediately, and the caller polls progress via SSE
* (`update_process_status`).
*
* File name encoding: each entry in `self.files_data` has its `name` URI-encoded before
* transmission to prevent multi-byte or special-character filenames from breaking the
* JSON payload or HTTP request boundaries.  Only three scalar properties travel with
* each file descriptor (`name`, `file_processor`, `component_option`); the binary file
* data itself was already uploaded to the server tmp directory by `service_dropzone`.
*
* `self.key_dir` tells the server which tmp subdirectory holds the staged files.
*
* `components_temp_data` (from `options.components_temp_data`) contains the current
* values from the phantom `service_tmp_section` input components; the server writes
* these values into every section record it creates during the import.
*
* Timeout is set to 3,600,000 ms (1 hour) because large batch imports can run for
* a long time on the server.  The request uses `retries: 1` (no retry) because
* submitting the import twice would create duplicate records.
*
* @param {Object} options - Import options
* @param {Array} options.components_temp_data - Serialised component value objects
*   from `service_tmp_section.get_components_data()`; propagated verbatim into every
*   section created by the import.  Shape: array of component datum objects.
* @returns {Promise<Object>} Resolves with the `dd_tools_api` response object:
*   `{ result: boolean, pid: string, pfile: string, msg: string, errors: Array }`.
*   On success, `result` is truthy and `pid`/`pfile` identify the running background
*   process for polling via `get_process_status`.
*/
tool_import_files.prototype.import_files = function(options) {

	const self = this

	// options
		const components_temp_data	= options.components_temp_data

	// short vars
		const files_data = self.files_data
		// URI-encode filenames to safely transmit special characters (spaces, accents,
		// non-ASCII) across the JSON/HTTP boundary without breaking server-side parsing.
		const safe_files_data = files_data.map(el => {
			const name = encodeURI(el.name)
			return {
				name				: name,
				file_processor		: el.file_processor || null,
				component_option	: el.component_option || null
			}
		})
		if(SHOW_DEBUG===true) {
			console.log('files_data:', files_data);
			console.log('safe_files_data:', safe_files_data);
		}

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'import_files')

	// rqo_options
		const rqo_options = {
			background_running		: true, // set run in background CLI
			tipo					: self.caller.tipo,
			section_tipo			: self.caller.section_tipo,
			section_id				: self.caller.section_id,
			tool_config				: self.tool_config,
			files_data				: safe_files_data,
			components_temp_data	: components_temp_data,
			key_dir					: self.key_dir,
			custom_target_quality	: self.custom_target_quality
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options : rqo_options
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){
			// request
			// (!) retries:1 — never retry an import request; a second dispatch would create
			// duplicate section records.  timeout:3600*1000 — large batches can run for hours.
			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(api_response){
				if(SHOW_DEBUG===true) {
					console.log('import_files api_response:', api_response);;
				}
				resolve(api_response)
			})
		})
}//end import_files



// @license-end
