// imports
	import * as instances from '/dedalo/lib/dedalo/common/js/instances.js'
	//import {context_parser} from '/dedalo/lib/dedalo/common/js/context_parser.js'
	import {data_manager} from '/dedalo/lib/dedalo/common/js/data_manager.js'
	import event_manager from '/dedalo/lib/dedalo/page/js/page.js'



/**
* SECTION_RECORD
*/
export const section_record = function() {
	if(SHOW_DEBUG===true) {
		//console.log("[section_record.new]");
	}

	this.section_id 	
	this.section_tipo
	this.model
	this.mode
	this.lang

	// optionals
	this.context
	this.data

	this.global_context
	this.global_data

	// control
	this.builded = false

	this.node

	return true
}//end section



/**
* INIT
* @params object options
* @return bool true
*/
section_record.prototype.init = function(options) {
	if(SHOW_DEBUG===true) {
		//console.log("section_record options:",options);
	}	
	
	const self = this

	// Options vars 
	self.context 		= options.context
	self.data 	 		= options.data

	self.global_context = options.global_context
	self.global_data 	= options.global_data

	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.model 			= options.model
	self.section_id 	= options.section_id

	self.mode 			= options.mode || 'edit'
	self.lang 			= options.lang || 'lg-nolan'

	return true
}//end init



/**
* BUILD
* @return promise
*/
section_record.prototype.build = function() {

	const self = this
	
	const components = self.load_items()
	//const groupers 	 = self.load_groupers()

	return Promise.all([components]).then(function(){
		self.builded = true
	})
}//end build



/**
* LOAD_items
* @return promise load_items_promise
*/
section_record.prototype.load_items = function() {

	const self = this

	const context 			= self.context
	const context_lenght 	= context.length
	const data 				= self.data
	const section_tipo 		= self.section_tipo
	const section_id 		= self.section_id
	
	const load_items_promise = new Promise(function(resolve){
		
		const instances_promises = []

		// for every item in the context
		for (let j = 0; j < context_lenght; j++) {

			const current_item = context[j]

			// remove the section of the create item instances (the section is instanciated, it's the current_section)
				if(current_item.tipo===section_tipo) continue;

			// item_data . Select the data for the current item. if current item is a grouper, it don't has data and will need the childrens for instance it.
				let item_data = (current_item.type==='grouper') ? {} : data.filter(item => item.tipo === current_item.tipo && item.section_id === section_id)[0]
				
				// undefined case. If the current item don't has data will be instanciated with the current section_id
				if (typeof(item_data)==='undefined') {
					item_data = {
						section_id: section_id,
						value: []
					}
				}
				
			// build instance with the options
				const item_options = {
					model 			: current_item.model,
					data			: item_data,
					context 		: current_item,
					section_tipo	: current_item.section_tipo,
					section_id		: section_id,
					tipo 			: current_item.tipo,
					parent			: current_item.parent,
					mode			: current_item.mode,
					lang			: current_item.lang,
					section_lang 	: self.lang,
				}			
				const current_instance = instances.get_instance(item_options)

			// add the instance to the array of instances
				instances_promises.push(current_instance)			
		}
		
		return Promise.all(instances_promises).then(function(){
			resolve(true)
		})
	})


	return load_items_promise
}//end load_items



/**
* GET_COMPONENT_CONTEXT
* @return object context
*/
section_record.prototype.get_component_context = function(component_tipo) {
	
	const self = this

	const section_tipo 	= self.section_tipo
	const context_full 	= self.context

	const context = context_full.filter(item => item.tipo===component_tipo && item.section_tipo===section_tipo)[0]
	

	return context		
}//end get_component_context



/**
* GET_COMPONENT_DATA
* @return object component_data
*/
section_record.prototype.get_component_data = function(component_tipo){

	const self = this

	let component_data = self.data.filter(item => item.tipo===component_tipo && item.section_id===self.section_id)[0]
				
	// undefined case. If the current item don't has data will be instanciated with the current section_id
	if (typeof(component_data)==='undefined') {

		component_data = {
			section_id : self.section_id,
			tipo : component_tipo,
			section_tipo: self.section_tipo,
			value: []
		}
		self.data.push(component_data)
	}

	return component_data
}//end get_component_data



