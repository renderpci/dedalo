// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/
// (!) FLAG: SHOW_DEVELOPER is used in get_rdf_data() at line ~136 but is NOT listed
//     in the /*global*/ directive above. The eslint no-undef rule will fire on it.
//     Do not move it here without confirming whether SHOW_DEVELOPER belongs in the
//     global scope for this module; fix in code, not in this comment.



/**
* TOOL_IMPORT_RDF
* Client-side controller for the RDF import tool.
*
* This tool lets a user supply one or more IRI identifiers (retrieved from a
* `component_iri` instance) that resolve to resources in an external RDF graph
* (e.g. Nomisma, Dublin Core). It sends those IRIs together with the active
* section locator to the server-side `tool_import_rdf::get_rdf_data` action,
* which parses the graph via EasyRdf, maps each RDF property to the
* corresponding Dédalo component according to the External Ontology configuration
* (stored under dd1270 in the ontology), and writes the imported values into the
* target section.
*
* Exported constructor: {@link tool_import_rdf}
* Main API method:      {@link tool_import_rdf.prototype.get_rdf_data}
*
* Lifecycle (standard tool pattern):
*   1. `init(options)`  — resolves tool_config / caller, delegates to tool_common.
*   2. `build()`        — instantiates ddo_map components, pins self.main_element.
*   3. `edit()`         — delegated to render_tool_import_rdf.prototype.edit;
*                         renders the UI (IRI input + import button).
*/

// import
	import {dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_import_rdf} from './render_tool_import_rdf.js'



/**
* TOOL_IMPORT_RDF
* Constructor — initialises all instance properties to safe defaults.
*
* Property notes:
*   - `ar_instances`    {Array|null}   Populated by tool_common.build(); holds the
*                                      live component instances declared in ddo_map.
*   - `main_element`    {Object|null}  Convenience reference to the live component
*                                      instance whose tipo matches the ddo_map entry
*                                      with role === "main_element" (set in build).
*   - `events_tokens`   {Array|null}   Event-manager subscription tokens used for
*                                      cleanup in destroy().
*   - `files_data`      {Array}        Staging array for file-upload payloads;
*                                      populated by the render layer before import.
*   - `source_lang`,`target_lang`,`langs`,`key_dir`,`active_dropzone`,`tool_contanier`
*                                      Reserved instance slots carried over from the
*                                      shared tool scaffold. Not actively used by this
*                                      tool's current implementation; retained for
*                                      forward-compatibility with tool_common helpers.
*                                      Note: `tool_contanier` is a known typo
*                                      ("container") — do not rename without updating
*                                      all callers.
*/
export const tool_import_rdf = function () {

	this.id					= null
	this.model				= null
	this.mode				= null
	this.node				= null
	this.ar_instances		= null
	this.status				= null
	this.events_tokens		= null
	this.type				= null
	this.source_lang		= null
	this.target_lang		= null
	this.langs				= null
	this.caller				= null
	this.key_dir			= null
	this.active_dropzone	= null
	this.tool_contanier		= null
	this.files_data			= []

	return true
}//end tool_import_rdf



/**
* COMMON FUNCTIONS
* Wires shared behaviour from tool_common and common onto this tool's prototype.
* - render:   tool_common generic render (handles mode dispatch).
* - destroy:  common base teardown (removes node, clears event tokens).
* - refresh:  common base refresh (re-runs build + render on data change).
* - edit:     render_tool_import_rdf.prototype.edit (full import UI).
*/
// prototypes assign
	tool_import_rdf.prototype.render	= tool_common.prototype.render
	tool_import_rdf.prototype.destroy	= common.prototype.destroy
	tool_import_rdf.prototype.refresh	= common.prototype.refresh
	tool_import_rdf.prototype.edit		= render_tool_import_rdf.prototype.edit



/**
* INIT
* Bootstraps the tool instance by delegating to tool_common.prototype.init,
* which resolves `tool_config` (from caller context or stored config), normalises
* `ddo_map` section_id placeholders, and sets core properties (id, model, mode,
* caller, etc.).
*
* @param {Object} options - Initialisation options forwarded verbatim to
*   tool_common.prototype.init. Expected shape:
*   {
*     caller          : {Object}  — the section/component that opened this tool,
*     tool_config     : {Object}  — optional pre-resolved tool_config with ddo_map,
*     caller_options  : {Object}  — optional extra context from the button DDO.
*   }
* @returns {Promise<*>} Resolves with the return value of tool_common.prototype.init
*   (typically the initialised instance or a status flag).
*/
tool_import_rdf.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);


	return common_init
}//end init




