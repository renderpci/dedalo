// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



/**
* TOOL_PROPAGATE_COMPONENT_DATA (module)
*
* Bulk-propagation tool that copies or merges the current value of a single
* component into the same component across every record returned by the
* section's active SQO (Search Query Object).
*
* The user configures the desired value using an interactive clone of the
* source component (`component_to_propagate`), which is wired against a
* synthetic temporal section (section_id = 1) so that edits are buffered in
* the session store without touching real section data.  When the user
* confirms an action the tool fires an asynchronous background job on the
* server via `dd_tools_api → propagate_component_data`, then streams live
* progress back with SSE through `dd_utils_api → get_process_status`.
*
* Supported actions (sent to the server):
*   'replace' — overwrite the target component value in every matched record.
*   'add'     — merge the propagation value into existing data (multi-value
*               components only; mono-value models skip the "Add" button).
*   'delete'  — remove matching entries from every record.
*
* Caller chain expected by this tool:
*   self.caller           → the tool_button / component_json that opened it
*   self.caller.caller    → (tool_button) the component being propagated
*   self.caller.caller?.caller → the parent section instance (must be model
*                                'section', mode 'edit') whose active SQO
*                                defines the set of records to update.
*
* Main exports:
*   tool_propagate_component_data — constructor (prototype chain below)
*
* (!) SHOW_DEVELOPER is referenced in the propagate_component_data method but is
*     NOT listed in the /*global*\/ directive above. This is a pre-existing
*     omission; do not change the code line or the directive.
*/



// import needed modules
	import {dd_console,clone} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common} from '../../tool_common/js/tool_common.js'
	import {render_tool_propagate_component_data} from './render_tool_propagate_component_data.js'



/**
* TOOL_PROPAGATE_COMPONENT_DATA
* Constructor for the propagate-component-data tool instance.
*
* Declares all instance properties used throughout the lifecycle.
* Most are populated during `init` / `build` via `tool_common.prototype.init`
* and are therefore null at construction time.
*
* Instance properties:
*   id                    {string|null}  — Unique instance id (set by common init).
*   model                 {string|null}  — Always 'tool_propagate_component_data'.
*   mode                  {string|null}  — Render mode ('edit', 'list', …).
*   node                  {HTMLElement|null} — Mounted DOM node after render.
*   ar_instances          {Array|null}   — Live component instances from ddo_map.
*   events_tokens         {Array|null}   — Event subscription tokens for cleanup.
*   status                {*|null}       — Generic status flag (unused by this tool).
*   main_element          {Object|null}  — The component instance identified by
*                                          `role:"main_element"` in ddo_map; this is
*                                          the component whose value will be propagated.
*   type                  {string|null}  — Tool type tag from ontology.
*   source_lang           {string|null}  — Source language code (unused here).
*   target_lang           {string|null}  — Target language code (unused here).
*   langs                 {Array|null}   — Available language list (unused here).
*   caller                {Object|null}  — The tool-button/component that opened this tool.
*   component_list        {*|null}       — Reserved; not used in current version.
*   component_to_propagate {Object}      — The live clone component wired to the temp
*                                          section, built by get_component_to_propagate.
*                                          Declared without initialiser (undefined) —
*                                          that is intentional in the original source.
*
* @returns {boolean} true — constructor sentinel, consistent with Dédalo convention.
*/
export const tool_propagate_component_data = function () {

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

	this.component_list = null
	this.component_to_propagate


	return true
}//end page



/**
* COMMON FUNCTIONS
* Prototype assignments that wire shared lifecycle methods from the tool_common
* and common base classes onto this tool.
*
* render  — delegates to tool_common's generic render entry point, which
*            dispatches to `self.edit(options)` defined below.
* destroy — shared teardown (unmounts node, clears events_tokens).
* refresh — shared re-render helper (calls build then render).
* edit    — concrete DOM builder from render_tool_propagate_component_data;
*            called automatically by the inherited render path.
*/
// prototypes assign
	// render : using common render entry point
	tool_propagate_component_data.prototype.render	= tool_common.prototype.render
	tool_propagate_component_data.prototype.destroy	= common.prototype.destroy
	tool_propagate_component_data.prototype.refresh	= common.prototype.refresh
	tool_propagate_component_data.prototype.edit	= render_tool_propagate_component_data.prototype.edit



/**
* INIT
* Initialises the tool instance.
*
* Delegates to `tool_common.prototype.init`, which resolves the caller chain,
* loads tool context from the API (dd1353/dd1324), populates `self.tool_config`,
* and seeds all common instance properties (id, model, mode, lang, etc.).
*
* This override exists as an extension point for tool-specific state that
* tool_common does not set. Currently no extra properties are initialised
* beyond those provided by the generic init.
*
* @param {Object} options - Initialisation options forwarded from the tool launcher
*   (open_tool). Typical keys: section_tipo, section_id, tipo, lang, caller, mode.
* @returns {Promise<boolean>} Resolves to the return value of tool_common.prototype.init
*   (true on success).
*/
tool_propagate_component_data.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// set the self specific vars not defined by the generic init (in tool_common)


	return common_init
}//end init



