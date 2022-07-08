/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// import
	// custom html elements
	// import '../../common/js/dd-modal.js'
	import '../../services/service_tinymce/js/dd-tiny.js'
	// others
	import {clone, dd_console} from '../../common/js/utils/index.js'
	// import {menu} from '../../menu/js/menu.js'
	import {event_manager} from '../../common/js/event_manager.js'
	// import {data_manager} from '../../common/js/data_manager.js'
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


	return true
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
*/
page.prototype.init = async function(options) {

	const self = this

	self.model			= 'page'
	self.type			= 'page'
	self.mode			= 'edit' // options.mode 	  // mode like 'section', 'tool', 'thesaurus'...
	self.node			= []
	self.ar_instances	= []
	self.context		= options.context // mixed items types like 'sections', 'tools'..
	// self.dd_request	= self.context ? self.context.dd_request : []
	self.status			= null
	self.events_tokens	= []
	self.menu_data		= options.menu_data

	// launch preload all components files in parallel
		//import('../../common/js/components_list.js')

	// update value, subscription to the changes: if the section or area was changed, observers dom elements will be changed own value with the observable value

		// user_navigation. Menu navigation (not pagination)
			self.events_tokens.push(
				event_manager.subscribe('user_navigation', fn_user_navigation)
			)
		// fn_user_navigation
			async function fn_user_navigation(user_navigation_options) {
				dd_console(`// page user_navigation received user_navigation_options`, 'DEBUG', user_navigation_options)

				// options
					const source			= user_navigation_options.source
					const sqo				= user_navigation_options.sqo || null
					const event_in_history	= user_navigation_options.event_in_history || false

				// unsaved_data check
					if (window.unsaved_data===true) {
						if (!confirm('Are you sure you want to exit with unsaved changes?')) {
							return false
						}
					}

				// check valid vars
					if (!source) {
						console.error("ERROR. valid source is mandatory on user_navigation:", user_navigation_options);
						return false
					}

				// reset status to prevent errors lock
					self.status = 'rendered'

				// loading css add
					const node = self.node && self.node[0]
						? self.node[0].querySelector('section') // .content_data.page
						: null
					if (node) { node.classList.add('loading') }

				try {

					// do the work
					return new Promise(async function(resolve){

						// basic vars
							// Only source is mandatory but if sqo is received, is placed in a new request_config
							// to allow sections and components manage properly the offset and limit
							if (!source.request_config && sqo) {
								source.request_config = [{
									api_engine	: 'dedalo',
									sqo			: sqo
								}]
							}

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
							const new_page_element_instance = await instantiate_page_element(self, source)

						// check only if new source of page element is actually valid for instantiation
						// (!) Note that this element page is called twice, this time and when page is refreshed (assume is cached..)
							if (!new_page_element_instance) {
								console.error("error on get new_page_element_instance:", new_page_element_instance);
								// loading css remove
								if (node) {setTimeout(()=> node.classList.remove('loading'), 150 )}
								console.error("ERROR. on instantiate_page_element. Unable to create a valid page element instance. ", user_navigation_options);
								return false
							}

						// page context elements to stay. Menu and other static elements don't need to be built and rendered every time
							const base_models		= ['menu']
							const elements_to_stay	= self.context.filter( item => base_models.includes(item.model))
							// add current source from options
								elements_to_stay.push(source)
							// fix new page context
								self.context = elements_to_stay

						// instances. Set property 'destroyable' as false for own instances to prevent remove. Refresh page
							const instances_to_stay = self.ar_instances.filter(item => base_models.includes(item.model))
							for (let i = instances_to_stay.length - 1; i >= 0; i--) {
								instances_to_stay[i].destroyable = false
							}

						// refresh page. Force to load new context elements data from DDBB
							const refresh_result = await self.refresh()

						// url history track
							if(refresh_result===true && event_in_history!==true) {

								// page tile
									const title	= new_page_element_instance.id

								// page url
									const current_tipo = (source.config && source.config.source_section_tipo)
										? source.config.source_section_tipo
										: source.tipo
									// const url_params	= Object.entries(options_url).map(([key, val]) => `${key}=${val}`).join('&');
									const url = "?t="+ current_tipo + '&m=' + source.mode

								// browser navigation update
									push_browser_history({
										source				: source,
										sqo					: sqo,
										event_in_history	: false,
										title				: title,
										url					: url
									})
							}

						// loading css remove
							if (node) { node.classList.remove('loading') }


						resolve(new_page_element_instance.id)
					})

				} catch (error) {
					// loading css remove
					if (node) { node.classList.remove('loading') }
					console.error(error)
					return false
				}
			}//end fn_user_navigation


	// window onpopstate. Triggered when user make click on browser navigation buttons
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


	// observe tool calls
		// load_tool
		// The event is fired by the tool button created with method ui.build_tool_button.
		// When the user triggers the click event, a publish 'load_tool' is made
			// self.events_tokens.push(
			// 	event_manager.subscribe('load_tool', load_tool) // fire tool_common.load_tool function
			// )

	// beforeunload (event)
		// window.addEventListener("beforeunload", function (event) {
		// 	event.preventDefault();

		// 	document.activeElement.blur()

		// 	const confirmationMessage = "Leaving tool transcription page.. ";
		// 	event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
		// 	// return confirmationMessage;				// Gecko, WebKit, Chrome <34

		// 	return null
		// })//end beforeunload

	// window messages
		// window.addEventListener("message", receiveMessage, false);
		// function receiveMessage(event) {
		// 	console.log("message event:",event);
		// 	alert("Mensaje recibido !");
		// }

	// events
		self.add_events()


	// status update
		self.status = 'initiated'

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
*/
page.prototype.build = async function() {

	const self = this

	// instances (like section). Instances are returned init and builded
		// await self.get_ar_instances() // (!) processed directly from render to allow async

	// status update
		self.status = 'builded'

	return true
}//end build



/**
* ADD_EVENTS
*/
page.prototype.add_events = function() {

	const self = this

	// keydown events
		document.addEventListener("keydown", function(evt){
			// console.log("paget keydown evt:", evt.key, evt);

			switch(true) {

				case evt.key==='Escape':
					// unactive user actived component
						if (ui.component.component_active) {
							ui.component.inactive(ui.component.component_active)
							ui.component.component_active = null
						}
					break;

				case evt.key==='Enter':
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
								event_manager.publish('toggle_search_panel', section)
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
		})//end keydown event

	return true
}//end add_events



/**
* GET_AR_INSTANCES
* Create and build one instance for each self.context item
* @return promise array self.ar_instances
* 	Array of instance objects (like menu, section, area..)
*/
	// page.prototype.get_ar_instances = async function(){

	// 	const self = this

	// 	// instances
	// 		const ar_promises = []

	// 		const context_length = self.context.length
	// 		for (let i = 0; i < context_length; i++) {

	// 			const current_ddo = self.context[i]
	// 			ar_promises.push( new Promise(function(resolve){

	// 				instantiate_page_element(self, current_ddo)
	// 				.then(function(current_instance){

	// 					// build (load data)
	// 					const autoload = current_instance.status==="initiated" // avoid reload menu data
	// 					current_instance.build(autoload)
	// 					.then(function(){
	// 						resolve(current_instance)
	// 					})
	// 				})
	// 			}))
	// 		}//end for (let i = 0; i < elements_length; i++)

	// 	// set on finish
	// 		await Promise.all(ar_promises).then((ar_instances) => {
	// 			self.ar_instances = ar_instances
	// 		})
	// 		console.log("page self.ar_instances:",self.ar_instances);

	// 	return self.ar_instances
	// }//end get_ar_instances



/**
* INSTANTIATE_PAGE_ELEMENT
* @param object self (instance)
* @param object ddo (source)
* @return promise current_instance_promise
*/
export const instantiate_page_element = function(self, ddo) {

	const context		= ddo
	const tipo			= ddo.tipo
	const section_tipo	= ddo.section_tipo || tipo
	const model			= ddo.model
	const section_id	= ddo.section_id || null
	const mode			= ddo.mode
	const lang			= ddo.lang
	const config		= ddo.config || null

	// instance options
		const instance_options = {
			model			: model,
			tipo			: tipo,
			section_tipo	: section_tipo,
			section_id		: section_id ,
			mode			: mode,
			lang			: lang,
			context			: context
		}

		// id_variant . Propagate a custom instance id to children
			if (self.id_variant) {
				instance_options.id_variant = self.id_variant
			}

		// config
			if (config && config.source_section_tipo) {
				instance_options.id_variant	= config.source_section_tipo
				instance_options.config		= config
			}

	// page_element instance (load file)
		const instance_promise = get_instance(instance_options)

	return instance_promise
}//end instantiate_page_element



/**
* USER_ACTION
*/
	// const user_navigation = async function(self, options) {

	// 	const current_data_manager = new data_manager()
	// 	const api_response = await current_data_manager.request({
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