/**
* GET_CONTEXT_CHILDRENS
*/
section_record.prototype.get_context_childrens = function(component_tipo){

	const self = this

	const group_childrens = self.context.filter(item => item.parent===component_tipo)

	return group_childrens
}//end get_context_childrens



/*
* RENDER
* @return promise render_promise
*/
section_record.prototype.render = function(){

	const self = this
	
	const render_promise = new Promise(function(resolve){

		const section_id 	= self.section_id
		const section_tipo	= self.section_tipo
	
		// section container
			const section_dom_node = common.create_dom_element({
					element_type	: 'section',
					id 				: section_tipo +'_'+ section_id,
					class_name		: self.model
				})

			self.node = section_dom_node

		// get the items inside the section of the record to render it
			const items			= self.context.filter(element => element.section_tipo===section_tipo && (element.type==='grouper' || element.type==='component'))
			const items_length 	= items.length

		// render the section_record
			const render_promises = []
			for (let i = 0; i < items_length; i++) {

				// create the instance options for build it, the instance is reflect of the context and section_id
				const instance_options = {
					tipo 			: items[i].tipo,
					section_tipo 	: items[i].section_tipo,
					section_id 		: section_id,
					parent 			: items[i].parent,
					mode 			: items[i].mode,
					lang 			: items[i].lang,
					section_lang 	: self.lang,
					model 			: items[i].model,
					context 		: items[i],
				}
				// create the intances of the all items
				const current_instance = instances.get_instance(instance_options).then(function(current_item){
					//render the node and return the instace with the render dom node
					return current_item.render()
					
				})
				// add the instance to the array for use in the promise.all
				render_promises.push(current_instance)
			}//end for

		// all render finished. when the all instaces are rendered we can create the nodes hierarchy
			return Promise.all(render_promises).then(function(ar_instances){
		
					const ar_instances_length = ar_instances.length
					// loop the instances for select the parent node
					for (let i = 0; i < ar_instances_length; i++) {

						const current_instance 		= ar_instances[i]
						const current_instance_node = current_instance.node
						// get the parent node inside the context
						const parent_tipo 			= current_instance.parent

						// if the item has the parent the section_tipo is direct children of the section_record
						// else we has other item parent
						if(parent_tipo===section_tipo){
							
							section_dom_node.appendChild(current_instance_node)
						
						}else{
							// get the parent instace like section group or others
							const parent_instance = ar_instances.filter(instance => instance.tipo===parent_tipo && instance.section_id===current_instance.section_id && instance.section_tipo===current_instance.section_tipo)
							// if parent_istance exist go to apped the current instace to it.
							if(parent_instance.length>0){
								const parent_node = parent_instance[0].node
								parent_node.appendChild(current_instance_node)
							}
						}
					}
						
					resolve(self)
			})//end Promise.all
	})//end render_promise

	return render_promise
}//end render



/**
* SAVE
* @return 
*/
section_record.prototype.save = function(component_tipo) {

	const self = this

	const component_data 	= self.get_component_data(component_tipo)
	const component_context = self.get_component_context(component_tipo)

	// triger vars
		const trigger_url 	= DEDALO_LIB_BASE_URL + '/api/v1/json/'
		const trigger_vars 	= {
			action 		: 'update',
			context 	: component_context,
			data 		: component_data,			
		}	

	// data_manager
		const current_data_manager = new data_manager({
			url 	: trigger_url,
			body	: trigger_vars
		})

		const save_promise = current_data_manager.request().then( response => {
				if(SHOW_DEBUG===true) {
					console.log("[section_record] save_response:",response);
				}
				
				const save_options = {
					tipo 	: component_tipo,
					label 	: component_context.label,
					msg 	: (response.result!==false) ? get_label['salvar'] : get_label['fail_to_save']
				}
				console.log("[section_record] save_options:",save_options);
				event_manager.publish('save', response)

				return response;				
		})

	return save_promise
}//end save


