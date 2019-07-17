// imports
	import event_manager from '../../page/js/page.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {ui} from '../../common/js/ui.js'
	import * as instances from '../../common/js/instances.js'



export const component_common = function(){

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

	// Optional vars 
	self.context = options.context  || null
	self.data 	 = options.data 	|| null
	self.datum 	 = options.datum  	|| null

	// events subscription
		// event active (when user focus in dom)
		event_manager.subscribe('component_active', (actived_component) => {
			// call ui.component
			ui.component.active(self, actived_component)
			.then( response => { // response is bool value
				if (response===true && typeof self.active==="function" ) {
					self.active()
				}
			})
		})
		// event save (when user change component value)
		event_manager.subscribe('component_save', (saved_component) => {
			// call component
			self.save(saved_component)
			.then( response => { // response is saved_component object
				//console.log("+++++++++++++++++++ component_save response:",response);
			})
		})
		//event_manager.publish('component_init', self)

		// test save
			//component_common.prototype.test_save(this)

	return true
}//end init



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


			//const my_promise = async function() {
			//
			//	component.set_value(ar_value)
			//	return component.render()
			//	.then( function() {
			//		component.save(component)
			//	})
			//}
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
	if(SHOW_DEBUG===true) {				
					
	}

	const self = this	

	if (self.id_base!==saved_component.id_base) {
		return saved_component
	}

	// portal same component id cases
		if (self.id_base===saved_component.id_base && self.id!==saved_component.id) {
			//self.render()
			return saved_component
		}

	const component = this
	const tipo 		= self.tipo

	// value change check
	//	const current_value_str = JSON.stringify(component.data.value)

	// force to update / sync dom node and component value
		const node = self.node
		if(node){
			self.update_data_value_from_dom()
		}

	// value change check
		//const update_value_str = JSON.stringify(component.data.value)
		//console.log("+++current_value_str,update_value:",current_value_str, update_value_str);		
		//if (current_value_str===update_value_str) {
		//	console.log("[save] ignored same current_value_str,update_value:",current_value_str, update_value_str);
		//	return false
		//}

	// remove previous success class if exists
		node.classList.remove("error","success")

	// direct way
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
				//console.log("+++++++++++++++++ save response:",response);
			// result expected is current section_id. False is returned if a problem found 
			const result = response.result
			if (result===false) {
				node.classList.add("error")
				if (response.error) {
					console.error(response.error)
				}
				if (response.msg) {
					alert("Error on save self "+self.model+" data: \n" + response.msg)
				}						
			}else{
				node.classList.add("success")				
				await self.render()

				// similar instances . add success css and render component again to update visual value		
					const similar_instances = instances.instances.filter(element => element.id_base===self.id_base && element.id!==self.id)
					// console.log("similar_instances:",similar_instances);
					const l = similar_instances.length
					for (let i = l - 1; i >= 0; i--) {						
						similar_instances[i].node.classList.remove("error","success")
						setTimeout(()=>{
							similar_instances[i].node.classList.add("success")
							similar_instances[i].render()
						},1)						
					}										
			}
		})

	return save_promise
}//end save



/**
* LOAD_DATA
* Generic component data loader from section_record
* @param object component
* @return promise data
*/
component_common.prototype.load_data = async function() {

	// Alredy set when section_record instances all elements
	// const self = this
	// 
	// // section_record instance
	// 	const section_record = await instances.get_instance({
	// 		model 				: 'section_record',
	// 		tipo 				: self.section_tipo,
	// 		section_tipo 		: self.section_tipo,
	// 		section_id			: self.section_id,
	// 		mode				: self.mode,
	// 		lang				: self.section_lang,
	// 		//parent_section_id 	: self.section_id,
	// 
 	// 		context 		: self.context 	|| null,
 	// 		data			: self.data 	|| null,
 	// 		datum 			: self.datum 	|| null
 	// 	})
 	// 
 	// // get data from section_record
 	// 	const data = section_record.get_component_data(self.tipo)
	// 
 	// // inject property
	// 	self.data = data
		
	return true
}//end load_data



