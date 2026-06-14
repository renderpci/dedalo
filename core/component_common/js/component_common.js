// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global get_label, SHOW_DEBUG, SHOW_DEVELOPER, Promise */
/*eslint no-undef: "error"*/



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



export const component_common = function(){

	return true
}//end component_common



/**
* INIT
* Common init prototype to use in components as default
* @param object options
* @return bool true
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
* Set the main component properties.
* Could be from database context and data or injected by caller section, tools, etc.
* @param bool autoload = false
* @return bool
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
* Internal build logic to be executed once
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
* Set component structure properties defined events (used in component info mainly)
* This method is called in 'build' life cycle, but must be execute only one time to prevent
* duplicated events attach
* Executed once !
* @param object self
* 	Is the self component instance
* @return bool
* 	True when new events are subscribed, false when already are subscribed (var self.init_events_subscribed as true)
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
* Executes a save action by calling the API.
* Handles UI state (loading, error, success classes), prevents concurrent saves,
* and updates the local data model upon success.
*
* @async
* @param {Array} new_changed_data - Array of changes to save. If not provided, uses `self.data.changed_data`.
* @example
* [{
* 	action : "update", // "update", "set_data", etc.
* 	key : 0,           // Array index or null
* 	value : "My new value"
* }]
* @returns {Promise<Object>} api_response - The raw API response object.
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
* Look component data entries (we assume that it is updated)
* @return array value
*/
component_common.prototype.get_value = function() {

	const value = this.data.entries

	return value
}//end get_value



/**
* SET_VALUE
* Update component data entries (usually with with DOM node actual value)
* @return bool true
*/
component_common.prototype.set_value = function(value) {

	// set value in data instance
	this.data.entries = value

	return true
}//end set_value



/**
* UPDATE_DATUM
* Update component data entries with changed_data send by the DOM element
* Update the datum and the data of the instance with the data changed and saved.
* @param object new_data
*	new_data contains fresh calculated data of saved component
* @return bool true
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
* Updates component data entries with changed_data_item sent by the DOM element
* @param object changed_data_item
* Sample data:
* {
*	id		: 'abc123',
*	value	: input.value,
*	action	: 'update'
* }
* @return bool true
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
* 	Changes one or more component's values:
* 		1 - Update self.data.entries
* 		2 - Save values to DDBB
* 		3 - Reset self.data.changed_data to empty array
* 	Publish event 'update_value_'+self.id_base
*
* @param object options
* {
* 	array changed_data
* 	string label
* 	bool|undefined refresh
* 	undefined|function|bool remove_dialog
* }
* @return promise
* 	Resolve bool|object (API response)
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
		// self.status = 'changing'

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

	// exec queue one by one
		if(self.change_value_pool.length > 0) {
			(self.change_value_pool.shift())();
		}


	return api_response
}//end change_value



/**
* FUNCTION_QUEUE
* @param object context
*	Usually self or this
* @param array pool
*	Where is stored the section
* @param function fn
*	Name of the function to store
* @param object options
*	Argument to send to function
* @return
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
* Static function. Replaces old DOM node by new node
* @param DOM node current_node
* @param DOM node new_node
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
* Destroy current instance and dependencies without remove HTML nodes (used to get target parent node placed in DOM)
* Create a new instance in the new mode (for example, from list to edit) and view (ex, from default to line )
* Render a fresh full element node in the new mode
* Replace every old placed DOM node with the new one
* Active element (using event manager publish)
* @param object options
* {
* 	mode: string 'list',
* 	view: string 'line'
* 	autoload: bool 'true'
* }
* @return bool
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
* Unified way to set changed_data item
* @param object changed_data_item
* @return bool
* 	Returns true when new data is different from stored db data and false when not
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
	// Test if the changed_data is not the original data (the data in server database)
		const original_value	= self.db_data.entries && self.db_data.entries[key]
			? self.db_data.entries[key]
			: null
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
* If window.unsaved_data===true, iterate all component instances
* searching unsaved data to force save it
* Customized confirm message is enable when is not possible to save the changed component
* @see page.js beforeunload event
* @see page.js mousedown event
* @see page.js user_navigation event
* @see section.js navigate method
* @see dd-modal.js _closeModal method
* @see ui component activate method
* @param object options
* {
* 	confirm_msg: "Discard unsaved changes?"
* }
* @return bool
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
* Iterate all instances and save component data if data.changed_data is filled
* @return bool
*/
export const save_unsaved_components = async function() {

	const ar_instances = get_all_instances()
	const ar_instances_length = ar_instances.length
	for (let i = 0; i < ar_instances_length; i++) {

		const item = ar_instances[i]
		if (item.type==='component') {
			if (!item.data) {
				console.error('))) Ignored item without data:', item);
				return true
			}
			if (item.data.changed_data && item.data.changed_data.length>0) {
				console.log('Saving component unsaved', item);
				await item.save()

				return true
			}
		}
	}


	return true
}//end save_unsaved_components



/**
* DEACTIVATE_COMPONENTS
* Called from document and from section in edit mode
* @see view_default_edit_section->render
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
* get_dataframe / delete_dataframe moved to dataframe.js (single JS authority
* for the dataframe pairing contract). Re-exported here for backwards
* compatibility of existing imports.
* @see core/component_common/js/dataframe.js
*/
export { get_dataframe, delete_dataframe, attach_item_dataframe } from './dataframe.js'



/**
* IS_EMPTY
* Check if the instance data is empty.
* Used in search mode for hilite the component wrapper when has value.
* @param object instance
* @return bool
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
* @param {number} options.modal_width - Modal width in CSS (default: '25rem')
* @param {string} options.lang - Language to use for edit instance
* @param {Function} options.on_close - Callback when modal closes
* @returns {boolean} Returns false if read-only or inside dataframe, otherwise void
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
