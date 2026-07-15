// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* MODULE: tool_ontology_parser
*
* Developer-only tool for parsing, exporting, and regenerating Dédalo ontology data.
*
* Responsibilities:
*  - Fetch the full list of available ontologies from the main_ontology via the
*    server-side `get_ontologies` API action, including TLD, name, and typology metadata.
*  - Let the user select a subset of ontologies (grouped by typology) and persist the
*    selection across sessions via `localStorage` key `'selected_ontologies'`.
*  - Trigger `export_ontologies` to serialise the selected ontologies to JSON files on
*    the server for distribution to other Dédalo installations.
*  - Trigger `regenerate_ontologies` to rebuild the in-database `dd_ontology` table
*    entries for the selected TLDs.
*
* All three server operations are routed through `dd_tools_api::tool_request`, which
* enforces the `API_ACTIONS` allowlist defined on the PHP side and checks that the
* caller holds developer privileges (SEC-024 §9.2).
*
* The tool follows the standard Dédalo tool lifecycle:
*  init (tool_common) → build (tool_common + custom) → render → edit (custom)
*
* Main exports: {tool_ontology_parser}
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
	import {render_tool_ontology_parser} from './render_tool_ontology_parser.js' // self tool rendered (called from render common)



/**
* TOOL_ONTOLOGY_PARSER
* Constructor for the tool instance.
*
* Initialises all shared instance properties to their default null/empty values.
* Actual values are assigned by `init` (via tool_common) and `build`.
*
* Instance shape:
*  - Standard tool_common properties (id, model, mode, node, ar_instances,
*    events_tokens, status, main_element, type, source_lang, target_lang, langs, caller)
*    are populated by `tool_common.prototype.init`.
*  - `ontologies`          {Array|null} — flat list of ontology descriptor objects
*    fetched from the server during `build`. Each item has the shape:
*    { target_section_tipo: string, tld: string, name: string,
*      typology_id: number|null, typology_name: string }
*  - `selected_ontologies` {Array<string>} — TLD strings the user has checked in the UI.
*    Persisted to and restored from `localStorage` key `'selected_ontologies'`.
*/
export const tool_ontology_parser = function () {

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

	// ontologies. List of available ontologies from main_ontology
	this.ontologies		= null
	// selected_ontologies. User selected ontologies (checkbox checked = true)
	this.selected_ontologies = []
}//end page



/**
* COMMON FUNCTIONS
* Prototype assignments that wire the standard Dédalo tool lifecycle methods onto
* tool_ontology_parser. The delegated implementations live in tool_common and common;
* this tool does not override them.
*
* render  — tool_common: opens the tool window and calls `this.edit()`.
* destroy — common:      tears down events, removes DOM nodes.
* refresh — common:      re-runs build+render to update stale content.
* edit    — render_tool_ontology_parser: builds the tool's full DOM tree
*           (ontology checklist, export/regenerate buttons, message areas).
*/
// prototypes assign
	tool_ontology_parser.prototype.render	= tool_common.prototype.render
	tool_ontology_parser.prototype.destroy	= common.prototype.destroy
	tool_ontology_parser.prototype.refresh	= common.prototype.refresh
	// render mode edit (default). Set the tool custom manager to build the DOM nodes view
	tool_ontology_parser.prototype.edit		= render_tool_ontology_parser.prototype.edit



