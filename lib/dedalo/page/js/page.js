// import
	import {common} from '../../common/js/common.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	//import * as instances from '../../common/js/instances.js'
	import {get_instance, delete_instance} from '../../common/js/instances.js'
	import '../../common/js/components_list.js' // launch preload all components files in parallel
	import {render_page} from './render_page.js'



// page event_manager init and export
	export default new event_manager({})



/**
* PAGE
*/
export const page = function () {

	this.id

	this.model
	this.node
	this.ar_instances
	this.elements
	this.mode
	this.status
	this.events_tokens

	return true
}//end page



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	page.prototype.default = render_page.prototype.default
	page.prototype.render  = common.prototype.render


/**
* INIT
* @param object options
*/
page.prototype.init = async function(options) {

	const self = this

	self.model 			= 'page'
	self.node 			= []
	self.ar_instances 	= []
	self.elements 		= options.elements // mixed items types like 'sections', 'tools'..
	self.mode 			= 'default' // options.mode 	  // mode like 'section', 'tool', 'thesaurus'...
	self.events_tokens	= []

	// launch preload all components files in parallel
		//import('../../common/js/components_list.js')

	self.status = 'inited'

	// autobuild
		self.build()

 	return true
}//end init



/**
* BUILD
*/
page.prototype.build = async function() {

	const self = this


	self.status = 'builded'

 	return true
}//end build



/**
* RENDER
*//*
page.prototype.render = async function(){
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'rendering'


	// nodes
		const get_node = async () => {

			switch (self.mode){
				case 'custom' :
					console.error("Not defined page mode: ", self.mode);
					break;

				default:
					return self.default()
			}

		}
		const node = await get_node()

		// set
			self.node.push(node)

	// status update
		self.status = 'rendered'

	// debug
		if(SHOW_DEBUG===true) {
			console.log("+ Page rendered", elements_length ," elements in time ms: ",performance.now()-t0)
		}


	return node
}//end page.prototype.render
*/



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
					section_tipo		: element.section_tipo,
					section_id			: element.section_id,
					mode				: element.mode,
					lang				: element.lang,
					sqo_context			: element.sqo_context
				})
				// build (load data)
					await current_instance.build(true)

			// add
				self.ar_instances.push(current_instance)

		}//end for (let i = 0; i < elements_length; i++)


	return self.ar_instances
}//end get_ar_instances



/**
* DESTROY
* prototype assign
*/
page.prototype.destroy = common.prototype.destroy



/**
* REFRESH
* prototype assign
*/
page.prototype.refresh 	= common.prototype.refresh