/**
* LOAD_DATUM
* Generic component data loader from section_record
* @param object component
* @return promise data
*/
component_common.prototype.load_datum = async function() {
	
	// Alredy set when section_record instances all elements
	// const self = this
	// 
 	// // section_record instance
 	// 	const section_record = await instances.get_instance({
 	// 		model 				: 'section_record',
 	// 		tipo 				: self.section_tipo,
 	// 		section_tipo 		: self.section_tipo,
 	// 		section_id			: self.section_id,
 	// 		mode				: self.mode,
 	// 		lang				: self.section_lang,
 	// 		//parent_section_id 	: self.section_id
 	// 	})
 	// 
 	// // set datum from section_record
	// 	self.datum 	= section_record.datum
		
	return true
}//end load_datum



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
	
	// force render component again
		//this.render()	

	return true	
}//end set_value



/**
* REPLACE_NODE
* Static function
*/
component_common.prototype.update_node_contents = (current_node, new_node) => {

	// clean
		while (current_node.firstChild) {
			current_node.removeChild(current_node.firstChild);
		}
	// set children nodes
		while (new_node.firstChild) {
			current_node.appendChild(new_node.firstChild);
		}

	return current_node
}//end update_node_contents



/**
* RENDER
* Parses component data to dom items to interact with user
* @return promise
*/
component_common.prototype.render = async function() {
	
	const self = this

	// render using external proptotypes of 'render_component_input_text'
		const mode = self.mode
		switch (mode){
			case 'list':
				const list_node = await self.list()
				// set
				self.node = list_node
				break
		
			case 'edit':
			default :				
				const edit_node = await self.edit()
				if (self.node) {
					// replace old node contents
					self.node = component_common.prototype.update_node_contents(self.node, edit_node)
				}else{
					// set
					self.node = edit_node
				}
				break
		}

	return self	
}//end render



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
			
			const current_value		= grouped_sections[current_section_tipo]
			const current_context 	= self.datum.context.filter(element => element.section_tipo===current_section_tipo && element.parent===self.tipo)
				//console.log("---portal rows value:",current_value);
				//console.log("---current_context:",current_context);

			const process_locators = async function (current_value) {
				
				for (const item of current_value) {

					const locator 			 = item
					const current_section_id = locator.section_id
					const current_data 		 = self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
					
					// section_record instance
					const current_section_record = await instances.get_instance({
							model 				: 'section_record',
							tipo 				: current_section_tipo,
							section_tipo		: current_section_tipo,
							section_id			: current_section_id,
							mode				: self.mode,
							lang				: self.section_lang,
							key_suffix 			: self.model + '_' + self.tipo +'_'+ self.section_id, // note this value affects the instance id

							context 			: current_context,
							data				: current_data,	
							datum 				: self.datum
						})			

					await current_section_record.render()
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
		switch (mode){
			case 'list':
				// add prototype list function from render_component_portal
				//component_portal.prototype.list = render_component_portal.prototype.list				
				const list_node = await self.list(ar_section_record)
				// debug
				if (self.node) {
					console.error("XXX WARN: Already exists node in portal mode list!", self.node, list_node);
				}
				//if (self.node) {
				//	// replace old node
				//	self.node.parentNode.replaceChild(list_node, self.node)
				//}else{
				// set
				self.node = list_node
				//}							
				break
		
			case 'edit':
			default :
				// add prototype edit function from render_component_portal
				//component_portal.prototype.edit = render_component_portal.prototype.edit				
				const edit_node = await self.edit(ar_section_record)						
				if (self.node) {
					// replace old node
					self.node.parentNode.replaceChild(edit_node, self.node)
				}else{
					// set
					self.node = edit_node
				}
				break
		}

	return self
}//end deep_render




