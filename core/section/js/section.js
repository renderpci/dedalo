// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_TOOLS_URL */
/*eslint no-undef: "error"*/



// imports
	import {clone, url_vars_to_object, object_to_url_vars, dd_console} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance, get_all_instances} from '../../common/js/instances.js'
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

		// mode. Check for valid mode. If is not valid, use default 'list'
		self.mode					= validate_mode(options.mode)

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
				setTimeout(function(){
					page_globals.creating_section = false
				}, 1500)
			}
			self.events_tokens.push(
				event_manager.subscribe('new_section_' + self.id, new_section_handler)
			)
			if(SHOW_DEBUG===true) {
				console.warn('))))) added section event subscription new_section_:', self.id, self.status, performance.now());
			}

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
				setTimeout(function(){
					page_globals.creating_section = false
				}, 1500)
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
					const update_menu = (menu, section_label) => {

						// menu instance check. Get from caller page
						if (!menu) {
							if(SHOW_DEBUG===true) {
								console.log('menu is not available from section.');
							}
							return
						}

						const section_label_click_handler = (e) => {
							e.stopPropagation();
							// goto_list
							return self.goto_list();
						}

						// update_section_label. Show icon Inspector and activate the link event
						menu.update_section_label({
							value					: section_label,
							mode					: self.mode,
							section_label_on_click	: section_label_click_handler
						})
					}//end update_menu

				// call menu label only for direct page created sections
					if ( self.caller?.model==='page' ) {
						dd_request_idle_callback( () => {
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
								update_menu( menu_instance, section_label )
							}
						})
					}

				// search control
					if (self.search_container && self.filter) {
						dd_request_idle_callback( () => {
							// open_search_panel. local DDBB table status
							const status_id		= 'open_search_panel'
							const status_table	= 'status'
							data_manager.get_local_db_data(status_id, status_table, true)
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
											const node = await self.filter.render()
											// display hidden search_global_container
											self.filter.search_global_container.classList.remove('hide')
											return node
										}
									})
								}
							})
						})
					}

				// debug
				if(SHOW_DEBUG===true) {
					console.log('section. event_manager.events.length:', event_manager.get_events().length);
				}
			}
			self.events_tokens.push(
				event_manager.subscribe('render_'+self.id, render_handler)
			)

		// quit event
			const quit_handler = () => {
				self.delete_cache()
			}
			self.events_tokens.push(
				event_manager.subscribe('quit', quit_handler)
			)

		// change_lang event
			const change_lang_handler = () => {
				self.delete_cache()
			}
			self.events_tokens.push(
				event_manager.subscribe('change_lang', change_lang_handler)
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
				self.request_config_object = self.request_config?.find(el => el.api_engine==='dedalo' && el.type==='main') || {}
			}else{
				// request_config_object. get the request_config_object from context
				 self.request_config_object = self.context?.request_config?.find(el => el.api_engine==='dedalo' && el.type==='main') || {};
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

			// add session SQO when is present in the context
			// @see server `get_structure_context` sqo_session property addition
			if (self.context?.sqo_session && self.request_config_object) {

				// request_config_object
				// Update on every build to preserve sync with the server section session
				self.request_config_object.sqo = self.context.sqo_session

				// rqo
				// Note that rqo is calculated once and need to be updated when build autoload is made
				// and the context is loaded / updated
				self.rqo.sqo = self.context.sqo_session
			}
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
				// preload search (experimental disable now)
				const pre_built_search = false
				if (pre_built_search && self.mode==='list') {
					dd_request_idle_callback(
						() => {
							self.filter.build()
						}
					)
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
				if (self.session_save) {
					// Get pagination value from local database
					const pagination_mode = self.mode==='edit' ? self.mode : 'list';
					const saved_pagination = await data_manager.get_local_db_data(
						`${self.tipo}_${pagination_mode}`,
						'pagination'
					);

					// ! Do not apply here default values to prevent overwrite server custom limit like 'dd542' (Activity)
					const saved_limit	= saved_pagination?.value?.limit ?? null;
					const saved_offset	= saved_pagination?.value?.offset ?? null;
					// fill sqo empty values with final values if necessary (check null and undefined cases)
					if (self.rqo.sqo.limit==null && saved_limit!==null) {
						self.rqo.sqo.limit = saved_limit;
					}
					if (self.rqo.sqo.offset==null && saved_offset!==null) {
						self.rqo.sqo.offset = saved_offset;
					}
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
				// context is set only when the origin context is empty,
				// if the instance has a previous context, it will need to be preserved.
				// because the context could be modified by ddo configuration and it can no be changed
				// ddo_map -----> context
				// ex: oh27 define the specific ddo_map for rsc368
				// 		{ mode: list, view: line, children_view: text ... }
				// if you call to API to get the context of the rsc368 the context will be the default config
				// 		{ mode: edit, view: default }
				// but it's necessary to preserve the specific ddo_map configuration in the new context.
				// Context is set and changed in section_record.js to get the ddo_map configuration
				if(!self.context){
					const context = self.datum?.context?.find(el => el.section_tipo===self.section_tipo) || {}
					if (Object.keys(context).length === 0) { // Checks if it's literally an empty object
						console.error("Context not found for section_tipo:", self.section_tipo, "in self.datum.context:", self.datum?.context);
					}else{
						self.context = context
					}
				}

			// Update mode.
			// Take care of the 'list_thesaurus' mode case. It is used only to retrieve custom data from server (on build section)
			// but in client is not used. Instead, change it to 'list' mode after getting the API data.
				if (self.context.mode === 'list_thesaurus') {
					self.context.mode = 'list';
				}
				self.mode = self.context.mode;

			// set Data
				self.data		= self.datum?.data?.find(el => el.tipo===self.tipo && el.typo==='sections') || {}
				self.section_id = null; // Initialize to null
				if (self.mode !== 'list' && self.data && Array.isArray(self.data.value)) {
					const found = self.data.value.find(el => el.section_tipo === self.section_tipo);
					if (found && found.section_id) {
						self.section_id = found.section_id;
					} else {
						console.warn('Empty value found or section_id missing in self.data.value: ', self.data.value);
					}
				}

			// rqo regenerate
				await generate_rqo()

			// pagination update
				const request_config		= self.context?.request_config || []
				const request_config_dedalo	= request_config.find(el => el.api_engine==='dedalo') || {}
				// fill values that are not defined previously with safe fallback to defaults (check null and undefined cases)
				if (self.rqo.sqo.limit==null) {
					self.rqo.sqo.limit = request_config_dedalo.show?.sqo_config?.limit ?? (self.mode==='edit' ? 1 : 10)
				}
				if (self.rqo.sqo.offset==null) {
					self.rqo.sqo.offset = request_config_dedalo.show?.sqo_config?.offset ?? 0
				}
				// On session_save, always fix current pagination value, even if is not different
				// Updates local DB pagination values. Don't await here
				if (self.session_save) {
					const pagination_mode = self.mode==='edit' ? self.mode : 'list';
					data_manager.set_local_db_data(
						{
							id		: `${self.tipo}_${pagination_mode}`,
							value	: {
								limit	: self.rqo.sqo.limit,
								offset	: self.rqo.sqo.offset
							}
						},
						'pagination'
					)
					.catch(error => {
						console.error("Error saving pagination to local DB:", error);
					});
				}else{
					// editing one record case in session_save false
					if (self.mode==='edit' && self.section_id) {
						// fix offset to 0 but do not store the value
						self.rqo.sqo.offset = 0
						// reset total to 1 to allow paginator render properly
						self.total = 1
					}
				}

			// view
				if (self.context.view) {
					self.view = self.context.view
				}

			// debug
				if(SHOW_DEBUG===true) {

					// render_handler
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
					const debug_token = event_manager.subscribe('render_'+self.id, render_handler)
					self.events_tokens.push(debug_token)
				}
		}//end if (autoload===true)

	// Safe update mode.
	// Take care of the 'list_thesaurus' mode case. It is used only to retrieve custom data from server
	// but in client is not used. Instead, always change it to 'list' mode.
		if (self.context.mode === 'list_thesaurus') {
			self.context.mode = 'list';
		}
		self.mode = self.context.mode;

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
		if (self.inspector==null && self.mode==='edit' && self.permissions) {

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
		if(SHOW_DEBUG===true) {
			dd_console(`__Time to render ${self.model} ${Math.round(performance.now()-t0)} ms`, 'DEBUG')
			console.log('get_all_instances:', get_all_instances().length);
			console.log('event_manager.get_events():', event_manager.get_events().length);
			console.log('self.datum.context.length:', self.datum.context.length);
			console.log('self.datum.data.length:', self.datum.data.length);
		}


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
* Remove the sqo calculation section records from database
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

		if (api_response?.result && api_response.result.length>0) {

			// all is OK
			return true
		}

	// delete has failed. Notify and return false
		console.error('api_response.errors:', api_response.errors);
		console.error( api_response.msg || 'Error on delete records!');


	return false
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
		dd_request_idle_callback(
			() => {
				data_manager.request({
					use_worker	: true,
					body		: {
						dd_api			: 'dd_utils_api',
						action			: 'update_lock_components_state',
						prevent_lock	: true,
						options			: {
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
		);


	return true
}//end navigate



/**
* NAVIGATE_TO_NEW_SECTION
* After a create or duplicate action, goes to the new created record
* @param int|string section_id
* @return bool
*/
section.prototype.navigate_to_new_section = async function(section_id) {

	const self = this

	// Validate input section_id
	if (!section_id) {
		throw new Error('section_id is required');
	}

	try {

		// Create the search source
		const source = create_source(self, 'search');
		source.section_id	= section_id
		source.mode			= 'edit'

		// sqo
		// Check current sqo from rqo
		if (!self.rqo?.sqo) {
		    console.error('Cannot navigate: Search Query Object (sqo) is missing.');
		    return false;
		}
		// Clone current sqo to preserve filters.
		const sqo = clone(self.rqo.sqo)

		// limit
		// New record creation navigates to edit mode. So, set always limit to 1
		sqo.limit = 1

		// filter_by_locators.
		// (!) Its important to pass an empty array [] to prevent auto-generated value in common.build_rqo_show
		sqo.filter_by_locators = []

		// filter_mode. Allowed modes : reset_filter | preserve_filter | legacy
		const filter_mode = 'reset_filter'
		if (filter_mode==='preserve_filter') {

			// Add existing filter items if they exists as $or / $and
			const current_filter_items = sqo.filter?.$and
				? sqo.filter.$and.length
				: sqo.filter?.$or
					? sqo.filter.$or.length
					: 0;
			if (current_filter_items>0) {

				// new_filter. Create a new filter
				const new_filter = {
					'$or' : []
				}

				// Handle case where filter already has $or at root
				if (sqo.filter.$or) {
					new_filter.$or.push(...sqo.filter.$or);
				} else {
					// Add non-$or filters
					for (let [key, value] of Object.entries(sqo.filter)) {
						const new_object = {
							[key] : value
						};
						new_filter.$or.push(new_object);
					}
				}

				// Add new created section_id to the filter to allow see this new record.
				// Note that component tipo (rsc175) is not relevant to search component_section_id.
				new_filter.$or.push({
				    q           : section_id,
				    q_operator  : null,
				    path		: [{
						section_tipo	: self.tipo,
						component_tipo	: 'rsc175',
						model			: 'component_section_id',
						name			: 'Id'
					}],
					q_split		: false,
					type		: 'jsonb'
				});

				// Replace old filter by the new one
				sqo.filter = new_filter
			}

			// offset.
			// Set offset to current total to force navigate to the last record (the new created one)
			sqo.offset = self.total || 0;

		}else if(filter_mode==='reset_filter'){

			// reset current filter and show all records, included the new one.

			sqo.filter = null

			// reset total and force to re-calculate it
			self.total = null;
			const total = await self.get_total(sqo);

			// offset
			// Set the new offset based on the real unfiltered records count.
			sqo.offset = total - 1;

		}else{

			// legacy. using filter_by_locators to select only the new record.

			// filter_by_locators
			// Forces the auto-generated value in common.build_rqo_show based on current section_id
			sqo.filter_by_locators = null;

			// offset.
			// Set offset to zero because only one record is expected
			sqo.offset = 0;
		}

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
			);
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
			);
		}

		// launch event 'user_navigation' that page.js is watching in init events subscriptions
		event_manager.publish('user_navigation', {
			source	: source,
			sqo		: sqo
		});


		return true

	} catch (error) {
		console.error('Error navigating to new section:', error);
		throw error;
	}
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
* _TOTAL_PROMISE
* @private
* @type {Promise<number>|null}
* A private property to hold the pending promise for the total count API call.
* This prevents multiple concurrent API calls if get_total is invoked rapidly.
*/
section.prototype._total_promise = null; // Initialize this property once, likely after prototype definition



/**
* GET_TOTAL
* Asynchronously fetches the total count of records from an API
* The function is designed to handle concurrent calls safely through promise-based request deduplication,
* ensuring only one API request is made at a time for the same section instance.
* @param object sqo (Optional)
* 	Search Query Object. If provided, uses this custom query; otherwise defaults to self.rqo.sqo
* @return promise
* 	Resolves to the total count as an integer
*/
section.prototype.get_total = async function(sqo) {

	const self = this

	// already calculated case
		if (self.total || self.total==0) {
			return self.total
		}

	// If a promise to fetch the total is already pending, return that existing promise for debouncing/queueing.
		if (self._total_promise) {
			return self._total_promise;
		}

	// Create and store a new promise for the current API call.
	// This promise will be resolved or rejected based on the API call's outcome.
		self._total_promise = (async () => {
			try {
				// Execute the actual API call to get the total.
				// API request

					// count sqo. Simplified version from current self.rqo.sqo
					const count_sqo = sqo
						? clone(sqo) // custom sqo from params
						: clone(self.rqo.sqo) // section rqo.sqo (default)
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
						prevent_lock	: true,
						sqo				: count_sqo,
						source			: source
					}
					const api_count_response = await data_manager.request({
						body		: rqo_count,
						use_worker	: true,
						retries : 5, // try
						timeout : 10 * 1000 // 10 secs waiting response (could be long in activity)
					})

				// API error case
					if ( api_count_response.result===false || api_count_response.errors?.length ) {
						console.error('Error on count total : api_count_response:', api_count_response);
						return
					}

				// set result
					self.total = api_count_response.result.total

				// Once the operation completes (successfully), clear the promise
				// so that future calls to get_total will trigger a new API request.
				self._total_promise = null;

				return self.total; // Resolve the promise with the fetched total
			} catch (error) {
				// --- Error Handling ---
				// Log the error for debugging purposes.
				console.error("section.get_total: Error fetching total from API:", error);

				// In case of an error, clear the promise so that the next call to get_total
				// will attempt to re-fetch the total, rather than endlessly returning a rejected promise.
				self._total_promise = null;

				// Re-throw the error so that the original caller of get_total can handle it.
				throw error;
			}
		})(); // Immediately invoke this async IIFE to create and assign the promise.


	return self._total_promise; // Return the promise that was just created/stored
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
		if (self.request_config_object?.sqo) {
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



/**
* FOCUS_FIRST_INPUT
* Mimics components method with same name
* Get first component (inside first section_record) and activate it
* @return bool
*/
section.prototype.focus_first_input = function() {

	const self = this

	const ar_instances = self.ar_instances[0]?.ar_instances || []
	const component = ar_instances.find(el => el.type==='component')
	if (component) {
		ui.component.activate(component)
		return true
	}

	return false
}//end focus_first_input



/**
* VALIDATE_MODE
* Check given mode to prevent unwanted or not valid mode.
* If the mode is not accepted, fallback to default mode 'list'
* @param string mode - The mode to validate.
* @return string mode - A valid mode.
*/
function validate_mode(mode) {

	const valid_modes = new Set(['edit', 'list', 'list_thesaurus', 'solved', 'tm'])
	const default_mode = 'list';

	if (!mode) {
		return default_mode;
	}

	if (valid_modes.has(mode)) {
		return mode;
	}

	// Temporarily returns the given mode until this list is final.
	console.error(`Invalid mode '${mode}' received. Using it temporarily !!. Valid modes: ${[...valid_modes].join(', ')}`);
	if(SHOW_DEBUG===true) {
		alert(`Invalid mode '${mode}' received. Using it temporarily !!.\n Valid modes: ${[...valid_modes].join(', ')}`);
	}

	return mode // It will return to the default mode in the future.
}//end validate_mode


/**
* GET_ALL_TARGET_SECTIONS
* Select all portal components of the section
* Give the unique target sections defined into every rqo of the component
* Get first component (inside first section_record) and activate it
* @return bool
*/
section.prototype.get_all_target_sections = function() {

	const self = this

	const section_portals = self.datum.context.filter( el =>
		el.model ==='component_portal'
		&& el.section_tipo === self.tipo
	)

	const target_sections = Object.values(
		section_portals
			.flatMap(el =>
				el.request_config.flatMap(rqo =>
				rqo.sqo.section_tipo // get all objects inside the sqo `section_tipo` as target section_tipo
			)
		)
			// reduce to unique target section tipo as some components can call to the same section
			.reduce((acc, obj) => {
				if (!acc[obj.tipo]) {  // Use `tipo` as the unique key
					acc[obj.tipo] = obj;
				}
				return acc;
			}, {})
	);

	return target_sections
}//end get_all_target_sections



/**
* DELETE_CACHE
* Removes all section local cache data.
* It is fired when login 'quit' event is published (subscription in page init),
* or menu changes lang: 'change_lang' event.
*/
section.prototype.delete_cache = async function () {

	// Get all local DB data
	await data_manager.delete_local_db_data_by_prefix('data', 'section_cache_')
}//end delete_cache



// @license-end
