/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {common, set_context_vars, create_source, load_data_debug} from '../../common/js/common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {search} from '../../search/js/search.js'
	import {inspector} from '../../inspector/js/inspector.js'
	import {ui} from '../../common/js/ui.js'
	import {render_edit_section} from './render_edit_section.js'
	import {render_list_section} from './render_list_section.js'



/**
* SECTION
*/
export const section = function() {

	this.id				= null

	// element properties declare
	this.model			= null
	this.type			= null
	this.tipo			= null
	this.section_tipo	= null
	this.section_id		= null
	this.mode			= null
	this.lang			= null
	this.column_id		= null

	this.datum			= null
	this.context		= null
	this.data			= null
	this.total			= null

	this.ar_section_id	= null

	this.node			= null
	this.ar_instances	= null

	this.status			= null
	this.paginator		= null

	this.id_variant		= null

	this.rqo_config		= null
	this.rqo			= null

	this.config			= null


	return true
};//end section



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// life cycle
	section.prototype.render			= common.prototype.render
	section.prototype.destroy			= common.prototype.destroy
	section.prototype.refresh			= common.prototype.refresh
	section.prototype.build_rqo_show	= common.prototype.build_rqo_show
	section.prototype.build_rqo_search	= common.prototype.build_rqo_search

	// render
	section.prototype.edit				= render_edit_section.prototype.edit
	section.prototype.list				= render_list_section.prototype.list
	section.prototype.list_portal		= render_list_section.prototype.list
	section.prototype.tm				= render_list_section.prototype.list
	section.prototype.list_header		= render_list_section.prototype.list_header

	section.prototype.get_columns		= common.prototype.get_columns



