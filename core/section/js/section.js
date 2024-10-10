// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// imports
	import {clone, url_vars_to_object, object_to_url_vars, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {
		common,
		set_context_vars,
		create_source,
		load_data_debug,
		get_columns_map,
		push_browser_history,
		build_autoload
	} from '../../common/js/common.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {check_unsaved_data} from '../../component_common/js/component_common.js'
	import {paginator} from '../../paginator/js/paginator.js'
	import {search} from '../../search/js/search.js'
	import {toggle_search_panel} from '../../search/js/render_search.js'
	import {inspector} from '../../inspector/js/inspector.js'
	import {render_edit_section} from './render_edit_section.js'
	import {render_list_section} from './render_list_section.js'
	import {render_solved_section} from './render_solved_section.js'
	import {render_common_section} from './render_common_section.js'



/**
* SECTION
*/
export const section = function() {

	this.id						= null

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
	this.events_tokens			= null
	this.ar_instances			= null
	this.caller					= null

	this.status					= null

	this.filter					= null
	this.inspector				= null
	this.paginator				= null
	this.buttons				= null

	this.id_variant				= null

	this.request_config_object	= null
	this.rqo					= null

	this.config					= null
	this.fixed_columns_map		= null
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
	section.prototype.solved			= render_solved_section.prototype.solved

	section.prototype.render_delete_record_dialog = render_common_section.prototype.render_delete_record_dialog



/**
* INIT
* Fix instance main properties
* @param object options
* @return bool
*/
section.prototype.init = async function(options) {

	const self = this

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

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

		// add_show to rqo to configure specific show
		self.add_show 				= options.add_show ?? false

		// buttons. bool to show / hide the buttons in list
		self.buttons 				= options.buttons ?? true

		// session_key
		self.session_save			= options.session_save ?? true
		self.session_key			= options.session_key ?? build_sqo_id(self.tipo)

		// view
		self.view					= options.view ?? null

	// event subscriptions

		// new_section_ event
			const new_section_handler = async () => {

				if (!confirm(get_label.sure || 'Sure?')) {
					return false
				}

				// lock new section creation while a creation process is working
				if (page_globals.creating_section) {
					console.error('Error. Ignored new section event. Wait for the creation of the active section to finish.');
					alert("Wait for the creation of the active section to finish.");
					return
				}
				page_globals.creating_section = true

				const new_section_id = await self.create_section()

				// navigate to the new record
				if (new_section_id) {
					self.navigate_to_new_section(new_section_id)
				}

				// unlock new section creation
				page_globals.creating_section = false
			}
			self.events_tokens.push(
				event_manager.subscribe('new_section_' + self.id, new_section_handler)
			)

		// duplicate_section_ event
			const duplicate_section_handler = async (options) => {

				// options
				const section_id = options.section_id

				if (!confirm(get_label.sure || 'Sure?')) {
					return false
				}

				// lock new section creation while a creation process is working
				if (page_globals.creating_section) {
					console.error('Error. Ignored new section event. Wait for the creation of the active section to finish.');
					alert("Wait for the creation of the active section to finish.");
					return
				}
				page_globals.creating_section = true

				const new_section_id = await self.duplicate_section(section_id)

				// navigate to the new record
				if (new_section_id) {
					self.navigate_to_new_section(new_section_id)
				}

				// unlock new section creation
				page_globals.creating_section = false
			}
			self.events_tokens.push(
				event_manager.subscribe('duplicate_section_' + self.id, duplicate_section_handler)
			)

		// delete_section_ event. (!) Moved to self button delete in render_section_list
			const delete_section_handler = async (options) => {

				// options
					const section_id	= options.section_id
					const section_tipo	= options.section_tipo
					const section		= options.caller
					const sqo			= options.sqo ||
						{
							section_tipo		: [section_tipo],
							filter_by_locators	: [{
								section_tipo	: section_tipo,
								section_id		: section_id
							}],
							limit				: 1
						}

				// delete_section
					await self.render_delete_record_dialog({
						section			: section,
						section_id		: section_id,
						section_tipo	: section_tipo,
						sqo				: sqo
					})
			}
			self.events_tokens.push(
				event_manager.subscribe('delete_section_' + self.id, delete_section_handler)
			)

		// toggle_search_panel event. Triggered by button 'search' placed into section inspector buttons
			const toggle_search_panel_handler = async () => {
				if (!self.search_container || !self.filter) {
					console.log('stop event no filter 1:', this);
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
			}
			self.events_tokens.push(
				event_manager.subscribe('toggle_search_panel_'+self.id, toggle_search_panel_handler)
			)

		// render_ event
			const render_handler = () => {
				// menu label control
					const update_menu = (menu) => {

						// menu instance check. Get from caller page
						if (!menu) {
							if(SHOW_DEBUG===true) {
								console.log('menu is not available from section.');
							}
							return
						}

						// Resolve the label of the section
						// if the section is called by a section_tool as 'oh81', get his label (transcription, indexation, etc. )
						// it's stored into the tool_congext of the config.
						// else get the section label
						const section_label = self.config?.tool_context?.label
							? self.config.tool_context.label
							: self.label

						// update_section_label. Show icon Inspector and activate the link event
						menu.update_section_label({
							value					: section_label,
							mode					: self.mode,
							section_label_on_click	: section_label_on_click
						})
						async function section_label_on_click(e) {
							e.stopPropagation();
							// goto_list
							return self.goto_list();
						}//end section_label_on_click
					}//end update_menu

				// call only for direct page created sections
					if ( self.caller?.model==='page' ) {

						// Resolve the label of the section
						// if the section is called by a section_tool as 'oh81', get his label (transcription, indexation, etc. )
						// it's stored into the tool_congext of the config.
						// else get the section label
						const section_label = self.config?.tool_context?.label
							? self.config.tool_context.label
							: self.label

						// set the window document.title
						const page_title = ( self.mode === 'edit' )
							? `${self.section_id} - ${section_label} - ${self.tipo}`
							: `${get_label.list || 'List'} - ${section_label} - ${self.tipo}`

						self.caller.set_document_title(page_title)

						// menu. Get instance from caller page
						const menu_instance = self.caller.ar_instances.find(el => el.model==='menu')
						if (menu_instance) {
							update_menu( menu_instance )
						}
					}

				// search control
					if (!self.search_container || !self.filter) {
						// console.log('stop event no filter 2:', this);
						return
					}
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

				if(SHOW_DEBUG===true) {
					console.log('section. event_manager.events.length:', event_manager.events.length);
				}
			}
			self.events_tokens.push(
				event_manager.subscribe('render_'+self.id, render_handler)
			)

	// load additional files as css used by section_tool in self.config
		if(self.config && self.config.source_model==='section_tool') {
			self.load_section_tool_files()
		}

	// render_views
		// Definition of the rendering views that could de used.
		// Tools or another components could add specific views dynamically
		self.render_views = [
			{
				view	: 'default',
				mode	: 'edit',
				render	: 'view_default_edit_section'
			},
			{
				view	: 'default',
				mode	: 'list',
				render	: 'view_default_list_section'
			}
		]

	// status update
		self.status = 'initialized'


	return true
}//end init



/**
* BUILD
* Load and parse necessary data to create a full ready instance
* @param bool autoload = false
* @return bool
*/
section.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// self.datum. On building, if datum is not created, creation is needed
		self.datum = self.datum || {
			data	: [],
			context	: []
		}
		self.data = self.data || {}

	// rqo
		const generate_rqo = async function(){

			if (!self.context) {
				// request_config_object. get the request_config_object from request_config
				self.request_config_object = self.request_config
					? self.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}else{
				// request_config_object. get the request_config_object from context
				self.request_config_object	= self.context && self.context.request_config
					? self.context.request_config.find(el => el.api_engine==='dedalo' && el.type==='main')
					: {}
			}

			// check request_config_object misconfigured issues (type = 'main' missed in request_config cases)
				if (self.request_config && !self.request_config_object) {
					console.warn('Warning: no request_config was found into the request_config. Maybe the request_config type is not set to "main"');
					console.warn('self.request_config:', self.request_config);
				}

			// rqo build
			const action	= 'search'
			const add_show	= (self.add_show)
				? self.add_show
				: (self.mode==='tm') ? true	: false
			self.rqo = self.rqo || await self.build_rqo_show(
				self.request_config_object, // object request_config_object
				action,  // string action like 'search'
				add_show // bool add_show
			)
		}
		await generate_rqo()

	// filter search
		if (self.filter===null && self.mode!=='tm') {
			self.filter = new search()
			self.filter.init({
				caller	: self,
				mode	: self.mode
			})
			.then(function(){
				// preload search (experimental disable)
				const pre_built_search = false
				if (pre_built_search && self.mode==='list') {
					setTimeout(function(){
						self.filter.build()
					}, 100)
				}
			})
		}

	// load from DDBB
		if (autoload===true) {

			// update rqo with session values
				self.rqo.source.session_save	= self.session_save
				self.rqo.source.session_key		= self.session_key

			// view
				self.rqo.source.view = self.view

			// pagination. Set pagination from saved local_db_data if exists
			// Updates the rqo.sqo pagination properties with local DB values
				const saved_pagination = self.session_save===false
					? false
					: await data_manager.get_local_db_data(
						`${self.tipo}_${self.mode}`,
						'pagination'
					);
				const default_limit		= saved_pagination?.value?.limit || (self.mode==='edit' ? 1 : 10);
				const default_offset	= saved_pagination?.value?.offset || 0;
				// fill sqo empty values with final values if necessary
				if (self.rqo.sqo.limit===null) {
					self.rqo.sqo.limit = default_limit
				}
				if (self.rqo.sqo.offset===null) {
					self.rqo.sqo.offset = default_offset
				}
				// always fix current pagination value, even if is not different
				// Updates local DB pagination values. Don't await here
					if (self.session_save===true) {
						data_manager.set_local_db_data(
							{
								id		: `${self.tipo}_${self.mode}`,
								value	: {
									limit	: self.rqo.sqo.limit,
									offset	: self.rqo.sqo.offset
								}
							},
							'pagination'
						)
					}

			// build_autoload
			// Use unified way to load context and data with
			// errors and not login situation managing
				const api_response = await build_autoload(self)

				// server: wrong response
				if (!api_response) {
					return false
				}
				// server: bad build context
				if(!api_response.result.context.length){
					console.error("Error!!!!, section without context:", api_response);
					return false
				}

			// destroy dependencies
				await self.destroy(
					false, // bool delete_self
					true, // bool delete_dependencies
					false // bool remove_dom
				)

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
					const context = self.datum.context.find(el => el.section_tipo===self.section_tipo) || {}
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

			// view
				if (self.context.view) {
					self.view = self.context.view
				}

			// debug
				if(SHOW_DEBUG===true) {

					let debug_token

					// fn_show_debug_info
						const render_handler = () => {

							// remove event subscription
							event_manager.unsubscribe(debug_token)

							const debug = document.getElementById('debug')
							if (!debug) {
								console.log('Ignored debug');
								return
							}

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
								button_debug.tabIndex = -1;
								const click_handler = () => {

									if (debug_container.hasChildNodes()) {
										debug_container.classList.toggle('hide')
										return
									}

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
								}
								button_debug.addEventListener('click', click_handler)

							// debug_container
								const debug_container = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'debug_container',
									parent			: debug
								})

							// show debug node removing hide style
								debug.classList.remove('hide')
						}
					debug_token = event_manager.subscribe('render_'+self.id, render_handler)
					self.events_tokens.push(debug_token)
				}
		}//end if (autoload===true)

	// update instance properties from context
		set_context_vars(self, self.context)

	// initiator . URL defined var or Caller of parent section
	// this is a param that defined who is calling to the section, sometimes it can be a tool or page or ...,
		const searchParams = new URLSearchParams(window.location.href);
		const initiator = searchParams.has('initiator')
			? searchParams.get('initiator')
			: self.caller!==null
				? self.caller.id
				: false
		// fix initiator
			self.initiator = initiator
				? initiator.split('#')[0]
				: initiator

	// paginator
		if (self.paginator===null) {

			self.paginator = new paginator()
			self.paginator.init({
				caller	: self,
				mode	: self.mode
			})

			// event paginator_goto_
				const paginator_goto_handler = (offset) => {
					self.update_pagination(offset)
				}
				self.events_tokens.push(
					event_manager.subscribe('paginator_goto_'+self.paginator.id, paginator_goto_handler)
				)
		}//end if (!self.paginator)

	// inspector
		if (self.inspector===null && self.mode==='edit' && self.permissions) {

			const current_inspector = new inspector()
			current_inspector.init({
				section_tipo	: self.section_tipo,
				section_id		: self.section_id,
				caller			: self
			})
			// fix section inspector
			self.inspector = current_inspector
		}

	// reset fixed_columns_map (prevents to apply rebuild_columns_map more than once)
		self.fixed_columns_map = false

	// columns_map. Get the columns_map to use into the list
		self.columns_map = get_columns_map({
			context			: self.context,
			datum_context	: self.datum.context
		})

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
	const t0 = performance.now()

	const self = this

	// call generic common render
		const result_node = await common.prototype.render.call(this, options)

	// event publish
		event_manager.publish('render_instance', self)

	// add node to instance
		self.node = result_node

	// debug
		dd_console(`__Time to render ${self.model} ${Math.round(performance.now()-t0)} ms`, 'DEBUG')

	return result_node
}//end render



