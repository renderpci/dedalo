// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, SHOW_DEBUG, SHOW_DEVELOPER, Promise */
/*eslint no-undef: "error"*/



/**
* COMPONENT_COMMON
* Prototype mixin that provides the shared lifecycle, data, and event methods for
* every Dédalo component instance (component_input_text, component_select, etc.).
*
* This module does NOT extend `common.js` — it replaces or wraps several of its
* prototype methods with component-specific behaviour. The public prototype chain is:
*
*   ComponentXxx → component_common.prototype → common.prototype
*
* Lifecycle order for every component instance:
*   init(options) → build(autoload) → render({render_level}) →
*   [change_value / save cycles] → refresh() → destroy()
*
* Status state machine (self.status):
*   'initializing' → 'initialized' → 'building' → 'built'
*   → 'rendering' → 'rendered' → 'changing' → 'destroyed'
*
* Key data shapes:
*   datum  : { data: Array<DataItem>, context: Array<ContextItem> }
*             Shared with the parent section; portals have their own datum.
*   data   : DataItem — { tipo, section_tipo, section_id, mode, lang,
*                          entries: Array<*>, changed_data: Array<ChangedDataItem> }
*   db_data: DataItem — snapshot of `data` as last returned by the server.
*                       Used by set_changed_data / save to detect genuine edits.
*
* Exported named functions (module-level, not on the prototype):
*   init_events_subscription — wires ontology-driven observer events once per build.
*   check_unsaved_data       — prompt/auto-save guard for navigation events.
*   save_unsaved_components  — sweep all instances and flush pending changed_data.
*   deactivate_components    — click-away handler that deactivates the active component.
*   is_empty                 — check whether a component instance has no user data.
*   activate_edit_in_list    — unified inline-or-modal edit entry point for list views.
*
* Re-exported from dataframe.js (backwards-compatibility shim):
*   get_dataframe, delete_dataframe, attach_item_dataframe
*/



// imports
	import { clone, dd_console, is_equal } from '../../common/js/utils/index.js'
	import { event_manager } from '../../common/js/event_manager.js'
	import { set_before_unload,dd_request_idle_callback } from '../../common/js/events.js'
	import { data_manager } from '../../common/js/data_manager.js'
	import { get_instance, get_all_instances } from '../../common/js/instances.js'
	import { set_context_vars, create_source } from '../../common/js/common.js'
	import { events_subscription } from './events_subscription.js'
	import { ui } from '../../common/js/ui.js'
	import { set_element_css } from '../../page/js/css.js'



/**
* COMPONENT_COMMON
* Base constructor for the component_common mixin.
* Every concrete component class (component_input_text, etc.) inherits from this
* via prototype chaining: `ComponentXxx.prototype = Object.create(component_common.prototype)`.
* The constructor itself is a no-op; all setup happens in `init()`.
*/
export const component_common = function(){

	return true
}//end component_common



/**
* INIT
* Seeds all well-known instance properties from `options` and attaches shared
* event subscriptions. Must be called exactly once per instance.
*
* Acts as the component-specific replacement for common.prototype.init(): it
* sets component-only properties (mode, lang, column_id, standalone, etc.) that
* the base common.init() does not cover.
*
* (!) A second call on the same instance is treated as a programming error: it
* logs a console.error and — in debug mode — fires alert(). Always guard creation
* paths so init() runs only once.
*
* Subscription order matters: events_subscription(self) wires the shared
* sync_data / hilite handlers first, then the concrete component's own
* self.events_subscription() (if defined) adds model-specific subscriptions.
* init_events_subscribed is deliberately left false here; it is flipped to true
* inside init_events_subscription(), called during build().
*
* @param {Object} options - Instance initialization bag (see `get_instance`)
* @param {string} options.model - Component class name, e.g. 'component_input_text'
* @param {string} options.tipo - Ontology tipo of this component, e.g. 'dd345'
* @param {string} options.section_tipo - Ontology tipo of the parent section, e.g. 'oh1'
* @param {string|number} options.section_id - Record identifier within the section
* @param {string|null} [options.matrix_id] - Time-machine matrix row id (list_tm mode only)
* @param {string} options.mode - Render mode: 'edit', 'list', 'search', 'tm', etc.
* @param {string} options.lang - Active language tag, e.g. 'lg-nolan'
* @param {string|null} [options.column_id] - Column id when rendering as a grid column
* @param {string} [options.type='component'] - Instance type classifier
* @param {string} options.section_lang - Section-level language tag, e.g. 'lg-eng'
* @param {string} options.parent - Ontology tipo of the structural parent group
* @param {Object|null} [options.context=null] - Server-resolved context (properties, tools, permissions, etc.)
* @param {Object|null} [options.data=null] - Resolved component data for the current record
* @param {Object|null} [options.datum=null] - Full datum shared with parent section
* @param {boolean} [options.is_temporal=false] - True for transient data used in tools
* @param {*} [options.data_source] - Caller-supplied data source hint
* @param {string} [options.view] - View variant, e.g. 'default', 'line'
* @param {Object|null} [options.caller] - Parent instance that owns this component
* @param {boolean} [options.standalone=true] - When true the component fetches its own data;
*   when false it relies on the parent section's shared datum to reduce API calls.
* @param {Object} [options.properties] - Raw ontology properties object
* @returns {Promise<boolean>} Always resolves true on success, false on duplicate-init error
*/
component_common.prototype.init = async function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

	// instance key used vars
		self.model			= options.model // structure model like 'component_input_text'
		self.tipo			= options.tipo // structure tipo of current component like 'dd345'
		self.section_tipo	= options.section_tipo // structure tipo like 'oh1'
		self.section_id		= options.section_id // record section_id like 1
		self.matrix_id		= options.matrix_id || null // record matrix_id like 1 (list_tm mode only)
		self.mode			= options.mode // current component mode like 'edit'
		self.lang			= options.lang // current component lang like 'lg-nolan'
		self.column_id		= options.column_id // id of the column when the instance is created to render a column list.
		self.type			= options.type || 'component' // a instance type

		self.section_lang	= options.section_lang // current section lang like 'lg-eng'
		self.parent			= options.parent // tipo of structure parent like a section group 'dd4567'

	// optional vars
		self.context		= options.context	|| null // structure context of current component (include properties, tools, etc.)
		self.data			= options.data		|| null // current specific data of this component
		self.datum			= options.datum		|| null // global data including dependent data (used in portals, etc.)
		self.is_temporal	= options.is_temporal ?? false // temporal data (used in tools, etc.)

	// data_source
		self.data_source = options.data_source

	// DOM
		self.node			= null // node place in light DOM

	// var containers
		self.events_tokens	= [] // array of events of current component
		self.ar_instances	= [] // array of children instances of current instance (used for components, etc.)
		self.services		= [] // array of services instances of current instance (used for autocomplete, etc.)

	// view
		self.view = options.view

	// caller pointer
		self.caller			= options.caller

	// standalone
		// Set the component to manage his data by itself, calling to the database and it doesn't share his data with other through datum
		// if the property is set to false, the component will use datum to get his data and is forced to update datum to share his data with others
		// false option is used to reduce the calls to API server and database, section use to load all data with 1 call and components load his data from datum
		// true options is used to call directly to API and manage his data, used by tools or services that need components standalone.
		self.standalone		= options.standalone ?? true

	// active. Active status (true|false) is set by ui.component.activate/deactivate
		self.active = false

	// properties
		self.properties = options.properties

	// pagination info
		// self.pagination = (self.data && self.data.pagination)
		// 	? self.data.pagination
		// 	: { // pagination info (used in portals, etc.)
		// 		total	: 0,
		// 		offset	: 0,
		// 		limit	: 0
		// 	}

	// set_context_vars. Common context vars re-updated after new build
		// set_context_vars(self, self.context)

	// value_pool. queue of component value changes (needed to avoid parallel change save collisions)
		self.change_value_pool = []

	// is_data_changed. bool set as true when component data changes.
		self.is_data_changed = false

	// events subscription
		self.init_events_subscribed = false // initial value (false) is changed on build
		// Two calls:
		// first; set the component_common events, the call is not in the instance and assign the self in the call
		// second; set the specific events of the components, they are part of the instance
		events_subscription(self)
		// set the component events (it could had his own definition or not) in the instance.
		if(typeof self.events_subscription==='function'){
			self.events_subscription()
		}

	// save status. While save action is running, is set to true to prevent save overlapping
		self.saving = false

	// DES
		// component_save (when user change component value) every component is looking if the own the instance was changed.
			/*
			self.events_tokens.push(
				event_manager.subscribe('save_component_'+self.id, (saved_component) => {
					// call component
						console.log("saved_component:",saved_component);
					self.save(saved_component)
					.then( response => { // response is saved_component object

					})
				})
			)
			*/
			//console.log("self.model:",self.model);
			//console.log("self.model:",self.tipo);
			//console.log("self.paginator_id:",self.paginator_id);

		//	self.events_tokens.push(
		//		event_manager.subscribe('paginator_destroy'+self.paginator_id, (active_section_record) => {
		//			// debug
		//			if (typeof self.destroy!=="function") {
		//				console.error("Error. Component without destroy method: ",self);
		//			}
		//			self.destroy()
		//		})
		//	)

		// component_save (when user change component value) every component is looking if the own the instance was changed.
		//event_manager.subscribe('rebuild_nodes_'+self.id, (changed_component) => {
		//	// call component
		//
		//	self.rebuild_nodes(changed_component)
		//	.then( response => { // response is changed_component object
		//
		//	})
		//})

		//event_manager.publish('component_init', self)

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Resolves and locks in the component's context and data, then wires observer
* events for the first time. The entry point for both standalone autoload
* (where the method calls the API itself) and injected-data scenarios (where
* the caller section pre-populates context/data before calling build).
*
* Concurrent build calls are serialised: if a build is already in progress,
* the method returns the pending `_build_waiter` Promise so all callers share
* the same result without duplicate API round-trips. A second call on an
* already-built instance returns true immediately.
*
* After build() resolves, the following are guaranteed:
*   - self.context   is the server-resolved context object for this component
*   - self.data      is the current data item for (tipo, section_tipo, section_id)
*   - self.db_data   is a deep clone of self.data as returned by the server
*   - self.status    === 'built'
*   - event_manager has published 'built_' + self.id
*
* @param {boolean} [autoload=false] - When true the component fetches its own
*   context and data from the API. When false (default), the caller is expected
*   to have injected context and data via options before calling build().
* @returns {Promise<boolean>} Resolves true on success
*/
component_common.prototype.build = async function(autoload=false) {

	const self = this

	// check status
		switch (self.status) {
			case 'building':
				return self._build_waiter;
			case 'built':
				return true;
		}

		self.status = 'building'
		self._build_waiter = new Promise(async (resolve) => {
			const result = await do_build(self, autoload)
			// status update
			self.status = 'built'
			event_manager.publish('built_' + self.id, self)
			resolve(result)
		})

	return self._build_waiter
}//end component_common.prototype.build


