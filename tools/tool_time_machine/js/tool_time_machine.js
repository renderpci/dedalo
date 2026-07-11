// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* TOOL_TIME_MACHINE (module)
*
* Client-side controller for the Time Machine tool — a history-viewer and
* value-restorer that lets users browse every past state of a component (or
* an entire section) that was saved to the `matrix_time_machine` table, and
* optionally restore any snapshot to the live record.
*
* Architecture overview
* ---------------------
* The tool is opened as a floating modal or detached window from a section's
* toolbar, with `caller` pointing to the component (or section) whose history
* is being inspected.  The tool instantiates one `service_time_machine` — a
* paginated list of all historical snapshots, sorted by `timestamp DESC`.
* When the user clicks the eye icon on a list row the service publishes the
* `tm_edit_record` event (see `view_tool_time_machine_list.js`); the tool
* subscribes, loads the historical snapshot through `get_component()`, renders
* it in the preview pane, and enables the "Apply and save" button.
*
* Pressing "Apply and save" calls `apply_value()` which posts an
* `apply_value` tool_request to `dd_tools_api`; the PHP handler overwrites
* the live data and logs the restore in the activity log.
*
* Bulk-process support
* --------------------
* When a TM row belongs to a bulk operation (`bulk_process_id` is set) a
* "Revert bulk process" button becomes visible.  Only global-admins can
* execute the revert; regular users see an advisory message directing them
* to contact an admin.  The revert is dispatched via `bulk_revert_process()`.
*
* Prototype inheritance
* ---------------------
*   render   ← tool_common.prototype.render
*   refresh  ← common.prototype.refresh
*   destroy  ← common.prototype.destroy
*   edit     ← render_tool_time_machine.prototype.edit
*
* Key instance properties (set at construction time)
* ---------------------------------------------------
*   service_time_machine   — {Object|null}   the service_time_machine instance
*   selected_matrix_id     — {number|null}   TM row PK chosen by the user
*   button_apply           — {HTMLElement}   "Apply and save" button DOM node
*   preview_component_container — {HTMLElement} container for the TM snapshot
*   caller                 — {Object}        the component/section that opened the tool
*   caller_dataframe       — {Object|null}   dataframe context forwarded to apply_value
*   selected_bulk_process_id — {number|null} bulk-process id of the selected row
*
* (!) SHOW_DEVELOPER is declared in core/common/js/environment.js.php and is
* NOT listed in the file-level /*global*\/ directive above; usages in
* apply_value() and bulk_revert_process() will trigger eslint no-undef.
*
* Exports: {tool_time_machine}
*/

// import
	import {event_manager} from '../../../core/common/js/event_manager.js'
	import {get_instance} from '../../../core/common/js/instances.js'
	import {clone, dd_console} from '../../../core/common/js/utils/index.js'
	import {data_manager} from '../../../core/common/js/data_manager.js'
	import {common, create_source} from '../../../core/common/js/common.js'
	import {tool_common, load_component} from '../../../core/tools_common/js/tool_common.js'
	import {render_tool_time_machine, add_component} from './render_tool_time_machine.js'



