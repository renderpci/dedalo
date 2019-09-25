// imports
	import {create_source} from '../../common/js/common.js'
	import event_manager from '../../page/js/page.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'
	//import {paginator} from '../../search/js/paginator.js'



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


	// events subscription
		// component_active (when user focus in dom)
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
* COMPONENT_SAVE
* Receive full component object and start the save process across the section_record
* @param object component
* @return promise save_promise
*/
component_common.prototype.save = async function(changed_data) {

	const self = this

	// check data
		if (typeof changed_data==="undefined") {
			console.error("+++++ Invalid changed_data [stop save]:", changed_data)
			console.trace()
			return false
		}

	if(SHOW_DEBUG===true) {
		console.log("[component_common.save] changed_data:", changed_data);
		console.log("[component_common.save] self:", self);
	}

	// remove previous success/error class if exists
		self.node.map(item => {
			item.classList.remove("error","success")
			item.classList.add("loading")
		})

	// send_data
		const send_data = async () => {
			try {

				const data 				= self.data
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
					// Update the new data into the instance and the general datum
					self.update_datum(api_response)

				return api_response

			} catch (error) {

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
			if(SHOW_DEBUG===true) {
				console.log("[component_common.save] response:",response);
			}

			self.node.map(item => {
				item.classList.remove("loading")
			})
				//console.log("+++++++++++++++++ save response:",response);
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

	const changed_data = self.data.changed_data

	// remove the component old data in general datum (from down to top array items)
		const datum_data_length = self.datum.data.length
		for (let i = datum_data_length - 1; i >= 0; i--) {
			const data_item = self.datum.data[i]
			if (data_item.parent_tipo===self.tipo && data_item.parent_section_id===self.section_id){
				//console.log(":----DELETE data_item ", i, JSON.parse( JSON.stringify(data_item)) );
				self.datum.data.splice(i, 1);
			}
		}
		//console.log("=======api_response.result.data:",JSON.parse( JSON.stringify(api_response.result.data)));

	// add the new data into the general datum
		self.datum.data = [...self.datum.data, ...api_response.result.data]

	// current element data
		self.data = self.datum.data.find(item => item.tipo===self.tipo && item.section_id===self.section_id) || {}
			//console.log("=======self.data:",JSON.parse( JSON.stringify(self.data)));


	// check data
		if (typeof self.data==="undefined") {
			console.trace();
			console.log("++++++++++++++++++++ self.datum:",self.datum);
		}

	// add as new data the most recent changed_data
		self.data.changed_data = changed_data

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

	return true
}//end update_data_value



/**
* REMOVE_VALUE
* @param element target
* @param string value
* @return promise
*/
component_common.prototype.remove_value = async function(target, value, refresh=true) {

	const self = this

	// user confirmation prevents remove accidentally
		if (!confirm(`Sure to remove value: ${value} ?`)) return false

	const key = parseInt(target.dataset.key)

	// update_data_value.
		const changed_data = {
			action	: 'remove',
			key		: key,
			value	: null
		}

	// update the data in the instance previous to save
		self.update_data_value(changed_data)
		self.data.changed_data = changed_data

	// rebuild and save the component
		const js_promise = self.save(self.data.changed_data).then(async api_response => {

			// refresh
				if (refresh) {
					self.refresh()
				}

			// event publish
				//event_manager.publish('remove_element_'+self.id, changed_data)
		})

	return js_promise
}//end remove_value



/**
* ADD_VALUE
* @param int key
* @param mix value
* @return promise
*/
component_common.prototype.add_value = async function(key, value, refresh=true) {

	const self = this

	// changed_data update
		const changed_data = {
			action	: 'insert',
			key	  	: key,
			value 	: value
		}

	// update the data in the instance previous to save
		self.update_data_value(changed_data)
		self.data.changed_data = changed_data

	// rebuild and save the component
		const js_promise = self.save(changed_data).then(async api_response => {

			// refresh
				if (refresh) {
					self.refresh()
				}

			// event publish
				//event_manager.publish('add_element_'+self.id, changed_data)
		})

	return js_promise
}//end add_value



/**
* UPDATE_VALUE
* @param int key
* @param mix value
* @return promise
*/
component_common.prototype.update_value = async function(key, value, refresh=false) {

	const self = this

	// changed_data update
		const changed_data = {
			action	: 'insert',
			key	  	: key,
			value 	: value
		}

	// update the data in the instance previous to save
		self.update_data_value(changed_data)
		self.data.changed_data = changed_data

	// rebuild and save the component
		const js_promise = self.save(changed_data).then(async api_response => {

			// refresh
				if (refresh) {
					self.refresh()
				}

			// event publish
				//event_manager.publish('update_value_'+self.id, changed_data)
		})

	return js_promise
}//end update_value



/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*//*
component_common.prototype.render = async function(assign=true) {

	const self = this

	// status update
		self.status = 'rendering'

	// render using external prototypes of 'render_component_xxx'
		//let node = null
		//switch (self.mode){
		//	case 'list':
		//		const list_node = await self.list()
		//		// set
		//		if(assign===true) {
		//			self.node.push(list_node)
		//		}
		//		node = list_node
		//		break
		//	case 'search':
		//
		//		const search_node = await self.search()
		//		// set
		//		if(assign===true) {
		//			self.node.push(search_node)
		//		}
		//		node = search_node
		//
		//		break
		//	case 'edit':
		//	default :
		//		const edit_node = await self.edit()
		//		// set
		//		if(assign===true) {
		//			self.node.push(edit_node)
		//		}
		//		node = edit_node
		//		break
		//}

	// node
		const node = await self[self.mode]()

	// set
		if(assign===true) {
			self.node.push(node)
		}

	// status update
		self.status = 'rendered'

	return node
}//end render
*/



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
* REBUILD_NODES
* Parses component data to dom items to interact with user
* @return promise
*//*
component_common.prototype.rebuild_nodes = async function() {

	const self = this

	// render new fresh node
	const fresh_node = await self.render(false)

	const ar_nodes 			= self.node
	const ar_nodes_length 	= ar_nodes.length
	for (let i = 0; i < ar_nodes_length; i++) {

		//if (ar_nodes[i].isEqualNode(self.selected_node)) {
		//	console.log("Ignored node !!!!");
		//	continue
		//}

		const new_node = fresh_node.cloneNode(true)
		const old_node = ar_nodes[i]

		// // get parent node
 		// const parent_node = ar_nodes[i].parentNode
 		// if (!parent_node) {
 		// 	console.log("parent_node not found for node:",ar_nodes[i]);
 		// }else{
 		// 	console.log("parent node found!: ",ar_nodes[i]);
 		// }
		//
		// // replace old with new rendered node
		// parent_node.replaceChild(new_node, old_node);

		await component_common.prototype.update_node_contents(old_node, new_node)

		//rebuilded_nodes.push(new_node)
	}


	return true
}//end rebuild_nodes
*/



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
				self.ar_instances.push(current_section_record)

		}//end for loop

	return self.ar_instances
}//end get_ar_instances