/**
* BUILD
* Builds the tool after init: loads component instances from ddo_map, resolves
* the main_element reference, and prepares the clone component used for
* interactive value editing.
*
* Execution order:
*   1. `tool_common.prototype.build` — loads tool CSS, iterates `tool_config.ddo_map`,
*      instantiates every declared component and populates `self.ar_instances`.
*   2. Identifies `main_element` (the component whose value will be propagated)
*      by matching the `role:"main_element"` entry in ddo_map against ar_instances.
*   3. `get_component_to_propagate()` — creates and saves the temporal clone of
*      main_element that the user edits to set the propagation value.
*
* @param {boolean} [autoload=false] - When true, triggers an immediate data fetch
*   inside the generic build step; forwarded unchanged to tool_common.
* @returns {Promise<boolean>} Resolves to the return value of tool_common.prototype.build.
*/
tool_propagate_component_data.prototype.build = async function(autoload=false) {

	const self = this

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(this, autoload);

	// specific actions.. like fix main_element for convenience
		// main_element. Set and config
		const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==="main_element")
		self.main_element		= self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)

	// init and build the component to propagate
		await self.get_component_to_propagate()


	return common_build
}//end build_custom



/**
* GET_COMPONENT_TO_PROPAGATE
* Creates, configures, and saves a temporary interactive clone of `main_element`
* that the user edits to define the value they want to propagate.
*
* The clone is instantiated with `is_temporal:true` and a synthetic section_id of 1
* so that save() writes to the server-side temporal/session store rather than to any
* real section record. A unique `id_variant` (`'propagate_' + Date.now()`) prevents
* instance-registry collisions when the tool is opened multiple times in a session.
*
* The clone's `context` is a deep copy of main_element.context so it inherits the
* same ontology context (labels, types, etc.) without sharing state.
*
* After `get_instance` + `build`:
*   - `datum` and `data` are deep-copied from main_element so the UI is pre-populated
*     with the source record's current value. `data.section_id` is overwritten to
*     the synthetic id (1) so saves target the temporal section.
*   - `show_interface` flags are adjusted to enable add/link buttons (needed for
*     relation-type components) while hiding the save animation, tools panel, and
*     the list-from-component-data widget — the clone is display-only outside the
*     normal component edit context.
*   - `save()` is called immediately with action `'set_data'` to persist the
*     pre-populated entries into the temporal section; this is the value that
*     `propagate_component_data` will send to the server when the user confirms.
*
* The result is stored as `self.component_to_propagate`.
*
* @returns {Promise<boolean>} Resolves to true on success.
* @throws {Error} Re-throws any error from get_instance, build, or save after logging.
*/
tool_propagate_component_data.prototype.get_component_to_propagate = async function() {

	const self = this

	try {

		const section_id = 1 // fake section id for temporal data

		const instance_options = {
			is_temporal		: true,
			section_tipo	: self.main_element.section_tipo,
			section_id		: section_id,
			model			: self.main_element.model,
			mode			: self.main_element.mode,
			tipo			: self.main_element.tipo,
			lang			: self.main_element.lang,
			type			: self.main_element.type,
			context			: clone(self.main_element.context),
			id_variant		: 'propagate_'+Date.now(),
			standalone		: true,
			caller			: self
		}
		// init
			self.component_to_propagate = await get_instance(instance_options)

		// build
			await self.component_to_propagate.build(true)

		// configure the component
			self.component_to_propagate.datum			= clone(self.main_element.datum)
			self.component_to_propagate.data			= clone(self.main_element.data)
			self.component_to_propagate.data.section_id	= section_id

		// show_interface. Change to add link and add buttons and remove save animation
			self.component_to_propagate.show_interface.button_add				= true
			self.component_to_propagate.show_interface.button_link				= true
			self.component_to_propagate.show_interface.save_animation			= false
			self.component_to_propagate.show_interface.tools					= false
			self.component_to_propagate.show_interface.list_from_component_data	= false

		// set value and save to tmp section (temporal session stored)
			const entries = self.main_element.data?.entries || []
			const changed_data_item = Object.freeze({
				action	: 'set_data', // 'set_data' action replaces entire component value in current language
				value	: entries
			})

			await self.component_to_propagate.save([changed_data_item])

	} catch (error) {
		console.error('Error on get_component_to_propagate:', error)
		throw error
	}

	return true
}//end get_component_to_propagate



