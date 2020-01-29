/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {common,create_source} from '../../common/js/common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {search} from '../../search/js/search.js'
	import {inspector} from '../../inspector/js/inspector.js'
	import {ui} from '../../common/js/ui.js'
	import {render_section} from './render_section.js'



/**
* SECTION
*/
export const section = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.section_tipo
	this.section_id
	this.mode
	this.lang

	this.datum
	this.context
	this.data

	this.ar_section_id

	this.node
	this.ar_instances

	this.status
	this.paginator

	return true
}//end section



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	section.prototype.edit 			= render_section.prototype.edit
	section.prototype.list 			= render_section.prototype.list
	section.prototype.tm 			= render_section.prototype.list
	section.prototype.list_header 	= render_section.prototype.list_header
	section.prototype.render 		= common.prototype.render
	section.prototype.destroy 		= common.prototype.destroy
	section.prototype.refresh 		= common.prototype.refresh



/**
* INIT
* @return bool
*/
section.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model 				= options.model
	self.tipo 				= options.tipo
	self.section_tipo 		= options.section_tipo
	self.section_id 		= options.section_id
	self.mode 				= options.mode
	self.lang 				= options.lang

	// DOM
	self.node 				= []

	self.section_lang 		= options.section_lang
	self.parent 			= options.parent


	self.events_tokens		= []
	self.ar_instances		= []
	self.sqo_context		= options.sqo_context 	|| null

	self.context 			= options.context 		|| null
	self.data 	 			= options.data 	  		|| null
	self.datum 	 			= options.datum   		|| null
	self.pagination 		= { // pagination info
		total : 0,
		offset: 0
	}

	self.type 				= 'section'
	self.label 				= null

	self.filter 			= null // (? used)
	self.inspector 			= null

	self.id_column_width 	= '7em'
	self.permissions 		= null

	// source. add to sqo_context
		if (self.sqo_context && self.sqo_context.show) {
			const source = create_source(self,'search')
			self.sqo_context.show.push(source)
		}
		//console.log("[section.init] modified self.sqo_context:", self.sqo_context);

	// events subscription
	// status update
		self.status = 'inited'


	return true
}//end init



/**
* BUILD
* @return promise
*	bool true
*/
section.prototype.build = async function(autoload=false) {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	const sqo = self.sqo_context.show.find(element => element.typo==='sqo')

	// load data if is not already received as option
		if (autoload===true) {

			// const sleep = function() {
			// 	return new Promise(resolve => {
			// 	    setTimeout(() => {
			// 	      resolve(true);
			// 	    }, 1000);
			// 	  });
			// }
			// await sleep()

			const current_data_manager = new data_manager()

			// count rows
				if (!self.pagination.total) {
					const current_sqo 		= sqo//self.sqo_context.show.find(element => element.typo==='sqo')
					self.pagination.total	= (current_sqo.full_count && current_sqo.full_count>0) ? current_sqo.full_count : current_data_manager.count(current_sqo)
					//console.log("[section.build] self.pagination.total:",self.pagination.total);
				}

			// get context and data
				const api_response = await current_data_manager.section_load_data(self.sqo_context.show)
					//console.log("[section.build] api_response++++:",api_response);

			// set the result to the datum
				self.datum = api_response.result

			// debug
				load_section_data_debug(self.tipo, self.sqo_context, api_response, self)
		}

	// set context and data to current instance
		self.context	= self.datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= self.datum.data.find(element => element.tipo===element.section_tipo && element.section_tipo===self.section_tipo)
		self.section_id = self.data
			? self.data.value.find(element => element.section_tipo===self.section_tipo).section_id
			: null

	// Update section mode/label with context declarations
		const section_context = self.context.find(element => element.tipo===self.section_tipo) || {
			mode  		: 'edit',
			label 		: 'Section without permissions '+self.tipo,
			permissions : 0
		}
		self.mode 	= section_context.mode
		self.label 	= section_context.label

	// permissions. calculate and set (used by section records later)
		//const section_self_context = self.context.find(element => element.model===self.model) || {}
		self.permissions = section_context.permissions || 0

	// pagination update properties
		self.pagination.limit	= sqo.limit
		self.pagination.offset	= sqo.offset

	// paginator
		if (!self.paginator) {
			const current_paginator = new paginator()
			current_paginator.init({
				caller : self
			})
			current_paginator.build()
			self.paginator = current_paginator

			self.events_tokens.push(
				event_manager.subscribe('paginator_goto_'+current_paginator.id , async (offset) => {
					self.pagination.offset = offset
					self.refresh() // refresh current section
				})
			)//end events push

		}else{

			// self.paginator.limit 	= self.pagination.limit
			// self.paginator.offset 	= self.pagination.offset
			// self.paginator.total 	= self.pagination.total
			// self.paginator.refresh() // refresh current paginator
		}

	// filter
		if (!self.filter && self.permissions>0) {
			const current_filter = new search()
			current_filter.init({
				caller : self
			})
			current_filter.build()
			self.filter = current_filter
		}

	// inspector
		if (!self.inspector && self.permissions) {
			const current_inspector = new inspector()
			current_inspector.init({
				section_tipo 	: self.section_tipo,
				section_id 		: self.section_id
			})
			current_inspector.caller = self
			current_inspector.build()
			self.inspector = current_inspector
		}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("+ Time to build", self.model, " ms:", performance.now()-t0);
			//load_section_data_debug(self.section_tipo, self.sqo_context, load_section_data_promise)
		}

	// status update
		self.status = 'builded'

	return true
}//end build