/**
* INIT
* @return bool
*/
section.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model				= options.model
	self.tipo				= options.tipo
	self.section_tipo		= options.section_tipo
	self.section_id			= options.section_id
	self.mode				= options.mode
	self.lang				= options.lang

	// DOM
	self.node				= []
	self.columns			= []

	self.section_lang		= options.section_lang
	self.parent				= options.parent

	self.events_tokens		= []
	self.ar_instances		= []

	self.caller				= options.caller	|| null

	self.datum				= options.datum		|| null
	self.context			= options.context	|| null
	self.data				= options.data		|| null

	self.type				= 'section'
	self.label				= null

	self.filter				= null // (? used)
	self.inspector			= null

	self.permissions		= options.permissions || null

	// columns
	self.columns = options.columns

	self.config = options.config || null
	
	// events subscription
		// new_section_
		self.events_tokens.push(
			event_manager.subscribe('new_section_' + self.id, fn_create_new_section)
		)
		async function fn_create_new_section() {

			// data_manager. create
			const rqo = {
				action			: 'create',
				section_tipo	: self.section_tipo
			}
			const current_data_manager	= new data_manager()
			const api_response			= await current_data_manager.request({body:rqo})
			if (api_response.result && api_response.result>0) {

				const section_id = api_response.result

				const source = create_source(self, 'search')
					  source.section_id	= section_id
					  source.mode		= 'edit'
				
				const sqo = {
					mode				: self.mode,
					section_tipo		: [{tipo:self.section_tipo}],
					filter_by_locators	: [{
						section_tipo	: self.section_tipo,
						section_id		: section_id
					}],
					limit				: 1,
					offset				: 0
				}
				// launch event 'user_navigation' that page is watching
				event_manager.publish('user_navigation', {
					source	: source,
					sqo		: sqo
				})
			}
		}//end fn_create_new_section


	// status update
		self.status = 'initiated'


	return true
};//end init



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

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}

	const current_data_manager	= new data_manager()
		
	// rqo
		const generate_rqo = async function(){
			// rqo_config. get the rqo_config from context
			self.rqo_config	= self.context.request_config
				? self.context.request_config.find(el => el.api_engine==='dedalo')
				: {}
			
			// rqo build
			const action	= 'search'
			const add_show	= self.mode==='tm'
			self.rqo = self.rqo || await self.build_rqo_show(self.rqo_config, action, add_show)
		}
		await generate_rqo()

	// debug check
		if(SHOW_DEBUG===true) {
			// console.log("SECTION self.rqo before load:", clone(self.rqo) );
		}

	// filter search
		if (self.mode!=='tm' && !self.filter) {
			self.filter = new search()
			self.filter.init({
				caller	: self,
				mode	: self.mode
			})
			self.filter.build()
		}
		// console.log("section build filter unactive (remember) ");	
	
	// load data if is not already received as option
		if (autoload===true) {

			// get context and data
				const api_response = await current_data_manager.request({body:self.rqo})
				if(SHOW_DEVELOPER===true) {
					dd_console("SECTION api_response:", 'DEBUG', [self.id, JSON.parse(JSON.stringify(api_response)), api_response.debug.exec_time]);
				}


			// set the result to the datum
				self.datum = api_response.result

			// set context and data to current instance
				self.context	= self.datum.context.find(el => el.section_tipo===self.section_tipo)
				self.data		= self.datum.data.find(el => el.tipo===self.tipo && el.typo==='sections')
				self.section_id	= self.mode!=='list' && self.data && self.data.value
					? self.data.value.find(el => el.section_tipo===self.section_tipo).section_id
					: null

			// rqo regenerate
				await generate_rqo()
				// console.log("SECTION self.rqo after load:", clone(self.rqo) );
		
			// count rows
				if (!self.total) {
					const count_sqo = clone(self.rqo.sqo )
					delete count_sqo.limit
					delete count_sqo.offset
					delete count_sqo.select
					delete count_sqo.generated_time
					const rqo_count = {
						action			: 'count',
						sqo				: count_sqo,
						prevent_lock	: true
					}
					const api_count_response = await current_data_manager.request({body:rqo_count})
					self.total = api_count_response.result.total
					// set value
					// current_data_manager.set_local_db_data(self.rqo, 'rqo')
				}

			// set local_db value always
				// current_data_manager.set_local_db_data(self.rqo, 'rqo')

			// debug
				if(SHOW_DEBUG===true) {

					// fn_show_debug_info
						const fn_show_debug_info = function() {
							event_manager.unsubscribe(event_token)

							const debug = document.getElementById("debug")

							// clean
								while (debug.firstChild) {
									debug.removeChild(debug.firstChild)
								}

							// button_debug add
								const button_debug = ui.create_dom_element({
									element_type	: 'button',
									class_name		: 'info eye',
									inner_html		: get_label.debug || "Debug",
									parent			: debug
								})
								button_debug.addEventListener("click", function(e){
									this.remove()

									// collect debug data
									load_data_debug(self, api_response, self.rqo)
									.then(function(info_node){
										// debug.classList.add("hide")

										debug.appendChild(info_node)
									})
								})

							// show
								debug.classList.remove("hide")
						}
					const event_token = event_manager.subscribe('render_'+self.id, fn_show_debug_info)
					self.events_tokens.push(event_token)
				}
		}//end if (autoload===true)
	
	// Update section mode/label with context declarations
		const section_context = self.context || {
			mode		: 'edit',
			label		: 'Section without permissions '+self.tipo,
			permissions	: 0
		}
		self.mode 	= section_context.mode

	// update instance properties from context
		set_context_vars(self, self.context)

	// initiator . Url defined var or Caller of parent section
	// this is a param that defined who is calling to the section, sometimes it can be a tool or page or ...,
		const searchParams = new URLSearchParams(window.location.href);
		const initiator = searchParams.has("initiator")
			? searchParams.get("initiator")
			: self.caller!==null
				? self.caller.id
				: false
		// fix initiator
			self.initiator = initiator

	// paginator
		if (!self.paginator) {

			self.paginator = new paginator()
			self.paginator.init({
				caller	: self,
				mode	: self.mode
			})
			self.paginator.build()

			// event paginator_goto_
				// fn_paginator_goto
				const fn_paginator_goto = async function(offset) {
					// loading
						const selector	= self.mode==='list' ? '.list_body' : '.content_data.section'
						const node		= self.node && self.node[0]
							? self.node[0].querySelector(selector)
							: null
						if (node) node.classList.add('loading')

					// fix new offset value
						self.rqo.sqo.offset = offset

					// set_local_db_data updated rqo
						current_data_manager.set_local_db_data(self.rqo, 'rqo')

					// refresh
						await self.refresh() // refresh current section

					// loading
						if (node) node.classList.remove('loading')
				}
				self.events_tokens.push(
					event_manager.subscribe('paginator_goto_'+self.paginator.id , fn_paginator_goto)
				)
		}//end if (!self.paginator)

	// inspector
		if (!self.inspector && self.permissions) {
			// if (initiator && initiator.model==='component_portal') {

			// 	self.inspector = null

			// }else{

				const current_inspector = new inspector()
				current_inspector.init({
					section_tipo	: self.section_tipo,
					section_id		: self.section_id
				})
				current_inspector.caller = self
				current_inspector.build()
				// fix section inspector
				self.inspector = current_inspector
			// }
		}

	// columns. Get the columns to use into the list
		self.columns = self.get_columns()


	// debug
		if(SHOW_DEBUG===true) {
			// console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			// load_section_data_debug(self.section_tipo, self.request_config, load_section_data_promise)
			// console.log("__Time to build", self.model, "(ms):", performance.now()-t0);
			// dd_console(`__Time to build ${self.model} ${Math.round(performance.now()-t0)} ms`, 'DEBUG')

			// debug duplicates check
				const ar_used = []
				for(const element of self.datum.data) {

					if (element.matrix_id) { continue; } // skip verification in matrix data

					const index = ar_used.findIndex(item => item.tipo===element.tipo && 
													item.section_tipo===element.section_tipo && 
													item.section_id==element.section_id && 
													item.from_component_tipo===element.from_component_tipo && 
													item.parent_section_id==element.parent_section_id && 
													item.row_section_id==element.row_section_id 
													// && (item.matrix_id && item.matrix_id==element.matrix_id)
													&& (item.tag_id && item.tag_id==element.tag_id)
													)
					if (index!==-1) {
						console.error("SECTION ERROR. self.datum.data contains duplicated elements:", ar_used[index]); // clone(self.datum.data)
					}else{
						ar_used.push(element)
					}
				}
		}

	// status update
		self.status = 'builded'


	return true
};//end build