/**
* GET_SECTION_RECORDS
* Generate a section_record instance for each data value
* Create (init and build) a section_record for each component value
* Used by portals to get all rows for render
* @param object options
* @return array section_records
*/
export const get_section_records = async function(options) {

	// options
		const self				= options.caller
		const tipo				= options.tipo || self.tipo || {}
		const mode				= options.mode || self.mode || 'list'
		const columns_map		= options.columns_map || self.columns_map
		const id_variant		= options.id_variant || self.id_variant || null
		const view				= options.view || 'default'
		const column_id			= options.column_id || self.column_id || null
		const datum				= options.datum || self.datum || {}
		const context			= self.context || {}
		const request_config	= (options.request_config)
			? clone(options.request_config)
			: clone(context.request_config)
		const fields_separator	= options.fields_separator || context.fields_separator || {}
		const lang				= options.lang || self.section_lang || self.lang
		const value				= options.value || ((self.data && self.data.value)
			? self.data.value
			: [])
		const section_record_mode = mode==='tm'
			? 'list'
			: mode

	// iterate records
		const ar_promises	= []
		const value_length	= value.length
		for (let i = 0; i < value_length; i++) {

			const locator				= value[i];
			const current_section_id	= locator.section_id
			const current_section_tipo	= locator.section_tipo

			const instance_options = {
				model			: 'section_record',
				tipo			: tipo,
				section_tipo	: current_section_tipo,
				section_id		: current_section_id,
				mode			: section_record_mode,
				lang			: lang,
				context			: {
					view				: view,
					request_config		: request_config,
					fields_separator	: fields_separator
				},
				// data			: current_data,
				datum			: datum,
				row_key 		: i,
				caller			: self,
				paginated_key	: locator.paginated_key,
				columns_map		: columns_map,
				column_id		: column_id,
				locator			: locator,
				id_variant		: id_variant
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

		// matrix_id. time machine matrix_id
			// time machine options
				if (self.model==='service_time_machine' || self.matrix_id) {
					instance_options.matrix_id = locator.matrix_id || self.matrix_id
					// // instance_options.matrix_id = (self.model==='section')
					// instance_options.matrix_id = (self.model==='service_time_machine')
					// 	? locator.matrix_id
					// 	: self.matrix_id
					instance_options.modification_date	= locator.timestamp || null
					instance_options.id_variant			= instance_options.id_variant + '_' + instance_options.matrix_id
				}

			// promise add and continue init and build
				ar_promises.push(new Promise(function(resolve){
					get_instance(instance_options)
					.then(function(current_section_record){
						current_section_record.build()
						.then(function(){
							resolve(current_section_record)
						})
					})
				}))
		}//end for (let i = 0; i < value_length; i++)

	// ar_instances. When all section_record instances are built, set them
		const section_records = await Promise.all(ar_promises).then((ready_instances) => {
			return ready_instances
		});


	return section_records
}//end get_section_records



/**
* LOAD_SECTION_TOOL_FILES
* Used by section_tool to set the tool icon from tool css definition
* Normally mask-image: url('../img/icon.svg');
* @return void
*/
section.prototype.load_section_tool_files = function() {

	const self = this

	// css file load
		const model	= self.config.tool_context.model
		const url	= DEDALO_TOOLS_URL + '/' + model + '/css/' + model + '.css'
		common.prototype.load_style(url)

	// debug
		if(SHOW_DEBUG===true) {
			console.log('loaded section_tool files:', url);
		}
}//end load_section_tool_files



/**
* CREATE_SECTION
* Creates a new section record calling API
* @return int|string|null
*/
section.prototype.create_section = async function () {

	const self = this

	// source
		const source = create_source(self, 'create')

	// data_manager. delete
		const rqo = {
			action	: 'create',
			source	: source
		}
		const api_response = await data_manager.request({
			body : rqo
		})

		// manage errors
		const errors = api_response?.errors || []
		if (errors.length>0) {
			alert('Errors: \n' + errors.join('\n'));
		}

		if (api_response.result && api_response.result>0) {

			const new_section_id = api_response.result

			return new_section_id

		}else{
			console.error('api_response.errors:', api_response.errors);
			console.error( api_response.msg || 'Error on create record!');
		}


	return null
}//end create_section



/**
* DUPLICATE_SECTION
* Creates a new section record and copies the current data into it
* @param object options
* @return int|string|null
*/
section.prototype.duplicate_section = async function (section_id) {

	const self = this

	// source
		const source = create_source(self, 'duplicate')
		// add section_id used as data source to clone
		source.section_id

	// data_manager. delete
		const rqo = {
			action	: 'duplicate',
			source	: source
		}
		const api_response = await data_manager.request({
			body : rqo
		})

		// manage errors
		const errors = api_response?.errors || []
		if (errors.length>0) {
			alert('Errors: \n' + errors.join('\n'));
		}

		if (api_response.result && api_response.result>0) {

			const new_section_id = api_response.result

			return new_section_id

		}else{
			console.error('api_response.errors:', api_response.errors);
			console.error( api_response.msg || 'Error on create record!');
		}


	return null
}//end duplicate_section



/**
* DELETE_SECTION
* @param object options
* {
* 	sqo : object,
* 	delete_mode : string
* }
* @return bool
*/
section.prototype.delete_section = async function (options) {

	const self = this

	// options
		const sqo						= clone(options.sqo)
		const delete_mode				= options.delete_mode
		const caller_dataframe			= options.caller_dataframe || null
		const delete_diffusion_records	= options.delete_diffusion_records ?? true

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
			sqo		: sqo,
			options : {
				delete_diffusion_records : delete_diffusion_records
			}
		}
		const api_response = await data_manager.request({
			body : rqo
		})

		// manage errors
		const errors = api_response?.errors || []
		if (errors.length>0) {
			alert('Errors: \n' + errors.join('\n'));
		}

		if (api_response.result && api_response.result.length>0) {

			// force to recalculate total records
			self.total = null
			// refresh self section
			self.refresh()
		}else{
			console.error('api_response.errors:', api_response.errors);
			console.error( api_response.msg || 'Error on delete records!');

			return false
		}


	return true
}//end delete_section