/**
* BUILD
* Builds the tool after init: loads the tool CSS, instantiates all components
* declared in `tool_config.ddo_map` (via tool_common.prototype.build), then
* resolves and stores a convenience reference to the "main_element" ddo_map
* entry on `self.main_element`.
*
* `self.main_element` is the component_iri instance through which the user
* supplies the IRIs to import. It is looked up by matching the `role` field
* of the ddo_map entry to `"main_element"` and then finding the corresponding
* live instance in `self.ar_instances` by `tipo`.
*
* Note: the `autoload` parameter is accepted for API parity with tool_common
* but is always passed as `true` to tool_common.prototype.build regardless of
* the caller's value, so the ddo_map instances are always loaded eagerly.
*
* @param {boolean} [autoload=false] - Ignored internally; build always forces
*   autoload=true when calling tool_common.prototype.build.
* @returns {Promise<*>} Resolves with the return value of tool_common.prototype.build.
*/
tool_import_rdf.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, true);

	// main_element. fix main_element for convenience
		const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
		self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)


	return common_build
}//end build_custom



/**
* GET_RDF_DATA
* Sends the selected IRI values to the server for RDF graph resolution and
* import into the current section.
*
* Flow:
*   1. Builds a `source` object (via create_source) that identifies this tool
*      instance to the router; the second argument `'get_rdf_data'` causes the
*      server to dispatch to `tool_import_rdf::get_rdf_data($options)`.
*   2. Assembles an rqo (request-query object) targeting `dd_tools_api /
*      tool_request`, passing the external ontology tipo, the IRI list, and
*      the caller's section locator so the server knows which record to populate.
*   3. Issues the request via `data_manager.request` with a 60-second timeout
*      to accommodate slow external RDF endpoints.
*   4. Resolves the outer Promise with the raw API response; the caller is
*      responsible for inspecting `response.result` and surfacing errors.
*
* The `ontology_tipo` argument selects which External Ontology definition
* (e.g. `numisdata1129`) to use for property-to-component mapping; it is
* typically retrieved from the component_iri's ontology node properties
* (`ar_tools_name.tool_import_rdf.external_ontology`).
*
* @param {string} ontology_tipo - Dédalo tipo of the external ontology node
*   that defines the RDF-to-component mapping (e.g. "numisdata1129").
* @param {Array<string>} ar_values - Array of IRI strings selected by the user
*   (e.g. ["http://numismatics.org/ocre/id/ric.1(2).aug.1A"]). The server
*   will fetch and parse the RDF graph rooted at each IRI.
* @returns {Promise<Object>} Resolves with the server response object.
*   On success: { result: true,  ... }
*   On failure: { result: false, msg: string, ... }
*/
tool_import_rdf.prototype.get_rdf_data = async function(ontology_tipo, ar_values) {

	const self = this

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'get_rdf_data')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				ontology_tipo	: ontology_tipo,
				ar_values		: ar_values,
				// locator provides the server with the target section so it can write
				// imported values into the correct record.
				locator			: {
					section_tipo	: self.caller.section_tipo,
					section_id		: self.caller.section_id
				}
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 5, // one try only
				// (!) FLAG: `retries: 5` contradicts the inline comment "one try only".
				//     The intent is likely retries:1 (no automatic retry) given that
				//     RDF fetches are long-running and idempotent retries could duplicate
				//     writes. Do not change the value here — verify intent with the author.
				timeout : 60 * 1000 // 60 secs waiting response
				// 60-second timeout accommodates slow external RDF graph endpoints
				// (e.g. numismatics.org) that may require fetching multiple sub-graphs.
			})
			.then(function(response){
				// (!) FLAG: SHOW_DEVELOPER is referenced here but not declared in the
				//     /*global*/ directive at the top of the file. ESLint (no-undef) will
				//     report this as an error. Add SHOW_DEVELOPER to the global pragma
				//     or import it explicitly; do not silently ignore the warning.
				if(SHOW_DEVELOPER===true) {
					dd_console("-> get_rdf_data API response:",'DEBUG',response);
				}

				// user messages
				// msg_type drives the UI toast/notification in the render layer;
				// the value is computed here but consumed by the caller of get_rdf_data,
				// which must read response.result to determine the display state.
					const msg_type = (response.result===false) ? 'error' : 'ok'

				resolve(response)
			})
		})
}//end get_rdf_data



// @license-end