/**
* GET_AR_INSTANCES (section_records)
* Generate a section_record instance for each data value
*/
section.prototype.get_ar_instances = async function(){

	const self = this

	// self data verification
		// if (typeof self.data==="undefined") {
		// 	self.data = {
		// 		value : []
		// 	}
		// }
	
	// iterate records
		const lang 			= self.lang
		const value			= self.data && self.data.value
			? self.data.value
			: []
		const value_length	= value.length		

		const ar_instances = []
		for (let i = 0; i < value_length; i++) {
			// console.groupCollapsed("section: section_record " + self.tipo +'-'+ value[i]);
			const current_section_id	= value[i].section_id
			const current_section_tipo	= value[i].section_tipo
			// const current_data			= (self.mode==='tm')
			// 	? self.datum.data.filter(element => element.matrix_id===value[i].matrix_id && element.section_tipo===current_section_tipo && element.section_id===current_section_id)
			// 	: self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
			const current_context 		= (typeof self.datum.context!=="undefined")
				? self.datum.context.filter(el => el.section_tipo===current_section_tipo && el.parent===self.tipo)
				: []

			const offset = (self.rqo.sqo.offset + i)

			const instance_options = {
				model			: 'section_record',
				tipo			: current_section_tipo,
				section_tipo	: current_section_tipo,
				section_id		: current_section_id,
				mode			: self.mode,
				lang			: lang,
				context			: current_context,
				// data			: current_data,
				datum			: self.datum,
				caller			: self,
				offset			: offset,
				columns			: self.columns,
				column_id		: self.column_id
			}

			// id_variant . Propagate a custom instance id to children
				if (self.id_variant) {
					instance_options.id_variant = self.id_variant
				}

			// time machine options
				if (self.mode==='tm') {
					instance_options.matrix_id			= value[i].matrix_id
					instance_options.modification_date	= value[i].timestamp
					// instance_options.state			= value[i].state
				}

			// section_record. init and build
				const current_section_record = await instances.get_instance(instance_options)
				await current_section_record.build(true)

			// add instance
				ar_instances.push(current_section_record)
				
		}//end for loop

	// set
		self.ar_instances = ar_instances
	

	return self.ar_instances
};//end get_ar_instances



/**
* GET_AR_ROWS
*//*
section.prototype.get_ar_rows = async function(){

	const self = this

	// self data verification
		if (typeof self.data==="undefined") {
			self.data = {
				value : []
			}
		}

	// iterate records
		const value			= self.data.value || []
		const value_length	= value.length

		const offset = self.pagination.offset

		for (let i = 0; i < value_length; i++) {
			//console.groupCollapsed("section: section_record " + self.tipo +'-'+ ar_section_id[i]);

			const current_section_id	= value[i].section_id
			const current_section_tipo	= value[i].section_tipo
			const current_data			= (self.mode==='tm')
				? self.datum.data.filter(element => element.matrix_id===value[i].matrix_id && element.section_tipo===current_section_tipo && element.section_id===current_section_id)
				: self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
			const current_context 		= self.context

			const instance_options = {
					model			: 'section_record',
					tipo			: current_section_tipo,
					section_tipo	: current_section_tipo,
					section_id		: current_section_id,
					mode			: 'list',
					lang			: self.lang,
					context			: current_context,
					data			: current_data,
					datum			: self.datum,
					caller			: self,
					offset			: (offset+i),
					columns 		: self.columns
			}

			// id_variant . Propagate a custom instance id to children
				if (self.id_variant) {
					instance_options.id_variant = self.id_variant
				}

			// time machine options
				if (self.mode==='tm') {
					instance_options.matrix_id			= value[i].matrix_id
					instance_options.modification_date	= value[i].timestamp
					// instance_options.state			= value[i].state
				}

			// section_record. init and build
				const current_section_record = await instances.get_instance(instance_options);
				await current_section_record.build()

			// add
				// self.ar_instances.push(current_section_record)

		}//end for loop


	// return self.ar_instances
};//end get_ar_instances
*/



/**
* RENDER
* @return promise render_promise
*//*
section.prototype.render__DES = async function(){

	const self = this

	// status update
		self.status = 'rendering'

	// self data verification
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


		// render using external prototypes of 'render_component_input_text'
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
};//end render
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
};//end render_content
*/



/**
* CREATE_request_config
* @return
*//*
section.prototype.create_request_config = function(){

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
	// request_config
		const request_config = {
			show : show,
			search : []
		}

	return request_config
};//end create_request_config
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
};//end load_data
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
};//end load_section_records
*/


