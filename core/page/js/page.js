/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {menu} from '../../menu/js/menu.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'
	import {common} from '../../common/js/common.js'
	import '../../common/js/components_list.js' // launch preload all components files in parallel
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

	// status update
		self.status = 'inited'

 	return true
}//end init



/**
* BUILD
*/
page.prototype.build = async function() {

	const self = this

	// menu
	const page_menu = new menu()
	page_menu.init({menu_data : self.menu_data})
	page_menu.build()
	self.menu = page_menu

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

			// element instance (load file)
				const current_instance = await get_instance({
					model 				: element.model,
					tipo 				: element.tipo || element.section_tipo,
					section_tipo		: element.section_tipo || null,
					section_id			: element.section_id || null,
					mode				: element.mode,
					lang				: element.lang,
					sqo_context			: element.sqo_context || null,
					datum				: element.datum || null
				})
				// build (load data)
					await current_instance.build(true)

			// add
				self.ar_instances.push(current_instance)

		}//end for (let i = 0; i < elements_length; i++)


	return self.ar_instances
}//end get_ar_instances


