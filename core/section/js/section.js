/*global get_label, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_TOOLS_URL, Promise */
/*eslint no-undef: "error"*/



// imports
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import * as instances from '../../common/js/instances.js'
	import {common, set_context_vars, create_source, load_data_debug, get_columns_map, push_browser_history} from '../../common/js/common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {search} from '../../search/js/search.js'
	import {toggle_search_panel} from '../../search/js/render_search.js'
	import {inspector} from '../../inspector/js/inspector.js'
	import {ui} from '../../common/js/ui.js'
	import {render_edit_section} from './render_edit_section.js'
	import {render_list_section} from './render_list_section.js'
	import {render_common_section} from './render_common_section.js'



/**
* SECTION
*/
export const section = function() {

	this.id				= null

	// element properties declare
	this.model					= null
	this.type					= null
	this.tipo					= null
	this.section_tipo			= null
	this.section_id				= null
	this.section_id_selected	= null
	this.mode					= null
	this.lang					= null
	this.column_id				= null

	this.datum					= null
	this.context				= null
	this.data					= null
	this.total					= null

	this.ar_section_id			= null

	this.node					= null
	this.ar_instances			= null

	this.status					= null

	this.filter					= null
	this.inspector				= null
	this.paginator				= null

	this.id_variant				= null

	this.rqo_config				= null
	this.rqo					= null

	this.config					= null


	return true
}//end section



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

	section.prototype.delete_record		= render_common_section.prototype.delete_record