/**
* DO_BUILD
* Internal implementation of build() — executed exactly once per lifecycle,
* wrapped inside `_build_waiter` to serialise concurrent callers.
*
* Responsibilities:
*  1. Ensure datum and data have safe default shapes.
*  2. Resolve request_config_object (main-type Dédalo API config entry).
*  3. If autoload is true: fetch context + data from the API, then update datum
*     (shared path for non-standalone, private copy for standalone).
*  4. Call set_context_vars() to push context-derived properties onto the instance.
*  5. Call init_events_subscription() to wire ontology-driven observer events.
*  6. Take a deep-clone snapshot into db_data (baseline for change detection).
*
* @param {Object} self - The component instance being built
* @param {boolean} autoload - Whether to fetch data from the API
* @returns {Promise<boolean>} true on success, false when the API returns no valid context
*/
const do_build = async (self, autoload) => {

	// self.datum. On building, if datum is not created, creation is needed
		// if (!self.datum) self.datum = {data:[]}
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {
			entries : null
		}
		// changed_data. Set as empty array always
		self.data.changed_data = []

	// request_config_object
		if (!self.context) {
			// request_config_object. get the request_config_object from request_config
			self.request_config_object = self.request_config
				? self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
				: {}
		}else{
			// request_config_object. get the request_config_object from context
			self.request_config_object = self.context && self.context.request_config
				? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
				: {}
		}

	// load data on auto-load true
	// when the auto-load if false the data will be injected by the caller (as section_record or others)
		if (autoload===true) {

			// rqo. Request Query Object
				const rqo = {
					source	: create_source(self, 'get_data'),
					action	: 'read'
				}

			// data_manager get context and data from the database
				const api_response = await data_manager.request({
					body : rqo
				})

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build component context
				if(!api_response.result.context?.length){
					console.error("Error!!!!, component without context:", api_response, rqo);
					return false
				}

				if(SHOW_DEVELOPER===true) {
				// console.log(`COMPONENT ${self.model} api_response:`,self.id, api_response);
					dd_console(`[component_common.build] COMPONENT: ${self.model} api_response:`, 'DEBUG', api_response)
				}

			// Context
				if(!self.context){
					const context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context
					}
				}

			// data
				const data = api_response.result.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && String(el.section_id)===String(self.section_id))
				if(!data){
					console.warn("data not found in api_response:",api_response);
				}
				self.data = data || {}

			// Update datum when the component is not standalone, it's dependent of section or others with common datum
				if(!self.standalone){
					// update shared datum
					await self.update_datum(api_response.result)
				}else{
					// set 'private' datum
					self.datum.context	= api_response.result.context
					self.datum.data		= api_response.result.data
				}

			// rqo. build again rqo with updated request_config if exists
				// if (self.context.request_config) {
				// 	self.rqo.show = self.build_rqo('show', self.context.request_config, 'get_data')
				// }
		}

	// update instance properties from context:
	// 	type, label, tools, value_separator, permissions
	// Note that 'show_interface' is assigned here with criteria: self.context.properties.show_interface || self.request_config_object.show_interface
		set_context_vars(self, self.context)

	// subscribe to the observer events (important: only once)
		init_events_subscription(self)

	// set the server data to preserve the data that is already saved in DDBB
		self.db_data = clone(self.data)

	// status update
		self.status = 'built'

	// dd_console(`__Time to build component: ${(performance.now()-t0).toFixed(3)} ms`,'DEBUG', [self.tipo,self.model])


	return true
}//end do_build



