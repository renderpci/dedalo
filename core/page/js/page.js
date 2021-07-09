/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// custom html elements
	// import '../../common/js/dd-modal.js'
	import '../../services/service_tinymce/js/dd-tiny.js'
	// others
	import {clone, dd_console} from '../../common/js/utils/index.js'
	import {menu} from '../../menu/js/menu.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {common} from '../../common/js/common.js'
	import {load_tool} from '../../../tools/tool_common/js/tool_common.js'
	// import '../../common/js/components_list.js' // launch preload all components files in parallel
	// import '../../../lib/tinymce/js/tinymce/tinymce.min.js'
	import {render_page} from './render_page.js'



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
};//end page



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
		// user_navigation
			self.events_tokens.push(
				event_manager.subscribe('user_navigation', user_navigation)
			)
		// user_navigation fn
			async function user_navigation(user_navigation_options) {				
				dd_console(`// page user_navigation received user_navigation_options`, 'DEBUG', user_navigation_options)

				// check valid vars
					if (!user_navigation_options.source) { 
						console.error("ERROR. valid source is mandatory on user_navigation:", user_navigation_options);
						return false
					}

				// reset status to prevent errors lock 
					self.status = 'rendered'

				// loading css add
					// const node = self.node && self.node[0]
					// 	? self.node[0].querySelector('.content_data.page')
					// 	: null
					// if (node) { node.classList.add('loading') }

				// do the work
				return new Promise(async function(resolve){

					// basic vars
						// Only source is mandatory but if sqo is received, is placed in a new request_config 
						// to allow sections and components manage properly the offset and limit
						const caller_id			= user_navigation_options.caller_id || null
						const source			= user_navigation_options.source
						const sqo				= user_navigation_options.sqo || null
						const request_config	= [{
							api_engine	: 'dedalo',
							sqo			: sqo,
						}]
						source.request_config = request_config
				
					// check if new source of page element is actually valid for instantiation
						const new_page_element_instance = await instantiate_page_element(self, source)
						if (!new_page_element_instance) {
							console.error("error on get new_page_element_instance:", new_page_element_instance);
							// loading css remove
							// if (node) {setTimeout(()=> node.classList.remove('loading'), 150 )}
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
						if(refresh_result===true && user_navigation_options.event_in_history!==true)  {
							
							// const url_params	= Object.entries(options_url).map(([key, val]) => `${key}=${val}`).join('&');							
							const title	= new_page_element_instance.id
							const url	= "?t="+ source.tipo + '&m=' + source.mode

							const new_user_navigation_options = Object.assign({
								event_in_history : false
							}, user_navigation_options);
							const state = {
								user_navigation_options : new_user_navigation_options
							}

							history.pushState(state, title, url)
						}

					// loading css remove
						// if (node) { node.classList.remove('loading') }

					resolve(new_page_element_instance.id)
				})
			};//end user_navigation


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
		self.events_tokens.push(
			// load_tool from tool_common/js/tool_common.js
			// event_manager.subscribe('load_tool', load_tool)
			event_manager.subscribe('load_tool', function(e) {
				load_tool(e)
			})
		)


	// beforeunload (event)
		// window.addEventListener("beforeunload", function (event) {
		// 	event.preventDefault();

		// 	document.activeElement.blur()

		// 	const confirmationMessage = "Leaving tool transcription page.. ";
		// 	event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
		// 	// return confirmationMessage;				// Gecko, WebKit, Chrome <34

		// 	return null
		// }, false)//end beforeunload


	// window messages
		// window.addEventListener("message", receiveMessage, false);
		// function receiveMessage(event) {
		// 	console.log("message event:",event);
		// 	alert("Mensaje recibido !");
		// }


	// status update
		self.status = 'initiated'
	

 	return true
};//end init



/**
* BUILD
*/
page.prototype.build = async function() {
	
	const self = this

	// instances (like section). Instances are returned init and builded
		await self.get_ar_instances()

	// status update
		self.status = 'builded'

	return true
};//end build



/**
* GET_AR_INSTANCES
*/
page.prototype.get_ar_instances = async function(){

	const self = this

	// instances
		const ar_promises = []

		const context_length = self.context.length
		for (let i = 0; i < context_length; i++) {

			const current_ddo = self.context[i]
				console.log("PAGE get_ar_instances current_ddo:", current_ddo); 
			ar_promises.push( new Promise(function(resolve){
			
				instantiate_page_element(self, current_ddo)
				.then(function(current_instance){
					// build (load data)
					const autoload = current_instance.status==="initiated" // avoid reload menu data
					current_instance.build(autoload)
					.then(function(response){
						resolve(current_instance)
					})
				})
			}))
		};//end for (let i = 0; i < elements_length; i++)

	// set on finish
		await Promise.all(ar_promises).then((ar_instances) => {
			self.ar_instances = ar_instances
		});

	return self.ar_instances
};//end get_ar_instances



/**
* INSTANTIATE_PAGE_ELEMENT
* @return promise current_instance_promise
*/
const instantiate_page_element = function(self, ddo) {

	const tipo			= ddo.tipo
	const section_tipo	= ddo.section_tipo || tipo
	const model			= ddo.model
	const section_id	= ddo.section_id || null
	const mode			= ddo.mode
	const lang			= ddo.lang
	const context		= ddo

	
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

	// page_element instance (load file)
		const instance_promise = get_instance(instance_options)


	return instance_promise
};//end instantiate_page_element



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

	// 		const uri_options	= JSON.parse(JSON.stringify(options))
	// 		const state 		= {options : uri_options}
	// 		const title 		= ''
	// 		const url 			= "?"+var_uri //window.location.href

	// 		history.pushState(state, title, url)

	// 	return true
	// };//end user_navigation