/**
* NAVIGATE
* Refresh the section instance with new sqo params creating a
* history footprint. Used to paginate and sort records
* @param object options
* {
* 	callback : callable function optional
* 	navigation_history : boolean, navigation_history save
* 	sqo : object (clone before apply offset)
* }
* @return bool
*/
section.prototype.navigate = async function(options) {

	const self = this

	// options
		const callback				= options.callback
		const navigation_history	= options.navigation_history ?? false
		const sqo					= options.sqo

	// check_unsaved_data
		const result = await check_unsaved_data({
			confirm_msg : 'section: ' + (get_label.discard_changes || 'Discard unsaved changes?')
		})
		if (!result) {
			// user selects 'cancel' in dialog confirm. Stop navigation
			return false
		}

	// remove aux items
		if (window.page_globals.service_autocomplete) {
			window.page_globals.service_autocomplete.destroy(true, true, true)
		}

	// callback execute
		if (callback) {
			await callback()
		}

	// loading styles
		if (self.node_body){
			self.node_body.classList.add('loading')
		}
		if (self.inspector && self.inspector.node) {
			self.inspector.node.classList.add('loading')
		}

	// refresh
		await self.refresh({
			destroy : false // avoid to destroy here to allow section to recover from loosed login scenarios
		})

	// loading styles
		if (self.node_body){
			self.node_body.classList.remove('loading')
		}
		if (self.inspector && self.inspector.node) {
			self.inspector.node.classList.remove('loading')
		}

	// navigation history. When user paginates, store navigation history to allow browser navigation too
		if (navigation_history===true) {

			const title		= self.id
			const source	= create_source(self, null)

			// url search. Append section_id if exists
				const url_vars = url_vars_to_object(location.search)
				const url = '?' + object_to_url_vars(url_vars)

			// browser navigation update
				push_browser_history({
					source				: source,
					sqo					: sqo,
					event_in_history	: false,
					title				: title,
					url					: url
				})
		}

	// clean previous locks of current user in current section
		const clean_lock = () => {
			data_manager.request({
				use_worker	: true,
				body		: {
					dd_api	: 'dd_utils_api',
					action	: 'update_lock_components_state',
					options	: {
						component_tipo	: null,
						section_tipo	: self.tipo,
						section_id		: null,
						action			: 'delete_user_section_locks' // delete_user_section_locks|blur|focus
					}
				}
			})
			.then(function(api_response){
				// dedalo_notification from config file
				// update page_globals
				page_globals.dedalo_notification = api_response.dedalo_notification || null
				// dedalo_notification from config file
				event_manager.publish('dedalo_notification', page_globals.dedalo_notification)
			})
		}
		dd_request_idle_callback(clean_lock)


	return true
}//end navigate