/**
* TOOL_TIME_MACHINE
* Constructor for the Time Machine tool instance.
*
* Initialises all instance properties to their null/empty defaults.
* The actual data is populated during `init()` and `build()`.
*
* Properties shared with tool_common / common:
*   @var {string|null}  id              - Unique instance identifier (set by tool_common.init)
*   @var {string|null}  model           - Always 'tool_time_machine'
*   @var {string|null}  mode            - Render mode ('edit', 'list', etc.)
*   @var {string|null}  lang            - Active language code (e.g. 'lg-spa'); inherited from caller
*   @var {HTMLElement|null} node        - Root DOM node after render
*   @var {Array|null}   ar_instances    - Child component/service instances managed by this tool
*   @var {string|null}  status          - Lifecycle status token
*   @var {Array}        events_tokens   - Subscription tokens returned by event_manager.subscribe;
*                                         used to unsubscribe on destroy()
*   @var {string|null}  type            - DDO type identifier
*
* Properties specific to tool_time_machine:
*   @var {Object|null}      caller               - The component or section instance that opened the tool
*   @var {Object|null}      service_time_machine - Loaded service_time_machine instance (paginated list)
*   @var {HTMLElement|null} button_apply         - "Apply and save" button; shown after user selects a row
*   @var {number|null}      selected_matrix_id   - PK of the currently selected TM row (dd1573 value)
*   @var {HTMLElement|null} modal_container      - Container node when the tool is opened as a modal
*                                                  (unused in the current implementation — reserved)
*/
export const tool_time_machine = function () {

	this.id						= null
	this.model					= null
	this.mode					= null
	this.lang					= null
	this.node					= null
	this.ar_instances			= null
	this.status					= null
	this.events_tokens			= []
	this.type					= null

	this.caller					= null
	this.service_time_machine	= null
	this.button_apply			= null
	this.selected_matrix_id		= null
	this.modal_container		= null
}//end tool_time_machine



/**
* COMMON FUNCTIONS
* Extend tool_time_machine with shared lifecycle and render methods.
*
* Assignments:
*   render  — tool_common.prototype.render  : handles wrapper creation and
*             delegates to this.edit() for content assembly
*   refresh — common.prototype.refresh      : rebuilds and re-renders without
*             full destroy; used when the user switches lang in the selector
*   destroy — common.prototype.destroy      : unsubscribes event tokens stored
*             in this.events_tokens, removes DOM node, clears ar_instances
*   edit    — render_tool_time_machine.prototype.edit : assembles the full
*             content_data layout (current + preview panes, toolbar, TM list)
*/
// prototypes assign
	tool_time_machine.prototype.render	= tool_common.prototype.render
	tool_time_machine.prototype.refresh	= common.prototype.refresh
	tool_time_machine.prototype.destroy	= common.prototype.destroy
	tool_time_machine.prototype.edit	= render_tool_time_machine.prototype.edit



/**
* INIT
* Initialises the tool instance state and subscribes to the cross-component
* event that drives the preview pane.
*
* Execution order:
*   1. Calls tool_common.prototype.init to load context, ddo_map, labels, and
*      reconstruct the caller reference (including the new-window path).
*   2. Copies `dedalo_projects_default_langs` from page_globals for the lang
*      selector rendered in `get_content_data`.
*   3. Inherits the active language from the caller component (null when opened
*      on a section, which has no meaningful single lang).
*   4. Subscribes to `tm_edit_record` — published by
*      `view_tool_time_machine_list.js` whenever the user clicks the eye icon
*      on a history row.  The handler loads the historical snapshot, renders it
*      in the preview pane, updates `selected_matrix_id`, and shows/hides the
*      apply and bulk-revert controls.
*
* Bulk-process handling inside the handler:
*   - When `data.bulk_process_id` is truthy the row belongs to a batch
*     operation.  Global admins see the operation label fetched via
*     `get_bulk_process_label()`; other users see a static advisory message.
*   - When `data.bulk_process_id` is falsy the bulk-revert controls are hidden
*     and `selected_bulk_process_id` is cleared.
*
* @param {Object} options - Initialisation options forwarded to tool_common.prototype.init
* @returns {Promise<boolean>} Resolves with the value returned by tool_common.prototype.init
*/
tool_time_machine.prototype.init = async function(options) {

	const self = this

	// call the generic common tool init
		const common_init = await tool_common.prototype.init.call(this, options);

	// fix dedalo_projects_langs
		self.langs = page_globals.dedalo_projects_default_langs

	// fix lang from caller
		self.lang = self.caller && self.caller.lang
			? self.caller.lang
			: null

	// events subscribe. Published when user clicks on list record eye icon (preview)
		const fn_tm_edit_record = async function(data) {

			const matrix_id = data.matrix_id
			// Render the timestamp component in text mode to obtain a human-readable label
			const modification_component_date = data.modification_component_date
			modification_component_date.view = 'text'
			const label = (await modification_component_date.render()).textContent;

			// render. Create and add new component to preview container
			const load_mode = 'tm' // (!) Remember use tm mode to force component to load data from time machine table
			add_component(
				self,
				self.preview_component_container,
				self.lang,
				label,
				load_mode,
				matrix_id
			)

			// fix selected matrix_id
			self.selected_matrix_id = matrix_id
			// show Apply button
			self.button_apply.classList.remove('hide','lock')

			// bulk process remove the hide when the selected row has a bulk_process_id
			// only global_admin can use it.
			// if user pick a row with bulk_process_id it will show a message.
			if( data.bulk_process_id ){
				self.selected_bulk_process_id = data.bulk_process_id
				if( self.button_bulk_revert_process ){
					self.button_bulk_revert_process.classList.remove('hide','lock')
				}

				// Global admins see the actual process label; everyone else gets an advisory.
				const label_bulk_revert_text = ( page_globals.is_global_admin === true )
					? await self.get_bulk_process_label({
						bulk_process_id : data.bulk_process_id
					})
					: self.get_tool_label('info_revert_bulk_process') || 'To revert this bulk process contact an administrator.'


				self.label_bulk_revert_process.innerHTML = label_bulk_revert_text


				self.label_bulk_revert_process.classList.remove('hide','lock')
			}else{
				// Row has no bulk_process_id — clear bulk controls
				self.selected_bulk_process_id = null
				self.button_bulk_revert_process.classList.add('hide','lock')
				self.label_bulk_revert_process.classList.add('hide','lock')
			}
		}//end fn_tm_edit_record
		self.events_tokens.push(
			event_manager.subscribe('tm_edit_record', fn_tm_edit_record)
		)


	return common_init
}//end init



