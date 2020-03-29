/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// custom html elements
	import '../../common/js/dd-modal.js'
	import '../../services/service_tinymce/js/dd-tiny.js'
	// others
	import {menu} from '../../menu/js/menu.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {common} from '../../common/js/common.js'
	import {load_tool} from '../../tool_common/js/tool_common.js'
	// import '../../common/js/components_list.js' // launch preload all components files in parallel
	// import '../../../lib/tinymce/js/tinymce/tinymce.min.js'

	import {render_page} from './render_page.js'
	import '../../services/service_tinymce/js/dd-tiny.js'



/**
* PAGE
*/
export const page = function () {

	this.id

	this.model
	this.mode
	this.node
	this.ar_instances
	this.elements
	this.status
	this.events_tokens

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	page.prototype.edit 	= render_page.prototype.edit
	page.prototype.render  	= common.prototype.render
	page.prototype.refresh 	= common.prototype.refresh
	page.prototype.destroy 	= common.prototype.destroy



/**
* INIT
* @param object options
*/
page.prototype.init = async function(options) {

	const self = this

	self.model 			= 'page'
	self.type 			= 'page'
	self.mode 			= 'edit' // options.mode 	  // mode like 'section', 'tool', 'thesaurus'...
	self.node 			= []
	self.ar_instances 	= []
	self.elements 		= options.elements // mixed items types like 'sections', 'tools'..
	self.status 		= null
	self.events_tokens	= []
	self.menu_data 		= options.menu_data

	// launch preload all components files in parallel
		//import('../../common/js/components_list.js')


	// update value, subscription to the changes: if the section or area was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('user_action', user_action)
		)
		// user_action fn
			async function user_action(options) {

				const current_data_manager = new data_manager()
				const api_response = await current_data_manager.get_page_element(options)

				// element context from api server result
					const page_element = api_response.result

				// check response page element is valid for instantiate. Element instance loads the file
					const page_element_instance = await instantiate_page_element(page_element)
					if (typeof page_element_instance==="undefined" || !page_element_instance) {
						console.error("[page.user_action] Stopped user action. Element instance not suitable. page_element:", page_element);
						return false
					}

				// elements to stay
					const base_types = ['section','tool','area']
					// const elements_to_stay 	= self.elements.filter(item => item.model!==page_element.model)
					const elements_to_stay 	= self.elements.filter(item => !base_types.includes(item.type))
						  elements_to_stay.push(page_element)
					self.elements = elements_to_stay

				// instances. Set property 'destroyable' as false for own instances to prevent remove. Refresh page
					// const instances_to_destroy = self.ar_instances.filter(item => item.model!==page_element.model)
					const instances_to_destroy = self.ar_instances.filter(item => !base_types.includes(item.type))
					for (let i = instances_to_destroy.length - 1; i >= 0; i--) {
						instances_to_destroy[i].destroyable = false
					}
					await self.refresh()

				// url history track
					if(options.event_in_history!==true) {

						// options_url : clone options and remove optional 'event_in_history' property
						const options_url 	= Object.assign({}, options);
						delete options_url.event_in_history

						const var_uri 		= Object.entries(options_url).map(([key, val]) => `${key}=${val}`).join('&');
						const uri_options	= JSON.parse(JSON.stringify(options))
						const state 		= {options : uri_options}
						const title 		= ''
						const url 			= "?"+var_uri //window.location.href

						history.pushState(state, title, url)
					}

				return true
			}//end user_action

	// window onpopstate
		window.onpopstate = function(event) {
			const options = event.state.options
			options.event_in_history = true
			event_manager.publish('user_action', options)
		};


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

		// 	// 	const confirmationMessage = "Leaving tool transcription page.. ";
		// 	// 	event.returnValue  	= confirmationMessage;	// Gecko, Trident, Chrome 34+
		// 	// 	// return confirmationMessage;				// Gecko, WebKit, Chrome <34

		// 	return null

		// }, false)//end beforeunload


	// status update
		self.status = 'inited'

 	return true
}//end init



/**
* BUILD
*/
page.prototype.build = async function() {

	const self = this

	// instances (like section). Instances are returned init and builded
		await self.get_ar_instances()

	// menu
	// const page_menu = new menu()
	// page_menu.init({menu_data : self.menu_data})
	// page_menu.build()
	// self.menu = page_menu

	// reset self.ar_instances
		//self.ar_instances = []

	// reset self.node
		//self.node = []



	// status update
		self.status = 'builded'

 	return true
}//end build



/**
* GET_AR_INSTANCES
*/
page.prototype.get_ar_instances = async function(){

	const self = this

	// instances
		const elements 			= self.elements
		const elements_length 	= elements.length
		for (let i = 0; i < elements_length; i++) {

			const element = elements[i]
			if(SHOW_DEBUG===true) {
				console.log("page.get_ar_instances element:", element);
			}

			// element instance (load file)
				// const current_instance = await get_instance({
				// 	model 				: element.model,
				// 	tipo 				: element.tipo || element.section_tipo,
				// 	section_tipo		: element.section_tipo || null,
				// 	section_id			: element.section_id || null,
				// 	mode				: element.mode,
				// 	lang				: element.lang,
				// 	sqo_context			: element.sqo_context || null,
				// 	datum				: element.datum || null
				// })
				const current_instance = await instantiate_page_element(element)

			// build (load data)
				await current_instance.build(true)

			// add
				self.ar_instances.push(current_instance)

		}//end for (let i = 0; i < elements_length; i++)


	return self.ar_instances
}//end get_ar_instances



/**
* INSTANTIATE_PAGE_ELEMENT
* @return promise current_instance_promise
*/
const instantiate_page_element = function(page_element) {

	// page_element instance (load file)
		const current_instance_promise = get_instance({
			model 				: page_element.model,
			tipo 				: page_element.tipo || page_element.section_tipo,
			section_tipo		: page_element.section_tipo || null,
			section_id			: page_element.section_id || null,
			mode				: page_element.mode,
			lang				: page_element.lang,
			sqo_context			: page_element.sqo_context || null,
			datum				: page_element.datum || null
		})

	return current_instance_promise
}//end instantiate_page_element



/**
* BUILD_ELEMENT
*/
page.prototype.build_element = async function(){


}//build_element



// /**
// * USER_ACTION
// */
// const user_action = async function(self, options) {

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
// }//end user_action