/**
* NAVIGATE_TO_NEW_SECTION
* After a create or duplicate action, go to the new created record
* @param int|string section_id
* @return bool
*/
section.prototype.navigate_to_new_section = async function(section_id) {

	const self = this

	const source = create_source(self, 'search')
		source.section_id	= section_id
		source.mode			= 'edit'

	// get sqo after modification for proper navigation
	const sqo = {
		mode				: self.mode,
		section_tipo		: [{tipo:self.section_tipo}],
		filter_by_locators	: [],
		filter 				: null,
		limit				: 1,
		offset				: 0
	}

	// rebuild sqo when is a separated window
	// and session is not the main session
	// in those cases, the section has a filter_by_locators
	// and is necessary add the new locator.
	if (self.session_save===false && self.rqo.sqo.filter_by_locators) {
		const old_locators = self.rqo.sqo.filter_by_locators
		sqo.filter_by_locators.push(...old_locators)
	}

	// new section generated
	sqo.filter_by_locators.push({
		section_tipo	: self.section_tipo,
		section_id		: section_id
	})

	sqo.offset = sqo.filter_by_locators.length - 1

	// save pagination
	// Updates local DB pagination values to preserve consistence
	if (self.session_save===true) {
		// list pagination
		await data_manager.set_local_db_data(
			{
				id		: `${self.tipo}_list`,
				value	: {
					limit : (self.mode==='list' && self.rqo.sqo?.limit)
						? self.rqo.sqo.limit
						: 10,
					offset : 0
				}
			},
			'pagination'
		)
		// edit pagination
		await data_manager.set_local_db_data(
			{
				id		: `${self.tipo}_edit`,
				value	: {
					limit	: 1,
					offset	: sqo.offset
				}
			},
			'pagination'
		)
	}

	// launch event 'user_navigation' that page is watching
	event_manager.publish('user_navigation', {
		source	: source,
		sqo		: sqo
	})


	return true
}//end navigate_to_new_section