/**
* BUILD (CUSTOM)
* Extends tool_common.prototype.build with Time Machine-specific setup:
* loading the main element (component or section being inspected) and wiring
* up the `service_time_machine` instance that renders the history list.
*
* Step-by-step:
*   1. Lang sync on ddo_map — before calling common build, iterate each entry
*      and update any translatable item's lang to `self.lang`.  This is
*      required on refresh-triggered rebuilds (lang switch) so the tool does
*      not request data in the wrong language.
*   2. Call tool_common.prototype.build — loads all ddo_map items via the API
*      and initialises child instances except 'section' model items (which
*      tool_common skips; see step 3).
*   3. Section special-case — when the main_element ddo has model='section'
*      the section instance is not created by tool_common, so build creates it
*      here manually with `get_instance` + `build(true)`.
*   4. Locate `main_element` in ar_instances by tipo match.
*   5. Build the `ddo_map` for service_time_machine:
*        - For a component target: a single synthetic ddo with mode='tm'.
*        - For a section target: the section's own `request_config_object.show.ddo_map`
*          (which lists all components belonging to that section).
*   6. Compute `ignore_columns` — for section targets the 'where' column (dd577)
*      is suppressed because a section restore does not have a single component
*      address to display.
*   7. Instantiate `service_time_machine` via `get_instance` and build it with
*      autoload=true.  Throws a string on failure so the catch block surfaces
*      the error through `self.error` without crashing the caller.
*   8. Force `caller_is_calculated = false` to prevent the new-window
*      reconstructed caller from being reused on the next lang-switch refresh
*      (which would recreate instances with stale context).
*
* @param {boolean} [autoload=false] - Passed through to tool_common.prototype.build
*                                     to control whether ddo_map items are
*                                     auto-fetched on first load
* @returns {Promise<boolean>} Resolves with the value from tool_common.prototype.build
*/
tool_time_machine.prototype.build = async function(autoload=false) {

	const self = this

	// ddo_map. Update ddo_map elements lang before common build
		// Note that when user switch lang from tool lang selector, we need refresh whole tool
		// re-building ddo_map from tool_common. To prevent re-create the first ddo_map items
		// it its necessary to update the items lang before (only for translatable elements)
		self.tool_config.ddo_map = self.tool_config.ddo_map || []
		const ddo_map_length = self.tool_config.ddo_map.length
		for (let i = 0; i < ddo_map_length; i++) {
			const item = self.tool_config.ddo_map[i]
			// Only update items with an explicit lang; nolan items carry lang-neutral data
			if (item.lang && item.lang!==page_globals.dedalo_data_nolan) {
				item.lang = self.lang
			}
		}

	// call generic common tool build
		const common_build = await tool_common.prototype.build.call(self, autoload);

	// service_time_machine
		try {

			// fix main_element for convenience
				const main_element_ddo	= self.tool_config.ddo_map.find(el => el.role==='main_element')

			// section case. (!) note that section is not loaded automatically from tool common build
				if (main_element_ddo.model==='section') {
					const section_options = {
						model			: main_element_ddo.model,
						mode			: main_element_ddo.mode,
						tipo			: main_element_ddo.tipo,
						section_tipo	: main_element_ddo.section_tipo,
						section_id		: main_element_ddo.section_id,
						lang			: main_element_ddo.lang,
						type			: main_element_ddo.type,
						properties 		: main_element_ddo.properties || null,
						id_variant		: self.model,  // id_variant prevents id conflicts
						caller			: self // set tool as caller of the element :-)
					}
					const instance = await get_instance(section_options) // load and init
					await instance.build(true)
					self.ar_instances.push(instance)
				}

			// fix main_element
				self.main_element = self.ar_instances.find(el => el.tipo===main_element_ddo.tipo)
				if (!self.main_element) {
					console.error('Error: main_element_ddo not found in self.ar_instances', self.ar_instances)
				}

			// ddo_map for service_time_machine. Section uses is request_config_object show
			// NOTE: The ddo_map will be changed in service_time_machine to mode = list
				const ddo = {
					tipo			: self.main_element.tipo,
					type			: self.main_element.type,
					typo			: 'ddo',
					model			: self.main_element.model,
					section_tipo	: self.main_element.section_tipo,
					parent			: self.main_element.section_tipo,
					label			: self.main_element.label,
					mode			: 'tm',
					view			: 'text'
				}

				// For section targets re-use the section's own ddo_map so all
				// components in that section appear in the history list.
				const ddo_map = self.main_element.model==='section'
					? self.main_element.request_config_object.show.ddo_map
					: [ddo]

			// // ignore_columns
				// Suppress the 'where' column (dd577, component tipo) for section
				// restores because a full-section snapshot has no single component address.
				const ignore_columns = self.main_element.model==='section'
					? [
			// 			'dd1573', // matrix_id
			// 			'dd1371', // bulk_process_id
			// 			'dd559', // when
						// 'who', // 'dd578'
						'where' // 'dd577'
						]
					: []

			//  // template_columns
			// 	const template_columns = self.main_element.model==='section'
			// 		? null
			// 		: [
			// 			// '8rem', // id
			// 			'8rem', // tm matrix_id
			// 			'8rem', // tm bulk_process_id
			// 			'11.2rem', // date (when)
			// 			'16rem', // user (who)
			// 			'1fr', // component (where)
			// 			'1fr', // annotation
			// 			'5fr' // tm value
			// 		  ].join(' ')

			// service_time_machine. Create, build and assign the time machine service to the instance
			// config is used in service_time_machine to get the ddo_map and send it to API
				const config = {
					id					: 'tool_tm',
					model				: self.main_element.model,
					tipo				: self.main_element.tipo,
					lang				: self.main_element.lang,
					// template_columns	: template_columns,
					ignore_columns		: ignore_columns,
					ddo_map				: ddo_map
				}
				const instance_options = {
					model			: 'service_time_machine',
					// (!) section_tipo / section_id come from the CALLER (live record),
					// not from main_element — the service filters TM rows by those values.
					section_tipo	: self.caller.section_tipo,
					section_id		: self.caller.section_id,
					view			: 'tool',
					id_variant		: self.main_element.tipo +'_'+ self.model,
					caller			: self,
					config			: config
				}
				self.config = config

				self.service_time_machine = await get_instance(instance_options)

			// build service_time_machine
				const build_result = await self.service_time_machine.build(true)
				if (!build_result) {
					throw 'Invalid service_time_machine build. See server log for details.'
				}

			// add to self instances list
				self.ar_instances.push(self.service_time_machine)

			// (!) force self.caller_is_calculated as false to avoid to re-use calculated
			// component instances on lang change
				self.caller_is_calculated = false

		} catch (error) {
			self.error = error
			console.error(error)
		}


	return common_build
}//end build