/**
* RENDER_CONTENT
*//*
component_common.prototype.render_content = async function() {

	const self = this

	// status update
		self.status = 'rendering'

	// instances
		self.ar_instances = await self.get_section_record_instances()

	// node
		const new_content_data_node = await self.render_content_data()

	// replace
		for (let i = 0; i < self.node.length; i++) {

			const wrapper 				 = self.node[i]
			const old_content_data_node  = wrapper.querySelector(":scope > .content_data")

				//console.log("wrapper:",wrapper);
				//console.log("old_content_data_node:",old_content_data_node);
				//console.log("new_content_data_node:",new_content_data_node);

			wrapper.replaceChild(new_content_data_node, old_content_data_node)
		}

	// status update
		self.status = 'rendered'


	// event publish
		event_manager.publish('render_'+self.id, self.node[0])


	return self.node[0]
}//end deep_render
*/



/**
* DEEP_RENDER_OLD
* Parses component data to dom items to interact with user
* Used by: portal, autocomplete
* @return promise
*//*
component_common.prototype.DEEP_RENDER_OLD = async function() {

	const self = this

	// status update
		self.status = 'rendering'

		console.log("self.data_DEEP:",self.data);
		//console.log("self.context:",self.context);

	// iterate values
		const value = self.data.value || []

		const group_by = key => array =>
		  array.reduce((objectsByKeyValue, obj) => {
		    const value = obj[key];
		    objectsByKeyValue[value] = (objectsByKeyValue[value] || []).concat(obj);
		    return objectsByKeyValue;
		}, {});
		const group_section_tipo = group_by('section_tipo')
		const grouped_sections 	 = group_section_tipo(value)

	// iterate section records
	console.log("self.ar_instances_DEEPP:",self.ar_instances);
		for(const current_section_tipo in grouped_sections) {

			//paginator
			//self.current_paginator_id = current_section_tipo+'_'+self.tipo+'_'+self.section_id

			const current_value		= grouped_sections[current_section_tipo]
			const current_context 	= self.datum.context.filter(element => element.section_tipo===current_section_tipo && element.parent===self.tipo)
			const sample_component 	= current_context.find(element => element.section_tipo===current_section_tipo && element.parent===self.tipo)
				//console.log("---portal rows value:",current_value);
				//console.log("---current_context:",current_context);
			if (!sample_component) {
				console.warn(`Skipped current_section_tipo '${current_section_tipo}' because sample_component is empty: `,sample_component)
				continue;
			}

			const process_locators = async function (current_value) {

				for (const item of current_value) {

					const locator 			 = item
					const current_section_id = locator.section_id
					const current_data 		 = self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
					//console.log("---current_data:",current_data);
					// section_record instance
					const current_section_record = await instances.get_instance({
							model 				: 'section_record',
							tipo 				: current_section_tipo,
							section_tipo		: current_section_tipo,
							section_id			: current_section_id,
							mode				: sample_component.mode,
							lang				: self.section_lang,
							//key_suffix 			: self.model + '_' + self.tipo +'_'+ self.section_id, // note this value affects the instance id

							context 			: current_context,
							data				: current_data,
							datum 				: self.datum,
							paginated_key 		: item.paginated_key,
							//paginator_id 		: self.current_paginator_id
						})

					//await current_section_record.render()
					self.ar_instances.push(current_section_record)
				}

				return true
			}
			await process_locators(current_value)

			// const current_value_length = current_value.length
 			// for (let i = 0; i < current_value_length; i++) {
 			//
 			// 	const locator 			 = current_value[i];
 			// 	const current_section_id = locator.section_id
 			// 	const current_data 		 = self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
 			//
 			// 	// section_record instance
 			// 	const current_section_record = await instances.get_instance({
 			// 			model 				: 'section_record',
 			// 			tipo 				: current_section_tipo,
 			// 			section_tipo		: current_section_tipo,
 			// 			section_id			: current_section_id,
 			// 			mode				: self.mode,
 			// 			lang				: self.section_lang,
 			// 			parent_section_id 	: self.section_id, // note this value affects the instance id
 			//
 			// 			context 			: current_context,
 			// 			data				: current_data,
 			// 			datum 				: self.datum
 			// 		})
 			//
			// 		await current_section_record.render()
			// 		ar_section_record.push(current_section_record)
			//
			// }//end for (let i = 0; i < current_value_length; i++)

		}//end for(const current_section_tipo in grouped_sections)
		//console.log("+++portal ar_section_record:",ar_section_record, self.section_id);

	// render using external proptotypes of 'render_component_portal'
		const mode = self.mode
		let node = null
		switch (mode){
			case 'list':
				// add prototype list function from render_component_portal
				//component_portal.prototype.list = render_component_portal.prototype.list
				const list_node = await self.list(self.ar_instances)

				// set
				self.node.push(list_node)
				node = list_node
				//}
				break

			case 'edit':
			default :
				// add prototype edit function from render_component_portal
				//component_portal.prototype.edit = render_component_portal.prototype.edit
				const edit_node = await self.edit(self.ar_instances)
				// set
				self.node.push(edit_node)
				node = edit_node

				// event publish
					event_manager.publish('render_'+self.id, node)

				break
		}

	// status update
		self.status = 'rendered'


	return node
}//end DEEP_RENDER_OLD
*/



/**
* CHANGE_MODE
*/
component_common.prototype.change_mode = async function() {

	const self = this

	// sqo_context
		const source = {
			typo 				: 'source',
			model 				: self.model,
			tipo 				: self.tipo,
			section_tipo 		: self.section_tipo,
			section_id 			: self.section_id,
			mode 				: self.mode,
			lang 				: self.lang,
			from_component_tipo	: self.tipo,
			//value 				: value
		}
		self.sqo_context.show.push(source)

	const ar_node = self.node

	self.data = false
	self.destroy(false,true)

	self.mode==='list' ? self.mode = 'edit' : self.mode = 'list'

	await self.build()

	// empty instance nodes
		self.node = []

	// render
		const node = await self.render()

		const ar_node_length = ar_node.length

	// clean and replace old dom nodes
		for (var i = ar_node_length - 1; i >= 0; i--) {

			const current_node = ar_node[i]
			const parent_node = ar_node[i].parentNode

			// remove the all child nodes of the node
				while (current_node.firstChild) {
					current_node.removeChild(current_node.firstChild)
				}

			// replace the node with the new render
				parent_node.replaceChild(node, current_node)
		 		//parent_node.classList.remove("loading", "hide")
	 	}

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