/**
* CHANGE_MODE
* Destroy current instance and dependencies without remove HTML nodes (used to get target parent node placed in DOM)
* Create a new instance in the new mode (for example, from list to edit) and view (ex, from default to line )
* Render a fresh full element node in the new mode
* Replace every old placed DOM node with the new one
* @param object options
* @return object|null new_instance
*/
section.prototype.change_mode = async function(options) {

	const self = this

	// options vars
		// mode check. When mode is undefined, fallback to 'list'. From 'list', change to 'edit'
		const mode = (options.mode)
			? options.mode
			: self.mode==='list' ? 'edit' : 'list'
		const autoload = (typeof options.autoload!=='undefined')
			? options.autoload
			: true
		const view = options.view ?? null

	// short vars
		const current_context	= self.context
		const section_lang		= self.section_lang
		const id_variant		= self.id_variant
		const old_node			= self.node
		if (!old_node) {
			console.warn('Not old_node found!!');
			return null
		}

	// set the new view to context
		current_context.view = view
		current_context.mode = mode

	// instance
		const new_instance = await get_instance({
			model			: current_context.model,
			tipo			: current_context.tipo,
			section_tipo	: current_context.section_tipo,
			mode			: mode,
			lang			: current_context.lang,
			section_lang	: section_lang,
			type			: current_context.type,
			id_variant		: id_variant,
			caller			: self.caller || null
		})

	// load_item_with_spinner
		ui.load_item_with_spinner({
			container			: old_node,
			preserve_content	: false,
			label				: current_context.label || current_context.model,
			replace_container	: true,
			callback			: async () => {

				// build (load data)
				await new_instance.build(autoload)

				// render node
				const node = await new_instance.render()

				// destroy self instance (delete_self=true, delete_dependencies=false, remove_dom=false)
				self.destroy(
					true, // delete_self
					true, // delete_dependencies
					true // remove_dom
				)

				return node || ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'error',
					inner_html		: 'Error on render element ' + new_instance.model
				})
			}
		})


	return new_instance
}//end change_mode