/**
* INIT_EVENTS_SUBSCRIPTION
* Wires the ontology-driven observer subscriptions declared in
* context.properties.observe for the component instance `self`.
*
* The observe array lives in the ontology (not in code) and controls
* inter-component reactivity: one component can watch another's value changes
* and react (e.g. auto-refresh) without the observable needing to know its
* observers. A typical use is a calculated-field component listening to a
* radio-button's 'update_value' event to trigger a refresh.
*
* Each observe entry shape:
*   {
*     component_tipo : string    — the observable component tipo to listen to
*     client : {
*       event   : string         — event name published by the observable, e.g. 'update_value'
*       perform : { function: string } — method name to call on self, e.g. 'refresh'
*     }
*     server : { filter: bool }  — server-side config only; ignored client-side
*   }
*
* Called inside do_build() after set_context_vars(). The guard
* `self.init_events_subscribed` prevents double-subscription when build() is
* called more than once (which can happen via refresh()).
*
* Subscription scoping: events are keyed on the combination
* `event +'_'+ section_tipo +'_'+ section_id +'_'+ component_tipo` so that
* observers only react to their own section record's observable — not to
* homologous components in other open records.
*
* @param {Object} self - The component instance to attach subscriptions to
* @returns {boolean} true when subscriptions were attached; false when skipped
*   (non-edit mode or already subscribed)
*/
export const init_events_subscription = function(self) {

	// check mode
		if (self.mode!=='edit') {
			// only in edit mode are attached the events
			return false
		}

	// check already subscribed
		if(self.init_events_subscribed===true) {
			// console.log("-->> [component_common.init_events_subscription] already subscribed events:", self);
			return false
		}

	// events subscription (from component properties)
	// the ontology can define a observer property that specify the tipo that this component will listen
	// the event has a scope of the same section_tipo and same section_id for the observer and observable
		const observe = (self.context.properties && typeof self.context.properties.observe!=='undefined')
			? (self.context.properties.observe || null)
			: null
		if(observe) {

			const observe_length = observe.length
			for (let i = observe_length - 1; i >= 0; i--) {

				// Ignore non client events (server events for example)
				if(!observe[i].client){
					continue;
				}

				const component_tipo	= observe[i].component_tipo // string target event component tipo
				const event_name		= observe[i].client.event || null // string event name as 'update_data'
				const perform			= observe[i].client.perform || null // string action to exec like 'update_data'
				const perform_function 	= perform
					? perform.function
					: null
				if(perform && perform_function && typeof self[perform_function]==='function') {

					// the event will listen the id_base ( section_tipo +'_'+ section_id +'_'+ component_tipo)
					// the id_base is built when the component is instantiated
					// this event can be fired by:
					// 		event_manager.publish(event +'_'+ self.section_tipo +'_'+ self.section_id +'_'+ self.tipo, data_to_send)
					// or the sort format with the id_base of the observable component:
					// 		event_manager.publish(event +'_'+ self.id_base, data_to_send)
					const id_base = self.section_tipo +'_'+ self.section_id +'_'+ component_tipo

					// debug
						if(SHOW_DEBUG===true) {
							// console.log('SUBSCRIBE [init_events_subscription] event:', event_name +'_'+ id_base);
							// console.log("SUBSCRIBE info ",
							// 	'self.id:', self.id,
							// 	'id_base:', id_base,
							// 	'perform:', perform
							// );
						}

					self.events_tokens.push(
						event_manager.subscribe(event_name +'_'+ id_base, self[perform_function].bind(self))
					)

				}else{

					// event_name is defined but not perform case
					if (event_name) {
						console.group(`Invalid observe ${self.tipo} - ${self.model}`);
						console.warn(`Invalid observe perform. Target function '${perform_function}' does not exists in ${self.model}:`, observe[i], typeof self[perform_function]);
						console.warn(`self.context.properties.observe of ${self.model} - ${self.tipo} :`, observe);
						console.groupEnd();
					}
				}
			}
		}

	// set as subscribed
		self.init_events_subscribed = true


	return true
}//end init_events_subscription



/**
* SAVE
* Persists `changed_data` to the server via the Dédalo API, manages UI
* feedback classes (saving / loading / error / save_success / modified), and
* keeps the local data model in sync with the server response.
*
* Flow:
*  1. Guard: skip if a save is already in progress (self.saving === true).
*  2. Validate changed_data — must be a non-empty array.
*  3. Optimisation: for action='update' items, compare each value against the
*     db_data snapshot with is_equal(). If nothing actually changed, abort.
*  4. Clone self.data, inject changed_data, build an RQO and POST via data_manager.
*  5. On success: update self.data + self.db_data from the server response, run
*     the success animation, clear the 'modified' CSS class, and reset the
*     before-unload warning.
*  6. On auth failure ('not_logged'): subscribe to 'login_successful' and
*     retry the save automatically when the user logs back in.
*  7. Always publish 'save' (general) and 'save_' + self.id_base (component-specific)
*     events with { instance, api_response } payload.
*
* ChangedDataItem shape:
*   {
*     action : string  — 'update' | 'set_data' | 'remove'
*     key    : number|null — array index within data.entries (null = append)
*     id     : *|null     — stable item id (preferred over key for id-based matching)
*     value  : *          — the new value to persist
*   }
*
* (!) component_password is excluded from the db_data snapshot update after save
* to avoid storing the hash in the client-side baseline.
*
* @param {Array} [new_changed_data] - ChangedDataItem array. Falls back to
*   self.data.changed_data when omitted.
* @returns {Promise<Object|boolean>} The raw api_response object on completion;
*   false when the save was skipped (concurrent, invalid data, or no-change).
*/
component_common.prototype.save = async function(new_changed_data) {

	const self = this

	// set save status to prevent save orders overlapping
	if (self.saving) {
		console.warn(`${self.model} is already saving data. Stop saving to prevent double action.`);
		return false
	}
	self.saving = true

	// fallback to self.data.changed_data if not received
		const changed_data = new_changed_data || self.data.changed_data

	// check changed_data format
		if (!changed_data || !Array.isArray(changed_data) || changed_data.length < 1) {
			if(SHOW_DEBUG===true) {
				console.warn("Invalid changed_data [stop save]:", changed_data)
				console.trace()
			}
			const msg = "Ignored save. changed_data is undefined or empty!"

			// dispatch event save (with error msg to notify observers)
				event_manager.publish('save', {
					instance		: self,
					api_response	: null,
					msg				: msg
				})

			// update save status
			self.saving = false

			return false
		}

	// Optimization: check if data has actually changed (only for action='update' items)
		const update_items = changed_data.filter(el => el.action === 'update')
		if (update_items.length > 0) {

			const all_items_unchanged = update_items.every(item => {
				const original_value = item.id !== null && item.id !== undefined
					? self.db_data.entries?.find(entry => entry?.id === item.id)
					: self.db_data.entries?.[item.key];
				return is_equal(item.value, original_value);
			});

			if (all_items_unchanged) {
				if(SHOW_DEBUG===true) {
					console.warn(get_label.data_was_not_modified_save_canceled || 'The data has not been modified. Saving canceled');
				}
				// reset page unload warning
				set_before_unload(false)

				self.saving = false
				return false
			}
		}

	// UI: remove previous status classes and add 'saving'
		if (self.node) {
			self.node.classList.remove('error', 'save_success')
			self.node.classList.add('saving')
		}

	// Internal helper: send_data
		const send_data = async () => {
			try {
				// data. isolated cloned var and set received changed_data
					const data = clone(self.data)
					data.changed_data = changed_data

				// source
					const source = create_source(self, null)

				// rqo
					const rqo = {
						action	: 'save',
						source	: source,
						data	: data
					}

				// data_manager API request
					const api_response = await data_manager.request({
						use_worker	: false,
						body		: rqo
					})

					// debug
					if(SHOW_DEBUG===true) {
						dd_console(`[component_common.save] api_response ${self.model} ${self.tipo}`, 'DEBUG', api_response)
						if (!api_response.result) {
							console.error('[component_common.save] api_response ERROR:', api_response);
						}
					}

				return api_response

			} catch(error) {
				console.error("+++++++ COMPONENT SAVE ERROR:", error);
				// Consistent error return structure matches API response format
				return {
					result	: false,
					msg		: error.message,
					error	: error
				}
			}
		}

		// lock component events setting 'loading' class (for UI feedback)
			if (self.node) {
				self.node.classList.add('loading')
			}

		// Execute API call
		const api_response = await send_data()


	// Process Result
		const result = api_response.result

		if (result === false) {

			// ERROR CASE
			if (self.node) {
				self.node.classList.remove('saving', 'loading')
				self.node.classList.add('error')
			}

			// Determine exact error
			const error = api_response.error || (api_response.errors ? api_response.errors[0] : null) || 'Unknown error';

			switch (error) {
				case 'not_logged': {
					// Handle session expiration: wait for login and retry
					let token
					const login_successful_handler = async () => {
						if (token) event_manager.unsubscribe(token);

						// restore styles
						self.node?.classList.remove('error')

						// retry save
						self.save(changed_data)
					}
					token = event_manager.subscribe('login_successful', login_successful_handler)
					break;
				}

				default:
					console.error('component save error:', api_response?.error || error)
					break;
			}

		} else {

			// SUCCESS CASE
			if (self.node) {
				self.node.classList.remove('saving', 'loading')
			}

			// Update Data Model
				const data = result.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && String(el.section_id)===String(self.section_id))
				if(!data){
					if(SHOW_DEBUG===true) {
						console.warn(`Warn: data not found for ${self.tipo} in API result.`, result);
					}
				}
				self.data = data || {}

			// Update DB Data snapshot (for future change detection)
				if (self.model !== 'component_password') {
					self.db_data = clone(self.data)
				}

			// UI: Success Animation
				if (self.mode === 'edit') {
					ui.component.exec_save_successfully_animation(self)
				}

			// Reset page unload warning
				set_before_unload(false)

			// Remove 'modified' visual state
				if (self.node?.classList.contains('modified')) {
					self.node.classList.remove('modified')
				}

		}//end else

		// Dispatch Events
			// General save event
			event_manager.publish('save', {
				instance		: self,
				api_response	: api_response
			})

			// Specific component save event
			event_manager.publish('save_' + self.id_base, {
				instance		: self,
				api_response	: api_response
			})

		// Reset internal saving flag
		self.saving = false

	return api_response
}//end save



