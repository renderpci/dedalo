/*global get_label, page_globals, SHOW_DEBUG*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {create_source} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'



export const component_common = function(){

	return true
}//end component_common



/**
* INIT
* Common init prototype to use in components as default
* @return bool true
*/
component_common.prototype.init = async function(options) {

	const self = this

	if(SHOW_DEBUG===true) {
		//console.log("======+ INIT options.data:",options.data);
	}

	// instance key used vars
	self.model 			= options.model // structure model like 'component_input_text'
	self.tipo 			= options.tipo // structure tipo of current component like 'dd345'
	self.section_tipo 	= options.section_tipo // structure tipo like 'oh1'
	self.section_id 	= options.section_id // record section_id like 1
	self.matrix_id 		= options.matrix_id || null // record matrix_id like 1 (list_tm mode only)
	self.mode 			= options.mode // current component mode like 'edit'
	self.lang 			= options.lang // current component lang like 'lg-nolan'

	// DOM
	self.node 			= [] // array of component nodes places in lihgt DOM

	self.section_lang 	= options.section_lang // current section lang like 'lg-eng'
	self.parent 		= options.parent // tipo of structure parent like a section group 'dd4567'
	//self.paginator_id 	= options.paginator_id // removed unused
	self.events_tokens	= [] // array of events of current component
	self.ar_instances	= [] // array of children instances of current instance (used for autocomplete, etc.)
	self.sqo_context	= options.sqo_context // search query object of current component (used for autocomplete, etc.)

	// Optional vars
	self.context 	= options.context  		|| null // structure context of current component (include properties, tools, etc.)
	self.data 	 	= options.data 			|| null // current specific data of this component
	self.datum 	 	= options.datum  		|| null // global data including dependent data (used in portals, etc.)
	self.pagination = self.data && self.data.pagination
		? self.data.pagination
		: { // pagination info (used in portals, etc.)
			total : 0,
			offset: 0,
			limit : 0
		}

	self.type  = self.context.type 	// tipology of current instance, usually 'component'
	self.label = self.context.label // label of current component like 'summary'

	self.tools = self.context.tools || [] //set the tools of the component

	self.divisor = (self.context.properties && self.context.properties.divisor) ? self.context.properties.divisor : ' | '

	self.change_value_pool = [] // cue of component value changes (needed to avoid parallel change save)

	self.permissions = null

	// events subscription
		// active_component (when user focus it in dom)
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


	// events subscription
	const observe = typeof self.context.properties!=="undefined"
		? (self.context.properties.observe || null)
		: null
	if(observe){
		const l = observe.length
		for (let i = l - 1; i >= 0; i--) {
			const component_tipo 	= observe[i].component_tipo
			const event 			= observe[i].event
			const perform 			= observe[i].perform || null

			if(perform){
				self.events_tokens.push(
					event_manager.subscribe(event +'_'+ component_tipo, self[perform].bind(self))
				)
			}
		}
	}


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

	// self.sqo_context. Fill from context.sqo_context if defined
		if (!self.sqo_context && self.context.sqo_context) {
			self.sqo_context = self.context.sqo_context
		}

	// source. add to sqo_context show
		if (self.sqo_context && self.sqo_context.show) {
			// check if already exists a source into sqo_context.show
			const show_source = self.sqo_context.show.find(element => element.typo==='source')
			if (typeof show_source==="undefined") {
				const source = create_source(self,'get_data')
				// deep clone self sqo_context to avoid interactions (!)
				self.sqo_context = JSON.parse(JSON.stringify(self.sqo_context))
				self.sqo_context.show.push(source)
			}
		}

	// status update
		self.status = 'inited'

	return true
}//end init



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

	// load data if is not already received as option
		if (autoload===true) {

			// sqo_context
				// create the sqo_context
				self.sqo_context = {show: []}
				// create the own show ddo element
				const source = create_source(self, 'get_data')
				self.sqo_context.show.push(source)

			// load data
				const current_data_manager 	= new data_manager()
				const api_response 			= await current_data_manager.section_load_data(self.sqo_context.show)

			// debug
				if(SHOW_DEBUG===true) {
					console.log("[component_common.build] api_response:",api_response);
				}

			// Update the self.data into the datum and self instance
				self.update_datum(api_response)
		}

	// permissions. calculate and set (used by section records later)
		self.permissions = self.context.permissions

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
		}

	// build_custom optional
		if (typeof self.build_custom==='function') {
			await self.build_custom()
		}

	// is_inside_tool
		self.is_inside_tool = ui.inside_tool(self)

	// status update
		self.status = 'builded'


	return true
}//end component_autocomplete.prototype.build



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
			item.classList.remove("error","success")
			item.classList.add("loading")
		})

	// send_data
		const send_data = async () => {
			try {

				// data. isolated cloned var
				const data = JSON.parse(JSON.stringify(self.data))
				data.changed_data = changed_data

				// data_manager
					const current_data_manager 	= new data_manager()
					const api_response 			= await current_data_manager.request({
						body : {
							action 		: 'save',
							context 	: self.context,
							data		: data,
							section_id  : self.section_id
						}
					})

				// debug
					if(SHOW_DEBUG===true) {
						if (api_response.result) {
							const changed_data_value = typeof changed_data.value!=="undefined" ? changed_data.value : 'Value not available'
							const api_response_data_value = typeof api_response.result.data[0]!=="undefined" ? api_response.result.data[0] : 'Value not available'
							console.log(`[component_common.save] ${changed_data.action} ${self.context.lang}: ${changed_data.key}, ${changed_data_value} api_response value:`, api_response_data_value);
						}else{
							console.error("[component_common.save] api_response ERROR:",api_response);
						}
					}

				// Update the new data into the instance and the general datum
					if (api_response.result) self.update_datum(api_response)

				return api_response

			}catch(error) {

			  	console.log("+++++++ COMPONENT SAVE ERROR:", error);
			  	return {
			  		result 	: false,
			  		msg 	: error.message,
			  		error 	: error
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

				console.error("response:",response);

			}else{

				self.node.map(item => {
					item.classList.add("success")
				})
			}
		})

	return save_promise
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
* Update component data value with dom node actual value
* @return bool true
*/
component_common.prototype.set_value = function(value) {

	// set value in data instance
	this.data.value = value

	return true
}//end set_value



