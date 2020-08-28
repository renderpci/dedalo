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
	this.id_variant

	this.offset

	return true
};//end section



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
	self.model				= options.model
	self.tipo				= options.tipo
	self.section_tipo		= options.section_tipo
	self.section_id			= options.section_id
	self.mode				= options.mode
	self.lang				= options.lang
	self.node				= []
	self.columns			= options.columns

	// dd request
	self.dd_request = {
		show	: null,
		search	: null,
		select	: null
	}

	self.datum			= options.datum
	self.context		= options.context
	self.data			= options.data
	self.paginated_key	= options.paginated_key

	self.events_tokens	= []
	self.ar_instances	= []

	self.type 				= self.model
	self.label 				= null

	self.caller 			= options.caller || null

	self.matrix_id 			= options.matrix_id || null

	self.modification_date 	= options.modification_date || null

	self.offset				= options.offset

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
};//end init



/**
* ADD_INSTANCE
*/
const add_instance = async (self, current_context, section_id, current_data) => {


	const instance_options = {
		model			: current_context.model,
		tipo			: current_context.tipo,
		section_tipo	: current_context.section_tipo,
		section_id		: section_id,
		mode			: current_context.mode,
		lang			: current_context.lang,
		section_lang	: self.lang,
		parent			: current_context.parent,
		type			: current_context.type,
		context			: current_context,
		data			: current_data,
		datum			: self.datum,
		request_config	: current_context.request_config
	}

	// id_variant . Propagate a custom instance id to children
		if (self.id_variant) {
			instance_options.id_variant = self.id_variant
		}
	// time machine matrix_id
		if (self.matrix_id) {
			instance_options.matrix_id = self.matrix_id
		}

	// component / section group. create the instance options for build it, the instance is reflect of the context and section_id
		const current_instance = await instances.get_instance(instance_options)

		if(!current_instance || typeof current_instance.build!=='function'){
			console.warn(`ERROR on build instance (ignored ${current_context.model}):`, current_instance);
			return
		}
		// instance build await
		await current_instance.build()

	// add
		// ar_instances.push(current_instance)

	return current_instance
}//end add_instance



/**
* GET_AR_INSTANCES
*/
section_record.prototype.get_ar_instances = async function(){

	const self = this

	// sort vars
		const mode 			= self.mode
		const section_tipo 	= self.section_tipo
		const section_id 	= self.section_id
		const caller_tipo	= self.caller.tipo

	// items. Get the items inside the section/component of the record to render it
		const items = (mode==="list")
			? self.datum.context.filter(el => el.section_tipo===section_tipo && (el.type==='component') && el.parent===caller_tipo)
			: self.datum.context.filter(el => el.section_tipo===section_tipo && (el.type==='component' || el.type==='grouper') && el.parent===caller_tipo)

	// instances
		const ar_instances = []
		const items_length = items.length
		for (let i = 0; i < items_length; i++) {
			//console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);

			const current_context = items[i]

			if (current_context.model==='component_portal' && current_context.mode==='list') {

				const portal_data = self.get_component_data(current_context.tipo, current_context.section_tipo, self.section_id)

				// portal items calculate
					const options = Object.assign({
						section_id 		: self.section_id,
						section_lang	: self.lang,
						context			: current_context,
						data			: portal_data,
						datum			: self.datum,
						request_config	: current_context.request_config
					}, current_context)

				const portal_instance = await instances.get_instance(options)
				// await portal_instance.build(false)

				const portal_items			= portal_instance.get_portal_items()
				const portal_items_length	= portal_items.length
				for (let g = 0; g < portal_items_length; g++) {

					const portal_item_context = portal_items[g]

					for(const current_portal_data of portal_data.value) {

						const current_data		= self.datum.data.find(item => item.tipo===portal_item_context.tipo && item.section_id===current_portal_data.section_id)
						const current_instance	= await add_instance(self, portal_item_context, current_data.section_id, current_data)

						// add
							ar_instances.push(current_instance)

						break; // only first for now
					}
				}

			}else{

				const current_data		= self.get_component_data(current_context.tipo, current_context.section_tipo, section_id)
				const current_instance	= await add_instance(self, current_context, section_id, current_data)
				// add
					ar_instances.push(current_instance)
			}

		}//end for loop

	// fix
		self.ar_instances = ar_instances


	return ar_instances
};//end get_ar_instances






