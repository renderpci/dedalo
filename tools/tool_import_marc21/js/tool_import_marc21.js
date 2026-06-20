// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// import
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_marc21} from './render_tool_import_marc21.js'



/**
* TOOL_IMPORT_MARC21
* Client-side controller for the MARC 21 import tool.
*
* This tool allows curators to upload one or more MARC 21 binary (.mrc) files
* and map their fields to Dédalo components in a target section type.  The
* field-to-component mapping is stored in the ontology (dd1633) and is loaded
* at build time via `tool_common.prototype.build`.
*
* High-level flow:
*   1. A section button or menu action opens the tool via `open_tool`.
*   2. `init` seeds instance properties and derives `key_dir` (the server-side
*      temporary upload directory key) from caller.tipo + caller.section_tipo.
*   3. `build` creates two service sub-instances:
*        - `service_dropzone`  — handles drag-and-drop .mrc file upload and
*          populates `self.files_data` with the uploaded file descriptors.
*        - `service_tmp_section` — renders the input components declared in
*          `tool_config.ddo_map` (role: "input_component") so the user can
*          supply context values (e.g. a target project locator) that are
*          propagated by the server to every imported section.
*   4. `edit` (delegated to render_tool_import_marc21) renders the full UI:
*      drop zone + input components + "IMPORT" button.
*   5. On button click the client sends a `tool_request` (action: import_files)
*      to `dd_tools_api`; the PHP side parses each .mrc, upserts sections, and
*      writes component data according to the configuration map.
*
* Prototype methods are mixed in from:
*   - `tool_common.prototype`  — render, init, build
*   - `common.prototype`       — destroy, refresh
*   - `render_tool_import_marc21.prototype` — edit (the concrete UI renderer)
*
* Instance properties are initialised to null / [] in the constructor and
* populated during `init` / `build`; see property comments below.
*
* Main exports:
*   tool_import_marc21  — constructor; used by instances.js as the model key.
*/



/**
* TOOL_IMPORT_MARC21
* Constructor for the MARC 21 import tool instance.
*
* All properties are set to null / empty defaults here and populated during
* `init` and `build`.  No arguments are accepted; callers use `get_instance`
* with an options object instead.
*/
export const tool_import_marc21 = function () {

	// standard tool identity properties (set by tool_common.prototype.init)
	this.id						= null
	this.model					= null
	this.mode					= null
	this.node					= null
	this.ar_instances			= null
	this.status					= null
	this.events_tokens			= null
	this.type					= null

	// language properties (unused by this tool; kept for tool_common parity)
	this.source_lang			= null
	this.target_lang			= null
	this.langs					= null

	// caller is the component or section that launched the tool (injected by open_tool)
	this.caller					= null

	// key_dir: composite key used as the server-side temp upload sub-directory
	// value: caller.tipo + '_' + caller.section_tipo (set in init)
	this.key_dir				= null

	// tool_contanier: (sic) reserved for an optional outer wrapper node (currently unused)
	this.tool_contanier			= null

	// files_data: array of file-descriptor objects populated by service_dropzone
	// after each successful upload; consumed by the import button handler
	this.files_data				= []

	// services
	// service_dropzone: service_dropzone instance; manages drag-and-drop upload UI
	this.service_dropzone		= null
	// service_tmp_section: service_tmp_section instance; renders input_component
	// entries from ddo_map so the user can supply per-import context values
	this.service_tmp_section	= null
}//end tool_import_marc21 constructor



/**
* COMMON FUNCTIONS
* Prototype methods mixed in from shared tool/component base classes.
* These provide the standard lifecycle (render, destroy, refresh) and
* the concrete edit renderer without requiring any inheritance chain.
*/
// prototypes assign
	tool_import_marc21.prototype.render		= tool_common.prototype.render
	tool_import_marc21.prototype.destroy	= common.prototype.destroy
	tool_import_marc21.prototype.refresh	= common.prototype.refresh
	tool_import_marc21.prototype.edit		= render_tool_import_marc21.prototype.edit



/**
* INIT
* Custom tool init.
*
* Calls the generic `tool_common.prototype.init` to seed all standard
* properties (id, model, mode, caller, tool_config, etc.) from `options`,
* then derives `key_dir` — the composite string used as the server-side
* temporary upload directory key for this caller context.
*
* `key_dir` format: "<caller.tipo>_<caller.section_tipo>"
* e.g. "dd100_dd88" for a component of tipo dd100 in section dd88.
* The PHP side uses this key under DEDALO_UPLOAD_TMP_DIR/<user_id>/<key_dir>/.
*
* @param {Object} options - Standard get_instance options: tipo, section_tipo,
*   section_id, mode, caller, tool_config, etc.
* @returns {Promise<boolean>} Resolves to the result of tool_common.prototype.init
*   (true on success, false on failure).
*/
tool_import_marc21.prototype.init = async function(options) {

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
* (!) Note that common build resolve all components inside 'self.tool_config.ddo_map' and
* here we do not want this, but only with role 'input_component' and with tmp section_id
*
* Calls `tool_common.prototype.build` with a custom `load_ddo_map` override that
* returns an empty array, preventing the generic build from auto-loading all ddo_map
* entries as live component instances.  This tool manages its own sub-instances:
*
*   service_dropzone   — Instantiated with `allowed_extensions` from tool options
*     (defaults to []) and `key_dir`.  Handles drag-and-drop .mrc file selection,
*     uploads files to the server temp dir, and populates `self.files_data`.
*
*   service_tmp_section — Instantiated with only the ddo_map entries whose `role`
*     equals "input_component".  Renders those components in a temporary section
*     context so the user can supply values (e.g. project) that the server will
*     propagate to every imported section.
*
* Any error during service build is caught, stored in `self.error`, and logged;
* the build still returns `common_build` so the tool can show an error state.
*
* @param {boolean} [autoload=false] - When true, tool_common.prototype.build will
*   attempt to load previously cached tool data (passed through unchanged).
* @returns {Promise<boolean>} Resolves to the result of tool_common.prototype.build.
*/
tool_import_marc21.prototype.build = async function(autoload=false) {

	const self = this

	// common_build. call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload, {
			load_ddo_map : () => { return []} // prevents to auto load ddo_map
		});

	try {

		// service_dropzone
		// 'file_processor' and 'component_option' are intentionally null for MARC 21:
		// files are processed entirely server-side and there is no per-file component selection.
			self.service_dropzone = await get_instance({
				model 				: 'service_dropzone',
				mode 				: 'edit',
				caller 				: self,
				allowed_extensions	: self.allowed_extensions || [],
				key_dir				: self.key_dir,
				component_option	: null,
				file_processor		: null
			})
			await self.service_dropzone.build()

		// Service tmp_section
		// Only pass ddo_map entries with role 'input_component'; these become the
		// per-import context fields (e.g. project, collection) rendered in the UI.
			self.service_tmp_section = await get_instance({
				model	: 'service_tmp_section',
				mode	: 'edit',
				caller	: self,
				ddo_map	: self.tool_config.ddo_map.filter(el => el.role==='input_component')
			})
			await self.service_tmp_section.build()

	} catch (error) {
		self.error = error
		console.error(error)
	}


	return common_build
}//end build



// @license-end