/**
* GET_VALUE
* Returns the current entries array from the component's data object.
* Assumes self.data.entries is up to date (call after build() or update_datum()).
* Concrete components may override this to apply model-specific transformations.
*
* @returns {Array|null} The entries array, or null/undefined when no data is set
*/
component_common.prototype.get_value = function() {

	const value = this.data.entries

	return value
}//end get_value



/**
* SET_VALUE
* Replaces the entries array in the component's data object with the supplied value.
* This is a low-level setter: it does not trigger save(), change_value(), or any
* event. Use change_value() when a user-initiated update should be persisted.
*
* @param {Array|*} value - New entries value to assign to self.data.entries
* @returns {boolean} Always true
*/
component_common.prototype.set_value = function(value) {

	// set value in data instance
	this.data.entries = value

	return true
}//end set_value



/**
* UPDATE_DATUM
* Merges an API result object (containing fresh `data` and `context` arrays)
* into the component's shared datum, then updates self.data from the merged result.
*
* Called in two situations:
*  1. After build(autoload=true) — to push the autoloaded data into the shared datum.
*  2. After change_value() → save() — to propagate the server-returned data back
*     into datum so all other components sharing the same datum stay in sync.
*
* Data merge strategy (datum.data):
*  - Existing items are matched by (tipo, section_tipo, section_id, mode) plus,
*    for dataframe sub-entries, by (section_id_key, section_tipo_key, main_component_tipo).
*  - Matching items have their `entries` and `fallback_value` updated in place.
*  - New items that have no match are appended to datum.data.
*  - When new_datum.data is empty the matched item's entries are cleared to []
*    (server sends no data node when a component has no value).
*
* Context merge strategy (datum.context):
*  - Only items NOT already in datum.context are appended (no update of existing).
*  - Match is by (tipo, section_tipo, mode, lang) — added 12-10-2023 to fix
*    component_relation_parent/children visualization after adding terms.
*
* (!) datum is shared with the parent section. Portals create their own private datum.
*     Do not replace the datum reference itself — only mutate it in place.
*
* @param {Object} new_datum - API result object: { data: Array<DataItem>, context: Array<ContextItem> }
* @returns {Promise<Object|boolean>} The updated self.datum on success; false on invalid input
*/
component_common.prototype.update_datum = async function(new_datum) {

	const self = this

	// (!) Note that component datum is shared with section datum. BUT! Portals have specific datum

	const new_data		= new_datum.data
	const new_context	= new_datum.context

	// DATA -------------------
		// new_data check
			if (!new_data || !Array.isArray(new_data)) {
				console.error(`component_common.update_datum received new_data is invalid! Expected array. Received:`, typeof new_data, new_data);
				return false
			}
			const new_data_length = new_data.length

			// EMPTY DATA CASE
			// if the caller has not data remove his value from the data
			// Server only send data when it has any data, empty portals will not send any data
			// data = []
			// the datum will remove the value of this component.
			// for now the subdatum is not removed because implications. To be evaluate.
			if(new_data_length === 0){

				for (let i = self.datum.data.length - 1; i >= 0; i--) {

					const el = self.datum.data[i]

					if( el.tipo 					=== self.tipo
						&& el.section_tipo 			=== self.section_tipo
						&& parseInt(el.section_id) 	=== parseInt(self.section_id)
						&& el.mode 					=== self.mode
						){
						// if the new data provides by dataframe it will has section_id_key, section_tipo_key and main_component_tipo
						// in this case check the previous data in datum has correspondence with section_id_key, section_tipo_key and its main_component_tipo
						const to_delete = ( el.section_id_key && el.section_tipo_key && el.main_component_tipo )
							? parseInt(el.section_id_key)	=== parseInt(self.section_id_key)
								&& el.section_tipo_key		=== self.section_tipo_key
								&& el.main_component_tipo	=== self.main_component_tipo
							: true

						if(to_delete){
							el.entries = [];
						}
					}
				}
			}

		// datum (global shared with section)
			// DATA
			// remove the component old data in the datum (from down to top array items)
				for (let i = new_data_length - 1; i >= 0; i--) {

					const data_item			= new_data[i]

					const ar_data_elements	= self.datum.data.filter( function(el) {
						if( el.tipo 					=== data_item.tipo
							&& el.section_tipo 			=== data_item.section_tipo
							&& parseInt(el.section_id) 	=== parseInt(data_item.section_id)
							&& el.mode 					=== data_item.mode
							){
							// if the new data provides by dataframe it will has section_id_key, section_tipo_key and main_component_tipo
							// in this case check the previous data in datum has correspondence with section_id_key, section_tipo_key and its main_component_tipo
							if( el.section_id_key && el.section_tipo_key && el.main_component_tipo ){
								return (
									parseInt(el.section_id_key)	=== parseInt(data_item.section_id_key)
									&& el.section_tipo_key		=== data_item.section_tipo_key
									&& el.main_component_tipo	=== data_item.main_component_tipo
								)
							}
							return true
						}
						return false
					})

					const ar_data_el_len = ar_data_elements.length
					if (ar_data_el_len>0) {
						// update already existing data item
						for (let j = ar_data_el_len - 1; j >= 0; j--) {
							const current_data_element = ar_data_elements[j]
								  current_data_element.entries			= data_item.entries
								  current_data_element.fallback_value	= data_item.fallback_value
						}
					}else{
						// add new data item
						self.datum.data.push(data_item)
					}
				}

	// CONTEXT -------------------
		// new_context check
			if (!new_context || !Array.isArray(new_context)) {
				console.error(`component_common.update_datum received new_context is invalid! Expected array. Received:`, typeof new_context, new_context);
				return false
			}
			const new_context_length = new_context.length

		// datum (global shared with section)
			// adds new elements to the datum if they do not already exist
			// Note that since 12-10-2023, the mode is taken into account here
				for (let i = new_context_length - 1; i >= 0; i--) {

					const context_item	= new_context[i]
					const found_item	= self.datum.context.find(el =>
						el.tipo===context_item.tipo &&
						el.section_tipo===context_item.section_tipo &&
						el.mode===context_item.mode && // @important Added 12-10-2023 because component_relation_parent/children visualization fails on add terms
 						el.lang===context_item.lang
					)

					if (!found_item) {
						// add new context item
						self.datum.context.push(context_item)
					}
				}

	// data of multiple components (TO DELETE)
		// the data sent by the server can be data of multiple components. The new_data is an array with the all response from server.
		// When one component is observed by other and the observable component data is changed, the observer component also will change
		// It's necessary update the data in all components (self, observers), not only the caller.
			// COMMENTED 08-09-2023 BY Paco/Alex: Apparently is not necessary anymore (!)
			// const ar_instances = await get_all_instances()
			// // Iterate data and instances with equal data
			// for (let i = new_data_length - 1; i >= 0; i--) {

			// 	const data_item = new_data[i]

			// 	// find current data_intem coincident in all instances
			// 		const current_instances	= ar_instances.filter(el =>
			// 			el.tipo===data_item.tipo &&
			// 			el.section_tipo===data_item.section_tipo &&
			// 			el.section_id==data_item.section_id &&
			// 			el.lang===data_item.lang
			// 		)
			// 		const instances_length = current_instances.length

			// 		console.log('current_instances:', current_instances);
			// 		console.log('new_data data_item:', data_item);

			// 	if (instances_length>0) {

			// 		// update instance data (not for himself)
			// 		// for (let j = 0; j < instances_length; j++) {
			// 		for (let j = instances_length - 1; j >= 0; j--) {

			// 			const inst = current_instances[j]

			// 			if(inst.id === self.id) {
			// 				continue; // skip self
			// 			}

			// 			inst.data = self.datum.data.find(el =>
			// 				el.tipo===inst.tipo &&
			// 				el.section_tipo===inst.section_tipo &&
			// 				el.section_id==inst.section_id &&
			// 				el.lang===inst.lang
			// 			) || {}
			// 			// console.log("____ updated instance data:", inst);
			// 		}

			// 	}else{

			// 		// if he can't even find himself, notify to user console
			// 		console.warn(`(!) [update_datum] The instance to update from new_data was not found:
			// 			tipo: ${data_item.tipo},
			// 			section_tipo: ${data_item.section_tipo},
			// 			section_id: ${data_item.section_id},
			// 			lang: ${data_item.lang}
			// 			data_item:`,
			// 			data_item,
			// 			' in instances:',
			// 			clone(current_instances)
			// 		)
			// 	}
			// }


		// check data
			if (typeof self.data==='undefined') {
				if(SHOW_DEBUG===true) {
					console.trace();
					console.warn("++++++++++++++++++++ self.datum:",self.datum);
				}
				alert("Error on read component data!");
			}

		// add as new data the most recent changed_data
			//self.data.changed_data = changed_data

		// update element pagination vars when are used
			/*
			if (self.data.pagination && typeof self.pagination.total!=="undefined") {
				self.pagination.total = self.data.pagination.total
			}
			*/

		// dispatch event
			// event_manager.publish('update_data_'+ self.id_base, '')

	return self.datum
}//end update_datum



