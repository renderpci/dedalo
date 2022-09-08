/* global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL, Promise */
/*eslint no-undef: "error"*/



// imports
	// import * as dd from '../../common/js/dd.common.funtions.js'
	import {clone, dd_console, is_equal} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {set_context_vars, create_source} from '../../common/js/common.js'
	import {events_subscription} from './events_subscription.js'
	import {ui} from '../../common/js/ui.js'



export const component_common = function(){

	return true
}//end component_common



// component_common.prototype.build_rqo_show = common.prototype.build_rqo_show



/**
* INIT
* Common init prototype to use in components as default
* @return bool true
*/
component_common.prototype.init = async function(options) {
	// const t0 = performance.now()

	const self = this

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

		self.section_lang	= options.section_lang // current section lang like 'lg-eng'
		self.parent			= options.parent // tipo of structure parent like a section group 'dd4567'

		// Optional vars
		self.context		= options.context	|| null // structure context of current component (include properties, tools, etc.)
		self.data			= options.data		|| null // current specific data of this component
		self.datum			= options.datum		|| null // global data including dependent data (used in portals, etc.)

		// DOM
		self.node			= null // node place in light DOM

		self.events_tokens	= [] // array of events of current component
		self.ar_instances	= [] // array of children instances of current instance (used for autocomplete, etc.)
		self.tools			= []
		//rqo
		// self.rqo 		= {}

		self.init_events_subscribed = false // initial value (false) is changed on build

		// caller
		self.caller = options.caller

		// Standalone
		// Set the component to manage his data by itself, calling to the database and it doesn't share his data with other through datum
		// if the property is set to false, the component will use datum to get his data and is forced to update datum to share his data with others
		// false option is used to reduce the calls to API server and database, section use to load all data with 1 call and components load his data from datum
		// true options is used to call directly to API and manage his data, used by tools or services that need components standalone.
		self.standalone = true

		// pagination info
		// self.pagination = (self.data && self.data.pagination)
		// 	? self.data.pagination
		// 	: { // pagination info (used in portals, etc.)
		// 		total	: 0,
		// 		offset	: 0,
		// 		limit	: 0
		// 	}

		// self.type	= self.context.type 	// typology of current instance, usually 'component'
		// self.label	= self.context.label // label of current component like 'summary'
		// self.tools	= self.context.tools || [] //set the tools of the component
		// self.value_separator	= (self.context.properties && self.context.properties.value_separator) ? self.context.properties.value_separator : ' | '

	// set_context_vars. context vars re-updated after new build
		// set_context_vars(self, self.context)

	// value_pool. queue of component value changes (needed to avoid parallel change save collisions)
		self.change_value_pool = []

	// is_data_changed. bool set as true when component data changes.
		self.is_data_changed = false

	// events subscription
		// Two calls:
		// first; set the component_common events, the call is not in the instance and assign the self in the call
		// second; set the specific events of the components, they are part of the instance
		events_subscription(self)
		// set the component events (it could had his own definition or not) in the instance.
		if(typeof self.events_subscription==='function'){
			self.events_subscription()
		}

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
		self.status = 'initiated'


	return true
}//end init