/**
* PROPAGATE_COMPONENT_DATA
* Fires the server-side bulk propagation job for the current tool state.
*
* Builds an RQO (Request Query Object) targeting `dd_tools_api → tool_request`,
* which on the server resolves to
*   `tool_propagate_component_data::propagate_component_data(options)`
* (the `source` object produced by create_source encodes this routing).
*
* The propagation value is read from `self.component_to_propagate.data.entries` —
* i.e. whatever the user has edited in the interactive clone built during build.
*
* SQO handling:
*   The active section's `rqo.sqo` is deep-cloned so that modifying `offset`/`limit`
*   does not affect the section's own state. `offset` and `limit` are both reset to 0
*   to tell the server "process all records matching this filter, no pagination".
*   The SQO is validated before the request is sent; if missing or if `self.total`
*   is falsy the method aborts early with an `alert()` and returns undefined.
*
* The job is flagged `background_running: true` so the PHP process detaches and
* returns a PID/pfile pair immediately. The render layer then polls progress via SSE.
* The timeout is set to 3600 seconds (1 hour) to accommodate very large datasets.
*
* (!) SHOW_DEVELOPER is referenced in the `.then` callback but is NOT in the
*     /*global*\/ directive — this is a pre-existing bug; do not change the code.
* (!) alert() is used for error feedback instead of a UI notification — pre-existing.
*
* @param {string} action - Propagation mode: 'replace' | 'add' | 'delete'.
* @returns {Promise<Object>} Resolves with the raw API response object containing at
*   minimum `{ pid, pfile }` — the identifiers used to poll process status via SSE.
*   Rejects when precondition checks (sqo / total) fail, after alerting the user.
*/
tool_propagate_component_data.prototype.propagate_component_data = function(action) {

	const self = this

	// short vars
		const section_tipo			= self.main_element.section_tipo
		const section_id			= self.main_element.section_id
		const component_tipo		= self.main_element.tipo
		const lang					= self.main_element.lang
		const propagate_data_value	= self.component_to_propagate.data.entries
		const bulk_process_text 	= self.get_tool_label('bulk_process_label') || 'Data propagation'
		const action_label 			= self.get_tool_label(action) || action
		const bulk_process_label 	= `${bulk_process_text} | ${action_label}`

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'propagate_component_data')

	// section. Get current SQO
		const section	= self.caller.caller?.caller
		const sqo		= section.rqo && section.rqo.sqo
			? clone(section.rqo.sqo)
			: null

		if (!sqo) {
			console.error('Invalid SQO from section:', section);
			alert("Error. Invalid SQO");
			return Promise.reject(new Error('Invalid SQO'))
		}

		if (!self.total) {
			console.error('Invalid total from section:', section);
			alert("Error. Invalid total");
			return Promise.reject(new Error('Invalid total'))
		}

		// clean sqo
		sqo.offset	= 0
		sqo.limit	= 0

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				background_running		: true, // set run in background CLI
				section_tipo			: section_tipo,
				section_id				: section_id,
				component_tipo			: component_tipo,
				action					: action,
				lang					: lang,
				propagate_data_value	: propagate_data_value,
				bulk_process_label		: bulk_process_label,
				sqo						: sqo,
				total					: self.total
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				use_worker	: true,
				body		: rqo,
				retries : 1, // one try only
				timeout : 3600 * 1000 // 3600 secs waiting response
			})
			.then(function(api_response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> propagate_component_data API api_response:",'DEBUG',api_response);
				}

				resolve(api_response)
			})
		})
}//end propagate_component_data



/**
* ON_CLOSE_ACTIONS
* Hook called by the tool shell (modal or window container) just before or as
* the tool UI is dismissed. Performs cleanup appropriate to how the tool was opened.
*
* When `open_as === 'modal'`:
*   1. Calls `self.caller.refresh()` to trigger a re-render of the originating
*      component, ensuring any propagated changes become visible in the UI.
*      (!) The inline comment "never refresh caller (component_json)" appears to be
*      an obsolete note from an earlier version — the code unconditionally calls
*      refresh(), which contradicts the comment. Do not change either.
*   2. Calls `self.destroy(true, true, true)` to unmount the tool DOM, clear event
*      subscriptions, and remove the instance from the registry.
*
* When opened as a standalone window ('window') nothing is done here — the window
* closing is handled by the browser/window manager outside of this hook.
*
* @param {string} open_as - How the tool was opened: 'modal' | 'window'.
* @returns {Promise<boolean>} Always resolves to true.
*/
tool_propagate_component_data.prototype.on_close_actions = async function(open_as) {

	const self = this

	if (open_as==='modal') {
		self.caller.refresh() // never refresh caller (component_json)
		self.destroy(true, true, true)
	}

	return true
}//end on_close_actions



// @license-end