/**
* GET_AR_INSTANCES
*/
section.prototype.get_ar_instances = async function(){

	const self = this

	// self data veification
	if (typeof self.data==="undefined") {
		self.data = {
			value : []
		}
	}

	// iterate records
		const value 		= self.data.value || []
		const value_length 	= value.length

		for (let i = 0; i < value_length; i++) {
			//console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);

			const current_section_id 	= value[i].section_id
			const current_section_tipo 	= value[i].section_tipo
			const current_data			= (self.mode==='tm')
				? self.datum.data.filter(element => element.matrix_id===value[i].matrix_id && element.section_tipo===current_section_tipo && element.section_id===current_section_id)
				: self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
			const current_context 		= self.context

			const instance_options = {
					model 			: 'section_record',
					tipo 			: current_section_tipo,
					section_tipo	: current_section_tipo,
					section_id		: current_section_id,
					mode			: self.mode,
					lang			: self.lang,
					context 		: current_context,
					data			: current_data,
					datum 			: self.datum,
					caller 			: self
			}

			if (self.mode==='tm') {
				instance_options.matrix_id = value[i].matrix_id
			}

			// section_record
				const current_section_record = await instances.get_instance(instance_options)

				await current_section_record.build(true)

			// add
			self.ar_instances.push(current_section_record)

		}//end for loop


	return self.ar_instances
}//end get_ar_instances



/**
* LOAD_SECTION_DATA_DEBUG
* @return
*/
const load_section_data_debug = async function(section_tipo, sqo_context, load_section_data_promise, self) {

	if(SHOW_DEBUG===false) {
		return false
	}

	//import {ui} from '../../common/js/ui.js'

	const response = await load_section_data_promise

	console.log("----> request sqo_context:",sqo_context);

	load_section_data_promise
	if (response.result===false) {
		console.error("API EXCEPTION:",response.msg);
	}
	console.log("[section.load_section_data_debug] response:",response, " TIME: "+response.debug.exec_time)
	console.log("[section.load_section_data_debug] context:",response.result.context)
	console.log("[section.load_section_data_debug] data:",response.result.data)

	const debug = document.getElementById("debug")
	debug.classList.add("hide")

	// clean
	while (debug.firstChild) {
		debug.removeChild(debug.firstChild)
	}

	// request to api
		const sqo = sqo_context.show.find(el => el.typo==='sqo')
		const request_pre = ui.create_dom_element({
			element_type : 'pre',
			text_content : "search query object sended to api: \n\n" + JSON.stringify(sqo, null, "   "),
			parent 		 : debug
		})

	// context
		const context_pre = ui.create_dom_element({
			element_type : 'pre',
			text_content : "context: " + JSON.stringify(response.result.context, null, "   "),
			parent 		 : debug
		})

	// data
		const data_pre = ui.create_dom_element({
			element_type : 'pre',
			text_content : "data: " + JSON.stringify(response.result.data, null, "   "),
			parent 		 : debug
		})

	// const time_info = "" +
	// 	"Total time: " + response.debug.exec_time +
	// 	"<br>Context exec_time: " + response.result.debug.context_exec_time +
	// 	"<br>Data exec_time: " + response.result.debug.data_exec_time  + "<br>"

	// const time_info_pre = ui.create_dom_element({
	// 	element_type : "pre",
	// 	class_name   : "total_time",
	// 	id   		 : "total_time",
	// 	inner_html   : time_info,
	// 	parent 		 : debug
	// })

	event_manager.subscribe('render_'+self.id, function(node){
		//console.log("node:",node);
		debug.classList.remove("hide")
	})


	return true
}//end load_section_data_debug