/**
* BUILD
* @param object value (locator)
* @return bool
*/
component_common.prototype.build = async function(autoload=false){
	// const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		// if (!self.datum) self.datum = {data:[]}
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}
		// changed_data. Set as empty array always
		self.data.changed_data = []

	// load data on auto-load true
	// when the auto-load if false the data will be injected by the caller (as section_record or others)
		if (autoload===true) {

			// rqo
				const rqo = {
					source	: create_source(self, 'get_data'),
					action	: 'read'
				}

			// get context and data
				const api_response = await data_manager.request({
					body : rqo
				})
				// console.log(`COMPONENT ${self.model} api_response:`,self.id, api_response);
				dd_console(`[component_common.build] COMPONENT: ${self.model} api_response:`, 'DEBUG', api_response)

			// Context
				const context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)
				if (!context) {
					console.error("context not found in api_response:", api_response);
				}
				self.context = context

			// Data
				const data = api_response.result.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id)
				if(!data){
					console.warn("data not found in api_response:",api_response);
				}
				self.data = data || {}

			// Update datum when the component is not standalone, it's dependent of section or others with common datum
				if(!self.standalone){
					await self.update_datum(api_response.result.data)
				}else{
					self.datum.context	= api_response.result.context
					self.datum.data		= api_response.result.data
				}

			// rqo. build again rqo with updated request_config if exists
				// if (self.context.request_config) {
				// 	self.rqo.show = self.build_rqo('show', self.context.request_config, 'get_data')
				// }
		}

	// update instance properties from context
		set_context_vars(self, self.context)

	// subscribe to the observer events (important: only once)
		init_events_subscription(self)

	// build_custom optional
		// if (typeof self.build_custom==='function') {
		// 	await self.build_custom()
		// }

	// set the server data to preserve the data that is saved in DDBB
		self.db_data = clone(self.data)

	// is_inside_tool
		self.is_inside_tool = ui.inside_tool(self)

	// status update
		self.status = 'builded'

	// dd_console(`__Time to build component: ${(performance.now()-t0).toFixed(3)} ms`,'DEBUG', [self.tipo,self.model])

	return true
}//end component_common.prototype.build



