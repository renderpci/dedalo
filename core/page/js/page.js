// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	// custom html elements
	// import '../../common/js/dd-modal.js'
	// others
	import {
		clone,
		dd_console,
		find_up_node,
		url_vars_to_object,
		JSON_parse_safely,
		object_to_url_vars
	} from '../../common/js/utils/index.js'
	// import {menu} from '../../menu/js/menu.js'
	import {event_manager} from '../../common/js/event_manager.js'
	// import {set_before_unload} from '../../common/js/events.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance} from '../../common/js/instances.js'
	import {common, push_browser_history} from '../../common/js/common.js'

	// import {load_tool} from '../../../tools/tool_common/js/tool_common.js'
	// import '../../common/js/components_list.js' // launch preload all components files in parallel
	// import '../../../lib/tinymce/js/tinymce/tinymce.min.js'
	import {render_page} from './render_page.js'
	// import {set_element_css} from './css.js'
	import {ui} from '../../common/js/ui.js'
	// import {activate_window_keydown} from '../../common/js/utils/keyboard.js'



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

	self.model			= 'page'
	self.type			= 'page'
	self.mode			= 'edit' // options.mode 	  // mode like 'section', 'tool', 'thesaurus'...
	self.node			= null
	self.ar_instances	= []
	self.context		= options.context // mixed items types like 'sections', 'tools'..
	// self.dd_request	= self.context ? self.context.dd_request : []
	self.status			= null
	self.events_tokens	= []
	self.menu_data		= options.menu_data

	// update value, subscription to the changes: if the section or area was changed, observers dom elements will be changed own value with the observable value

	// user_navigation. Menu navigation (not pagination)
		self.events_tokens.push(
			event_manager.subscribe('user_navigation', fn_user_navigation)
		)
		// fn_user_navigation
		async function fn_user_navigation(user_navigation_options) {
			if(SHOW_DEVELOPER===true) {
				dd_console(`// page user_navigation received user_navigation_options`, 'DEBUG', user_navigation_options)
			}
			// options
				const source			= user_navigation_options.source
				const sqo				= user_navigation_options.sqo || null
				const event_in_history	= user_navigation_options.event_in_history || false

			// unsaved_data check
				if (window.unsaved_data===true) {
					if (!confirm('page: ' + get_label.discard_changes || 'Discard unsaved changes?')) {
						return false
					}
					// reset unsaved_data state by the user
					window.unsaved_data = false
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

			try {

				// do the work
				return new Promise(async function(resolve){

					// basic vars
						// Only source is mandatory but if sqo is received, is placed in a new request_config
						// to allow sections and components manage properly the offset and limit
						if (!source.request_config && sqo) {
							source.request_config = [{
								api_engine	: 'dedalo',
								type		: 'main',
								sqo			: sqo
							}]
						}
						// const context = source

					// destroy previous page instances
						// await self.ar_instances.map(async function(el){
						// 	if (el.model!=='menu') {
						// 		// console.log("destroying el:", el);
						// 		await el.destroy(
						// 			true, // delete_self
						// 			true, // delete_dependencies
						// 			true // remove_dom
						// 		)
						// 	}
						// })

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
							if (container) {setTimeout(()=> container.classList.remove('loading'), 150)}
							console.error("ERROR. on instantiate_page_element. Unable to create a valid page element instance. ", user_navigation_options);
							return false
						}else{
							// remove instance from cache to prevent to use old request_config
							await new_page_element_instance.destroy(
								true, // delete_self
								true, // delete_dependencies
								true // remove_dom
							)
						}

					// spinner
						// const spinner = ui.create_dom_element({
						// 	element_type	: 'div',
						// 	class_name		: 'spinner',
						// 	parent			: self.node[0]
						// })
						// // self.events_tokens.push(
						// 	event_manager.subscribe('render_'+new_page_element_instance.id , fn_render_target)
						// // )
						// function fn_render_target() {
						// 	spinner.remove()
						// }

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

					// browser history track
						if(refresh_result===true && event_in_history!==true) {

							// page tile
								const title	= new_page_element_instance.id

							// page url
								const current_tipo = (source.config && source.config.source_section_tipo)
									? source.config.source_section_tipo
									: source.tipo
								// const url_params	= Object.entries(options_url).map(([key, val]) => `${key}=${val}`).join('&');
								// const url = "?t="+ current_tipo + '&m=' + source.mode

								// url search. Append section_id if exists
									const url_vars = url_vars_to_object(location.search)
										  url_vars.t = current_tipo
										  url_vars.m = source.mode
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


					resolve(new_page_element_instance.id)
				})

			} catch (error) {
				// loading css remove
				if (container) { container.classList.remove('loading') }
				// spinner.remove()
				console.error('Error on user navigation. user_navigation_options:', user_navigation_options)
				console.error(error)
				return false
			}
		}//end fn_user_navigation

	// activate_component
		self.events_tokens.push(
			event_manager.subscribe('activate_component', fn_activate_component)
		)
		// fn_activate_component
		function fn_activate_component(component_instance) {
			dd_console(`// page activate_component received component_instance`, 'DEBUG', component_instance)

			// lock_component. launch worker
			if (DEDALO_LOCK_COMPONENTS===true && component_instance.mode==='edit') {
				data_manager.request({
					use_worker	: true,
					body		: {
						dd_api	: 'dd_utils_api',
						action	: 'update_lock_components_state',
						options	: {
							component_tipo	: component_instance.tipo,
							section_tipo	: component_instance.section_tipo,
							section_id		: component_instance.section_id,
							action			: 'focus' // delete_user_section_locks | blur | focus
						}
					}
				})
				.then(function(api_response){

					if (api_response.in_use===true) {
						document.activeElement.blur()

						ui.component.deactivate(component_instance)
						// component_instance.node.classList.add('disabled_component')
						// ui.component.lock(component_instance)

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
										action			: 'delete_user_section_locks' // delete_user_section_locks | blur | focus
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
				})
			}
		}//end fn_user_navigation

	// observe tool calls
		// load_tool
		// The event is fired by the tool button created with method ui.build_tool_button.
		// When the user triggers the click event, a publish 'load_tool' is made
			// self.events_tokens.push(
			// 	event_manager.subscribe('load_tool', load_tool) // fire tool_common.load_tool function
			// )

	// window messages
		// window.addEventListener("message", receiveMessage, false);
		// function receiveMessage(event) {
		// 	console.log("message event:",event);
		// 	alert("Mensaje recibido !");
		// }

	// events. Add window/document general events
		self.add_events()

	// update main CSS url to avoid cache
		update_css_file('main')

	// status update
		self.status = 'initialized'

	// test
		// elements_css.rsc75 = {
		// 	children : {
		// 		height : '150px',
		// 		width : '100%'
		// 	}
		// }
		// elements_css.oh1_rsc75 = {
		//        ".wrap_component": {
		//            "style": {
		//            	"width": "12%",
		//                "@media screen and (min-width: 900px)" : {
		//             	"width": "50%"
		//             }
		//         }
		// 	},
		//        ".content_data": {
		//            "style": {
		//                "width": "3620px"
		//            }
		//        }
		//    }
	// setTimeout(function(){
		// elements_css.oh1_rsc75 = {
		//     ".wrap_component": {
		//         "width": "12%",
		//            "height" : '150px',
		//            "@media (max-width: 800px)" : {
		//         	"width": "50%",
		//             "height" : '120px'
		//         }
		//     },
		//     ".content_data": {
		//         "style": {
		//             "width": "120px"
		//         }
		//     }
		// }
		// }, 5)


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

				// local DDBB SQO
				// Try to get local DDB SQO value when URL tipo exists to preserve user navigation filter and pagination
					if (rqo.options.search_obj.t) {
						const section_tipo	= rqo.options.search_obj.t
						const mode			= rqo.options.search_obj.m || 'list'
						const local_db_sqo	= await data_manager.get_local_db_data(
							section_tipo + '_' + mode, // id
							'sqo', // table
							true // cache
						)
						if (local_db_sqo && local_db_sqo.value) {
							// add found user navigation values to RQO
							rqo.sqo		= local_db_sqo.value
							rqo.source	= {
								tipo			: section_tipo,
								section_tipo	: section_tipo,
								mode			: mode
							}
						}
					}

				// request page context (usually menu and section context)
					const api_response = await data_manager.request({
						body : rqo
					});
					console.log('page build api_response:', api_response);

				// error case
					if (!api_response || !api_response.result) {

						// running_with_errors
							const running_with_errors = [
								{
									msg		: api_response.msg || 'Invalid API result',
									error	: api_response.error || 'unknown'
								}
							]
						const wrapper_page = render_server_response_error(
							running_with_errors
						)

						return false
					}
					// server_errors check (page and environment)
					if (api_response.dedalo_last_error) {
						console.error('Page running with server errors. dedalo_last_error: ', api_response.dedalo_last_error);
					}
					if (page_globals.dedalo_last_error) {
						console.error('Environment running with server errors. dedalo_last_error: ', page_globals.dedalo_last_error);
					}

				// set context and data to current instance
					self.context	= api_response.result.context
					self.data		= {}
			}
		}//end if (autoload===true)

	// page title update
		const section_info = self.context.find(el => el.model==='section' || el.model.indexOf('area')===0)
		if (section_info) {

			const tipo = section_info.tipo || 'Unknown tipo'
			const label = section_info.label
				? section_info.label.replace(/<[^>]+>/ig,'')
				: ''

			document.title =  'V6 ' + tipo + ' ' + label
		}

	// status update
		self.status = 'built'

	return true
}//end build



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
		window.onpopstate = function(event) {
			if (event.state) {
				// get previously stored state data
				const new_user_navigation_options = event.state.user_navigation_options
				// mark as already used in history
				new_user_navigation_options.event_in_history = true
				// publish the event normally as usual
				event_manager.publish('user_navigation', new_user_navigation_options)
			}
		}

	// beforeunload (event)
		window.addEventListener('beforeunload', beforeUnloadListener, {capture: true})
		function beforeUnloadListener(event) {
			// event.preventDefault();

			// document.activeElement.blur()
			if (typeof window.unsaved_data==='undefined' || window.unsaved_data!==true) {
				// console.log('window.unsaved_data:', window.unsaved_data);
				// removeEventListener('beforeunload', beforeUnloadListener, {capture: true})
				return false
			}

			// set event.returnValue value to force browser standard message (unable to customize)
			// like : 'Changes that you made may not be saved.'
			event.returnValue = true
			// return event.returnValue = get_label.discard_changes || 'Discard unsaved changes?';
		}

	// keydown events
		document.addEventListener('keydown', fn_keydown)
		function fn_keydown(evt) {
			switch(true) {

				case evt.key==='Escape':
					// inactive user activated component
						if (ui.component.component_active) {
							ui.component.deactivate(ui.component.component_active)
							ui.component.component_active = null
						}
					break;

				case evt.key==='Enter':
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

				case (evt.key==='ArrowLeft' && evt.shiftKey===true):
					// paginator left arrow <
						// paginator right arrow >
						const section_prev = self.ar_instances.find(el => el.model==='section')
						if (section_prev && section_prev.paginator) {
							section_prev.paginator.navigate_to_previous_page()
						}
					break;

				case (evt.key==='ArrowRight' && evt.shiftKey===true):
					// paginator right arrow >
						const section_next = self.ar_instances.find(el => el.model==='section')
						if (section_next && section_next.paginator) {
							section_next.paginator.navigate_to_next_page()
						}
					break;

				default:
					break;
			}//end switch
		}//end fn_keydown

	// page click
		document.addEventListener('mousedown', fn_deactivate_components)
		function fn_deactivate_components() {
			if (page_globals.component_active) {

				const component_instance = page_globals.component_active

				// lock_component. launch worker
				if (DEDALO_LOCK_COMPONENTS===true && component_instance.mode==='edit') {
					data_manager.request({
						use_worker	: true,
						body		: {
							dd_api	: 'dd_utils_api',
							action	: 'update_lock_components_state',
							options	: {
								component_tipo	: component_instance.tipo,
								section_tipo	: component_instance.section_tipo,
								section_id		: component_instance.section_id,
								action			: 'blur' // delete_user_section_locks | blur | focus
							}
						}
					})
				}

				// deactivate
					ui.component.deactivate(component_instance)
			}
		}//end fn_deactivate_components
}//end add_events