/**
* UPDATE_DATUM
* Update component data value with changed_data send by the dom element
* update_datum. Update the datum and the data of the instance with the data changed and saved
* the format of changed_data = { key	: i,
*								value : input.value }
* @return bool true
*/
component_common.prototype.update_datum = async function(api_response) {

	const self = this

	//const changed_data = self.data.changed_data
	//on building if datum is not created, creation is needed
		if (!self.datum) self.datum = {data:[]}

	// remove the component old data in general datum (from down to top array items)
		const datum_data_length = self.datum.data.length
		for (let i = datum_data_length - 1; i >= 0; i--) {
			const data_item = self.datum.data[i]
			// console.log("data_item:",data_item);
			//if (data_item.parent_tipo===self.tipo && data_item.parent_section_id===self.section_id){
			if (data_item.tipo===self.tipo && data_item.section_id===self.section_id){
				if(SHOW_DEBUG===true) {
					console.log(`:---- [update_datum] DELETE data_item i:${i} `, JSON.parse( JSON.stringify(data_item)) );
				}
				self.datum.data.splice(i, 1);
			}
		}
		if(SHOW_DEBUG===true) {
			//console.log(" [component_common.update_datum] api_response.result.data:",JSON.parse( JSON.stringify(api_response.result.data)));
		}

	// add the new data into the general datum
		self.datum.data = [...self.datum.data, ...api_response.result.data]

	// current element data
		self.data = self.datum.data.find(item => item.tipo===self.tipo && item.section_id===self.section_id) || {}
			//console.log("=======self.data:",JSON.parse( JSON.stringify(self.data)));

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
		if (self.data.pagination && typeof self.pagination.total!=="undefined") {
			self.pagination.total = self.data.pagination.total
		}

	return true
}//end update_datum



/**
* UPDATE_DATA_VALUE
* Update component data value with changed_data send by the dom element
* update_data_value. Update the data of the instance with the data changed
* the format of changed_data = { key	: i,
*								value : input.value }
* @return bool true
*/
component_common.prototype.update_data_value = async function(changed_data){

	const self = this

	if(SHOW_DEBUG===true) {
		const data_value = typeof self.data.value!=="undefined" ? self.data.value : null
		console.log("***** update_data_value PRE:",JSON.parse(JSON.stringify(data_value)));
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
		//console.log("***** update_data_value data_key:",JSON.parse(JSON.stringify(data_key)));
		//console.log("======= update_data_value:",JSON.parse(JSON.stringify(self.data.value)));
		console.log("======= update_data_value:",self.data.value, self.id);
	}


	return true
}//end update_data_value



