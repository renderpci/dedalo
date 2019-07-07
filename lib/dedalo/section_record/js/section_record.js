// imports
	import {render_section_record} from '../../section_record/js/render_section_record.js'
	import * as instances from '../../common/js/instances.js'
	//import {context_parser} from '../../common/js/context_parser.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import event_manager from '../../page/js/page.js'



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
		console.log("section_record init options:",options);
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

	// events subscription
		// event active (when user focus in dom)
		event_manager.subscribe('section_record_rendered', (active_section_record) => {
			//if (active_section_record.id===self.id) {
				console.log("-- event section_record_rendered: active_section_record:",active_section_record.tipo, active_section_record.section_id);
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

	// get the items inside the section of the record to render it
		const items			= self.context.filter(element => element.section_tipo===section_tipo && (element.type==='grouper' || element.type==='component'))
		const items_length 	= items.length

	// render all components and groupers
		const render_promises = []
		for (let i = 0; i < items_length; i++) {

			// current_instance. create the instance options for build it, the instance is reflect of the context and section_id
				const current_instance = instances.get_instance({
					model 			: items[i].model,
					tipo 			: items[i].tipo,
					section_tipo 	: items[i].section_tipo,
					section_id 		: section_id,
					mode 			: items[i].mode,
					lang 			: items[i].lang,
					section_lang 	: self.lang,
					context 		: items[i],
					parent 			: items[i].parent
				})
				.then(function(current_item){
					//render the node and return the instace with the render dom node
					return current_item.render()
				})

			// add the instance to the render_promises array for use in the promise.all
				render_promises.push(current_instance)

		}//end for


	// all render finished. when the all instaces are rendered we can create the nodes hierarchy
		return Promise.all(render_promises).then(function(ar_instances){
	
			// render using external proptotypes of 'render_component_input_text'
				const mode = self.mode
				switch (mode){
					case 'list':
						// add prototype list function from render_component_input_text
						section_record.prototype.list = render_section_record.prototype.list			
						const list_node = self.list(ar_instances)
						if (self.node) {
							// replace old node
							self.node.parentNode.replaceChild(list_node, self.node)
						}
						// set
						self.node = list_node
						break
				
					case 'edit':
					default :
						// add prototype edit function from render_section_record
						section_record.prototype.edit = render_section_record.prototype.edit
						const edit_node = self.edit(ar_instances)
						if (self.node) {
							// replace old node
							self.node.parentNode.replaceChild(edit_node, self.node)
						}
						// set
						self.node = edit_node
						break
				}

 			// // notify section record is rendered
			// event_manager.publish('section_record_rendered', self)					

			return self
		})//end Promise.all
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
* SAVE
* @return 
*//*
section_record.prototype.save = async function(component) {

	const self = this

	const component_tipo 	= component.tipo
	const component_data 	= self.get_component_data(component_tipo)
	const component_context = self.get_component_context(component_tipo)

	// send_data
		const send_data = async () => {
			try {
				// data_manager
					const current_data_manager 	= new data_manager()
					const response 				= await current_data_manager.request({
						url 	: DEDALO_LIB_BASE_URL + '/api/v1/json/',
						body	: {
							action 		: 'update',
							context 	: component_context,
							data 		: component_data
						}
					})				
					console.log("+++++++ response:",response);
					//return doSomethingWith(data)

				return response

			} catch (error) {
			  	//logAndReport(error)
			  	console.log("++++++ error:",error);
			  	return {
			  		result 	: false,
			  		msg 	: error.message,
			  		error 	: error
			  	}
			}
		}
		const save_promise = send_data()

		//const save_promise = current_data_manager.request()
		//
		//save_promise.then( response => {
		//		if(SHOW_DEBUG===true) {
		//			console.log("[section_record] save_response:",response);
		//		}
		//		
		//		const save_options = {
		//			tipo 	: component_tipo,
		//			label 	: component_context.label,
		//			msg 	: (response.result!==false) ? get_label['salvar'] : get_label['fail_to_save']
		//		}
		//		// console.log("[section_record] save_options:",save_options);
		//		event_manager.publish('save', response)
		//
		//		return response;				
		//})

	return save_promise
}//end save
*/



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