/**
* GET_COMPONENT
* Creates and returns a component instance loaded with data from a specific
* `matrix_time_machine` row, to be placed in the preview pane.
*
* The new instance is built from a deep clone of `self.main_element.context`
* so that the original live component is not mutated.  The clone is then
* augmented with:
*   - `matrix_id`    — TM row PK (dd1573); signals the API to read from
*                      `matrix_time_machine` instead of the regular table.
*   - `data_source: 'tm'` — forwarded into the source object by `create_source`
*                      so the server-side reader knows to query TM storage.
*   - `mode: 'edit'` — forced to 'edit' regardless of the `mode` argument;
*                      the render step later sets permissions=1 (read-only).
*   - `to_delete_instances` — any previous TM-preview instances with the same
*                      tipo are marked for deletion inside `load_component`,
*                      preventing stale previews from accumulating in
*                      `ar_instances`.
*
* (!) The `mode` parameter is accepted but overridden by the hardcoded
* `'edit'` value in the options object.  This was intentional (force edit
* context for proper rendering) but may be surprising to callers.
*
* @param {string}       lang      - Language code to request data in (e.g. 'lg-spa')
* @param {string}       mode      - Requested render mode (currently overridden to 'edit' internally)
* @param {number|null}  [matrix_id=null] - PK of the `matrix_time_machine` row to preview;
*                                          null is only valid for the current-value pane
* @returns {Promise<Object>} Resolves with the loaded component instance
*/
tool_time_machine.prototype.get_component = async function(lang, mode, matrix_id=null) {

	const self = this

	// to_delete_instances. Select instances with same tipo and property matrix_id not empty
		// Collect any existing TM-preview instances so load_component can remove them
		// after the new one is ready (avoids accumulating ghost instances in ar_instances).
		const to_delete_instances = self.ar_instances.filter(el => el.tipo===self.main_element.tipo && el.matrix_id)

	// instance_options (clone context and edit)
		// Clone main_element.context so the live component is not mutated,
		// then overlay TM-specific options.
		const options = Object.assign(clone(self.main_element.context), {
			self				: self,
			lang				: lang,
			mode				: 'edit', // mode,
			section_id			: self.main_element.section_id,
			matrix_id			: matrix_id,
			data_source			: 'tm',
			to_delete_instances	: to_delete_instances, // array of instances to delete after create the new on
		})

	// call generic common tool build
		const component_instance = await load_component(options);


	return component_instance
}//end get_component



