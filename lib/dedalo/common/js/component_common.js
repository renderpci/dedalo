// imports
	import {create_source} from '../../common/js/common.js'
	import event_manager from '../../page/js/page.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'



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

	// instance key used vars
	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang

	self.node 			= []

	self.section_lang 	= options.section_lang
	self.parent 		= options.parent
	self.paginator_id 	= options.paginator_id
	self.events_tokens	= []
	self.sqo_context	= options.sqo_context
	self.ar_instances	= []

	// Optional vars
	self.context 	= options.context  		|| null
	self.data 	 	= options.data 			|| null
	self.datum 	 	= options.datum  		|| null
	self.pagination = self.data.pagination 	|| {
		total : 0,
		offset: 0
	}

	self.type  = self.context.type
	self.label = self.context.label

	self.change_value_pool = []


	// events subscription
		// component_active (when user focus it in dom)
		self.events_tokens.push(
			event_manager.subscribe('active_component',  (actived_component) => {
				// call ui.component
				ui.component.active(self, actived_component)
				.then( response => { // response is bool value
					if (response===true && typeof self.active==="function" ) {
						self.active()
					}
				})
			})
		)

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

	// test save
		//component_common.prototype.test_save(this)

	// source. add to sqo_context show
		if (self.sqo_context && self.sqo_context.show) {
			const source = create_source(self,'get_data')
			// deep clone self context to avoid interactions (!)
			self.sqo_context = JSON.parse(JSON.stringify(self.sqo_context))
			self.sqo_context.show.push(source)
		}


	// paginator
		//if (!self.paginator) {
		//	self.paginator = new paginator()
		//	self.paginator.init({
		//		caller : self
		//	})
		//}

	// build optional
		if(typeof self.build==='function'){
			self.build()
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
		self.status = 'loading'

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

			// Update the self.data into the datum and own instance
				self.update_datum(api_response)
		}

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Time to build",self.model, ":", performance.now()-t0);
		}

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

	// remove previous success/error class if exists
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
						console.log(`[component_common.save ${changed_data.action}: ${changed_data.key},${changed_data.value}] api_response value:`, api_response.result.data[0].value);
					}

				// Update the new data into the instance and the general datum
					self.update_datum(api_response)

				return api_response

			}catch(error) {

			  	console.log("+++++++ error:",error);
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

	// remove the component old data in general datum (from down to top array items)
		const datum_data_length = self.datum.data.length
		for (let i = datum_data_length - 1; i >= 0; i--) {
			const data_item = self.datum.data[i]
			if (data_item.parent_tipo===self.tipo && data_item.parent_section_id===self.section_id){
				//console.log(":----DELETE data_item ", i, JSON.parse( JSON.stringify(data_item)) );
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

	// update element pagination vars
		if (self.data.pagination && self.pagination.total) {
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

		//console.log("***** update_data_value PRE:",JSON.parse(JSON.stringify(self.data.value)));

	const data_key 		= changed_data.key
	const changed_value = changed_data.value
	// when the data_key is false the value is propagated to all items in the array

	if (data_key===false && changed_value===null) {
		self.data.value = []
	}else{
		if (changed_value===null) {
			self.data.value.splice(data_key,1)
		}else{
			self.data.value[data_key] = changed_value
		}
	}
		//console.log("***** update_data_value data_key:",JSON.parse(JSON.stringify(data_key)));
		//console.log("***** update_data_value:",JSON.parse(JSON.stringify(self.data.value)));

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
			console.log(`Busy change_value delayed! ${options.changed_data.action} ${self.model}`, options.changed_data);
			return new Promise(function(resolve) {
				resolve( function_queue(self, self.change_value_pool, self.change_value, options) );
			})
		}


	const changed_data 	= options.changed_data
	const action 		= changed_data.action
	const label 		= options.label
	const refresh 		= typeof options.refresh!=="undefined" ? options.refresh : false

	// user confirmation prevents remove accidentally
		if (action==='remove') {
			if (!confirm(`Sure to remove value: ${label} ?`)) return false
		}


	const prev_status = self.status
	self.status = 'changing'

	// update the data in the instance previous to save
		self.update_data_value(changed_data)

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

		// exec queue
			//while (self.change_value_pool.length > 0) {
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
			const current_context 		= self.datum.context.filter(el => el.section_tipo===current_section_tipo && el.parent===self.tipo)

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
					paginated_key 	: locator.paginated_key // used by autocomplete / portal
				})

			// add instance
				ar_instances.push(current_section_record)

		}//end for loop

	// set
		self.ar_instances = ar_instances

	return ar_instances
}//end get_ar_instances





/**
* CHANGE_MODE
*/
component_common.prototype.change_mode = async function(new_mode) {

	const self = this

	const current_context 		= self.context
	const current_data 			= self.data
	const current_datum 		= self.datum
	const current_section_id 	= self.section_id
	const section_lang 			= self.section_lang
	const ar_node 				= self.node

	if(typeof new_mode === 'undefined'){
		new_mode = self.mode==='list' ? 'edit_in_list' : 'list'
	}

	self.destroy(true,true)

	// component. create the instance options for build it, the instance is reflect of the context and section_id
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

	// render
		const node = await new_instance.render({
			render_level	: 'full'
		})

	// clean and replace old dom nodes
		const ar_node_length = ar_node.length
		for (var i = ar_node_length - 1; i >= 0; i--) {

			const current_node = ar_node[i]
			const parent_node = ar_node[i].parentNode

			// replace the node with the new render
				parent_node.replaceChild(node, current_node)
		 		//parent_node.classList.remove("loading", "hide")
	 	}

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


