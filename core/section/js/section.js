/*global get_label, SHOW_DEBUG, SHOW_DEVELOPER */
/*eslint no-undef: "error"*/



// imports
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {common, set_context_vars, create_source, load_data_debug, get_columns_map} from '../../common/js/common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {search} from '../../search/js/search.js'
	import {toggle_search_panel} from '../../search/js/render_search.js'
	import {inspector} from '../../inspector/js/inspector.js'
	import {ui} from '../../common/js/ui.js'
	import {render_edit_section} from './render_edit_section.js'
	import {render_list_section} from './render_list_section.js'



/**
* SECTION
*
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
	// section.prototype.render			= common.prototype.render
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

	// columns_map
	self.columns_map 		= options.columns_map || []

	self.config 			= options.config || null

	// events subscription
		// new_section_
		self.events_tokens.push(
			event_manager.subscribe('new_section_' + self.id, fn_create_new_section)
		)
		async function fn_create_new_section() {

			if (!confirm(get_label.seguro || 'Sure?')) {
				return false
			}

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

		// toggle_search_panel. Triggered by button 'search' placed into section inspector buttons
		self.events_tokens.push(
			event_manager.subscribe('toggle_search_panel', fn_toggle_search_panel)
		)
		async function fn_toggle_search_panel() {
			if (self.search_container.children.length===0) {
				await self.filter.build()
				const filter_wrapper = await self.filter.render()
				await self.search_container.appendChild(filter_wrapper)
			}
			toggle_search_panel(self.filter)
		}

		// render event
		self.events_tokens.push(
			event_manager.subscribe('render_'+self.id, fn_render)
		)
		function fn_render() {
			// open_search_panel. local DDBB table status
				const status_id			= 'open_search_panel'
				const collapsed_table	= 'status'
				data_manager.prototype.get_local_db_data(status_id, collapsed_table, true)
				.then(async function(ui_status){
					// (!) Note that ui_status only exists when element is open
					const is_open = typeof ui_status==='undefined' || ui_status.value===false
						? false
						: true
					if (is_open===true && self.search_container.children.length===0) {
						const spinner = ui.create_dom_element({
							element_type	: 'div',
							class_name		: 'spinner',
							parent			: self.search_container
						})
						await self.filter.build()
						const filter_wrapper = await self.filter.render()
						await self.search_container.appendChild(filter_wrapper)
						toggle_search_panel(self.filter)
						spinner.remove()
					}
				})
		}


	// load additional files as css used by section_tool in self.config
		if(self.config && self.config.source_model==='section_tool'){
			self.load_section_tool_files()
		}


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
	// const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}
		self.context = self.context || {}

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
			// self.filter.build()
		}
		// console.log("section build filter unactive (remember) ");

	// load data if is not already received as option
		if (autoload===true) {

			// get context and data
				const api_response = await current_data_manager.request({body:self.rqo})
				if(SHOW_DEVELOPER===true) {
					if (!api_response || !api_response.result) {
						console.error("section build autoload api_response:",api_response);
					}
					const response	= clone(api_response)
					const exec_time	= api_response.debug ? api_response.debug.exec_time : null
					dd_console("SECTION api_response:", 'DEBUG', [self.id, response, exec_time]);
				}

			// set the result to the datum
				self.datum = api_response.result

			// set context and data to current instance
				self.context	= self.datum.context.find(el => el.section_tipo===self.section_tipo) || {}
				self.data		= self.datum.data.find(el => el.tipo===self.tipo && el.typo==='sections') || {}
				self.section_id	= self.mode!=='list' && self.data && self.data.value
					? (() =>{
						const found = self.data.value.find(el => el.section_tipo===self.section_tipo)
						if (found && found.section_id) {
							return found.section_id
						}
						console.warn('Empty value found in self.data.value: ', self.data.value)
						return null
					  })()
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
					self.total = function() {
						return new Promise(function(resolve){
							current_data_manager.request({body:rqo_count})
							.then(function(api_count_response){
								self.total = api_count_response.result.total
								resolve(self.total)
							})
						})
					}

					// set_local_db_data updated rqo
						// const rqo = self.rqo
						// current_data_manager.set_local_db_data(rqo, 'rqo')
				}

			// set_local_db_data updated rqo
				// const rqo = self.rqo
				// current_data_manager.set_local_db_data(rqo, 'rqo')

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
								button_debug.addEventListener("click", function(){

									if (debug_container.hasChildNodes()) {
										debug_container.classList.toggle('hide')
										return
									}

									// clean
										// while (debug_container.firstChild) {
										// 	debug_container.removeChild(debug_container.firstChild)
										// }

									// collect debug data
									load_data_debug(self, api_response, self.rqo)
									.then(function(info_node){
										// debug.classList.add("hide")
										if (info_node) {
											debug_container.appendChild(info_node)
										}

										// scroll debug to top of page
											const bodyRect	= document.body.getBoundingClientRect()
											const elemRect	= debug.getBoundingClientRect()
											const offset	= elemRect.top - bodyRect.top
											window.scrollTo({
												top			: offset,
												left		: 0,
												behavior	: 'smooth'
											});
									})
								})

							// debug_container
								const debug_container = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'debug_container',
									parent			: debug
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

			// event paginator_goto_
				self.events_tokens.push(
					event_manager.subscribe('paginator_goto_'+self.paginator.id, fn_paginator_goto)
				)
				async function fn_paginator_goto(offset) {
					// loading
						// const selector	= self.mode==='list' ? '.list_body' : '.content_data.section'
						// const node		= self.node && self.node[0]
						// 	? await self.node[0].querySelector(selector)
						// 	: null
						// if (node) node.classList.add('loading')
						self.node_body.classList.add('loading')

					// fix new offset value
						self.rqo.sqo.offset = offset

					// set_local_db_data updated rqo
						const rqo = self.rqo
						current_data_manager.set_local_db_data(rqo, 'rqo')

					// refresh
						await self.refresh() // refresh current section

					// loading
						// if (node) node.classList.remove('loading')
						self.node_body.classList.remove('loading')
				}
		}//end if (!self.paginator)

	// inspector
		if (self.mode==='edit' && !self.inspector && self.permissions) {
			// if (initiator && initiator.model==='component_portal') {

			// 	self.inspector = null

			// }else{

				const current_inspector = new inspector()
				current_inspector.init({
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					caller			: self
				})
				// fix section inspector
				self.inspector = current_inspector
			// }
		}

	// columns_map. Get the columns_map to use into the list
		self.columns_map = get_columns_map(self.context)

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
* RENDER
* @param object options
*	render_level : level of deep that is rendered (full | content)
* @return promise
*	node first DOM node stored in instance 'node' array
*/
section.prototype.render = async function(options={}) {

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)


	return result_node
};//end render