/**
* APPLY_VALUE
* Sends a tool_request to `dd_tools_api` asking the server to overwrite the
* live component data with the historical snapshot identified by `matrix_id`.
*
* The server-side handler (`tool_time_machine::apply_value` in PHP) will:
*   - Read the `matrix_time_machine` row for `matrix_id`.
*   - Write that data back to the live component (or section) via `set_data`
*     + `save()`.
*   - Log the restore as a RECOVER COMPONENT/SECTION activity entry.
*   - Delete the TM row that was just restored.
*
* Dataframe context: when `self.caller_dataframe` is set (the tool was opened
* on a dataframe-paired component), it is forwarded so the PHP handler can
* correctly route the restore to the right dataframe slot.
*
* Timeout is intentionally generous (60 s) because section restores can
* involve a large number of components.
*
* (!) SHOW_DEVELOPER is a page-global not listed in the file /*global*\/ annotation;
* references on line 368 will produce an eslint no-undef warning at lint time.
*
* @param {Object} options              - Restore parameters
* @param {number} options.section_id  - Section ID of the live record to restore into
* @param {string} options.section_tipo - Section tipo of the live record
* @param {string} options.tipo        - Component tipo being restored (equals section_tipo for section restores)
* @param {string} options.lang        - Language code of the data to restore
* @param {number} options.matrix_id   - PK of the `matrix_time_machine` row containing the snapshot
* @returns {Promise<Object>} Resolves with the API response object
*                            ({result: boolean, msg: string, errors: Array})
*/
tool_time_machine.prototype.apply_value = function(options) {

	const self = this

	// options
		const section_id	= options.section_id
		const section_tipo	= options.section_tipo
		const tipo			= options.tipo
		const lang			= options.lang
		const matrix_id		= options.matrix_id

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'apply_value')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				section_id		: section_id,
				section_tipo	: section_tipo,
				tipo			: tipo,
				lang			: lang,
				matrix_id		: matrix_id
			}
		}

	// dataframe caller
		// Forward the dataframe context so the PHP handler routes the restore
		// to the correct dataframe slot when the component is dataframe-paired.
		if (self.caller_dataframe) {
			rqo.options.caller_dataframe = self.caller_dataframe
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 60 * 1000 // 60 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> apply_value API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end apply_value



/**
* BULK_REVERT_PROCESS
* Sends a tool_request to revert ALL changes that belong to a previous bulk
* operation identified by `bulk_process_id`.
*
* This is a potentially long-running, wide-scope operation: the PHP handler
* searches `matrix_time_machine` for every row with the given `bulk_process_id`,
* iterates each affected component, and restores the component to its state
* immediately prior to the bulk change.  If a component had no pre-bulk
* history the handler writes an empty array.
*
* The operation is recorded as a new bulk-process entry in the
* `DEDALO_BULK_PROCESS_SECTION_TIPO` (dd800) section so that this revert is
* itself reversible via a subsequent bulk_revert_process call.
*
* Access control: only global admins can trigger the bulk-revert UI button
* (enforced in `render_tool_time_machine`), but the server enforces its own
* per-row permission check via `security::assert_tipo_permission` and
* `security::assert_record_in_user_scope`.  Rows the caller cannot write are
* skipped and recorded in `response.errors`.
*
* Timeout is set to 180 s to accommodate very large bulk processes spanning
* hundreds of records.
*
* (!) SHOW_DEVELOPER is a page-global not listed in the file /*global*\/ annotation;
* the reference on line 425 will produce an eslint no-undef warning at lint time.
*
* Note: the `options` property key is `selected_bulk_process_id` (not
* `bulk_process_id`); the local variable `bulk_process_id` is read from
* `options.selected_bulk_process_id` — callers must use that key name.
*
* @param {Object} options                          - Revert parameters
* @param {number} options.section_id              - Section ID of the record that opened the tool
* @param {string} options.section_tipo            - Section tipo of the record
* @param {string} options.tipo                    - Component tipo of the record
* @param {string} options.lang                    - Active language code
* @param {number} options.selected_bulk_process_id - The bulk_process_id (dd1371) to revert
* @param {string} options.bulk_revert_process_label - Human-readable name logged as the new process label
* @returns {Promise<Object>} Resolves with the API response object
*                            ({result: boolean, msg: string, errors: Array})
*/
tool_time_machine.prototype.bulk_revert_process = function(options) {

	const self = this

	// options
		const section_id				= options.section_id
		const section_tipo				= options.section_tipo
		const tipo						= options.tipo
		const lang						= options.lang
		// (!) The key is 'selected_bulk_process_id', not 'bulk_process_id'
		const bulk_process_id			= options.selected_bulk_process_id
		const bulk_revert_process_label	= options.bulk_revert_process_label

	// source. Note that second argument is the name of the function to manage the tool request like 'revert_process'
	// this generates a call as my_tool_name::my_function_name(options)
		const source = create_source(self, 'bulk_revert_process')

	// rqo
		const rqo = {
			dd_api	: 'dd_tools_api',
			action	: 'tool_request',
			source	: source,
			options	: {
				section_id					: section_id,
				section_tipo				: section_tipo,
				tipo						: tipo,
				lang						: lang,
				bulk_process_id				: bulk_process_id,
				bulk_revert_process_label	: bulk_revert_process_label
			}
		}

	// call to the API, fetch data and get response
		return new Promise(function(resolve){

			data_manager.request({
				body : rqo,
				retries : 1, // one try only
				timeout : 180 * 1000 // 180 secs waiting response
			})
			.then(function(response){
				if(SHOW_DEVELOPER===true) {
					dd_console("-> bulk revert_process API response:",'DEBUG',response);
				}

				resolve(response)
			})
		})
}//end bulk_revert_process



/**
* GET_BULK_PROCESS_LABEL
* Fetches the human-readable label string stored in the bulk-process section
* (dd800) for the given `bulk_process_id`.
*
* The bulk-process section (DEDALO_BULK_PROCESS_SECTION_TIPO = 'dd800') stores
* one record per bulk operation, where:
*   - section_id  = bulk_process_id (the PK doubles as the record id)
*   - dd796       = DEDALO_BULK_PROCESS_LABEL_TIPO, a component_input_text that
*                   holds the operation's human-readable name
*
* The method bypasses tool_request and calls `dd_core_api` directly with
* action='read' and a manually constructed source object, because the label
* lives in a standard core component — no tool-specific dispatch is needed.
*
* The source object here is built inline rather than through `create_source()`
* because this reads a different section/component than the one the tool is
* managing; `create_source()` would populate the wrong tipo/section_tipo.
*
* (!) SHOW_DEVELOPER is a page-global not listed in the file /*global*\/ annotation;
* the reference on line 710 will produce an eslint no-undef warning at lint time.
*
* @param {Object} options                    - Options
* @param {number} options.bulk_process_id    - The bulk-process id (dd1371 value); used
*                                             as both the filter value and as section_id
*                                             when reading the dd800 record
* @returns {Promise<string|null>} Resolves with the label text, or null/false when
*                                 the record is not found or the API call fails
*/
tool_time_machine.prototype.get_bulk_process_label = async function(options){

	const self = this

	const bulk_process_id	= options.bulk_process_id
	// dd800 = DEDALO_BULK_PROCESS_SECTION_TIPO; dd796 = DEDALO_BULK_PROCESS_LABEL_TIPO
	const section_tipo		= 'dd800'
	const component_tipo	= 'dd796'

	// source. Note that second argument is the name of the function to manage the tool request like 'apply_value'
	// this generates a call as my_tool_name::my_function_name(options)
		// (!) source is built inline — not via create_source() — because we are
		// reading from a different section (dd800) than the tool's own target.
		const source = {
			typo			: 'source',
			type			: 'component',
			action			: 'get_value',
			tipo			: component_tipo,
			section_tipo	: section_tipo,
			section_id		: bulk_process_id,
		}

	// rqo
		const rqo = {
			dd_api	: 'dd_core_api',
			action	: 'read',
			source	: source
		}

	// call to the API, fetch data and get response
		const api_response = await data_manager.request({
			body : rqo
		})
		if(SHOW_DEVELOPER===true) {
			console.log("-------------> get_value:",'DEBUG', api_response.result);
		}

		// user messages
		// const msg_type = (api_response.result===false) ? 'error' : 'ok'
		// ui.show_message(buttons_container, api_response.msg, msg_type)

	// Returns the raw result value: a string label, or null/false on failure
	return api_response.result
}//end get_bulk_process_label



// @license-end
