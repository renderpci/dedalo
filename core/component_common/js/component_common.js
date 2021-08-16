/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	// import * as dd from '../../common/js/dd.common.funtions.js'
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {create_source} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



export const component_common = function(){

	return true
};//end component_common



/**
* INIT
* Common init prototype to use in components as default
* @return bool true
*/
component_common.prototype.init = async function(options) {
	const t0 = performance.now()

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
		self.node			= [] // array of component nodes places in light DOM

		self.events_tokens	= [] // array of events of current component
		self.ar_instances	= [] // array of children instances of current instance (used for autocomplete, etc.)
		self.tools			= []
		//rqo
		// self.rqo 		= {}

		self.init_events_subscribed = false // initial value (false) is changed on build

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
		// self.divisor	= (self.context.properties && self.context.properties.divisor) ? self.context.properties.divisor : ' | '

	// set_context_vars. context vars re-updated after new build
		set_context_vars(self, self.context)

	// value_pool. queue of component value changes (needed to avoid parallel change save collisions)
		self.change_value_pool = []


	// events subscription
		// active_component (when user focus it in DOM)
			self.events_tokens.push(
				event_manager.subscribe('active_component', (actived_component) => {
					// call ui.component
					ui.component.active(self, actived_component)
					.then( response => { // response is bool value
						if (response===true && typeof self.active==="function" ) {
							self.active()
						}
					})
				})
			)


	// subscribe to the observer events (important: only once)
		// init_events_subscription(self)


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
};//end init



/**
* BUILD
* @param object value (locator)
* @return bool
*/
component_common.prototype.build = async function(autoload=false){
	const t0 = performance.now()

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

	const current_data_manager = new data_manager()


	// load data on auto-load true
		if (autoload===true) {

			// rqo
				const rqo = {
					source	: create_source(self, 'get_data'),
					action	: 'read'
				}

			// get context and data
				const api_response = await current_data_manager.request({body : rqo})
					// console.log(`COMPONENT ${self.model} api_response:`,self.id, api_response);
					dd_console(`[component_common.build] COMPONENT ${self.model} api_response:`, 'DEBUG', api_response)

			// set context and data to current instance
				await self.update_datum(api_response.result.data)
				self.context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)

			// rqo. build again rqo with updated request_config if exists
				if (self.context.request_config) {
					self.rqo.show = self.build_rqo('show', self.context.request_config, 'get_data')
				}
		}

	// update instance properties from context
		set_context_vars(self, self.context)

	// subscribe to the observer events (important: only once)
		init_events_subscription(self)

	// build_custom optional
		// if (typeof self.build_custom==='function') {
		// 	await self.build_custom()
		// }

	// is_inside_tool
		self.is_inside_tool = ui.inside_tool(self)

	// status update
		self.status = 'builded'

	// dd_console(`__Time to build component: ${(performance.now()-t0).toFixed(3)} ms`,'DEBUG', [self.tipo,self.model])

	return true
};//end component_common.prototype.build



/**
* BUILD_OLD
* @param object value (locator)
* @return bool
*/
component_common.prototype.build_OLD = async function(autoload=false){
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		if (!self.datum) self.datum = {data:[]}

	// load data on auto-load true
		if (autoload===true) {

			// console.log("++++ self.rqo.show:", clone(self.rqo.show));
			// console.log("self.context:",self.context);
			// alert("Loading component " + self.model + " - " + self.tipo);

			// set rqo if not exists
				// if(!self.rqo.show){
				// 	const request_config = self.context.request_config || null
				// 	self.rqo.show = self.build_rqo('show', request_config, 'get_data')
				// }
				// const request_config	= self.context.request_config || null
				const rqo = {
					source	: create_source(self, 'get_data'),
					action	: 'read'
				}

			// load data
				const current_data_manager	= new data_manager()
				const api_response			= await current_data_manager.request({body : rqo})

			// debug
				if(SHOW_DEBUG===true) {
					console.log(`[component_common.build] + api_response (${Math.round(performance.now()-t0)} ms) :`, api_response);
				}

			// set context and data to current instance
				await self.update_datum(api_response.result.data)
				self.context = api_response.result.context.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo)

			// rqo. build again rqo with updated request_config if exists
				if (self.context.request_config) {
					self.rqo.show = self.build_rqo('show', self.context.request_config, 'get_data')
				}
		}

	// update instance properties from context
		set_context_vars(self, self.context)

	// permissions. calculate and set (used by section records later)
		// self.permissions = self.context.permissions

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
		}

	// build_custom optional
		// if (typeof self.build_custom==='function') {
		// 	await self.build_custom()
		// }

	// is_inside_tool
		self.is_inside_tool = ui.inside_tool(self)

	// status update
		self.status = 'builded'

	// dd_console(`__Time to build component: ${(performance.now()-t0).toFixed(3)} ms`,'DEBUG', [self.tipo,self.model])

	return true
};//end component_common.prototype.build



