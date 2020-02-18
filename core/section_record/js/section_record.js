/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	//import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_section_record} from '../../section_record/js/render_section_record.js'
	import * as instances from '../../common/js/instances.js'
	import {data_manager} from '../../common/js/data_manager.js'
	//import {context_parser} from '../../common/js/context_parser.js'



/**
* SECTION_RECORD
*/
export const section_record = function() {

	this.id

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

	this.paginated_key

	// control
	//this.builded = false

	this.node

	this.events_tokens
	this.ar_instances
	this.caller

	this.matrix_id

	return true
}//end section



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	section_record.prototype.build		= common.prototype.build
	section_record.prototype.destroy	= common.prototype.destroy
	section_record.prototype.render 	= common.prototype.render
	section_record.prototype.list 		= render_section_record.prototype.list
	section_record.prototype.tm			= render_section_record.prototype.list
	section_record.prototype.edit 		= render_section_record.prototype.edit



/**
* INIT
* @params object options
* @return bool true
*/
section_record.prototype.init = async function(options) {

	const self = this

	// options vars
	self.model 			= options.model
	self.tipo 			= options.tipo
	self.section_tipo 	= options.section_tipo
	self.section_id 	= options.section_id
	self.mode 			= options.mode
	self.lang 			= options.lang
	self.node 	 		= []
	self.sqo_context	= options.sqo_context

	self.datum 			= options.datum
	self.context 		= options.context
	self.data 	 		= options.data
	self.paginated_key 	= options.paginated_key
	//self.paginator_id 	= options.paginator_id
	self.events_tokens	= []
	self.ar_instances	= []

	self.type 				= self.model
	self.label 				= null

	self.caller 			= options.caller || null

	self.matrix_id 			= options.matrix_id || null

	self.modification_date 	= options.modification_date || null

	// events subscription
		// event active (when user focus in dom)
		//event_manager.subscribe('section_record_rendered', (active_section_record) => {
			//if (active_section_record.id===self.id) {
			//	console.log("-- event section_record_rendered: active_section_record:",active_section_record.tipo, active_section_record.section_id);
			//}
		//})

	// status update
		self.status = 'initied'


	return self
}//end init



/**
* BUILD
* @params object options
* @return bool true
*//*
section_record.prototype.build = async function(autoload=false) {

	const self = this


	// // load data if is not already received as option
	// 	//if (!self.datum) {
	// 	if (autoload===true) {
	// 		const current_data_manager 	= new data_manager()
	// 		const api_response 			= await current_data_manager.section_load_data(self.sqo_context)
	// 		// set
	// 		self.datum = api_response.result

	// 		// set context and data to current instance
	// 			self.context	= self.datum.context.filter(element => element.section_tipo===self.section_tipo)
	// 			self.data 		= self.datum.data.filter(element => element.section_tipo===self.section_tipo)


	// 		// Update section mode with context declaration
	// 			const section_context = self.context.find(element => element.tipo===self.section_tipo)
	// 			self.mode = section_context.mode

	// 		// set ar_section_id
	// 			const section_data	= self.datum.data.find(item => item.tipo===self.section_tipo && item.section_tipo===self.section_tipo)
	// 			self.ar_section_id	= section_data.value
	// 	}


	// status update
		self.status = 'builded'

	return true
}//end build
*/



/**
* GET_AR_INSTANCES
*/
section_record.prototype.get_ar_instances = async function(){

	const self = this

	const mode 			= self.mode
	const section_tipo 	= self.section_tipo
	const section_id 	= self.section_id

	// get the items inside the section of the record to render it
		const items			= (mode==="list") ?
							self.context.filter(element => element.section_tipo===section_tipo && (element.type==='component')) :
							self.context.filter(element => element.section_tipo===section_tipo && (element.type==='component' || element.type==='grouper'))
		const items_length 	= items.length

		const ar_instances = []
		for (let i = 0; i < items_length; i++) {
			//console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);

			const current_context 	= items[i]
			const current_data 		= self.get_component_data(current_context.tipo)

				const instance_options = {
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
					sqo_context 	: current_context.sqo_context
				}

				if (self.matrix_id) {
					instance_options.matrix_id = self.matrix_id
				}

			// component / section group. create the instance options for build it, the instance is reflect of the context and section_id
				const current_instance = await instances.get_instance(instance_options)

				if(!current_instance || typeof current_instance.build!=='function'){
					console.warn(`ERROR on build instance (ignored ${current_context.model}):`, current_instance);
					continue;
				}
				// instance build await
				await current_instance.build()

			// add
				ar_instances.push(current_instance)

		}//end for loop

	// fix
		self.ar_instances = ar_instances

	return ar_instances
}//end get_ar_instances



/**
* GET_COMPONENT_DATA
* @return object component_data
*/
section_record.prototype.get_component_data = function(component_tipo){

	const self = this

	let component_data = self.data.find(item => item.tipo===component_tipo && item.section_id===self.section_id)

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
* GET_COMPONENT_INFO
* @return object component_data
*/
section_record.prototype.get_component_info = function(component_tipo){

	const self = this

	const component_info = self.data.find(item => item.tipo==='ddinfo' && item.section_id===self.section_id)

	return component_info
}//end get_component_info



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


