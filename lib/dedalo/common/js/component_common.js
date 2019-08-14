// imports
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

	self.section_lang 	= options.section_lang	
	self.parent 		= options.parent
	self.id 			= options.id
	self.node 			= []
	self.paginator_id 	= options.paginator_id
	self.events_tokens	= []
	self.sqo_context	= options.sqo_context
	
	// Optional vars 
	self.context = options.context  || null
	self.data 	 = options.data 	|| null
	self.datum 	 = options.datum  	|| null
	

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
		self.events_tokens.push(
			event_manager.subscribe('save_component_'+self.id, (saved_component) => {
				// call component
					console.log("saved_component:",saved_component);
				self.save(saved_component)
				.then( response => { // response is saved_component object

				})
			})
		)

		self.events_tokens.push(
			event_manager.subscribe('paginator_destroy'+self.paginator_id, (active_section_record) => {
				self.destroy()
			})
		)

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

	return true
}//end init



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



/**
* COMPONENT_SAVE
* Receive full component object and start the save process across the section_record
* @param object component
* @return promise save_promise
*/
component_common.prototype.save = async function(saved_component) {
	
	const self = this	

	// remove previous success/error class if exists
		self.node.map(item => {
			item.classList.remove("error","success")
			item.classList.add("loading")
		})
	
	// send_data
		const send_data = async () => {
			try {
				// data_manager
					const current_data_manager 	= new data_manager()
					const api_response 			= await current_data_manager.request({
						url  : DEDALO_LIB_BASE_URL + '/api/v1/json/',
						body : {
							action 	: 'update',
							context : self.context,
							data 	: self.data
						}
					})				
					console.log("+++++++ api_response:",api_response);
				
				return api_response

			} catch (error) {
			  	//logAndReport(error)
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
* UPDATE_DATA_VALUE
* Update component data value with changed_data send by the dom element
* update_data_value. Update the data of the instance with the data changed
* the format of changed_data = { key	: i, 
*								value : input.value }
* @return bool true
*/
component_common.prototype.update_data_value = function() {
	
	const self = this

	// fix values
	const data_key 		= self.data.changed_data.key
	const changed_value	= self.data.changed_data.value

	// when the data_key is false the value is propoagated to all items in the array
	if ( data_key===false && changed_value===null) {
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
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*/
component_common.prototype.render = async function(assign=true) {
	
	const self = this

	// render using external prototypes of 'render_component_xxx'		
		let node = null
		switch (self.mode){
			case 'list':
				const list_node = await self.list()
				// set
				if(assign===true) {
					self.node.push(list_node)
				}
				node = list_node
				break
		
			case 'edit':
			default :				
				const edit_node = await self.edit()
				// set
				if(assign===true) {
					self.node.push(edit_node)
				}
				node = edit_node
				break
		}

	return node
}//end render



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



component_common.prototype.destroy = async function (){

	const self = this

	// get the instance events that was created by itself
	const events_tokens = self.events_tokens
	// delete all own events 
	const delete_events = events_tokens.map(current_token => event_manager.unsubscribe(current_token))

	// Delete the instance
	const current_instance = instances.delete_instance({
		model 			: self.model,
		tipo 			: self.tipo,
		section_tipo 	: self.section_tipo,
		section_id 		: self.section_id,
		mode 			: self.mode,
		lang 			: self.lang,
	})
	return current_instance
}


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
* DEEP_RENDER
* Parses component data to dom items to interact with user
* Used by: portal, autocomplete
* @return promise
*/
component_common.prototype.deep_render = async function() {

	const self = this
	
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
		const ar_section_record = []
		for(const current_section_tipo in grouped_sections) {

			//paginator
			self.current_paginator_id = current_section_tipo+"_0"
			
			const current_value		= grouped_sections[current_section_tipo]
			const current_context 	= self.datum.context.filter(element => element.section_tipo===current_section_tipo && element.parent===self.tipo)
				//console.log("---portal rows value:",current_value);
				//console.log("---current_context:",current_context);


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
							mode				: self.mode,
							lang				: self.section_lang,
							//key_suffix 			: self.model + '_' + self.tipo +'_'+ self.section_id, // note this value affects the instance id

							context 			: current_context,
							data				: current_data,	
							datum 				: self.datum,
							paginator_id 		: self.current_paginator_id
						
						})			

					//await current_section_record.render()
					ar_section_record.push(current_section_record)
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
				const list_node = await self.list(ar_section_record)
			
				// set
				self.node.push(list_node)
				node = list_node
				//}							
				break
		
			case 'edit':
			default :
				// add prototype edit function from render_component_portal
				//component_portal.prototype.edit = render_component_portal.prototype.edit				
				const edit_node = await self.edit(ar_section_record)

				// set
				self.node.push(edit_node)
				node = edit_node

				break
		}

	return node
}//end deep_render