/**
* UPDATE_DATA_VALUE
* Applies a single ChangedDataItem mutation to self.data.entries in memory,
* without any API call. Called by change_value() before save() so the local
* model stays consistent with what will be persisted.
*
* ChangedDataItem shape:
*   {
*     action : string      — 'update' | 'set_data' | 'remove'
*     id     : *|undefined — stable item id (preferred lookup key)
*     key    : number|null — fallback array index when id is absent
*     value  : *|null      — new entry value; null signals deletion
*   }
*
* Mutation rules by action / key combination:
*   set_data              → replace the entire entries array with `value` (bulk insert)
*   remove + key=null + value=null + id resolved → wipe entries to []
*   data_key=false + value=null (legacy path) → wipe entries to []
*   data_key=null + value !== null → append value to entries
*   data_key=<idx> + value=null → splice that entry out (delete by position)
*   data_key=<idx> + value !== null → overwrite that position
*
* id-based lookup: when `id` is present, findIndex() on entries is used to
* resolve the array position, setting id_not_found=true when not matched
* (avoids the 'remove all' fallback firing on a stale id).
*
* @param {Object} changed_data_item - The mutation descriptor
* @returns {boolean} Always true
*/
component_common.prototype.update_data_value = function(changed_data_item) {

	const self = this

	// changed_data_item
		const action			= changed_data_item.action
		const changed_value		= changed_data_item.value
		const changed_id		= typeof changed_data_item.id!=='undefined'
			? changed_data_item.id
			: null

		self.data = self.data || {}

	// set_data. If action is 'set_data' the value is changed as is, exec a bulk insert or update the data of the component.
		if(action==='set_data'){
			self.data.entries = changed_value || []
			return true
		}

	// resolve data_key from id
		let data_key = null;
		let id_not_found = false;
		if (changed_id !== null) {
			const idx = self.data.entries?.findIndex(entry => entry?.id === changed_id);
			if (idx !== -1) {
				data_key = idx;
			}else{
				id_not_found = true;
			}
		}

	// data entries
		if (action==='remove' && data_key===null && changed_value===null && !id_not_found) {
			self.data.entries = [];
		}else if (data_key===false && changed_value===null) {
			self.data.entries = [];
		}else if (data_key === null) {
			if (changed_value !== null) {
				self.data.entries = self.data.entries || [];
				self.data.entries.push(changed_value);
			}
		}else{
			if (changed_value===null && self.data.entries) {
				self.data.entries.splice(data_key, 1);
			}else{
				self.data.entries = self.data.entries || [];
				self.data.entries[data_key] = changed_value;
			}
		}

	// debug
		if(SHOW_DEBUG===true) {
			console.log('======= [component_common] update_data_value POST CHANGE:', clone(self.data.entries), self.id);
		}


	return true
}//end update_data_value



/**
* CHANGE_VALUE (AND SAVE)
* High-level user-action handler that updates the in-memory data model and
* persists the change in one atomic call. This is the correct entry point for
* all user-initiated value changes; do NOT call save() or update_data_value()
* directly from UI event handlers.
*
* Sequence:
*  1. Queue guard: if a change_value is already in progress (self.status === 'changing'),
*     the new call is deferred into self.change_value_pool and resolved when the
*     current call drains the queue in its finally block.
*  2. Remove-confirmation: if any item in changed_data has action === 'remove',
*     a confirmation dialog is shown (custom or default). Returning false cancels.
*  3. Mark self.status = 'changing' so subsequent overlapping calls queue up.
*  4. update_data_value() for each item — mutates self.data.entries in memory.
*  5. save(changed_data) — POSTs to server, updates self.data and self.db_data.
*  6. For non-standalone components, update_datum() propagates the server result
*     into the shared section datum.
*  7. Optional refresh if options.refresh === true.
*  8. Restore status and drain the queue in the finally block (always runs).
*  9. Publish 'sync_data_' + id_base_lang → sibling components sharing the same
*     id_base update their DOM via events_subscription.js.
* 10. Publish 'update_value_' + id_base → ontology-defined observers react
*     (see init_events_subscription).
*
* @param {Object} options - Change descriptor
* @param {Array} options.changed_data - Array of ChangedDataItem objects (required, must be array)
* @param {string} [options.label] - Human-readable label shown in the remove confirmation dialog
* @param {boolean} [options.refresh=false] - Whether to call self.refresh() after save
* @param {boolean} [options.build_autoload=false] - autoload flag forwarded to self.refresh()
* @param {Function|boolean|undefined} [options.remove_dialog] - Custom remove-confirm function;
*   omit or pass undefined to use the built-in confirm() dialog
* @returns {Promise<Object|boolean>} The api_response on success; false when cancelled or skipped
*/
component_common.prototype.change_value = async function(options) {

	const self = this

	// queue overlapped calls to avoid server concurrence issues
		if(self.status==='changing') {
			//console.log(`Busy change_value delayed! ${options.changed_data.action} ${self.model}`, options.changed_data);
			return new Promise(function(resolve) {
				resolve( function_queue(self, self.change_value_pool, self.change_value, options) );
			})
		}

	// options
		const changed_data			= options.changed_data
		const label					= options.label
		const refresh				= typeof options.refresh!=='undefined' ? options.refresh : false
		const build_autoload		= typeof options.build_autoload!=='undefined' ? options.build_autoload : false
		const custom_remove_dialog	= options.remove_dialog // undefined|function|bool

	// check changed_data valid format
		if (!Array.isArray(changed_data)) {
			throw `Exception: changed_data is not as expected (array). ` + typeof changed_data;
		}

	// remove dialog. Check the remove dialog (default or sent by caller )user confirmation prevents remove accidentally
		// UIUX-01: changed_data items are objects ({action, ...}), not strings.
		// The old `changed_data[0]==='remove'` was always false, so the accidental-
		// delete confirmation never fired. Detect a remove action anywhere in the batch.
		const action = changed_data[0]?.action
		if ( changed_data.some(el => el && el.action==='remove') ) {

			// generate default remove dialog to confirm the remove option is correct
			// to overwrite this dialog use something as:
			// function(){
			// 		return confirm(get_label.sure)
			// 	}
			// the confirm will check the true and false option, don't check it in the function!
			// to check the user result use the general response of this function (false or api_response)
			const remove_dialog = typeof custom_remove_dialog!=='undefined' && typeof custom_remove_dialog==='function'
				? custom_remove_dialog
				: function() {
					const msg = SHOW_DEBUG
						? `Sure to remove value: ${label} ? \n\nchanged_data:\n${JSON.stringify(changed_data, null, 2)}`
						: `Sure to remove value: ${label} ?`
					return confirm( msg )
				  }

			const remove_result = remove_dialog()
			if ( remove_result===false ) {
				return false
			}
		}

	// status
		const prev_status = self.status
		// Mark as 'changing' so overlapping change_value calls are queued (see guard
		// above) instead of racing into save() — where the second call hits the
		// `self.saving` guard, returns false and silently drops the change.
		self.status = 'changing'

	// Wrap the body in try/finally so the 'changing' status is ALWAYS restored and the
	// queued calls ALWAYS drained, even if update/save/refresh throw. Otherwise status
	// would stay 'changing' and deadlock every future change_value call.
	try {

		// update_data_value. update the component data value in the instance before to save (returns bool)
			const changed_data_length = changed_data.length
			for (let i = 0; i < changed_data_length; i++) {
				const changed_data_item = changed_data[i] // must be a freeze object
				const update_data = self.update_data_value(changed_data_item)
				if (!update_data) {
					return false
				}
			}

		// save. save and rebuild the component
			const api_response = await self.save(changed_data)

			// fix instance changed_data
			if (api_response && api_response.result) {

				// reset component changed_data to empty array
				self.data.changed_data = []

				// update_datum. Force update datum with received API response result
				// That is necessary for example to allow update maps with ddo.hide items
				// containing coordinates value
				// @see component_geolocation tch244
				if(!self.standalone){
					await self.update_datum(api_response.result)
				}
			}

		// refresh (optional, default is false)
			if (refresh===true) {
				await self.refresh({
					// build_autoload default value is false but could be a function callback
					build_autoload : build_autoload
				})
			}

		// restore previous status value
			self.status = prev_status

		// event sync_data_ . Used to update the DOM elements of the instance
		// subscriptions from component_common.init()
		// @see events_subscription.js
			const id_base_lang = self.id_base + '_' + self.lang
			event_manager.publish('sync_data_'+id_base_lang, {
				caller			: self,
				changed_data	: changed_data
			})

		// event update_value_ . Defined in Ontology to fire events, see: hierarchy93 or numisdata77
		// subscriptions from component_common.build() -> init_events_subscription(self)
		// @see component_common.init_events_subscription
		// sample of use in Ontology item properties:
			// "observe": [
			// 	{
			// 	  "info": "Observes 'Review status' radio_button value changes to update this calculated value",
			// 	  "client": {
			// 		"event": "update_value",
			// 		"perform": {
			// 		  "function": "refresh"
			// 		}
			// 	  },
			// 	  "server": {
			// 		"filter": false
			// 	  },
			// 	  "component_tipo": "oh93"
			// 	}
			// ]
			const id_base = self.id_base
			event_manager.publish('update_value_'+id_base, {
				caller			: self
			})

		return api_response

	} finally {

		// safety: ensure status is restored even on early-return/throw
			if (self.status==='changing') {
				self.status = prev_status
			}

		// exec queue one by one
			if(self.change_value_pool.length > 0) {
				(self.change_value_pool.shift())();
			}
	}
}//end change_value