/**
* GET_TOTAL
* Exec a async API call to count the current sqo records
* @return int total
*/
section.prototype.get_total = async function() {

	const self = this

	// already calculated case
		if (self.total || self.total==0) {
			return self.total
		}

	// queue. Prevent double resolution calls to API
		if (self.loading_total_status==='resolving') {
			return new Promise(function(resolve){
				setTimeout(function(){
					resolve( self.get_total() )
				}, 600)
			})
		}

	// loading status update
		self.loading_total_status = 'resolving'

	// API request

		// count sqo. Simplified version from current self.rqo.sqo
		const count_sqo = clone(self.rqo.sqo)
		// remove unused properties
		delete count_sqo.limit
		delete count_sqo.offset
		delete count_sqo.select
		delete count_sqo.order
		delete count_sqo.generated_time

		// source
		const source = create_source(self, null)
		// remove unused properties
		delete source.properties

		const rqo_count	= {
			action			: 'count',
			sqo				: count_sqo,
			prevent_lock	: true,
			source			: source
		}
		const api_count_response = await data_manager.request({
			body		: rqo_count,
			use_worker	: true
		})

	// API error case
		if ( api_count_response.result===false || api_count_response.error ) {
			console.error('Error on count total : api_count_response:', api_count_response);
			return
		}

	// set result
		self.total = api_count_response.result.total


	// loading status update
		self.loading_total_status = 'resolved'


	return self.total
}//end get_total