/**
* GET_AR_INSTANCES
*/
section_record.prototype.get_ar_row_instances = async function(){

	const self = this

	// sort vars
		const mode 			= self.mode
		const tipo 			= self.tipo
		const section_tipo 	= self.section_tipo
		const section_id 	= self.section_id
		const columns		= await self.columns
		const data 			= self.data

	// instances
		const ar_instances = []
		const columns_length =  columns.length

		for (let i = 0; i < columns_length; i++) {

			const current_context = columns[i]

			// the component has direct data into the section
			// console.log("current_context.parent", current_context.parent);
			// console.log("section_id", section_id);
			// console.log("tipo", tipo);
			// console.log("current_context", current_context);
			// console.log("self.datum.data", self.datum.data);

			if(current_context.parent === tipo){
				const current_data		= self.get_component_data(current_context.tipo, current_context.section_tipo, section_id)
				const current_instance	= await add_instance(self, current_context, section_id, current_data)
				//add
				ar_instances.push(current_instance)
			}else{
				// the component don't has direct data into the section, it has a locator that will use for located the data of the column
				const current_data		= self.get_component_relation_data(current_context, section_id)

				// sometimes the section_tipo can be different (es1, fr1, ...)
				//the context get the first component, but the instance can be with the section_tipo data
				current_context.section_tipo = current_data.section_tipo
				const current_instance	= await add_instance(self, current_context, current_data.section_id, current_data)
				//add
				ar_instances.push(current_instance)

			}

		}//end for loop

	// fix
		self.ar_instances = ar_instances


	return ar_instances
};//end get_ar_instances




/**
* GET_COMPONENT_DATA
* @return object component_data
*/
section_record.prototype.get_component_data = function(component_tipo, section_tipo, section_id){

	const self = this

	let component_data = self.data.find(item => item.tipo===component_tipo && item.section_id===section_id)

	// undefined case. If the current item don't has data will be instanciated with the current section_id
	if (typeof(component_data)==='undefined') {
		// empy component data build
		component_data = {
			tipo			: component_tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			value			: [],
			fallback_value	: [""]
		}
	}


	return component_data
};//end get_component_data


/**
* GET_COMPONENT_DATA
* @return object component_data
*/
section_record.prototype.get_component_relation_data = function(component, section_id){

	const self = this

	const parent 			= component.parent
	const section_tipo 		= component.section_tipo
	const component_data 	= {}
	// get the f_path it has full path from the main section to last component in the chain, (sectui b¡)
	const f_path 			= component.parent_f_path
	// get the first compoment, position 2, this component has the locator into the data of the main section.
	const component_tipo 	= f_path[1]
	const first_locator 	= self.data.find(item => item.tipo===component_tipo && item.section_id===section_id)


	// Get the data of the component selected in the show, normally the last compoment of the chain.
	// It's the column in the list
	const parent_data = (first_locator)
		? self.datum.data.find(item =>
			item.tipo === component.tipo
			&& item.parent_section_id 	=== section_id
			&& item.parent_tipo 		=== first_locator.tipo)
		: null
	// if the component has data set it, if not create a null data
	if(parent_data){
		component_data.value = parent_data
	}else{
		component_data.value = null
	}

	// undefined case. If the current item don't has data will be instanciated with the current section_id
	if (component_data.value === null) {
		// empy component data build
		component_data.value = {
			section_id				: section_id,
			section_tipo			: section_tipo,
			tipo					: component.tipo,
			from_component_tipo		: parent,
			parent					: parent,
			value					: [],
			fallback_value			: [""]
		}
	}
	// self.data.push(component_data.value)

	return component_data.value
};//end get_component_data




/**
* GET_COMPONENT_INFO
* @return object component_data
*/
section_record.prototype.get_component_info = function(component_tipo){

	const self = this

	const component_info = self.data.find(item => item.tipo==='ddinfo' && item.section_id===self.section_id)

	return component_info
};//end get_component_info



/**
* GET_COMPONENT_CONTEXT
* @return object context
*//*
section_record.prototype.get_component_context = function(component_tipo) {

	const self = this

	const context = self.context.filter(item => item.tipo===component_tipo && item.section_tipo===self.section_tipo)[0]

	return context
};//end get_component_context
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
};//end build
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
};//end load_items
*/



/**
* GET_CONTEXT_CHILDRENS
*//*
section_record.prototype.get_context_childrens = function(component_tipo){

	const self = this

	const group_childrens = self.context.filter(item => item.parent===component_tipo)

	return group_childrens
};//end get_context_childrens
*/