/**
* FUNCTION_QUEUE
* Defers a function call by wrapping it in a closure and pushing it onto a pool
* array. Used by change_value() to serialise concurrent value-change calls:
* when self.status === 'changing' the new call is queued here and the running
* call drains it (pool.shift()()) in its finally block.
*
* The returned function is also resolved as the Promise value for the waiting
* caller, so the caller gets the result once the queue entry executes.
*
* @param {Object} context - The `this` context to bind when the function executes (usually the component instance)
* @param {Array} pool - The queue array to push the wrapped call onto
* @param {Function} fn - The function to defer (e.g. self.change_value)
* @param {Object} options - The single argument to pass when fn is eventually called
* @returns {Function} The wrapped deferred call (also added to pool)
*/
const function_queue = function(context, pool, fn, options) {

	const wrap_function = function(fn, context, params) {
		return function() {
			fn.apply(context, params);
		};
	}
	const fun = wrap_function(fn, context, [options]);

	pool.push( fun )

	return fun
}//end function_queue



/**
* UPDATE_NODE_CONTENTS
* Replaces the children of `current_node` with the children of `new_node`,
* preserving the `current_node` element itself in the DOM (so external
* references and event listeners on the container remain valid).
*
* This is preferred over `parentNode.replaceChild(new_node, current_node)` when
* the caller holds a reference to `current_node` that must stay live.
* Both nodes are mutated in place: current_node is emptied then repopulated,
* and new_node is drained (its children are moved, not copied).
*
* @param {HTMLElement} current_node - The existing container whose content will be replaced
* @param {HTMLElement} new_node - The source node whose children will be moved into current_node
* @returns {Promise<HTMLElement>} The updated current_node
*/
component_common.prototype.update_node_contents = async (current_node, new_node) => {

	// clean
		while (current_node.firstChild) {
			current_node.removeChild(current_node.firstChild)
		}
	// set children nodes
		while (new_node.firstChild) {
			current_node.appendChild(new_node.firstChild)
		}

	//current_node.parentNode.replaceChild(new_node, current_node);

	return current_node
}//end update_node_contents



/**
* CHANGE_MODE
* Switches the component to a different render mode (e.g. 'list' → 'edit') and/or
* view variant. Creates a fresh instance in the new mode, renders it, swaps it into
* the DOM in place of the old node, activates it if in edit mode, and finally
* destroys the current (old) instance.
*
* The old DOM node is preserved long enough to locate its parent for the in-place
* swap; destroy() is called with remove_dom=true so the old shadow subtree is also
* cleaned up after the swap.
*
* CSS: if context.css is defined, set_element_css() injects a scoped rule so the
* new node immediately picks up any component-specific styles.
*
* Mode fallback logic (when options.mode is omitted):
*   list → edit (toggle to edit)
*   any other → self.mode (unchanged)
*
* View fallback logic (when options.view is omitted):
*   edit mode → 'line'
*   otherwise → self.mode (unchanged — keeps current view)
*
* @param {Object} options - Change descriptor
* @param {string} [options.mode] - Target mode ('edit', 'list', etc.). Defaults to toggling list↔edit.
* @param {string} [options.view] - Target view variant. Defaults to 'line' for edit, current mode otherwise.
* @param {boolean} [options.autoload=true] - Whether the new instance should fetch its own data
* @returns {Promise<boolean>} true on success; false when permissions are insufficient (< 1)
*/
component_common.prototype.change_mode = async function(options) {

	const self = this

	// options vars
		// mode check. When mode is undefined, fallback to 'list'. From 'list', change to 'eddit'
		const mode = (options.mode)
			? options.mode
			: self.mode === 'list' ? 'edit' : 'list'
		const view = (options.view)
			? options.view
			: mode==='edit'
				? 'line'
				: self.mode
		const autoload = (typeof options.autoload!=='undefined')
			? options.autoload
			: true

	// check interface and permissions
		if (self.permissions<1) {
			console.error('Error. calling component change_mode with permissions: ',self.permissions);
			return false
		}

	// short vars
		const current_context		= self.context
		const current_data			= self.data
		const current_datum			= self.datum
		const current_section_id	= self.section_id
		const section_lang			= self.section_lang
		const old_node				= self.node

	// id_variant. Add view_mode pattern to id variant avoiding to duplicate additions
		const pattern			= `_${view}_list|_${view}_edit`
		const regex				= new RegExp(pattern, "g");
		const id_variant_clean	= self.id_variant.replace(regex, '')
		const id_variant		= id_variant_clean + `_${view}_${mode}`

	// set the new view and mode to context
		current_context.view = view
		current_context.mode = mode

	// element. Create the instance options for build it. The instance is reflect of the context and section_id
		const new_instance = await get_instance({
			model			: current_context.model,
			tipo			: current_context.tipo,
			section_tipo	: current_context.section_tipo,
			section_id		: current_section_id,
			mode			: mode,
			lang			: current_context.lang,
			section_lang	: section_lang,
			parent			: current_context.parent,
			type			: current_context.type,
			context			: current_context,
			data			: current_data,
			datum			: current_datum,
			id_variant 		: id_variant
		})

	// build
		await new_instance.build(autoload)

	// render
		const new_node = await new_instance.render({
			render_level : 'full'
		})

		if (new_instance.context.css) {
			const selector = `${new_instance.section_tipo}_${new_instance.tipo}.${new_instance.tipo}.${new_instance.mode}`
			set_element_css(selector, new_instance.context.css)
		}

	// replace the node with the new render
		old_node.replaceWith(new_node);

	// active component at end
		if (mode.indexOf('edit')!==-1) {
			if (!new_instance.active) {
				ui.component.activate(new_instance)
			}
		}

	// destroy self instance (delete_self=true, delete_dependencies=false, remove_dom=false)
		self.destroy(
			true, // delete_self
			true, // delete_dependencies
			true // remove_dom
		)

	return true
}//end change_mode