/**
* INIT
* Custom tool initialisation — delegates entirely to tool_common.
*
* `tool_common.prototype.init` is responsible for:
*  - Assigning standard instance properties: model, section_tipo, section_id,
*    lang, mode, and all other fields from `options`.
*  - Resolving or creating the `caller` reference.
*  - Loading or creating the tool_config record if one was not supplied.
*
* This override exists as the required hook point; the tool currently adds no
* extra initialisation steps beyond the generic baseline.
*
* @param {Object} options - Standard tool options forwarded from the tool button or
*   programmatic caller. Typical keys: id, model, mode, section_tipo, section_id.
* @returns {Promise<boolean>} Resolves to true when initialisation succeeds.
*/
tool_ontology_parser.prototype.init = async function(options) {

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
* Custom tool build — extends tool_common.prototype.build with ontology data loading
* and localStorage-based selection restoration.
*
* Steps performed after the generic build:
*  1. Calls `get_ontologies()` to fetch all available ontology descriptors from the
*     server and stores the result array in `self.ontologies`.
*  2. Reads the `'selected_ontologies'` key from localStorage (a JSON array of TLD
*     strings previously saved by the checkbox change handlers in the render layer).
*  3. Validates each saved TLD against `self.ontologies`; invalid/removed TLDs are
*     silently dropped with a console.warn so stale storage does not cause errors.
*  4. Pushes surviving TLDs into `self.selected_ontologies` so the render layer can
*     pre-check the matching checkboxes without requiring the user to re-select.
*
* Note: `tool_common.prototype.build` also accepts an optional second argument for a
* custom `load_ddo_map` override; this tool does not use that escape hatch.
*
* @param {boolean} [autoload=false] - When true, tool_common will immediately trigger
*   data loading for any ddo_map-configured components.
* @returns {Promise<boolean>} Resolves to the value returned by tool_common.prototype.build.
*/
tool_ontology_parser.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
	// it will load the components or sections defined in ontology ddo_map.
	// it's possible to set your own load_ddo_map adding to something as:
	// tool_common.prototype.build.call(this, autoload, {load_ddo_map : function({
	// 	your own code here to load components
	// })}
	// it will assign or create the context of the tool calling to get_element_context
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// call API to get_ontologies and fix it
		const api_response	= await self.get_ontologies()
		self.ontologies		= api_response?.result

	// selected ontologies. Get previous user selections saved in local storage and fill selection for convenience
		const saved_selected_ontologies			= localStorage.getItem('selected_ontologies')
		const parsed_saved_selected_ontologies	= saved_selected_ontologies ? JSON.parse(saved_selected_ontologies) : [];
		// add saved selected ontologies if found it into available self.ontologies list
		const parsed_saved_selected_ontologies_length = parsed_saved_selected_ontologies.length
		for (let i = 0; i < parsed_saved_selected_ontologies_length; i++) {
			const current_tld = parsed_saved_selected_ontologies[i]
			const found = self.ontologies.find(el => el.tld===current_tld)
			if (!found) {
				// Saved TLD no longer exists in the ontology list (e.g. was removed from
				// the ontology or belongs to a different installation). Skip silently.
				console.warn('Warning: Ignored invalid saved tld:', current_tld);
				continue;
			}
			self.selected_ontologies.push(current_tld)
		}
		if(SHOW_DEBUG===true) {
			console.log('build self.selected_ontologies:', self.selected_ontologies);
		}


	return common_build
}//end build_custom



/**
* GET_ONTOLOGIES
* Fetches the full list of available ontology descriptors from the server.
*
* Calls `dd_tools_api::tool_request` → `tool_ontology_parser::get_ontologies` (PHP).
* The server iterates all main_ontology records and extracts, per record:
*   { target_section_tipo, tld, name, typology_id, typology_name }
* Records missing `target_section_tipo` or `tld` are skipped server-side and their
* errors appear in `response.errors`.
*
* The `create_source` helper encodes the tool identity so the server dispatcher
* can route the request to the correct PHP class and method:
*   tool_ontology_parser::get_ontologies(options)
*
* No `options` payload is required for this read-only call.
*
* @returns {Promise<Object>} Resolves to the raw API response object:
*   { result: Array<Object>|false, msg: string, errors: Array<string> }
* @throws {Error} Re-throws network or server errors so the caller (`build`) can
*   handle them; currently `build` does not guard against rejection.
*/
tool_ontology_parser.prototype.get_ontologies = async function() {

	const self = this

	// Construct the source identifier
	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
	const source = create_source(self, 'get_ontologies')

	// Construct the Request Object (rqo)
	const rqo = {
		dd_api	: 'dd_tools_api',
		action	: 'tool_request',
		source	: source,
		options	: {}
	}

	// Call to the API, fetch data and get response.
    try {
        // Await the promise returned by data_manager.request
        const response = await data_manager.request({
            body: rqo
        });

        if (SHOW_DEVELOPER === true) {
            // Use standard console.log if dd_console is a custom/legacy function
            // Otherwise, keep dd_console if it's required for logging setup.
            console.log("-> get_ontologies API response:", response);
            // dd_console("-> get_ontologies API response:", 'DEBUG', response);
        }

        // The async function implicitly returns the resolved value
        return response;

    } catch (error) {
        // Log the error and either re-throw it or return a structure indicating failure.
        console.error("Error in get_ontologies API call:", error);

        // Re-throw the error so calling code can handle the rejection
        throw error;
    }
}//end get_ontologies



/**
* EXPORT_ONTOLOGIES
* Sends the user's current TLD selection to the server to produce JSON export files.
*
* The server-side handler (`tool_ontology_parser::export_ontologies`, PHP) performs:
*  1. Updates the ontology metadata timestamp/version in dd1 (section ontology40_1).
*  2. Writes an `ontology.json` info file via `ontology_data_io::export_ontology_info`.
*  3. Iterates `selected_ontologies` and calls `ontology_data_io::export_to_file($tld)`
*     for each TLD, collecting per-TLD messages and errors.
*  4. Exports private lists via `ontology_data_io::export_private_lists_to_file`.
*  5. Exports the LLM ontology map via `ontology_data_io::export_llm_map`.
*
* The call uses `retries: 1` (no automatic retry) and a 180-second timeout because
* exporting a large ontology set can be slow; the caller (render layer) shows a
* spinner while waiting.
*
* Early return: if `self.selected_ontologies` is empty the method returns `false`
* immediately without making a network request. The render layer checks for `!api_response`
* before rendering results, so returning false is safe.
*
* @returns {Promise<Object|false>} Resolves to the API response object:
*   { result: boolean, msg: string, errors: Array<string>, ar_msg: Array<string> }
*   or `false` when the selection is empty.
*/
tool_ontology_parser.prototype.export_ontologies = function () {
	return this.send_action('export_ontologies')
}//end export_ontologies


