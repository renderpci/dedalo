// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* TOOL_ONTOLOGY (module)
* Client-side entry point for the ontology-processing tool.
*
* This tool materialises one or more ontology section records into rows of the
* `dd_ontology` table — the runtime ontology model used by the Dédalo API to
* resolve tipos, labels, and hierarchy data.  It is triggered as a modal overlay
* from a section toolbar button (registered as dd1340) and is restricted to
* developer-level users (enforced by the PHP class `tool_ontology::assert_developer`).
*
* Architecture:
*   - `tool_ontology`  — constructor + prototype chain (this file); extends
*       `tool_common` for lifecycle (`init` / `build` / `render`) and `common`
*       for `destroy` / `refresh`.
*   - `render_tool_ontology` — DOM builder for the edit view; wired in via
*       `tool_ontology.prototype.edit`.
*   - `class.tool_ontology.php` — server-side handler; exposes the single
*       API_ACTION `set_records_in_dd_ontology` dispatched by dd_tools_api.
*
* Lifecycle flow:
*   1. `open_tool` (tool_common) resolves the registered context and opens the modal.
*   2. `init(options)` — delegates entirely to `tool_common.prototype.init`, seeding
*       standard tool properties from options and resolving the caller.
*   3. `build(autoload)` — delegates entirely to `tool_common.prototype.build`, which
*       loads CSS, populates ar_instances from ddo_map, and fetches tool context.
*   4. `render()` — wired from tool_common; calls the concrete `edit` method.
*   5. User clicks "Process" → `set_records_in_dd_ontology()` dispatches an API RQO
*       to `dd_tools_api / tool_request`, routing to `tool_ontology::set_records_in_dd_ontology`.
*   6. On modal close → `on_close_actions()` destroys the tool instance.
*
* Exported symbols:
*   tool_ontology — constructor; fully wired prototype chain is the only export.
*/



// import needed modules
// you can import and use your own modules or any dedalo module of section, components or other tools.
// by default you will need the tool_common to init, build and render.
// use tool_common is not mandatory, but it can help to do typical task as open tool window, or load the section and components defined in ontology.
// import dd_console if you want to use dd_console with specific console.log messages
	import {dd_console} from '../../../core/common/js/utils/index.js'
// import data_manager if you want to access to Dédalo API
	import {data_manager} from '../../../core/common/js/data_manager.js'
// import common to use destroy, render, refresh and other useful methods
	import {common, create_source} from '../../../core/common/js/common.js'
// tool_common, basic methods used by all the tools
	import {tool_common} from '../../../core/tools_common/js/tool_common.js'
// specific render of the tool
	import {render_tool_ontology} from './render_tool_ontology.js' // self tool rendered (called from render common)



/**
* TOOL_ONTOLOGY
* Constructor for the ontology-processing tool instance.
*
* All properties are initialised to null; they are populated during
* `tool_common.prototype.init` (called from `tool_ontology.prototype.init`).
*
* Notable instance properties:
*   @var {string|null}   id           - Unique instance identifier (set by get_instance)
*   @var {string|null}   model        - Tool model name: 'tool_ontology'
*   @var {string|null}   mode         - Active render mode, typically 'edit'
*   @var {HTMLElement|null} node      - Root DOM node once rendered
*   @var {Array|null}    ar_instances - Child component instances managed by this tool
*   @var {Array|null}    events_tokens - Subscribed event tokens for cleanup on destroy
*   @var {string|null}   status       - Lifecycle state ('initializing' / 'initialized' / 'building' / 'built')
*   @var {HTMLElement|null} main_element - Reference to the primary content element
*   @var {string|null}   type         - Instance type classifier, set to 'tool' by init
*   @var {string|null}   source_lang  - Source language code (reserved; unused in current version)
*   @var {string|null}   target_lang  - Target language code (reserved; unused in current version)
*   @var {Array|null}    langs        - Available language codes (reserved; unused in current version)
*   @var {Object|null}   caller       - Component or section instance that opened this tool
*/
export const tool_ontology = function () {

	this.id				= null
	this.model			= null
	this.mode			= null
	this.node			= null
	this.ar_instances	= null
	this.events_tokens	= null
	this.status			= null
	this.main_element	= null
	this.type			= null
	this.source_lang	= null
	this.target_lang	= null
	this.langs			= null
	this.caller			= null
}//end tool_ontology



/**
* COMMON FUNCTIONS
* Prototype methods wired in from tool_common and common.
* tool_ontology does not override any of these — all lifecycle behaviour
* is inherited from the base classes.
*/
// prototypes assign
	tool_ontology.prototype.render	= tool_common.prototype.render
	tool_ontology.prototype.destroy	= common.prototype.destroy
	tool_ontology.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_ontology.prototype.edit	= render_tool_ontology.prototype.edit