/**
* INIT
* Fix instance main properties
* @param object options
* @return bool
*/
section.prototype.init = async function(options) {

	const self = this

	// vars
		// instance key used vars
		self.model					= options.model
		self.tipo					= options.tipo
		self.section_tipo			= options.section_tipo
		self.section_id				= options.section_id
		self.section_id_selected	= options.section_id_selected
		self.mode					= options.mode
		self.lang					= options.lang

		// DOM
		self.node					= null

		self.section_lang			= options.section_lang
		self.parent					= options.parent

		self.events_tokens			= []
		self.ar_instances			= []

		self.caller					= options.caller	|| null

		self.datum					= options.datum		|| null
		self.context				= options.context	|| null
		self.data					= options.data		|| null

		self.type					= 'section'
		self.label					= null

		// filter. Allow false as value when no filter is required
		self.filter					= options.filter!==undefined ? options.filter : null

		// inspector. Allow false as value when no inspector is required (notes cases)
		self.inspector				= options.inspector!==undefined ? options.inspector : null

		// paginator. Allow false as value when no paginator is required
		self.paginator				= options.paginator!==undefined ? options.paginator : null

		self.permissions			= options.permissions || null

		// columns_map
		self.columns_map			= options.columns_map || []

		// config
		self.config					= options.config || null

		// request_config
		self.request_config			= options.request_config || null

	// event subscriptions
		// new_section_ event
			self.events_tokens.push(
				event_manager.subscribe('new_section_' + self.id, fn_create_new_section)
			)
			async function fn_create_new_section() {

				if (!confirm(get_label.sure || 'Sure?')) {
					return false
				}

				// data_manager. create
				const rqo = {
					action	: 'create',
					source	: {
						section_tipo : self.section_tipo
					}
				}
				const api_response = await data_manager.request({
					body : rqo
				})
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


		// delete_section_ event. (!) Moved to self button delete in render_section_list
			// self.events_tokens.push(
			// 	event_manager.subscribe('delete_section_' + self.id, fn_delete_section)
			// )
			// async function fn_delete_section(options) {
			// 	console.log("-> delete_section_ options:", self.id, options);
			// 	// options
			// 		const section_id	= options.section_id
			// 		const section_tipo	= options.section_tipo
			// 		const section		= options.caller
			// 		const sqo			= options.sqo ||
			// 			{
			// 				section_tipo		: [section_tipo],
			// 				filter_by_locators	: [{
			// 					section_tipo	: section_tipo,
			// 					section_id		: section_id
			// 				}],
			// 				limit				: 1
			// 			}

			// 	// delete_record
			// 		self.delete_record({
			// 			section			: section,
			// 			section_id		: section_id,
			// 			section_tipo	: section_tipo,
			// 			sqo				: sqo
			// 		})
			// }//end fn_create_new_section

		// toggle_search_panel event. Triggered by button 'search' placed into section inspector buttons
			self.events_tokens.push(
				event_manager.subscribe('toggle_search_panel', fn_toggle_search_panel)
			)
			async function fn_toggle_search_panel() {
				if (!self.search_container) {
					return
				}
				if (self.search_container.children.length===0) {
					// await add_to_container(self.search_container, self.filter)
					await ui.load_item_with_spinner({
						container	: self.search_container,
						label		: 'filter',
						callback	: async () => {
							await self.filter.build()
							return self.filter.render()
						}
					})
				}
				toggle_search_panel(self.filter)
			}//end fn_toggle_search_panel

		// render_ event
			self.events_tokens.push(
				event_manager.subscribe('render_'+self.id, fn_render)
			)
			function fn_render() {
				// open_search_panel. local DDBB table status
				const status_id			= 'open_search_panel'
				const collapsed_table	= 'status'
				data_manager.get_local_db_data(status_id, collapsed_table, true)
				.then(async function(ui_status){
					// (!) Note that ui_status only exists when element is open
					const is_open = typeof ui_status==='undefined' || ui_status.value===false
						? false
						: true
					if (is_open===true && self.search_container && self.search_container.children.length===0) {
						// add_to_container(self.search_container, self.filter)
						await ui.load_item_with_spinner({
							container	: self.search_container,
							label		: 'filter',
							callback	: async () => {
								await self.filter.build()
								return self.filter.render()
							}
						})
						toggle_search_panel(self.filter)
					}
				})
			}//end fn_render

	// load additional files as css used by section_tool in self.config
		if(self.config && self.config.source_model==='section_tool'){
			self.load_section_tool_files()
		}

	// status update
		self.status = 'initiated'


	return true
}//end init



/**
* BUILD
* Load and parse necessary data to create a full ready instance
* @param bool autoload = false
* @return bool
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
		self.data		= self.data || {}
		// self.context	= self.context || {}

	// rqo
		const generate_rqo = async function(){

			if (!self.context) {
				// rqo_config. get the rqo_config from request_config
				self.rqo_config = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}else{
				// rqo_config. get the rqo_config from context
				self.rqo_config	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}

			// rqo build
			const action	= 'search'
			const add_show	= self.mode==='tm'
			self.rqo = self.rqo || await self.build_rqo_show(
				self.rqo_config, // object rqo_config
				action,  // string action like 'search'
				add_show // bool add_show
			)
		}
		await generate_rqo()

	// debug check
		if(SHOW_DEBUG===true) {
			// console.log("SECTION self.rqo before load:", clone(self.rqo) );
		}

	// filter search
		if (self.filter===null && self.mode!=='tm') {
			self.filter = new search()
			self.filter.init({
				caller	: self,
				mode	: self.mode
			})
			// self.filter.build()
		}
		// console.log("section build filter inactive (remember) ");

	// load data if is not already received as option
		if (autoload===true) {
			// const t0 = performance.now()

			// get context and data
				const api_response = await data_manager.request({
					body : self.rqo
				})
				if(SHOW_DEVELOPER===true) {
					// const response	= clone(api_response)
					// const exec_time	= (performance.now()-t0).toFixed(3)
					// dd_console('SECTION api_response:', 'DEBUG', [self.id, response, exec_time]);
					console.log('api_response:', api_response);
				}
				if (!api_response || !api_response.result) {
					self.running_with_errors = [
						'section build autoload api_response: '+ (api_response.error || api_response.msg)
					]
					console.error("Error: section build autoload api_response:", api_response);
					return false
				}

			// set the result to the datum
				self.datum = api_response.result

			// set Context
				// context is only set when it's empty the origin context,
				// if the instance has previous context, it will need to preserve.
				// because the context could be modified by ddo configuration and it can no be changed
				// ddo_map -----> context
				// ex: oh27 define the specific ddo_map for rsc368
				// 		{ mode: list, view: line, children_view: text ... }
				// if you call to API to get the context of the rsc368 the context will be the default config
				// 		{ mode: edit, view: default }
				// but it's necessary preserve the specific ddo_map configuration in the new context.
				// Context is set and changed in section_record.js to get the ddo_map configuration
				if(!self.context){
					const context	= self.datum.context.find(el => el.section_tipo===self.section_tipo) || {}
					if (!context) {
						console.error("context not found in api_response:", api_response);
					}else{
						self.context = context
					}
				}

			// set Data
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
				// console.log('SECTION self.rqo after load:", clone(self.rqo) );

			// update rqo.sqo.limit. Note that it may have been updated from the API response
			// Paginator takes limit from: self.rqo.sqo.limit
				const request_config_item = self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
				if (request_config_item) {
					// Updated self.rqo.sqo.limit. Try sqo and show.sqo_config
					if (request_config_item.sqo && request_config_item.sqo.limit) {
						self.rqo.sqo.limit = request_config_item.sqo.limit
					}else
					if(request_config_item.show && request_config_item.show.sqo_config && request_config_item.show.sqo_config.limit) {
						self.rqo.sqo.limit = request_config_item.show.sqo_config.limit
					}
				}

			// count rows
				if (!self.total) {
					const count_sqo = clone(self.rqo.sqo )
					delete count_sqo.limit
					delete count_sqo.offset
					delete count_sqo.select
					delete count_sqo.order
					delete count_sqo.generated_time
					const source	= create_source(self, null)
					const rqo_count	= {
						action			: 'count',
						sqo				: count_sqo,
						prevent_lock	: true,
						source			: source
					}
					self.total = function() {
						return new Promise(function(resolve){
							data_manager.request({
								body : rqo_count
							})
							.then(function(api_count_response){
								self.total = api_count_response.result.total
								resolve(self.total)
							})
						})
					}

					// set_local_db_data updated rqo
						// const rqo = self.rqo
						// data_manager.set_local_db_data(
						// 	rqo,
						// 	'rqo'
						// )
				}

			// set_local_db_data updated rqo
				// const rqo = self.rqo
				// data_manager.set_local_db_data(
				// 	rqo,
				// 	'rqo'
				// )

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
		// const section_context = self.context || {
		// 	mode		: 'edit',
		// 	label		: 'Section without permissions '+self.tipo,
		// 	permissions	: 0
		// }
		// self.mode 	= section_context.mode

	// update instance properties from context
		set_context_vars(self, self.context)

	// initiator . URL defined var or Caller of parent section
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
		if (self.paginator===null) {

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
					// navigate section rows
						self.navigate(
							() => { // callback
								// fix new offset value
									self.rqo_config.sqo.offset	= offset
									self.rqo.sqo.offset			= offset
								// set_local_db_data updated rqo
									if (self.mode==='list') {
										const rqo = self.rqo
										data_manager.set_local_db_data(
											rqo,
											'rqo'
										)
									}
							},
							true // bool navigation_history save
						)
				}
		}//end if (!self.paginator)

	// inspector
		if (self.inspector===null && self.mode==='edit' && self.permissions) {
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
		self.columns_map = get_columns_map(self.context, self.datum.context)

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
													item.parent_section_id==element.parent_section_id
													// && item.row_section_id==element.row_section_id
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
		self.status = 'built'


	return true
}//end build



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

	// add node to instance
		self.node = result_node

	return result_node
}//end render



/**
* GET_AR_INSTANCES (section_records)
* Generate a section_record instance for each data value
*/
section.prototype.get_ar_instances = async function(options={}){

	const self = this

	// options
		const mode			= options.mode || self.mode || 'list'
		const columns_map	= options.columns_map || self.columns_map
		const id_variant	= options.id_variant || self.id_variant || null
		const view			= options.view || 'default'

	// iterate records
		const lang 			= self.section_lang || self.lang
		const value			= self.data && self.data.value
			? self.data.value
			: []
		const value_length	= value.length

		const section_record_mode = mode==='tm'
			? 'list'
			: mode

		const request_config = clone(self.context.request_config)


		// const ar_instances = []
		const ar_promises = []
		for (let i = 0; i < value_length; i++) {

			const locator				= value[i];
			const current_section_id	= locator.section_id
			const current_section_tipo	= locator.section_tipo
			// const current_data			= (self.mode==='tm')
			// 	? self.datum.data.filter(element => element.matrix_id===value[i].matrix_id && element.section_tipo===current_section_tipo && element.section_id===current_section_id)
			// 	: self.datum.data.filter(element => element.section_tipo===current_section_tipo && element.section_id===current_section_id)
			// const current_context 		= (typeof self.datum.context!=="undefined")
			// 	? self.datum.context.filter(el => el.section_tipo===current_section_tipo && el.parent===self.tipo)
			// 	: []

			const instance_options = {
				model			: 'section_record',
				tipo			: self.tipo,
				section_tipo	: current_section_tipo,
				section_id		: current_section_id,
				mode			: section_record_mode,
				lang			: lang,
				context			: {
					view				: view,
					request_config		: request_config,
					fields_separator	: self.context.fields_separator
				},
				// data			: current_data,
				datum			: self.datum,
				row_key 		: i,
				caller			: self,
				paginated_key	: locator.paginated_key,
				columns_map		: self.columns_map,
				column_id		: self.column_id,
				locator			: locator
			}

			// id_variant . Propagate a custom instance id to children
				if (id_variant) {
					instance_options.id_variant = id_variant
				}

			// locator tag_id modifies id_variant when is present
				if (locator.tag_id) {
					const tag_id_add = '_l' + locator.tag_id
					instance_options.id_variant = (instance_options.id_variant)
						? instance_options.id_variant + tag_id_add
						: tag_id_add
				}


			// time machine options
				if (mode==='tm') {
					instance_options.matrix_id			= locator.matrix_id
					instance_options.modification_date	= locator.timestamp
				}

			// section_record. init and build
				// 	const current_section_record = await instances.get_instance(instance_options)
				// 	await current_section_record.build(true)

			// add instance
				// 	ar_instances.push(current_section_record)

			// promise add and continue init and build
				ar_promises.push(new Promise(function(resolve){
					instances.get_instance(instance_options)
					.then(function(current_section_record){
						current_section_record.build()
						.then(function(){
							resolve(current_section_record)
						})
					})
				}))

		}//end for (let i = 0; i < value_length; i++)

	// ar_instances. When all section_record instances are built, set them
		const ar_instances = await Promise.all(ar_promises).then((ready_instances) => {
			return ready_instances
		});

	// set
		// self.ar_instances.push(...ar_instances)


	return ar_instances
}//end get_ar_instances



/**
* LOAD_SECTION_TOOL_FILES
* @return promise
*/
section.prototype.load_section_tool_files = function() {

	const self = this

	// load dependencies js/css
		// const load_promises = []

		// css file load
			// const lib_css_file = self.config.tool_context && self.config.tool_context.css
			// 	? self.config.tool_context.css.url
			// 	: null
			// if (lib_css_file) {
			// 	load_promises.push( common.prototype.load_style(lib_css_file) )
			// }
			const model = self.config.tool_context.model
			const url = DEDALO_TOOLS_URL + '/' + model + '/css/' + model + '.css'
			const js_promise = common.prototype.load_style(url)

	// const js_promise = Promise.all(load_promises)


	return js_promise
}//end load_section_tool_files



/**
* DELETE_SECTION
* @param object options
* {
* 	sqo : object,
* 	delete_mode : string
* }
* @return promise
*/
section.prototype.delete_section = async function (options) {

	const self = this

	// options
		const sqo				= clone(options.sqo)
		const delete_mode		= options.delete_mode
		const caller_dataframe	= options.caller_dataframe || null

	// sqo
		// sqo.limit = null

	// source
		const source			= create_source(self, 'delete')
		source.section_id		= self.section_id
		source.delete_mode		= delete_mode
		source.caller_dataframe	= caller_dataframe

	// data_manager. delete
		const rqo = {
			action	: 'delete',
			source	: source,
			sqo		: sqo
		}

		const api_response = await data_manager.request({
			body : rqo
		})
		if (api_response.result && api_response.result.length>0) {
			// const ar_section_id = api_response.result
			self.refresh()
		}

	return true
}//end delete_section



/**
* NAVIGATE
* Refresh the section instance with new sqo params creating a
* history footprint. Used to paginate and sort records
* @param function callback
* @return promise
*/
section.prototype.navigate = async function(callback, navigation_history=false) {

	const self = this

	// unsaved_data check
		if (window.unsaved_data===true) {
			if (!confirm('section: ' +get_label.discard_changes || 'Discard unsaved changes?')) {
				return false
			}
			// reset unsaved_data state by the user
			window.unsaved_data = false
		}

	// callback execute
		if (callback) {
			await callback()

			if(SHOW_DEBUG===true) {
				// console.log("-> Executed section navigate received callback:", callback);
			}
		}

	// loading
		self.node_body.classList.add('loading')

	// refresh
		await self.refresh()

	// loading
		self.node_body.classList.remove('loading')

	// navigation history. When user paginates, store navigation history to allow browser navigation too
		if (navigation_history===true) {

			const source	= create_source(self, null)
			const sqo		= self.rqo_config.sqo
			const title		= self.id
			const url		= '#section_nav' // '?t='+ self.tipo + '&m=' + self.mode

			// browser navigation update
				push_browser_history({
					source	: source,
					sqo		: sqo,
					title	: title,
					url		: url
				})
		}

	return true
}//end navigate