/**
* CHANGE_MODE_DES
* Dead-code: superseded by change_mode(). Opened a modal instead of performing
* an in-place DOM swap. Kept commented out to preserve history.
* (!) Do not remove — explicit decision deferred.
*/
	// component_common.prototype.change_mode_DES = async function(new_mode, autoload) {

	// 	const self = this

	// 	// short vars
	// 		const current_context		= self.context
	// 		const current_data			= self.data
	// 		const current_datum			= self.datum
	// 		const current_section_id	= self.section_id
	// 		const section_lang			= self.section_lang

	// 	// element. Create the instance options for build it. The instance is reflect of the context and section_id
	// 		const new_instance = await get_instance({
	// 			model			: current_context.model,
	// 			tipo			: current_context.tipo,
	// 			section_tipo	: current_context.section_tipo,
	// 			section_id		: current_section_id,
	// 			mode			: 'edit',
	// 			lang			: current_context.lang,
	// 			section_lang	: section_lang,
	// 			parent			: current_context.parent,
	// 			type			: current_context.type,
	// 			context			: current_context,
	// 			// data			: current_data,
	// 			// datum			: current_datum
	// 		})

	// 		autoload = true

	// 	// build
	// 		await new_instance.build(autoload)

	// 	// render
	// 		const new_node = await new_instance.render({
	// 			render_level : 'full'
	// 		})

	// 	// body
	// 		const body = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'body section_record'
	// 		})
	// 		body.appendChild(new_node)

	// 	// modal
	// 		ui.attach_to_modal({
	// 			header				: 'Edit ' + self.label,
	// 			body				: body,
	// 			footer				: null,
	// 			size				: 'small'
	// 			// remove_overlay	: bool
	// 		})

	// 	// active component at end
	// 		// if (new_mode.indexOf('edit')!==-1) {
	// 		// 	if (!new_instance.active) {
	// 		// 		event_manager.publish('activate_component', new_instance)
	// 		// 	}
	// 		// }


	// 	return true
	// }//end change_mode_DES



/**
* SET_CHANGED_DATA
* Records a pending edit in self.data.changed_data and determines whether the
* edit represents an actual change from the last-saved server state (db_data).
*
* Deduplication: if an item with the same `id` already exists in changed_data
* it is replaced in place; otherwise the item is appended. This ensures that
* rapid keystrokes accumulate into a single pending change entry rather than
* growing the array unboundedly.
*
* Change detection: compares the new value against db_data using is_equal().
* Lookup order: by stable item `id` when present (mirrors save()'s contract),
* falling back to positional `key` when no id is set.
*
* Side effects:
*  - When the value is unchanged (is_equal returns true):
*      · resets the before-unload navigation warning (set_before_unload(false))
*      · removes the 'modified' CSS class from self.node
*      · returns false
*  - When the value is genuinely new:
*      · activates the before-unload warning (set_before_unload(true))
*      · adds the 'modified' CSS class to self.node
*      · returns true
*
* @param {Object} changed_data_item - The change descriptor to record
* @param {*} [changed_data_item.id] - Stable item id for dedup and db lookup
* @param {number|null} [changed_data_item.key] - Array index fallback when id is absent
* @param {*} changed_data_item.value - The new value to compare against db_data
* @returns {boolean} true when the data is genuinely changed; false when it matches db_data
*/
component_common.prototype.set_changed_data = function(changed_data_item) {

	const self = this

	// changed_data. Set as empty array always
		self.data.changed_data = self.data.changed_data || []

	// set changed_data item
		const key = self.data.changed_data.findIndex(el => el.id===changed_data_item.id)
		if (key!==-1) {
			// replace
			self.data.changed_data[key] = changed_data_item
		}else{
			// add
			self.data.changed_data.push(changed_data_item)
		}

	// Check if changed_data was really changed.
	// Test if the changed_data is not the original data (the data in server database).
	// Resolve the original db entry by matching id (same contract as save()); the
	// previous code indexed db_data.entries with the changed_data array index `key`,
	// which is an unrelated ordering and compared against the wrong db entry.
		const original_value	= (changed_data_item.id !== null && changed_data_item.id !== undefined)
			? (self.db_data?.entries?.find(entry => entry?.id === changed_data_item.id) ?? null)
			: (self.db_data?.entries?.[changed_data_item.key] ?? null)
		const new_value			= changed_data_item.value

		// debug
			// console.log('original_value (DDBB):', clone(original_value));
			// console.log('new_value (changed_data_item):', clone(new_value));
			// console.log('is_equal:', is_equal(clone(new_value), clone(original_value)));

		if (is_equal(new_value, original_value)) {
			set_before_unload(false)
			self.node.classList.remove('modified')
			return false
		}

	// prevents user navigate loosing changes without warning
		set_before_unload(true)

	// add style modified to wrapper node
		if (!self.node.classList.contains('modified')) {
			self.node.classList.add('modified')
		}

	// debug
		// console.log('+++++++++++++++++++++++++++++ self.data.changed_data:', clone(self.data.changed_data));


	return true
}//end set_changed_data



/**
* CHECK_UNSAVED_DATA
* Navigation guard that flushes auto-saveable pending edits and prompts the user
* to confirm discarding any remaining unsaved changes before a navigation event
* proceeds.
*
* Two-phase approach:
*  1. If window.unsaved_data === true, call save_unsaved_components() to auto-save
*     any component instances that still carry non-empty changed_data. This handles
*     the common text-area debounce window (500 ms delay before the component marks
*     itself changed) where the user navigates faster than the debounce fires.
*  2. After the auto-save pass, if window.unsaved_data is still true (e.g. a save
*     failed or a component could not be auto-saved), show a browser confirm() dialog.
*     Returning false signals the caller to abort the navigation.
*
* Called from:
*   page.js        — beforeunload, mousedown, user_navigation events
*   section.js     — navigate() method
*   dd-modal.js    — _closeModal() method
*   ui             — component.activate() method
*
* @param {Object} [options={}] - Options bag
* @param {string} [options.confirm_msg] - Confirmation prompt text; defaults to the
*   'discard_changes' i18n label or 'Discard unsaved changes?'
* @returns {Promise<boolean>} true when safe to navigate; false when the user cancelled
*/
export const check_unsaved_data = async function(options={}) {

	// options
		const confirm_msg = options.confirm_msg ||
							(get_label.discard_changes || 'Discard unsaved changes?')

	// unsaved_data case
	// Checks for unsaved components usually happens in component_text_area editions
	// because the delay (500 ms) used to set as changed
		if (typeof window.unsaved_data!=='undefined' && window.unsaved_data===true) {
			// look in all component instances for unsaved data
			await save_unsaved_components()
			// reset unsaved_data value (unsaved component data will be saved before)
			window.unsaved_data = false
		}

	// unsaved_data value check
		if (window.unsaved_data===true) {

			// let user decide if continue loosing unsaved changes
			if ( !confirm(confirm_msg) ) {
				return false
			}

			// reset unsaved_data state by the user
			window.unsaved_data = false
		}

	return true
}//end check_unsaved_data



/**
* SAVE_UNSAVED_COMPONENTS
* Walks the entire instance registry and calls save() on every component instance
* that has a non-empty data.changed_data array (i.e. edits not yet persisted).
*
* Called by check_unsaved_data() before presenting the user with a discard prompt,
* so that components like component_text_area — which debounce their change events
* — get a chance to flush their pending edits even when the user navigates quickly.
*
* Instances without a `data` property are skipped with a console.error (they are
* anomalous — all built components should have data) but the sweep continues for
* the remaining instances.
*
* @returns {Promise<boolean>} Always resolves true (individual save errors are
*   handled inside save() itself and do not abort the sweep)
*/
export const save_unsaved_components = async function() {

	const ar_instances = get_all_instances()
	const ar_instances_length = ar_instances.length
	for (let i = 0; i < ar_instances_length; i++) {

		const item = ar_instances[i]
		if (item.type==='component') {
			if (!item.data) {
				console.error('))) Ignored item without data:', item);
				// skip this one but keep sweeping the rest
				continue
			}
			if (item.data.changed_data && item.data.changed_data.length>0) {
				console.log('Saving component unsaved', item);
				// save every dirty component, not just the first one (otherwise
				// later unsaved edits are silently dropped on navigation/unload)
				await item.save()
			}
		}
	}


	return true
}//end save_unsaved_components