/**
* SET_CONTEXT_VARS
* type, label, tools, divisor, permissions
*/
export const set_context_vars = function(self, context) {

	self.type			= self.context.type // typology of current instance, usually 'component'
	self.label			= self.context.label // label of current component like 'summary'
	self.tools			= self.context.tools || [] //set the tools of the component
	self.divisor		= (self.context.properties && self.context.properties.divisor) ? self.context.properties.divisor : ' | '
	self.permissions	= self.context.permissions || null

	return true
};//end set_context_vars



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
					console.warn(`Invalid observe perform. Target function '${perform}' don't exists in ${self.model}:`, observe[i], typeof self[perform]);
					console.warn(`self.context.properties.observe of ${self.model} - ${self.tipo} :`, observe);
				}
			}
		}

	// set as subscribed
		self.init_events_subscribed = true

	return true
}//end init_events_subscription



/**
* COMPONENT_SAVE
* Receive full component object and start the save process across the section_record
* @param object component
* @return promise save_promise
*/
component_common.prototype.save = async function(changed_data) {

	const self = this

	// check data
		if (typeof changed_data==="undefined") {
			if(SHOW_DEBUG===true) {
				console.error("+++++ Invalid changed_data [stop save]:", changed_data)
				console.trace()
			}
			alert("Error on save. changed_data is undefined!")
			return false
		}

	// remove previous success/error css class if exists
		self.node.map(item => {
			item.classList.remove("error","save_success")
			item.classList.add("loading")
		})

	// send_data
		const send_data = async () => {
			try {

				// data. isolated cloned var
				const data = JSON.parse(JSON.stringify(self.data))
				data.changed_data = changed_data

				// context. isolated cloned var
				const context = JSON.parse(JSON.stringify(self.context))

				// data_manager
					const current_data_manager	= new data_manager()
					const api_response			= await current_data_manager.request({
						body : {
							action		: 'save',
							context		: context,
							data		: data,
							section_id	: self.section_id
						}
					})
					dd_console(`component_common save api_response`, 'DEBUG', api_response)

				// debug
					if(SHOW_DEBUG===true) {
						if (api_response.result) {
							const changed_data_value = typeof changed_data.value!=="undefined" ? changed_data.value : 'Value not available'
							// const api_response_data_value = typeof api_response.result.data[0]!=="undefined" ? api_response.result.data[0] : 'Value not available'
							console.log(`[component_common.save] action:'${changed_data.action}' lang:'${self.context.lang}', key:'${changed_data.key}'`);
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
		const save_promise = send_data()

	// check result for errors
		save_promise.then(async function(response){

			self.node.map(item => {
				item.classList.remove("loading")
			})

			// result expected is current section_id. False is returned if a problem found
			const result = response.result
			if (result===false) {

				self.node.map(item => {
					item.classList.add("error")
				})

				if (response.error) {
					console.error(response.error)
				}
				if (response.msg) {
					alert("Error on save self "+self.model+" data: \n" + response.msg)
				}

				console.error("ERROR response:",response);

			}else{
				// success

				// update datum (centralized update datum call)
					await self.update_datum(result.data)

				// success. add save_success class to component wrappers (green line animation)
					self.node.map(item => {
						item.classList.add("save_success")
					})

				// remove save_success. after 2000ms, remove wrapper class to avoid issues on refresh
					setTimeout(()=>{
						self.node.map(item => {
							// item.classList.remove("save_success")
							// allow restart animation. Not set state pause before animation ends (2 secs)
							item.style.animationPlayState = "paused";
							item.style.webkitAnimationPlayState = "paused";
						})
					},2000)
			}
		})

	return save_promise
};//end save



/**
* GET_VALUE
* Look component data value (we assume that it is updated)
* @return array value
*/
component_common.prototype.get_value = function() {

	const value = this.data.value

	return value
};//end get_value



/**
* SET_VALUE
* Update component data value with DOM node actual value
* @return bool true
*/
component_common.prototype.set_value = function(value) {

	// set value in data instance
	this.data.value = value

	return true
};//end set_value



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

				const index_to_delete = self.datum.data.findIndex(el => el.tipo===data_item.tipo && el.section_tipo===data_item.section_tipo && el.section_id==data_item.section_id)
				if (index_to_delete!==-1) {
					// Ok, value already exists and will be deleted to prevent duplicates
					if(SHOW_DEBUG===true) {
						console.log(`:---- [update_datum] DELETED data_item i:${index_to_delete} `, clone(self.datum.data[index_to_delete]) );
					}
					self.datum.data.splice(index_to_delete, 1);
				}else{
					// Ops. data doesn't exists previously. Nothing to delete
					console.warn("(!) [update_datum] NOT FOUNDED index_to_delete in component datum:", self.model, data_item.tipo, data_item.section_tipo, data_item.section_id, clone(self.datum) ) 
				}
			}

		// add the new data into the general datum
			self.datum.data = [...self.datum.data, ...new_data]
				// console.log("update_datum --------------------------- final self.datum.data:", clone(self.datum.data) );

	// data (specific component data)
		// current element data (from current component only), removed!, we need update all data in all components.
			// self.data = self.datum.data.find(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id===self.section_id) || {}


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
				const current_instances	= ar_instances.filter(inst => inst.tipo===data_item.tipo && inst.section_tipo===data_item.section_tipo && inst.section_id==data_item.section_id)
				const instances_length	= current_instances.length
				if (instances_length>0) {
					// add
					for (let j = 0; j < instances_length; j++) {
						const inst		= current_instances[j]
						// inst.data	= self.datum.data.find(el => el.tipo===data_item.tipo && el.section_tipo===data_item.section_tipo && el.section_id==data_item.section_id) || {}
						inst.data		= self.datum.data.find(el => el.tipo===inst.tipo && el.section_tipo===inst.section_tipo && el.section_id==inst.section_id) || {}						
						// console.log("____ updated instance data:", inst);
					}
				}else{
					console.warn("(!) Not found current instance:", data_item.tipo, data_item.section_tipo, data_item.section_id)
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
		event_manager.publish('update_data_'+ self.id_base, '')



	return self.datum
};//end update_datum



/**
* UPDATE_DATA_VALUE
* Update component data value with changed_data send by the DOM element
* update_data_value. Update the data of the instance with the data changed.
* The format of changed_data is { key	: i,
* @param object changed_data	  value : input.value }
* @return bool true
*/
component_common.prototype.update_data_value = function(changed_data){

	const self = this

	if(SHOW_DEBUG===true) {
		const data_value = typeof self.data.value!=="undefined" ? self.data.value : null
		console.log("======= update_data_value PRE CHANGE:", clone(data_value) );
	}

	const data_key 		= changed_data.key
	const changed_value = changed_data.value

	// when the data_key is false the value is propagated to all items in the array
		if (data_key===false && changed_value===null) {
			self.data.value = []
		}else{
			if (changed_value===null) {
				self.data.value.splice(data_key,1)
			}else{
				self.data.value = self.data.value || []
				self.data.value[data_key] = changed_value
			}
		}

	if(SHOW_DEBUG===true) {
		//console.log("***** update_data_value data_key:",clone(data_key));
		//console.log("======= update_data_value:",clone(self.data.value));
		console.log("======= update_data_value POST CHANGE:", clone(self.data.value), self.id);
	}


	return true
};//end update_data_value



/**
* CHANGE_VALUE
* @param object options
* @return promise
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
	
	const changed_data 	= options.changed_data
	const action 		= changed_data.action
	const label 		= options.label
	const refresh 		= typeof options.refresh!=="undefined" ? options.refresh : false

	// user confirmation prevents remove accidentally
		if (action==='remove' && label) {
			if (!confirm(`Sure to remove value: ${label} ?`)) return false
		}

	const prev_status = self.status
	//self.status = 'changing'

	// update the data in the instance previous to save (returns bool)
		const update_data = self.update_data_value(changed_data)

	// save. save and rebuild the component
		const api_response = await self.save(changed_data)

		// fix instance changed_data
			self.data.changed_data = changed_data

		// refresh
			if (refresh===true) {
				self.refresh()
			}

		// restore previous status
			self.status = prev_status

		// exec queue one by one
			if(self.change_value_pool.length > 0) {
				(self.change_value_pool.shift())();
			}

	return api_response
};//end change_value



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
};//end function_queue



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
};//end update_node_contents



/**
* GET_AR_INSTANCES
* Create (init and build) a section_record for each component value
* Used by portals to get all rows for render
* @return array of objects (section_record instances)
*/
component_common.prototype.get_ar_instances = async function(){

	const self = this

	// // self data verification
	// 	if (typeof self.data==="undefined") {
	// 		self.data = {
	// 			value : []
	// 		}
	// 	}

	// const records_mode	= (self.context.properties.source) ? self.context.properties.source.records_mode : null
	const records_mode		= null
	const lang				= self.section_lang
	const value				= self.data.value || []
	const value_length		= value.length

	// console.log("---- get_ar_instances deep_render value:", clone(value));

	// iterate rows
		const ar_instances = []
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
				mode			: records_mode,
				lang			: lang,
				context			: current_context,
				// data			: current_data,
				datum			: self.datum,
				paginated_key	: locator.paginated_key, // used by autocomplete / portal
				caller			: self,
				columns			: self.columns,
				column_id		: self.column_id
			}

			// id_variant . Propagate a custom instance id to children
				if (self.id_variant) {
					instance_options.id_variant = self.id_variant
				}

				if (self.matrix_id) {
					instance_options.matrix_id = self.matrix_id
				}

			// section_record instance
				const current_section_record = await instances.get_instance(instance_options)
				await current_section_record.build()

			// add instance
				ar_instances.push(current_section_record)

		}//end for loop

	// set
		self.ar_instances = ar_instances

	return ar_instances
};//end get_ar_instances



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
	const ar_node				= self.node

	// new_mode check. When new_mode is undefined, fallback to 'list'. From 'list', change to 'edit_in_list'
		if(typeof new_mode==='undefined'){
			new_mode = self.mode==='list' ? 'edit_in_list' : 'list'
		}

	// destroy self instance (delete_self=true, delete_dependences=false, remove_dom=false)
		const destroyed = self.destroy(true, true, false)

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
		const node = await new_instance.render({
			render_level : 'full'
		})

	// clean and replace old DOM nodes
		await ui.update_dom_nodes(ar_node, node)

	// active component at end
		event_manager.publish('active_component', new_instance)


	return true
};//end change_mode



/**
* TEST_SAVE
*/
component_common.prototype.test_save = async function(component) {

	if (component.model==='component_input_text') {

		for (let i = 1; i <= 1; i++) {

			const time = i * 1000
			const ar_value = [i,"234"]

			setTimeout( async function() {

				component.set_value(ar_value)
				await component.render()
				component.save(component)

			},time)
		}
	}
};//end test_save