/**
* GOTO_LIST
* Navigates from edit mode to list mode, usually from the Inspector or the Menu
* @return bool
*/
section.prototype.goto_list = async function() {

	const self = this

	// only edit mode is accepted here
		if (self.mode!=='edit') {
			return false
		}

	// MODE USING PAGE user_navigation

	const sqo = clone(self.rqo.sqo)

	// reset pagination from current edit sqo
		sqo.limit = null
		sqo.offset = null

	// set pagination from saved local_db_data if exists
	// Updates the rqo.sqo pagination properties with local DB values
		if (self.session_save===true) {
			const saved_pagination = await data_manager.get_local_db_data(
				`${self.tipo}_list`,
				'pagination'
			);
			if (saved_pagination) {
				sqo.limit	= saved_pagination.value?.limit
				sqo.offset	= saved_pagination.value?.offset
			}
		}

	// source
		const source = {
			action			: 'search',
			model			: self.model, // section
			tipo			: self.tipo,
			section_tipo	: self.section_tipo,
			mode			: 'list',
			lang			: self.lang
		 }

	// user_navigation event publish
		const user_navigation_options = {
			caller_id	: self.id,
			source		: source,
			sqo			: sqo  // new sqo to use in list mode
		}
		event_manager.publish('user_navigation', user_navigation_options)


	return true
}//end goto_list



/**
* BUILD_SQO_ID
* Unified way to compound sqo_id value
* This string is used as key for section session SQO
* like $_SESSION['dedalo']['config']['sqo'][$sqo_id]
* @param string tipo
* 	section tipo like 'oh1'
* @return string sqo_id
* 	final sqo_id like 'oh1'
*/
const build_sqo_id = function(tipo) {

	const sqo_id = tipo

	return sqo_id
}//end build_sqo_id



/**
* UPDATE_PAGINATION
* This is fired in paginator_goto_ event function
* Is a unified mode to update navigation history and offset
* @see self.navigate
* @param int offset
* @return bool
*/
section.prototype.update_pagination = async function (offset) {

	const self = this

	// update section rqo sqo
		self.rqo.sqo.offset = offset
	// update section request_config_object sqo
		if (self.request_config_object.sqo) {
			self.request_config_object.sqo.offset = offset
		}

	// get sqo after modification for proper navigation
		const sqo = clone(self.rqo.sqo)

	// save pagination
	// Updates local DB pagination values
		if (self.session_save===true) {
			await data_manager.set_local_db_data(
				{
					id		: `${self.tipo}_${self.mode}`,
					value	: {
						limit	: self.rqo.sqo.limit,
						offset	: self.rqo.sqo.offset
					}
				},
				'pagination'
			)
		}

	// navigate section rows
		self.navigate({
			sqo					: sqo,
			navigation_history	: true // bool navigation_history save
		})

	return true
}//end update_pagination



// @license-end