/**
* DEACTIVATE_COMPONENTS
* Click-away handler attached to the document (and to section wrappers in edit mode)
* that deactivates the currently active component when the user clicks outside it.
*
* Two code paths:
*  A. A component is currently active (page_globals.component_active is set):
*     - If component locking is enabled (DEDALO_LOCK_COMPONENTS === true) and the
*       component is in edit mode, a background worker request is fired via
*       dd_request_idle_callback to send a 'blur' lock-state update to the server
*       (preventing the record from appearing locked to other users after the focus
*       leaves without an explicit save).
*     - ui.component.deactivate() is called to visually deactivate the component.
*  B. No component is active:
*     - check_unsaved_data() is called to handle the text-area debounce window edge
*       case where the user clicks outside any component before the debounce timer fires.
*
* Scrollbar clicks: e.target.parentElement === null means the click landed on the
* browser scrollbar (which is outside the DOM tree). These are ignored to prevent
* spurious deactivation when the user scrolls the page.
*
* Called from:
*   view_default_edit_section → render (section-level mousedown listener)
*   page.js document-level mousedown listener
*
* @param {MouseEvent} e - The originating mouse event
*/
export const deactivate_components = function(e) {
	e.stopPropagation()

	// click on scrollbar case: capture event
		const is_descendant_of_root = (e.target.parentElement !== null);
		if (is_descendant_of_root===false) {
			return
		}

	if (page_globals.component_active) {

		const component_instance = page_globals.component_active

		// lock_component. launch worker
			if (DEDALO_LOCK_COMPONENTS===true && component_instance.mode==='edit') {
				dd_request_idle_callback(
					() => {
						data_manager.request({
							use_worker	: true,
							body		: {
								dd_api			: 'dd_utils_api',
								action			: 'update_lock_components_state',
								prevent_lock	: true,
								options			: {
									component_tipo	: component_instance.tipo,
									section_tipo	: component_instance.section_tipo,
									section_id		: component_instance.section_id,
									action			: 'blur' // delete_user_section_locks | blur | focus
								}
							}
						})
						.then(function(api_response) {
							// update page_globals
							page_globals.dedalo_notification = api_response.dedalo_notification || null
							// dedalo_notification from config file
							event_manager.publish('dedalo_notification', page_globals.dedalo_notification)
						})
					}
				)
			}

		// deactivate
			ui.component.deactivate(component_instance)
	}else{

		// unsaved_data case
		// This allow catch page mousedown event (outside any component) and check for unsaved components
		// usually happens in component_text_area editions because the delay (500 ms) to set as changed
			check_unsaved_data()
	}
}//end deactivate_components



/**
* DATAFRAME
* get_dataframe, delete_dataframe, and attach_item_dataframe were extracted to
* dataframe.js to centralise the dataframe pairing contract in a single authority
* file. They are re-exported here so that existing callers importing from
* component_common.js continue to work without changes.
*
* @see core/component_common/js/dataframe.js for full documentation and the
*   pairing contract (id_key / section_id_key / main_component_tipo triad).
*/
export { get_dataframe, delete_dataframe, attach_item_dataframe } from './dataframe.js'



/**
* IS_EMPTY
* Determines whether a component instance currently holds no user data.
* Used by the search-mode event handler in events_subscription.js to decide
* whether to highlight (hilite) the component wrapper.
*
* Resolution order:
*  1. If instance is falsy → true (empty).
*  2. If the instance defines its own `is_empty()` method, delegate to it.
*     Concrete components that have unusual data shapes (e.g. component_date,
*     component_select) override this to apply model-specific logic.
*  3. Otherwise apply the shared heuristic:
*     - entries array empty → true
*     - entries[0] is an object with a 'value' property (string-component shape) →
*       empty when value is falsy or ''
*     - entries[0] is any other truthy value → false (non-empty)
*     - entries[0] is falsy → true
*
* @param {Object|null} instance - The component instance to check
* @returns {boolean} true when the instance has no meaningful data
*/
export const is_empty = function( instance ) {

	if( !instance ) {
		return true
	}

	if( typeof instance.is_empty === 'function' ) {
		return instance.is_empty()
	}

	const entries = instance.data?.entries || []

	if(entries.length === 0) {
		return true
	}

	const entries0 = entries[0]
	if(entries0 && typeof entries0 === 'object' && Object.prototype.hasOwnProperty.call(entries0, 'value')) {
		// string components check
		return !entries0.value || entries0.value === ''
	}else{
		// other components check
		if(entries0) {
			return false
		}
	}

	return true;
}//end is_empty



/**
* ACTIVATE_EDIT_IN_LIST
* Unified edit mechanism for components in list view.
* Handles permissions, read-only mode, dataframe context, and edit mode selection.
*
* @param {Object} self - The component instance
* @param {Event} e - The mouse event for positioning the modal
* @param {Object} options - Optional configuration
* @param {string} options.mode - 'modal' (always modal), 'inline' (always inline), 'auto' (based on width)
* @param {string} options.inline_view - View to use for inline mode (default: 'line')
* @param {string} options.modal_width - Modal width CSS value (default: '25rem')
* @param {string} options.lang - Language to use for edit instance
* @param {Function} options.on_close - Callback when modal closes
* @returns {boolean|undefined} false if read-only or inside dataframe; undefined otherwise (edit is launched)
*
* @example
* // Simple usage (auto mode)
* wrapper.addEventListener('click', (e) => {
*   e.stopPropagation()
*   activate_edit_in_list(self, e)
* })
*
* @example
* // Always modal with custom width
* wrapper.addEventListener('click', (e) => {
*   e.stopPropagation()
*   activate_edit_in_list(self, e, { mode: 'modal', modal_width: '90%' })
* })
*
* @example
* // Auto mode with custom inline view
* wrapper.addEventListener('click', (e) => {
*   e.stopPropagation()
*   activate_edit_in_list(self, e, { mode: 'auto', inline_view: 'line' })
* })
*/
export const activate_edit_in_list = (self, e, options={}) => {

	// options
		const mode			= options.mode ?? 'modal' // 'modal' | 'inline' | 'auto'
		const inline_view	= options.inline_view ?? 'line'
		const modal_width	= options.modal_width ?? '25rem'
		const lang			= options.lang ?? null
		const on_close		= options.on_close ?? null

	// read only check
		if (self.show_interface.read_only === true || self.permissions < 2) {
			return false
		}

	// dataframe detection
		if (ui.inside_dataframe(self)) {
			return false
		}

	// resolve edit mode
		const edit_mode = (() => {
			if (mode === 'modal') return 'modal'
			if (mode === 'inline') return 'inline'
			// auto: decide based on wrapper width
			if (mode === 'auto') {
				const wrapper_width = e.target?.getBoundingClientRect?.()?.width
					|| e.currentTarget?.getBoundingClientRect?.()?.width
					|| 0
				const minimum_width = self.minimum_width_px ?? 200
				return wrapper_width >= minimum_width ? 'inline' : 'modal'
			}
			return 'modal' // fallback
		})()

	// execute edit mode
		if (edit_mode === 'inline') {
			// inline way: change mode directly
			self.change_mode({
				mode	: 'edit',
				view	: inline_view
			})
		} else {
			// modal way: open modal to edit
			ui.render_edit_modal({
				self		: self,
				lang		: lang,
				callback	: (dd_modal) => {
					dd_modal.modal_content.style.width = modal_width
					// 'center' class from render_edit_modal handles both horizontal and vertical centering
				},
				on_close	: on_close
			})
		}
}//end activate_edit_in_list



// @license-end