/**
* CHANGE_VALUE
* @param object options
* @return promise
*/
component_common.prototype.change_value = async function(options) {

	const self = this

	// queue overlaped calls to avoid server concurrence issues
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

	// update the data in the instance previous to save
		await self.update_data_value(changed_data)

	// rebuild and save the component
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
* Static function. Replaces old dom node by new node
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
* GET_AR_INSTANCES
*/
component_common.prototype.get_ar_instances = async function(){

	const self 			= this
	const records_mode 	= self.context.properties.source.records_mode

	const lang 			= self.section_lang
	const value 		= self.data.value || []
	const value_length 	= value.length

	//console.log("--deep_render value:", JSON.parse(JSON.stringify(value)));

	// iterate rows
		const ar_instances = []
		for (let i = 0; i < value_length; i++) {

			const locator 			 	= value[i];
			const current_section_tipo 	= locator.section_tipo
			const current_section_id 	= locator.section_id
			const current_data 		 	= self.datum.data.filter(el => el.section_tipo===current_section_tipo && el.section_id===current_section_id)
			// const current_context 	= self.datum.context.filter(el => el.section_tipo===current_section_tipo && el.parent===self.tipo)
			const current_context 		= (typeof self.datum.context!=="undefined")
				? self.datum.context.filter(el => el.section_tipo===current_section_tipo && el.parent===self.tipo)
				: []

			// section_record instance
				const current_section_record = await instances.get_instance({
					model 			: 'section_record',
					tipo 			: current_section_tipo,
					section_tipo	: current_section_tipo,
					section_id		: current_section_id,
					mode			: records_mode,
					lang			: lang,
					context 		: current_context,
					data			: current_data,
					datum 			: self.datum,
					paginated_key 	: locator.paginated_key, // used by autocomplete / portal
					caller 			: self
				})

				await current_section_record.build()

			// add instance
				ar_instances.push(current_section_record)

		}//end for loop

	// set
		self.ar_instances = ar_instances

	return ar_instances
}//end get_ar_instances



/**
* CHANGE_MODE
* Destroy current instance and dependences without remove html nodes (used to get target parent node placed in dom)
* Create a new instance in the new mode (for example, from list to edit_in_list)
* Render a fresh full element node in the new mode
* Replace every old placed dom node with the new one
* Active element (using event manager publish)
*/
component_common.prototype.change_mode = async function(new_mode, autoload) {

	const self = this

	const current_context 		= self.context
	const current_data 			= self.data
	const current_datum 		= self.datum
	const current_section_id 	= self.section_id
	const section_lang 			= self.section_lang
	const ar_node 				= self.node

	// new_mode check. When new_mode is undefined, fallback to 'list'. From 'list', change to 'edit_in_list'
		if(typeof new_mode==='undefined'){
			new_mode = self.mode==='list' ? 'edit_in_list' : 'list'
		}

	// destroy self instance (delete_self=true, delete_dependences=false, remove_dom=false)
		const destroyed = self.destroy(true, true, false)

	// element. Create the instance options for build it. The instance is reflect of the context and section_id
		const new_instance = await instances.get_instance({
			model 			: current_context.model,
			tipo 			: current_context.tipo,
			section_tipo 	: current_context.section_tipo,
			section_id 		: current_section_id,
			mode 			: new_mode,
			lang 			: current_context.lang,
			section_lang 	: section_lang,
			parent 			: current_context.parent,
			type 			: current_context.type,
			context 		: current_context,
			data 			: current_data,
			datum 			: current_datum,
			sqo_context 	: current_context.sqo_context
		})

	// build
		await new_instance.build(autoload)

	// render
		const node = await new_instance.render({
			render_level : 'full'
		})

	// clean and replace old dom nodes
		await ui.update_dom_nodes(ar_node, node)

	// active component at end
		event_manager.publish('active_component', new_instance)


	return true
}//end change_mode



/**
* TEST_SAVE
*/
component_common.prototype.test_save = async function(component) {

	if (component.model==='component_input_text') {

		for (var i = 1; i <= 1; i++) {

			const time = i * 1000
			const ar_value = [i,"234"]

			setTimeout( async function() {

				component.set_value(ar_value)
				await component.render()
				component.save(component)

			},time)
		}
	}
}//end test_save