/**
* INSTANTIATE_PAGE_ELEMENT
* Creates the instance of current element, usually a section or menu
* calling instance.get_instance(...). This function only load and init the instance file
* @param object self (instance)
* @param object source
* 	Could be full context of element return by start API function or an basic source on page navigation
* @return promise instance_promise
*/
export const instantiate_page_element = function(self, source) {

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

		// config. Used by section tools
			if (config && config.source_section_tipo) {
				instance_options.id_variant	= config.source_section_tipo
				instance_options.config		= config
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

	// page_element instance (load file)
		const instance_promise = get_instance(instance_options)


	return instance_promise
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
* USER_ACTION
*/
	// const user_navigation = async function(self, options) {

	// 	const api_response = await data_manager.request({
	// 		body : {
	// 			action 		: 'get_element',
	// 			options 	: options
	// 		}
	// 	})

	// 	// elements to stay
	// 		const api_element 		= api_response.result
	// 		const elements_to_stay 	= self.elements.filter(item => item.model!==api_element.model)
	// 			  elements_to_stay.push(api_element)
	// 		self.elements = elements_to_stay

	// 	// instances. remove all other instances but current an refresh page
	// 		const instances_to_destroy = self.ar_instances.filter(item => item.model!==api_element.model)
	// 		for (let i = instances_to_destroy.length - 1; i >= 0; i--) {
	// 			instances_to_destroy[i].destroyable = false
	// 		}
	// 		self.refresh()

	// 	// url history track
	// 		if(options.event_in_history===true) return;

	// 		const var_uri = Object.entries(options).map(([key, val]) => `${key}=${val}`).join('&');

	// 		const uri_options	= clone(options)
	// 		const state 		= {options : uri_options}
	// 		const title 		= ''
	// 		const url 			= "?"+var_uri //window.location.href

	// 		history.pushState(state, title, url)

	// 	return true
	// }//end user_navigation



// @license-end