/**
* RENDER
* @return promise render_promise
*//*
section.prototype.render__DES = async function(){

	const self = this

	// status update
		self.status = 'rendering'

	// self data veification
	if (typeof self.data==="undefined") {
		self.data = {
			value : []
		}
	}

	// iterate records
		const value 		= self.data.value || []
		const value_length 	= value.length

		for (let i = 0; i < value_length; i++) {
			//console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);

			const current_section_id 	= value[i].section_id
			const current_section_tipo 	= value[i].section_tipo
			const current_data			= self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
			const current_context 		= self.context

			// section_record
				const current_section_record = await instances.get_instance({
					model 			: 'section_record',
					tipo 			: current_section_tipo,
					section_tipo	: current_section_tipo,
					section_id		: current_section_id,
					mode			: self.mode,
					lang			: self.lang,
					context 		: current_context,
					data			: current_data,
					datum 			: self.datum
				})

			// add
				self.ar_instances.push(current_section_record)

		}//end for loop


		// render using external proptotypes of 'render_component_input_text'
			// const mode = self.mode
			// //self.ar_instances.push(ar_section_record)
			// let node = null
			// switch (mode){
			// 	case 'list':
			// 		// add prototype list function from render_component_input_text
			// 		section.prototype.list 			= render_section.prototype.list
			// 		section.prototype.list_header 	= render_section.prototype.list_header
			// 		const list_node = await self.list(self.ar_instances)
 			// 		// set
 			// 		self.node.push(list_node)
 			// 		node = list_node
 			// 		break
 			//
 			// 	case 'edit':
 			// 	default :
 			// 		// add prototype edit function from render_section
 			// 		section.prototype.edit =  render_section.prototype.edit
 			// 		const edit_node = await self.edit(self.ar_instances)
 			// 		// set
 			// 		self.node.push(edit_node)
 			// 		node = edit_node
		 	// 		break
			// }

	// get node
		//const get_node = async () => {
		//
		//	switch (self.mode){
		//		case 'list':
		//			return self.list(self.ar_instances)
		//			break
		//
		//		case 'edit':
		//		default :
		//
		//			return self.edit(self.ar_instances)
		//			break
		//	}
		//}
		//const node = await get_node()

	// node
		const node = await self[self.mode]()

	// set
		self.node.push(node)

	// status update
		self.status = 'rendered'

	// event publish
		event_manager.publish('render_'+self.id, node)


	return node
}//end render
*/


/**
* RENDER_CONTENT
* @return promise render_promise
*//*
section.prototype.render_content = async function(){

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
}//end render_content
*/




/**
* CREATE_SQO_CONTEXT
* @return
*//*
section.prototype.create_sqo_context = function(){

	const self = this

		console.log("sqo_in JS:");

	// filter
		let filter = null
		if (self.section_id) {
			filter = {
				"$and": [{
					q: self.section_id,
					path: [{
						section_tipo : self.section_tipo,
						modelo 		 : "component_section_id"
					}]
				}]
			}
		}
	// sqo_show
		const show = [
			{ // source object
				typo			: "source",
				action			: "search",
				model 			: 'section',
				tipo 			: self.section_tipo,
				mode 			: self.mode,
				lang 			: self.lang,
				pagination		: {offset : 0},
			},
			{ // search query object in section 'test65'
				typo			: "sqo",
				id				: "query_"+self.section_tipo+"_sqo",
				section_tipo	: [self.section_tipo],
				limit			: (self.mode==="list") ? 10 : 1,
				order			: null,
				offset			: 0,
				full_count		: false,
				filter			: filter
			},
			{ // section 'test65'
				typo			: "ddo",
				model			: self.model,
				tipo 			: self.section_tipo,
				section_tipo 	: self.section_tipo,
				mode 			: self.mode,
				lang 			: self.lang,
				parent			: "root"
			}
		]
	// sqo_context
		const sqo_context = {
			show : show,
			search : []
		}

	return sqo_context
}//end create_sqo_context
*/



/**
* LOAD_DATA
* @return
*//*
section.prototype.load_data = async function() {

	const self = this

	const current_datum = self.datum

	// set data to current instance
		self.context	= current_datum.context.filter(element => element.section_tipo===self.section_tipo)
		self.data 		= current_datum.data.filter(element => element.section_tipo===self.section_tipo)

		// Update section mode with context declaration
			const section_context = self.context.filter(element => element.tipo===self.section_tipo)[0]
			self.mode = section_context.mode

		const section_data		= current_datum.data.filter(item => item.tipo===self.section_tipo && item.section_tipo===self.section_tipo)
		const ar_section_id		= section_data[0].value
		self.ar_section_id 		= ar_section_id

	return true
}//end load_data
*/



/**
* LOAD_SECTION_RECORDS
* @return promise loaded
*//*
section.prototype.load_section_records = function() {

	const self = this

	const context 		= self.context
	const data 			= self.data
	const section_tipo 	= self.section_tipo

	const section_data		= data.filter(item => item.tipo===section_tipo && item.section_tipo===section_tipo)
	const ar_section_id		= section_data[0].value
	self.ar_section_id 		= ar_section_id
	const data_lenght 		= ar_section_id.length
	const context_lenght 	= context.length


	const loaded = new Promise(function(resolve){

		const section_record_promises =[]
		// for every section_id
		for (let i = 0; i < data_lenght; i++) {

			// init component
				const item_options = {
					model 			: 'section_record',
					data			: data,
					context 		: context,
					section_tipo	: section_tipo,
					section_id		: ar_section_id[i],
					tipo 			: section_tipo,
					mode			: self.mode,
					lang			: self.lang,
					global_context 	: self.context,
					global_data 	: self.context,
				}

			const current_instance = instances.get_instance(item_options).then(function(section_record){
				return section_record.build()
			})

			// add the instances to the cache
				section_record_promises.push(current_instance)

		}// end for

		return Promise.all(section_record_promises).then(function(){
			resolve(true)
		})
	})//end loaded

	return loaded
}//end load_section_records
*/



