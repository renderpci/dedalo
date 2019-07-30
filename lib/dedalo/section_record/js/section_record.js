// imports
	import {render_section_record} from '../../section_record/js/render_section_record.js'
	import * as instances from '../../common/js/instances.js'
	import event_manager from '../../page/js/page.js'
	//import {data_manager} from '../../common/js/data_manager.js'
	//import {context_parser} from '../../common/js/context_parser.js'



/**
* SECTION_RECORD
*/
export const section_record = function() {

	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.datum
		this.context
		this.data

		// control
		//this.builded = false

		this.node

		this.root_instance

	return true
}//end section



/**
* INIT
* @params object options
* @return bool true
*/
section_record.prototype.init = function(options) {
		
	const self = this

	// Options vars 
	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang
	self.node 	 		= []

	self.datum 			= options.datum
	self.context 		= options.context
	self.data 	 		= options.data

	self.root_instance	= options.root_instance || null

	// events subscription
		// event active (when user focus in dom)
		event_manager.subscribe('section_record_rendered', (active_section_record) => {
			//if (active_section_record.id===self.id) {
			//	console.log("-- event section_record_rendered: active_section_record:",active_section_record.tipo, active_section_record.section_id);
			//}
		})

	return true
}//end init



/*
* RENDER
* @return promise render_promise
*/
section_record.prototype.render = async function(){

	const self = this
		
	const section_id 	= self.section_id
	const section_tipo	= self.section_tipo
	const mode 			= self.mode

	// get the items inside the section of the record to render it
		const items		= (mode==="list") ? 
							self.context.filter(element => element.section_tipo===section_tipo && (element.type==='component')) : 
							self.context.filter(element => element.section_tipo===section_tipo && (element.type==='component' || element.type==='grouper'))
		const items_length 	= items.length
	
	// render all components and groupers
		const ar_instances  = []
		const process_items = async (items) => {
			
			for (const item of items) {

				const current_context 	= item
				const current_data 		= self.get_component_data(current_context.tipo)

				// component / section group. create the instance options for build it, the instance is reflect of the context and section_id
				const current_instance = await instances.get_instance({
					model 			: current_context.model,
					tipo 			: current_context.tipo,
					section_tipo 	: current_context.section_tipo,
					section_id 		: section_id,
					mode 			: current_context.mode,
					lang 			: current_context.lang,
					section_lang 	: self.lang,
					parent 			: current_context.parent,
					type 			: current_context.type,
					context 		: current_context,
					data 			: current_data,
					datum 			: self.datum,
					root_instance	: self.root_instance
				})
				// add
				ar_instances.push(current_instance)
			}

			return true
		}
		await process_items(items)

		// old way
			// for (let i = 0; i < items_length; i++) {
			// 				
			// 	const current_context 	= items[i]
			// 	const current_data 		= self.get_component_data(current_context.tipo)
			// 	
			// 	// current_instance. create the instance options for build it, the instance is reflect of the context and section_id
			// 		const current_instance = await instances.get_instance({
			// 			model 			: current_context.model,
			// 			tipo 			: current_context.tipo,
			// 			section_tipo 	: current_context.section_tipo,
			// 			section_id 		: section_id,
			// 			mode 			: current_context.mode,
			// 			lang 			: current_context.lang,
			// 			section_lang 	: self.lang,					
			// 			parent 			: current_context.parent,
			// 			type 			: current_context.type,
			// 			context 		: current_context,
			// 			data 			: current_data,
			// 			datum 			: self.datum
			// 		})				
			// 		// render the node and return the instace with the render dom node					
			// 		//render_promises.push(current_instance.render())	
			// 		await current_instance.render()
			// 		ar_instances.push(current_instance)
			// 
			// }//end for


	// render using external proptotypes
		let node = null
		switch (mode){
			case 'list':
				// add prototype list function from render_component_input_text
				section_record.prototype.list = render_section_record.prototype.list				
				const list_node = await self.list(ar_instances)
				
				// set
				self.node.push(list_node)
				node = list_node
				break
			case 'edit':
			default :
				// add prototype edit function from render_section_record
				section_record.prototype.edit = render_section_record.prototype.edit
				const edit_node = await self.edit(ar_instances)
				
				// set
				self.node.push(edit_node)
				node = edit_node
				break
		}

		// // notify section record is rendered
	// event_manager.publish('section_record_rendered', self)

	return node	
}//end render



/**
* GET_COMPONENT_DATA
* @return object component_data
*/
section_record.prototype.get_component_data = function(component_tipo){

	const self = this

	let component_data = self.data.filter(item => item.tipo===component_tipo && item.section_id===self.section_id)[0]
	
	// undefined case. If the current item don't has data will be instanciated with the current section_id
	if (typeof(component_data)==='undefined') {
		// empy component data build
		component_data = {
			section_id 	 : self.section_id,
			tipo 		 : component_tipo,
			section_tipo : self.section_tipo,
			value 		 : []
		}
		self.data.push(component_data)
	}

	return component_data
}//end get_component_data



/**
* GET_COMPONENT_CONTEXT
* @return object context
*//*
section_record.prototype.get_component_context = function(component_tipo) {
	
	const self = this

	const context = self.context.filter(item => item.tipo===component_tipo && item.section_tipo===self.section_tipo)[0]
	
	return context		
}//end get_component_context
*/



/**
* BUILD
* @return promise
*//*
section_record.prototype.build = function() {

	const self = this
	
	const components = self.load_items()
	//const groupers 	 = self.load_groupers()

	return Promise.all([components]).then(function(){
		self.builded = true
	})
}//end build
*/



/**
* LOAD_items
* @return promise load_items_promise
*//*
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
*/



/**
* GET_CONTEXT_CHILDRENS
*//*
section_record.prototype.get_context_childrens = function(component_tipo){

	const self = this

	const group_childrens = self.context.filter(item => item.parent===component_tipo)

	return group_childrens
}//end get_context_childrens
*/