/**
* INIT
* Custom tool initialiser — delegates entirely to `tool_common.prototype.init`.
*
* `tool_common.prototype.init` seeds the standard tool properties from `options`
* (model, section_tipo, section_id, lang, mode, etc.), resolves the caller instance
* (from `options.caller` in the modal path, or from URL `raw_data` in the new-window
* path), and resolves or synthesises `tool_config` (with its `ddo_map`).
*
* No tool_ontology-specific setup is required beyond the common init; this method
* exists as an override hook in case future requirements need pre/post logic.
*
* @param {Object} options - Initialisation options forwarded verbatim to tool_common
* @param {Object|null} options.caller    - Live caller instance (modal) or null (new-window)
* @param {string}      options.lang      - Language code, e.g. 'lg-eng'
* @param {string}      [options.mode]    - Render mode; defaults to 'edit'
* @param {string}      options.model     - Tool model name, must be 'tool_ontology'
* @param {Object}      [options.tool_config] - Tool configuration with ddo_map; resolved
*   from caller or synthesised when omitted
* @returns {Promise<boolean>} Resolves true on success; false if already initialised
*/
tool_ontology.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
	// it will assign common vars as:
		// model
		// section_tipo
		// section_id
		// lang
		// mode
		// etc
	// set the caller if it was defined or create it and set the tool_config or create new one if tool_config was not defined.
		const common_init = await tool_common.prototype.init.call(this, options);


	return common_init
}//end init



/**
* BUILD
* Custom tool build — delegates entirely to `tool_common.prototype.build`.
*
* `tool_common.prototype.build` loads the tool CSS, instantiates all elements
* declared in `tool_config.ddo_map` (via `get_instance` / `build(true)`), and —
* when `autoload` is true — fetches the tool's registered context object from the
* API (component_json dd1353 inside tool-registered section dd1324) and stores it
* at `self.context`.
*
* tool_ontology does not declare any custom ddo_map entries in its registration;
* the `ddo_map` is therefore typically empty or minimal.  The tool's UI is built
* entirely in `render_tool_ontology.prototype.edit` without needing pre-built
* child component instances.
*
* No tool_ontology-specific build logic is required; this method exists as an
* override hook.
*
* @param {boolean} [autoload=false] - When true, fetches the persisted tool context
*   from the API; passing true a second time (after context is already loaded) is a
*   programming error and is logged as an error by tool_common
* @returns {Promise<boolean>} Resolves true when all ddo_map elements are built
*/
tool_ontology.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
	// it will load the components or sections defined in ontology ddo_map.
	// it's possible to set your own load_ddo_map adding to something as:
	// tool_common.prototype.build.call(this, autoload, {load_ddo_map : function({
	// 	your own code here to load components
	// })}
	// it will assign or create the context of the tool calling to get_element_context
		const common_build = await tool_common.prototype.build.call(this, autoload);


	return common_build
}//end build_custom



/**
* SET_RECORDS_IN_DD_ONTOLOGY
* Dispatches a `dd_tools_api / tool_request` RQO to the server-side handler
* `tool_ontology::set_records_in_dd_ontology`, which parses the ontology section
* node(s) and writes or updates their definitions in the `dd_ontology` table.
*
* The server handler determines processing scope from the caller mode:
*   - 'edit' mode  — processes a single record identified by section_id + section_tipo
*   - other modes  — reads the active sqo from the PHP session and processes the full
*       result set (batch mode for list/search views)
*
* After a successful server response the active_elements session cache is cleared
* server-side so `dd_ts_api::get_children_data` picks up the updated ontology.
*
* API contract:
*   RQO body: { dd_api: 'dd_tools_api', action: 'tool_request', source, options }
*   source: built by `create_source(self, 'set_records_in_dd_ontology')`
*     → routes to PHP `tool_ontology::set_records_in_dd_ontology($options)`
*   options forwarded to PHP: { section_id, section_tipo, mode }
*   Response shape: { result: bool, msg: string|string[], errors: string[] }
*
* (!) `SHOW_DEVELOPER` is used inside this method but is not declared in the
* global directive at the top of the file. This is a pre-existing condition —
* do not resolve here; flag only.
*
* @returns {Promise<Object>} Resolves with the API response object:
*   { result: {boolean}, msg: {string|string[]}, errors: {string[]} }
*/
tool_ontology.prototype.set_records_in_dd_ontology = async function() {

	const self = this

	// sort vars
		const mode			= self.caller.mode
		const section_tipo	= self.caller.section_tipo
		const section_id	= self.caller.section_id || null

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
	// create_source produces a descriptor that dd_tools_api uses to locate and invoke
	// the correct PHP static method: tool_ontology::set_records_in_dd_ontology($options)
		const source = create_source(self, 'set_records_in_dd_ontology')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				section_id		: section_id,
				section_tipo	: section_tipo,
				mode			: mode
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 60 * 1000 // 60 secs waiting response
			})
			.then(function(response){
				// (!) SHOW_DEVELOPER is not listed in the /*global*/ directive above;
				// this is a pre-existing condition and is flagged for future correction.
				if(SHOW_DEVELOPER===true) {
					dd_console("-> set_records_in_dd_ontology API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end set_records_in_dd_ontology



/**
* ON_CLOSE_ACTIONS
* Hook called by `tool_common / view_modal` when the modal is dismissed.
* Overrides the default `view_modal` close handler (which would call destroy +
* caller.refresh) with a lighter-weight destroy-only path, since tool_ontology
* does not need to refresh the caller on close.
*
* Destroying the instance cleans up event listeners, removes child component
* instances from ar_instances, and resets the registry entry so the tool can
* be re-opened cleanly from the same button.
*
* @returns {boolean} Always true (signals successful cleanup to the modal).
*/
tool_ontology.prototype.on_close_actions = function() {

	// destroy current tool instance to allow open again
	this.destroy(true, true, true)

	return true
}//end on_close_actions



// @license-end
