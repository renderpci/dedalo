// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, SHOW_DEVELOPER, DEDALO_LOCK_COMPONENTS, DEDALO_CORE_URL, DEDALO_NOTIFICATION, Promise */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {common, push_browser_history, set_environment} from '../../common/js/common.js'
	import {ui} from '../../common/js/ui.js'
	import {
		find_up_node,
		url_vars_to_object,
		JSON_parse_safely,
		object_to_url_vars
	} from '../../common/js/utils/index.js'
	import {check_unsaved_data, deactivate_components} from '../../component_common/js/component_common.js'
	import {render_page, render_notification_msg} from './render_page.js'



/**
* PAGE
*/
export const page = function () {

	this.id

	this.model
	this.mode
	this.node
	this.ar_instances
	this.context
	this.status
	this.events_tokens
	this.last_dedalo_notification // object
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	page.prototype.edit		= render_page.prototype.edit
	page.prototype.render	= common.prototype.render
	page.prototype.refresh	= common.prototype.refresh
	page.prototype.destroy	= common.prototype.destroy



/**
* INIT
* @param object options
* @return bool
*/
page.prototype.init = async function(options) {

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

	// set vars
		self.model			= 'page'
		self.type			= 'page'
		self.mode			= 'edit' // mode like 'section', 'tool', 'thesaurus'...
		self.node			= null
		self.ar_instances	= []
		self.context		= options.context // mixed items types like 'sections', 'tools'..
		self.status			= null
		self.events_tokens	= []
		self.menu_data		= options.menu_data

	// events subscriptions

		// event user_navigation. Menu navigation (not pagination)
			const user_navigation_handler = (user_navigation_options) => {
				navigate.bind(this)(user_navigation_options)
			}
			self.events_tokens.push(
				event_manager.subscribe('user_navigation', user_navigation_handler)
			)

		// event activate_component
			const activate_component_handler = function(component_instance) {

				// lock_component. launch worker
				if (DEDALO_LOCK_COMPONENTS===true && component_instance.mode==='edit') {
					dd_request_idle_callback(
						() => {
							data_manager.request({
								use_worker	: true,
								body		: {
									dd_api	: 'dd_utils_api',
									action	: 'update_lock_components_state',
									options	: {
										component_tipo	: component_instance.tipo,
										section_tipo	: component_instance.section_tipo,
										section_id		: component_instance.section_id,
										action			: 'focus' // delete_user_section_locks|blur|focus
									}
								}
							})
							.then(function(api_response){

								if (api_response.in_use===true) {
									document.activeElement.blur()

									ui.component.deactivate(component_instance)

									// clean previous locks of current user in current section
										data_manager.request({
											use_worker	: true,
											body		: {
												dd_api	: 'dd_utils_api',
												action	: 'update_lock_components_state',
												options	: {
													component_tipo	: null,
													section_tipo	: component_instance.section_tipo,
													section_id		: null,
													action			: 'delete_user_section_locks' // delete_user_section_locks|blur|focus
												}
											}
										})

									// show warning
										ui.attach_to_modal({
											header	: get_label.warning || 'Warning',
											body	: api_response.msg,
											size	: 'small'
										})
								}

								// dedalo_notification from config file
								// update page_globals
								page_globals.dedalo_notification = api_response.dedalo_notification || null
								// dedalo_notification from config file
								event_manager.publish('dedalo_notification', page_globals.dedalo_notification)
							})
						}
					)
				}
			}//end activate_component_handler
			self.events_tokens.push(
				event_manager.subscribe('activate_component', activate_component_handler)
			)

		// event dedalo_notification
			const dedalo_notification_handler = (data) => {
				dd_request_idle_callback(
					() => render_notification_msg(self, data)
				)
			}//end dedalo_notification_handler
			self.events_tokens.push(
				event_manager.subscribe('dedalo_notification', dedalo_notification_handler)
			)

	// events listeners. Add window/document general events
		self.add_events()

	// css. Update custom CSS based on environment
		set_custom_css()

	// set page instance as global to be available
		window.dd_page = self

	// status update
		self.status = 'initialized'


 	return true
}//end init



/**
* BUILD
* (!) Note that normally page only needs load once. Later, only sections/areas will be built
* @param bool autoload = false
* @return bool
*/
page.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// (!) Note that normally page only needs load once. Later, only sections/areas will be updated
		if (autoload===true) {

			if (self.context) {
				// catch invalid call. Page build must be false except the first start page
				console.error('Error. Ignored call to page build with autoload=true. Page already have context!', self.context);
			}else{

				// searchParams
					const searchParams = new URLSearchParams(window.location.href);

				// menu
					const menu = searchParams.has('menu')
						? JSON_parse_safely(
							searchParams.get('menu'), // string from url
							true // fallback on exception parsing string
						  )
						: true

				// start bootstrap
					const rqo = { // rqo (request query object)
						action			: 'start',
						prevent_lock	: true,
						options : {
							search_obj	: url_vars_to_object(location.search),
							menu		: menu //  bool
						}
					}

				// request page context (usually menu and section/area context)
					const api_response = await data_manager.request({
						body : rqo
					});
					if(typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
						console.log('))) page build api_response:', api_response);
					}

				// errors check

					// error generic case starting the page
						if (!api_response || !api_response.result) {
							// api_response do not exists or result is false
							console.error('!!! STOP build: page build api_response:', api_response);
							// API start_error
							page_globals.api_errors.push(
								{
									error	: 'start_error', // error type
									msg		: api_response.msg || 'Error: Unable to start page. Check that PHP server is running and configuration files are correct [1]',
									trace	: 'page build'
								}
							)

							return false
						}

					// environment API data check
						if (!api_response.environment || !api_response.environment.result) {
							// API environment data is not available
							page_globals.api_errors.push(
								{
									error	: 'start_error', // error type
									msg		: api_response.msg || 'Error: Unable to start page: environment is unavailable. Check that PHP server is running and configuration files are correct [2]',
									trace	: 'page build'
								}
							)

							return false
						}

					// fix API environment vars to window (page_globals, plain_vars, get_label)
						set_environment(api_response.environment.result)

					// check environment (var DEDALO_ENVIRONMENT is set from API environment result plain_vars. Expected bool true)
						if (typeof DEDALO_ENVIRONMENT==='undefined') {
							// environment vars are not set correctly
							console.error('!!! STOP build: environment unavailable. DEDALO_ENVIRONMENT var is not defined');

							page_globals.api_errors.push(
								{
									error	: 'start_error', // error type
									msg		: 'Error: The environment is not available. Check that PHP server is running and configuration files are correct [3]',
									trace	: 'page build'
								}
							)

							return false
						}

					// server_errors check (minor page and environment errors)
						if (api_response.dedalo_last_error) {
							console.error('Page running with server errors. dedalo_last_error: ', api_response.dedalo_last_error);
						}

				// set context and data to current instance
					self.context	= api_response.result.context
					self.data		= {}
			}
		}//end if (autoload===true)

	// check page context is valid. If not, return special error node
		if (!self.context) {

			// api_errors.
			// It's important to set instance as api_errors because this
			// generates a temporal wrapper. Once solved the problem, (usually a not login scenario)
			// the instance could be built and rendered again replacing the temporal wrapper
				page_globals.api_errors.push(
					{
						error	: 'invalid_context', // error type
						msg		: 'Invalid context. ' + (page_globals.request_message ?? ''),
						trace	: 'page build'
					}
				)

			return false
		}

	// status update
		self.status = 'built'


	return true
}//end build