/**
* INSPECT_ONTOLOGIES
* READ. Fetches the drift of each selected TLD from the server
* (tool_ontology_parser::inspect_hierarchy → core/ontology/ontology_state.ts inspectOntology):
* which dd_ontology nodes are missing, stale or orphaned vs the matrix source. The render
* layer paints this as a per-TLD status panel, so the operator SEES why an ontology is out of
* sync before pressing anything. Writes nothing.
*
* @returns {Promise<Object|false>} { result, msg, errors, states:[{tld, drift, inSync, …}] } or false when empty.
*/
tool_ontology_parser.prototype.inspect_ontologies = function () {
	return this.send_action('inspect_ontologies', { allow_empty: true })
}//end inspect_ontologies


/**
* RECONCILE_ONTOLOGIES
* WRITE (default). INCREMENTAL reconcile — bring each selected TLD's dd_ontology in line with
* its matrix source by applying only the delta (server ensureOntology). Non-destructive: the
* runtime ontology is never momentarily empty, and a TLD already in sync is a no-op. This is
* the everyday action; `regenerate` is the destructive fallback.
*
* @returns {Promise<Object|false>} { result, msg, errors, ar_msg } or false when empty.
*/
tool_ontology_parser.prototype.reconcile_ontologies = function () {
	return this.send_action('reconcile_ontologies')
}//end reconcile_ontologies


/**
* REGENERATE_ONTOLOGIES
* WRITE (nuclear). TRANSACTIONAL wipe-and-rebuild of each selected TLD's dd_ontology from its
* matrix source (server rebuildOntology). For structural corruption the incremental reconcile
* cannot converge. The delete + reinsert run in one transaction per TLD — a failure rolls back
* with no empty window and no leftover backup table. Prefer `reconcile` unless a rebuild is
* genuinely needed.
*
* @returns {Promise<Object|false>} { result, msg, errors, ar_msg } or false when empty.
*/
tool_ontology_parser.prototype.regenerate_ontologies = function () {
	return this.send_action('regenerate_ontologies')
}//end regenerate_ontologies


/**
* SEND_ACTION
* The ONE request path for every tool action (was duplicated per method). Posts the current
* TLD selection to `dd_tools_api::tool_request` for the named server action.
*
* @param {string} action - server action: 'inspect_ontologies' | 'reconcile_ontologies' | 'regenerate_ontologies' | 'export_ontologies'
* @param {Object} [opts]
* @param {boolean} [opts.allow_empty=false] - when true, an empty selection still sends (inspect wants "nothing selected → empty panel")
* @returns {Promise<Object|false>} the API response, or false when the selection is empty and allow_empty is not set.
*/
tool_ontology_parser.prototype.send_action = async function (action, opts) {

	const self = this
	const allow_empty = (opts && opts.allow_empty===true)

	// empty selection: a write on nothing is a no-op; only inspect may proceed empty.
		if (self.selected_ontologies.length===0 && !allow_empty) {
			console.error('Ignored empty selected ontologies for action:', action);
			return false
		}

	const rqo = {
		dd_api	: 'dd_tools_api',
		action	: 'tool_request',
		source	: create_source(self, action),
		options	: {
			selected_ontologies : self.selected_ontologies
		}
	}

	// inspect is a light read; the writes can take minutes over many TLDs.
	const api_response = await data_manager.request({
		body	: rqo,
		retries	: 1,
		timeout	: (action==='inspect_ontologies' ? 30 : 180) * 1000
	})

	if(SHOW_DEVELOPER===true) {
		dd_console('-> ' + action + ' API api_response:', 'DEBUG', api_response);
	}

	return api_response
}//end send_action



/**
* ON_CLOSE_ACTIONS
* Hook called by the modal/tool window infrastructure when the user closes the tool.
*
* Destroys the current tool instance so that the next open triggers a fresh `init →
* build → render` cycle. Without this cleanup the tool window could not be reopened
* (the existing instance would block re-instantiation) and any stale ontology data
* or selection state from the previous session would persist in memory.
*
* The three `true` arguments to `destroy` instruct common.prototype.destroy to:
*  1. Remove DOM nodes.
*  2. Unsubscribe all events_tokens listeners.
*  3. Delete the instance from the shared instances map.
*
* @returns {boolean} Always returns true (expected by the modal close handler).
*/
tool_ontology_parser.prototype.on_close_actions = function() {

	// destroy current tool instance to allow open again
	this.destroy(true, true, true)

	return true
}//end on_close_actions



// @license-end