/**
* GET_AR_INSTANCES (section_records)
* Generate a section_record instance for each data value
*/
export const get_ar_instances = async function(self){

	// const self = this

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
		const section_record_mode = self.mode==='tm'
			? 'list'
			: self.mode

		// const ar_instances = []
		const ar_promises = []
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
				mode			: section_record_mode,
				lang			: lang,
				context			: current_context,
				// data			: current_data,
				datum			: self.datum,
				row_key 		: i,
				caller			: self,
				offset			: offset,
				columns_map		: self.columns_map,
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
					instance_options.mode				= 'list' // section record and components will be created in list mode (!)
					// instance_options.state			= value[i].state
				}

			// // section_record. init and build
			// 	const current_section_record = await instances.get_instance(instance_options)
			// 	await current_section_record.build(true)

			// // add instance
			// 	ar_instances.push(current_section_record)

			// promise add and continue. Init and build
				ar_promises.push(new Promise(function(resolve){
					instances.get_instance(instance_options)
					.then(function(current_section_record){
						current_section_record.build()
						.then(function(){
							resolve(current_section_record)
						})
					})
				}))


		}//end for loop

	// ar_instances. When all section_record instances are built, set them
		const ar_instances = await Promise.all(ar_promises).then((ready_instances) => {
			return ready_instances
		});

	// set
		// self.ar_instances.push(...ar_instances)


	return ar_instances
};//end get_ar_instances



/**
* LOAD_SECTION_TOOL_FILES
* @return promise
*/
section.prototype.load_section_tool_files = function() {

	const self = this

	// load dependences js/css
		const load_promises = []

		// css file load
			const lib_css_file = self.config.tool_context && self.config.tool_context.css
				? self.config.tool_context.css
				: ''
			load_promises.push( common.prototype.load_style(lib_css_file) )

		// // js module import
		// 	const load_promise = import('../../../lib/jsoneditor/dist/jsoneditor.min.js') // used minified version for now
		// 	load_promises.push( load_promise )
		// 	//self.JSONEditor = JSONEditor

	const js_promise = Promise.all(load_promises)


	return js_promise
};//end load_section_tool_files


/**
* DELETE_SECTION
* @return promise
*/
section.prototype.delete_section = async function (options) {

	const self = this
	// options
	const sqo			= options.sqo
	const delete_mode	= options.delete_mode

	// source
	const source		= create_source(self, 'delete')
	source.section_id	= self.section_id
	source.delete_mode 	= delete_mode

	// data_manager. delete
	const rqo = {
		action	: 'delete',
		source	: source,
		sqo		: sqo
	}

	const current_data_manager	= new data_manager()
	const api_response			= await current_data_manager.request({body:rqo})

	if (api_response.result && api_response.result>0) {
		const ar_section_id = api_response.result
		self.refresh()
	}
};// delete_section