/**
* NAVIGATE
* Used by menu navigation
* Is called by page init event 'user_navigation'
* @param object user_navigation_options
* {
* 	source: object {config:null, mode:"list", model:"section", tipo:"rsc170"},
* 	sqo: object|null,
* 	event_in_history: bool
* }
* @return promise
* 	resolve string new_page_element_instance id
*/
const navigate = async function(user_navigation_options) {

	const self = this

	// options
		const source			= user_navigation_options.source
		const sqo				= user_navigation_options.sqo || null
		const event_in_history	= user_navigation_options.event_in_history ?? false

	// check_unsaved_data
		const result = await check_unsaved_data({
			confirm_msg : 'page: ' + (get_label.discard_changes || 'Discard unsaved changes?')
		})
		if (!result) {
			// user selects 'cancel' in dialog confirm. Stop navigation
			return false
		}

	// check valid vars
		if (!source) {
			console.error("ERROR. valid source is mandatory on user_navigation:", user_navigation_options);
			return false
		}

	// reset status to prevent errors lock
		self.status = 'rendered'

	// loading css add
		const container = self.node
			? self.node.content_data
			: null
			if (container) { container.classList.add('loading') }

	// stream_readers. If any stream reader is active, stop it
		if (page_globals.stream_readers && page_globals.stream_readers.length) {
			page_globals.stream_readers.forEach((el)=>{
				el.cancel('abort')
			})
		}

	// source
		// Only source is mandatory but if sqo is received, is placed in a new request_config
		// to allow sections and components manage properly the offset and limit
		if (!source.request_config && sqo) {
			source.request_config = [{
				api_engine	: 'dedalo',
				type		: 'main',
				sqo			: sqo
			}]
		}

	try {

		// new_page_element_instance. Like 'section'
			const new_page_element_instance = await instantiate_page_element(
				self, // object page instance
				source // object source
			)
			// check valid element. Only checks if new source of page element is actually valid for instantiation
			// (!) Note that this element page is called twice, this time and when page is refreshed (assume is cached..)
			if (!new_page_element_instance) {
				console.error("error on get new_page_element_instance:", new_page_element_instance);
				// loading css remove
				if (container) {setTimeout(()=> container.classList.remove('loading'), 50)}
				console.error("ERROR. on instantiate_page_element. Unable to create a valid page element instance. ", user_navigation_options);
				return false
			}

		// page context elements to stay. Menu and other static elements don't need to be built and rendered every time
			const base_models				= ['menu']
			const context_elements_to_stay	= self.context.filter( item => base_models.includes(item.model) )
			// add current source from options
				context_elements_to_stay.push(source)
			// fix new page clean context
				self.context = context_elements_to_stay

		// instances. Set property 'destroyable' as false for own instances to prevent to be remove on refresh page
			const instances_to_stay = self.ar_instances.filter(item => base_models.includes(item.model))
			for (let i = instances_to_stay.length - 1; i >= 0; i--) {
				instances_to_stay[i].destroyable = false
			}

		// refresh page. Force to load new context elements data from DDBB
			const refresh_result = await self.refresh({
				build_autoload	: false,
				render_level	: 'content'
			})

		// reset page scroll
			window.scrollTo(0, 0);

		// browser history track. Navigating from menu for example
			// If is not already mark as used in history
			if(refresh_result===true && event_in_history!==true) {

				// page tile
					const title	= new_page_element_instance.id

				// page url
					const current_tipo = source.config?.source_section_tipo || source.tipo;
					// url search. Append section_id if exists
						const current_url_vars = url_vars_to_object(location.search)
						const url_vars = {} // url_vars_to_object(location.search)
							  url_vars.tipo = current_tipo
							  url_vars.mode = source.mode
						if(source.mode==='list' && url_vars.id){
							delete url_vars.id
						}
						// source.config.url_vars add if they exists
						// used by menu thesaurus_view_mode
						if (source.config?.url_vars) {
							for (const property in source.config.url_vars) {
								url_vars[property] = source.config.url_vars[property]
							}
						}
						// preserve URL vars
						const preserve_url_vars = [
							'menu',
							'session_save'
						]
						preserve_url_vars.forEach(name => {
							if (typeof current_url_vars[name]!=='undefined') {
								url_vars[name] = current_url_vars[name]
							}
						})
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

		// remove aux items
			if (window.page_globals.service_autocomplete) {
				window.page_globals.service_autocomplete.destroy(true, true, true)
			}

		// loading css remove
			if (container) { container.classList.remove('loading') }

		// clean previous locks of current user in current section
			dd_request_idle_callback(
				() => {
					data_manager.request({
						use_worker	: true,
						body		: {
							dd_api	: 'dd_utils_api',
							action	: 'update_lock_components_state',
							options	: {
								component_tipo	: null,
								section_tipo	: source.section_tipo || source.tipo,
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
			)

		return new_page_element_instance.id

	} catch (error) {
		// loading css remove
		if (container) { container.classList.remove('loading') }
		console.error('Error on user navigation. user_navigation_options:', user_navigation_options)
		console.error(error)

		return false
	}
}//end navigate



/**
* ADD_EVENTS
* Set page common events like 'keydown'
* @return void
*/
page.prototype.add_events = function() {

	const self = this

	// window onpopstate. Triggered when user clicks on the browser navigation buttons
		// note that navigation calls generate a history of event state, and when user click's on back button,
		// the browser get this event form history with the state info stored previously
		const popstate_handler = function(event) {
			if (event.state && event.state.user_navigation_options) {
				// get previously stored state data
				const new_user_navigation_options = event.state.user_navigation_options
				// mark as already used in history
				new_user_navigation_options.event_in_history = true
				// publish the event normally as usual
				event_manager.publish('user_navigation', new_user_navigation_options)
			}
		}
		window.addEventListener('popstate', popstate_handler)

	// beforeunload (event)
		const beforeunload_handler = function(event) {
			// event.preventDefault();

			const unsaved_data = typeof window.unsaved_data!=='undefined'
				? window.unsaved_data
				: false

			// unsaved_data case
			// Check for unsaved components, usually happens in component_text_area editions because
			// the delay (500 ms) to set as changed
				if (unsaved_data===true) {
					// check_unsaved_data
					check_unsaved_data()
				}

			// unsaved_data is false. Nothing to worry about
				if (unsaved_data!==true) {
					// console.log('window.unsaved_data:', window.unsaved_data);
					// removeEventListener('beforeunload', beforeUnloadListener, {capture: true})
					return false
				}

			// set event.returnValue value to force browser standard message (unable to customize)
			// like : 'Changes that you made may not be saved.'
				event.returnValue = true
		}
		window.addEventListener('beforeunload', beforeunload_handler, {capture: true})

	// keydown events
		const keydown_handler = function(evt) {
			switch(true) {

				case evt.key==='Escape':
					// modal is open case
						if (window.modal) {
							// Note that dd-modal has is own ESC event to close the modal
							return
						}
					// inactive user activated component
						if (page_globals.component_active) {
							ui.component.deactivate(page_globals.component_active)
						}
					// blur active input
						document.activeElement.blur()
					break;

				case evt.key==='Enter': {
					// parent recursive check on document.activeElement
						if (document.activeElement) {
							// find_up_node returns node|null
							const top_node = find_up_node(
								document.activeElement, // DOM node selected
								'DD-MODAL' // only capital letters
							)
							// we are inside modal. Stop actions
							if (top_node) {
								return
							}
							// when the event is fired by paginator stop it
							if(document.activeElement.classList.contains('input_go_to_page')){
								return
							}
						}
					// search with current section filter
						const section = self.ar_instances.find(el => el.model==='section')
						if (section && section.mode==='list' && section.filter) {
							if (section.filter.search_panel_is_open===true) {
								// always blur active component to force set dato (!)
									document.activeElement.blur()
								// exec search
									section.filter.exec_search()
							}
							// toggle filter container
								event_manager.publish('toggle_search_panel_'+section.id)
						}
					break;
				}

				case (evt.key==='ArrowLeft' && evt.shiftKey===true): {
					// paginator left arrow <
						// paginator right arrow >
						const section_prev = self.ar_instances.find(el => el.model==='section')
						if (section_prev && section_prev.paginator) {
							section_prev.paginator.navigate_to_previous_page()
						}
					break;
				}

				case (evt.key==='ArrowRight' && evt.shiftKey===true): {
					// paginator right arrow >
						const section_next = self.ar_instances.find(el => el.model==='section')
						if (section_next && section_next.paginator) {
							section_next.paginator.navigate_to_next_page()
						}
					break;
				}

				case (evt.ctrlKey===true && evt.key==='i'): {
					// inspector toggle
						ui.toggle_inspector()
					break;
				}

				default:
					break;
			}//end switch
		}
		document.addEventListener('keydown', keydown_handler)

	// page click/mousedown
		document.addEventListener('mousedown', deactivate_components)

}//end add_events



/**
* INSTANTIATE_PAGE_ELEMENT
* Creates the instance of current element, usually a section or menu
* calling instance.get_instance(...). This function only load and init the instance file
* @param object self (instance)
* @param object source
* 	Could be full context of element return by start API function or an basic source on page navigation
* @return object instance
*/
export const instantiate_page_element = async function(self, source) {

	// short vars
		const tipo				= source.tipo
		const section_tipo		= source.section_tipo || tipo
		const model				= source.model
		const section_id		= source.section_id || null
		const mode				= source.mode
		const lang				= source.lang
		const properties		= source.properties

		const config			= source.config || null // used by tools to config section_tool
		const request_config	= source.request_config
		const view				= source.view

	// instance options
		const instance_options = {
			model			: model,
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id,
			mode			: mode,
			lang			: lang
		}

		// id_variant . Propagate a custom instance id to children
			if (self.id_variant) {
				instance_options.id_variant = self.id_variant
			}

		// menu case. To avoid id conflicts between different users
			if (model==='menu') {
				instance_options.id_variant = page_globals.user_id
			}

		// config. Used by section tools, area_thesaurus model
			if (config) {
				// init adding param config
				instance_options.config	= config
				// section tools id_variant
				if (config.source_section_tipo) {
					instance_options.id_variant	= config.source_section_tipo
				}
			}

		// request_config
			if (request_config) {
				instance_options.request_config = request_config
			}

		// view
			if (view) {
				instance_options.view = view
			}

		// properties
			if (properties) {
				instance_options.properties = properties
			}

		// url_vars session_key
			const url_vars = url_vars_to_object(location.search)
			if (url_vars.session_key) {
				instance_options.session_key = url_vars.session_key
			}
			if (url_vars.session_save) {
				instance_options.session_save = JSON.parse(url_vars.session_save)
			}

	// page_element instance (load file)
		const instance = await get_instance(instance_options)

	// caller. Set element caller. Useful to update menu section label from modal section
	// ! Do not overwrite already existing caller (tool case)
		if (instance && !instance.caller) {
			instance.caller = self
		}


	return instance
}//end instantiate_page_element



/**
* UPDATE_CSS_FILE
* Force load cached css file
* @param string sheet_name
* 	Sample: 'main'
* @return bool
*/
const update_css_file = function(sheet_name) {

	const style_sheet = document.querySelector('link[href*=' + sheet_name + ']')
	if (style_sheet) {
		const url = style_sheet.href
		if (url.indexOf('?')===-1) {
			// add version and update style_sheet
			const new_url = url + '?v=' + (new Date().valueOf())
			style_sheet.href = new_url
			return true
		}
	}


	return false
}//end update_css_file



/**
* SET_CUSTOM_CSS
* Set custom specific CSS based on operating system, browser, etc
* @return void
*/
const set_custom_css = function () {

	// browser specifics
	{
		const regex = /Windows/gm;
		const found = regex.exec(navigator.userAgent)
		if (found) {
			// add to body @see general.less for affections
			document.body.classList.add('os-windows')
			return
		}
	}
	{
		const regex = /Macintosh/gm;
		const found = regex.exec(navigator.userAgent)
		if (found) {
			// add to body @see general.less for affections
			document.body.classList.add('os-macintosh')
			return
		}
	}
}//end set_custom_css


/**
* SET_DOCUMENT_TITLE
* Change the window title
* Used by section and area to label the browser window
* see section.js
* @param string title
* 	Sample: '22 - Oral history - oh1'
* @return bool
*/
page.prototype.set_document_title = function (title) {

	document.title = title

	return true
}//end set_document_title



// @license-end