/**
* BUILD_OLD
* @param object value (locator)
* @return bool
*/
	// component_common.prototype.build_OLD = async function(autoload=false){
	// 	const t0 = performance.now()

	// 	const self = this

	// 	// status update
	// 		self.status = 'building'

	// 	// self.datum. On building, if datum is not created, creation is needed
	// 		if (!self.datum) self.datum = {data:[]}

	// 	// load data on auto-load true
	// 		if (autoload===true) {

	// 			// console.log("++++ self.rqo.show:", clone(self.rqo.show));
	// 			// console.log("self.context:",self.context);
	// 			// alert("Loading component " + self.model + " - " + self.tipo);

	// 			// set rqo if not exists
	// 				// if(!self.rqo.show){
	// 				// 	const request_config = self.context.request_config || null
	// 				// 	self.rqo.show = self.build_rqo('show', request_config, 'get_data')
	// 				// }
	// 				// const request_config	= self.context.request_config || null
	// 				const rqo = {
	// 					source	: create_source(self, 'get_data'),
	// 					action	: 'read'
	// 				}

	// 			// load data
	// 				const api_response			= await data_manager.request({body : rqo})

	// 			// debug
	// 				if(SHOW_DEBUG===true) {
	// 					console.log(`[component_common.build] + api_response (${Math.round(performance.now()-t0)} ms) :`, api_response);
	// 				}

	// 			// set context and data to current instance
	// 				await self.update_datum(api_response.result.data)
	// 				self.context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)

	// 			// rqo. build again rqo with updated request_config if exists
	// 				if (self.context.request_config) {
	// 					self.rqo.show = self.build_rqo('show', self.context.request_config, 'get_data')
	// 				}
	// 		}

	// 	// update instance properties from context
	// 		set_context_vars(self, self.context)

	// 	// permissions. calculate and set (used by section records later)
	// 		// self.permissions = self.context.permissions

	// 	// debug
	// 		if(SHOW_DEBUG===true) {
	// 			// console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
	// 		}

	// 	// build_custom optional
	// 		// if (typeof self.build_custom==='function') {
	// 		// 	await self.build_custom()
	// 		// }

	// 	// is_inside_tool
	// 		self.is_inside_tool = ui.inside_tool(self)

	// 	// status update
	// 		self.status = 'builded'

	// 	// dd_console(`__Time to build component: ${(performance.now()-t0).toFixed(3)} ms`,'DEBUG', [self.tipo,self.model])

	// 	return true
	// }//end component_common.prototype.build



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
		const observe = (self.context.properties && typeof self.context.properties.observe!=="undefined")
			? (self.context.properties.observe || null)
			: null
		if(observe){
			const l = observe.length
			for (let i = l - 1; i >= 0; i--) {
				const component_tipo	= observe[i].component_tipo // target event component tipo
				const event_name		= observe[i].event
				const perform			= observe[i].perform || null

				if(perform && typeof self[perform]==="function"){
					// the event will listen the id_base ( section_tipo +'_'+ section_id +'_'+ component_tipo)
					// the id_base is built when the component is instantiated
					// this event can be fired by:
					// 		event_manager.publish(event +'_'+ self.section_tipo +'_'+ self.section_id +'_'+ self.tipo, data_to_send)
					// or the sort format with the id_base of the observable component:
					// 		event_manager.publish(event +'_'+ self.id_base, data_to_send)
					const id_base = self.section_tipo +'_'+ self.section_id +'_'+ component_tipo
					// console.log("SUBSCRIBE self.id:", self.id, ' id_base:',id_base, " perform:"+perform);
					self.events_tokens.push(
						event_manager.subscribe(event_name +'_'+ id_base, self[perform].bind(self))
					)

				}else{

					// event_name is defin ed but not perform case
					if (event_name) {
						console.group(`Invalid observe ${self.tipo} - ${self.model}`);
						console.warn(`Invalid observe perform. Target function '${perform}' does not exists in ${self.model}:`, observe[i], typeof self[perform]);
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
*
* @param object changed_data
* 	[{
* 		action : "update",
* 		key : 0,
* 		value : "XXX"
* 	}]
* @return promise save_promise
*/
component_common.prototype.save = async function(changed_data) {

	const self = this

	// check data
		if (typeof changed_data==='undefined' || !Array.isArray(changed_data) || changed_data.length<1) {
			if(SHOW_DEBUG===true) {
				console.error("+++++ Invalid changed_data [stop save]:", changed_data)
				console.trace()
			}
			const msg = "Error on save. changed_data is undefined or empty!"
			console.error('msg:', msg);
			alert("Error on save. changed_data is undefined or empty!")

			// dispatch event save
				event_manager.publish('save', {
					instance		: self,
					api_response	: null,
					msg				: msg
				})

			return false
		}

	// check data is changed (only action=update items)
		const update_items			= changed_data.filter(el => el.action==='update')
		const update_items_length	= update_items.length
		if (update_items_length>0) {
			const ar_equals = []
			for (let i = 0; i < update_items_length; i++) {

				const changed_data_item = update_items[i]

				const original_value	= self.db_data.value[changed_data_item.key]
				const new_value			= changed_data_item.value

				if (is_equal(new_value, original_value)) {
					ar_equals.push(changed_data_item)
				}
			}
			if (ar_equals.length===update_items_length) {
				// dispatch event save
					event_manager.publish('save', {
						instance		: self,
						api_response	: null,
						msg				: get_label.dato_no_modificado || 'The data was not modified. Canceled save'
					})

				// page unload event
					// set_before_unload (bool)
					set_before_unload(false)

				return false
			}
		}

	// remove previous success/error css class if exists
		if (self.node) {
			if (self.node.classList.contains("error")) {
				self.node.classList.remove("error")
			}
			if (self.node.classList.contains("save_success")) {
				self.node.classList.remove("save_success")
			}
		}

	// send_data
		const send_data = async () => {
			try {

				// data. isolated cloned var
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

				// data_manager
					const api_response = await data_manager.request({
						body : rqo
					})
					dd_console(`[component_common.save] api_response ${self.model} ${self.tipo}`, 'DEBUG', api_response)

				// debug
					if(SHOW_DEBUG===true) {
						if (api_response.result) {
							// const changed_data_value = typeof changed_data.value!=="undefined" ? changed_data.value : 'Value not available'
							// const api_response_data_value = typeof api_response.result.data[0]!=="undefined" ? api_response.result.data[0] : 'Value not available'
							const changed_data_length = changed_data.length
							for (let i = 0; i < changed_data_length; i++) {
								const item = changed_data[i]
								console.log(`[component_common.save] action:'${item.action}' lang:'${self.context.lang}', key:'${item.key}'`);
							}
							// console.log(`[component_common.save] api_response value:`, api_response_data_value);
							console.log("[component_common.save] api_response:", api_response);
						}else{
							console.error("[component_common.save] api_response ERROR:",api_response);
						}
					}

				// Update the new data into the instance and the general datum
					// if (api_response.result) self.update_datum(api_response) // (!) Use build to update_datum, NOT here

				return api_response

			}catch(error) {

				console.error("+++++++ COMPONENT SAVE ERROR:", error);
				return {
					result	: false,
					msg		: error.message,
					error	: error
				}
			}
		}
		const response = await send_data()

	// check result for errors
	// result expected is current section_id. False is returned if a problem found
		const result = response.result
		if (result===false) {

			// error case

			self.node.classList.add("error")

			if (response.error) {
				console.error(response.error)
			}
			if (response.msg) {
				alert("Error on save self "+self.model+" data: \n" + response.msg)
			}

			console.error("ERROR response:",response);

		}else{

			// success case

			// data
				const data = result.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id)
				if(!data){
					console.warn("data not found in result:", result);
				}
				self.data = data || {}

			// datum. Update datum (centralized update datum call)
				await self.update_datum(result.data)

			// db_data. Updates db_data
				if (self.model!=='component_password') {
					self.db_data = self.db_data
						? self.db_data
						: {}

					self.db_data.value = self.db_data.value
						? self.db_data.value
						: [null]

					self.db_data.value[changed_data.key] = clone(changed_data.value)
				}

			// ui. Add save_success class to component wrappers (green line animation)
				if (self.mode==='edit') {
					ui.component.exec_save_successfully_animation(self)
				}

			// page unload event set as false (reset)
				set_before_unload(false)

			// remove style modified to wrapper node
				if (self.node && self.node.classList.contains('modified')) {
					self.node.classList.remove('modified')
				}
			}

		// dispatch save event
			event_manager.publish('save', {
				instance		: self,
				api_response	: response
			})

		// remove acive
			// ui.component.inactive(self)

		// blur selection
			// document.activeElement.blur()


	return response
}//end save



/**
* GET_VALUE
* Look component data value (we assume that it is updated)
* @return array value
*/
component_common.prototype.get_value = function() {

	const value = this.data.value

	return value
}//end get_value



/**
* SET_VALUE
* Update component data value with DOM node actual value
* @return bool true
*/
component_common.prototype.set_value = function(value) {

	// set value in data instance
	this.data.value = value

	return true
}//end set_value



/**
* UPDATE_DATUM
* Update component data value with changed_data send by the DOM element
* Update the datum and the data of the instance with the data changed and saved.
* @param object new_data
*	new_data contains fresh calculated data of saved component
* @return bool true
*/
component_common.prototype.update_datum = async function(new_data) {

	const self = this

	// console.log("____ new_data:",new_data);
	// console.log("____ self:",clone(self));

	// (!) Note that component datum is shared with section datum. BUT! Portals have specific datum

	// new_data
		if (!new_data || !Array.isArray(new_data)) {
			console.error(`component_common.update_datum received new_data is invalid! Expected array. Received:`, typeof new_data, new_data);
			return false
		}
		const new_data_length = new_data.length
			// console.log("update_datum --------------------------- new_data:", clone(new_data) );
			// console.log("update_datum --------------------------- first self.datum.data:", clone(self.datum.data));
			// console.trace();

	// datum (global shared with section)
		// remove the component old data in the datum (from down to top array items)
			for (let i = new_data_length - 1; i >= 0; i--) {

				const data_item = new_data[i]
				const ar_data_elements = self.datum.data.filter(el => el.tipo===data_item.tipo && el.section_tipo===data_item.section_tipo && el.section_id==data_item.section_id)

				const ar_data_el_len = ar_data_elements.length

				for (let j = ar_data_el_len - 1; j >= 0; j--) {
					const current_data_element  = ar_data_elements[j]
					current_data_element.value			= data_item.value
					current_data_element.fallback_value	= data_item.fallback_value
				}

				//ATT ! removed because it get only 1 element in datum and it's necessary update the all items inside datum.

				// const index_to_delete = self.datum.data.findIndex(el => el.tipo===data_item.tipo && el.section_tipo===data_item.section_tipo && el.section_id==data_item.section_id)
				// if (index_to_delete!==-1) {
				// 	// Ok, value already exists and will be deleted to prevent duplicates
				// 	if(SHOW_DEBUG===true) {
				// 		console.log(`:---- [update_datum] DELETED data_item i:${index_to_delete} `, clone(self.datum.data[index_to_delete]) );
				// 	}
				// 	self.datum.data.splice(index_to_delete, 1);
				// }else{
				// 	// Ops. data doesn't exists previously. Nothing to delete
				// 	if (self.datum.data.length>0) {
				// 		console.warn(`(!) [update_datum] NOT FOUND index_to_delete ${i} in component datum:`, self.model, data_item.tipo, data_item.section_tipo, data_item.section_id, clone(self.datum) )
				// 	}
				// }
			}

		// add the new data into the general datum
			// self.datum.data = [...self.datum.data, ...new_data]
				// console.log("update_datum --------------------------- final self.datum.data:", clone(self.datum.data) );

	// data (specific component data)
		// current element data (from current component only), removed!, we need update all data in all components.
			// self.data = self.datum.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id) || {}
	// console.log("self.data:",self.datum.data.filter(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id));

		// data of multiple components
		// the data sent by the serve can be data of multiple components. The new_data is a array with the all response from server.
		// When one component is observed by other and the observable component data is changed, the observer component also will change
		// It's necessary update the data in all components (self, observers), not only the caller.
			const ar_instances = instances.get_all_instances()
			/* OLD WAY MONO
				for (let i = new_data_length - 1; i >= 0; i--) {
					const data_item = new_data[i]
					const current_instance = ar_instances.find(inst => inst.tipo===data_item.tipo && inst.section_tipo===data_item.section_tipo && inst.section_id==data_item.section_id)
					if (current_instance) {
						// add
						// current_instance.data = self.datum.data.find(el => el.tipo===data_item.tipo && el.section_tipo===data_item.section_tipo && el.section_id==data_item.section_id) || {}
						current_instance.data = self.datum.data.find(el => el.tipo===current_instance.tipo && el.section_tipo===current_instance.section_tipo && el.section_id==current_instance.section_id) || {}
					}else{
						console.warn("(!) Not found current instance:", data_item.tipo, data_item.section_tipo, data_item.section_id)
					}
				}
				*/
			// new way multi. Iterate data and instances with equal data
			for (let i = new_data_length - 1; i >= 0; i--) {

				const data_item			= new_data[i]
				// console.log("data_item:",data_item);
				// console.log("ar_instances:",ar_instances);
				const current_instances	= ar_instances.filter(el =>
					el.tipo===data_item.tipo &&
					el.section_tipo===data_item.section_tipo &&
					el.section_id==data_item.section_id &&
					el.lang===data_item.lang
				)
				const instances_length	= current_instances.length
				if (instances_length>0) {
					// add
					for (let j = 0; j < instances_length; j++) {
						const inst		= current_instances[j]
						// inst.data	= self.datum.data.find(el => el.tipo===data_item.tipo && el.section_tipo===data_item.section_tipo && el.section_id==data_item.section_id) || {}
						inst.data		= self.datum.data.find(el =>
							el.tipo===inst.tipo &&
							el.section_tipo===inst.section_tipo &&
							el.section_id==inst.section_id &&
							el.lang===inst.lang
						) || {}
						// console.log("____ updated instance data:", inst);
					}
				}else{
					console.warn(`(!) [update_datum] Not found current instance: tipo:${data_item.tipo}, section_tipo:${data_item.section_tipo}, section_id:${data_item.section_id} in instances:`, current_instances)
				}
			}


		// check data
			if (typeof self.data==="undefined") {
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
* Updates component data value with changed_data sent by the DOM element
* @param object changed_data
* Sample data:
* {
*	key		: 0,
*	value	: input.value,
*	action	: 'update'
* }
* @return bool true
*/
component_common.prototype.update_data_value = function(changed_data_item) {

	const self = this

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("======= update_data_value changed_data_item:", clone(changed_data_item));
			// const data_value = typeof self.data.value!=="undefined" ? self.data.value : null
			// console.log("======= update_data_value PRE CHANGE:", clone(data_value) );
		}

	// changed_data_item
		const action		= changed_data_item.action
		const data_key		= typeof changed_data_item.key!=='undefined'
			? changed_data_item.key // (!) allowed int 0 or bool false
			: null
		const changed_value	= changed_data_item.value

		self.data = self.data || {}

	// set_data. If action is 'set_data' the value is changed as is, exec a bulk insert or update the data of the component.
		if(action==='set_data'){
			self.data.value = changed_value || []
			return true
		}

	// data.value. When the data_key is false and value is null, the value is propagated to all items in the array
		if (data_key===false && changed_value===null) {
				// delete all values
				self.data.value = []
		}else{
			if (changed_value===null) {
				// delete current value key from array
				self.data.value.splice(data_key,1)
			}else{
				// add / update array key value
				self.data.value = self.data.value || []
				self.data.value[data_key] = changed_value
			}
		}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("***** update_data_value data_key:",clone(data_key));
			//console.log("======= update_data_value:",clone(self.data.value));
			console.log("======= [component_common] update_data_value POST CHANGE:", clone(self.data.value), self.id);
		}


	return true
}//end update_data_value



/**
* CHANGE_VALUE (AND SAVE)
* 	Changes one or more component's values:
* 		1 - Update self.data.value
* 		2 - Save values to DDBB
* 		3 - Reset self.data.changed_data to empty array
* 	Publish event 'update_value_'+self.id_base
*
* @param object options
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
		const action				= changed_data.action
		const label					= options.label
		const refresh				= typeof options.refresh!=='undefined' ? options.refresh : false
		const build_autoload		= typeof options.build_autoload!=='undefined' ? options.build_autoload : false
		const custom_remove_dialog	= options.remove_dialog // undefined|function|bool

		if (!Array.isArray(changed_data)) {
			throw `Exception: changed_data is not as expected (array). ` + typeof changed_data;
		}

	// remove dialog. Check the remove dialog (default or sent by caller )user confirmation prevents remove accidentally
		if (action==='remove') {

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

	// update the component data value in the instance before to save (returns bool)
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
			// self.data.changed_data = changed_data
			if (api_response && api_response.result) {
				// reset component changed_data to empty object
				self.data.changed_data = []
			}

		// refresh
			if (refresh===true) {
				await self.refresh({
					build_autoload : build_autoload // default value is false
				})
			}

	// restore previous status
		self.status = prev_status

	// event to update the DOM elements of the instance
		event_manager.publish('update_value_'+self.id_base, {
			caller			: self,
			changed_data	: changed_data
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
* GET_AR_INSTANCES (COMPONENT)
* Create (init and build) a section_record for each component value
* Used by portals to get all rows for render
* @return array of objects (section_record instances)
*/
component_common.prototype.get_ar_instances = async function(options={}){

	const self = this

	// options
		const mode			= options.mode || self.mode || 'list'
		const columns_map	= options.columns_map || self.columns_map
		const id_variant	= options.id_variant || self.id_variant || null

	// self data verification
		// 	if (typeof self.data==="undefined") {
		// 		self.data = {
		// 			value : []
		// 		}
		// 	}

	// short vars
		// const records_mode	= (self.context.properties.source) ? self.context.properties.source.records_mode : null
		const lang				= self.section_lang
		const value				= self.data.value || []
		const value_length		= value.length

	// console.log("---- get_ar_instances deep_render value:", clone(value));

	// iterate rows
		const ar_promises = []
		for (let i = 0; i < value_length; i++) {

			const locator				= value[i];
			const current_section_tipo	= locator.section_tipo
			const current_section_id	= locator.section_id
			// const current_data		= self.datum.data.filter(el => el.section_tipo===current_section_tipo && el.section_id===current_section_id)

			// console.log("self:",self);

			// console.log("current_section_tipo:",current_section_tipo, current_section_id, self.data.row_section_id);

			// const current_context = self.datum.context.filter(el => el.section_tipo===current_section_tipo && el.parent===self.tipo)
			const current_context = (typeof self.datum.context!=="undefined")
				? self.datum.context.filter(el => el.section_tipo===current_section_tipo && el.parent===self.tipo)
				: []

			const instance_options = {
				model			: 'section_record',
				tipo			: self.tipo,
				section_tipo	: current_section_tipo,
				section_id		: current_section_id,
				mode			: mode,
				lang			: lang,
				context			: current_context,
				// data			: current_data,
				datum			: self.datum,
				row_key			: i,
				paginated_key	: locator.paginated_key, // used by autocomplete / portal
				caller			: self,
				columns_map		: columns_map,
				column_id		: self.column_id,
				locator			: locator
			}

			// id_variant . Propagate a custom instance id to children
				if (id_variant) {
					instance_options.id_variant = id_variant
				}
				// locator tag_id modifies id_variant when is present
				if (locator.tag_id) {
					const tag_id_add = '_l' + locator.tag_id
					instance_options.id_variant = (instance_options.id_variant)
						? instance_options.id_variant + tag_id_add
						: tag_id_add
				}

			// matrix id (time machine mode)
				if (self.matrix_id) {
					instance_options.matrix_id = self.matrix_id
				}

			// await
				// // section_record instance
				// 	const current_section_record = await instances.get_instance(instance_options)
				// 	await current_section_record.build()
				// // add instance
				// 	ar_instances.push(current_section_record)

			// promise add and continue. Init and build
				ar_promises.push(new Promise(function(resolve){
					instances.get_instance(instance_options)
					.then(function(current_section_record){
						current_section_record.build()
						.then(function(){
							resolve(current_section_record)
						})
					})
				}))

		}//end for loop

	// ar_instances. When all section_record instances are built, set them
		const ar_instances = await Promise.all(ar_promises).then((ready_instances) => {
			return ready_instances
		});


	return ar_instances
}//end get_ar_instances



/**
* CHANGE_MODE
* Destroy current instance and dependencies without remove html nodes (used to get target parent node placed in DOM)
* Create a new instance in the new mode (for example, from list to edit_in_list)
* Render a fresh full element node in the new mode
* Replace every old placed DOM node with the new one
* Active element (using event manager publish)
*/
component_common.prototype.change_mode = async function(new_mode, autoload) {

	const self = this

	const current_context		= self.context
	const current_data			= self.data
	const current_datum			= self.datum
	const current_section_id	= self.section_id
	const section_lang			= self.section_lang
	const old_node				= self.node

	// new_mode check. When new_mode is undefined, fallback to 'list'. From 'list', change to 'edit_in_list'
		if(typeof new_mode==='undefined'){
			new_mode = self.mode==='list' ? 'edit_in_list' : 'list'
		}

	// destroy self instance (delete_self=true, delete_dependences=false, remove_dom=false)
		self.destroy(
			true, // delete_self
			true, // delete_dependences
			false // remove_dom
		)

	// element. Create the instance options for build it. The instance is reflect of the context and section_id
		const new_instance = await instances.get_instance({
			model			: current_context.model,
			tipo			: current_context.tipo,
			section_tipo	: current_context.section_tipo,
			section_id		: current_section_id,
			mode			: new_mode,
			lang			: current_context.lang,
			section_lang	: section_lang,
			parent			: current_context.parent,
			type			: current_context.type,
			context			: current_context,
			data			: current_data,
			datum			: current_datum
		})

	// build
		await new_instance.build(autoload)

	// render
		const new_node = await new_instance.render({
			render_level : 'full'
		})

	// replace the node with the new render
		old_node.parentNode.replaceChild(new_node, old_node)

	// active component at end
		if (new_mode.indexOf('edit')!==-1) {
			if (!new_instance.active) {
				event_manager.publish('activate_component', new_instance)
			}
		}


	return true
}//end change_mode



/**
* SET_CHANGED_DATA
* Unified way to set changed_data
* @param object options
* @return bool
*/
component_common.prototype.set_changed_data = function(changed_data_item) {

	const self = this

	// changed_data. Set as empty array always
		self.data.changed_data = self.data.changed_data || []

	// set changed_data item
		const key = self.data.changed_data.findIndex(el => el.key===changed_data_item.key)
		if (key!==-1) {
			// replace
			self.data.changed_data[key] = changed_data_item
		}else{
			// add
			self.data.changed_data.push(changed_data_item)
		}

	// prevents user navigate loosing changes without warning
		set_before_unload(true)

	// add style modified to wrapper node
		if (!self.node.classList.contains('modified')) {
			self.node.classList.add('modified')
		}

	// debug
		console.log('+++++++++++++++++++++++++++++ self.data.changed_data:', clone(self.data.changed_data));


	return true
}//end set_changed_data
