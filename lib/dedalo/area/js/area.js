// imports
	import {common} from '../../common/js/common.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import event_manager from '../../page/js/page.js'
	import * as instances from '../../common/js/instances.js'
	import {render_area} from './render_area.js'
	import {ui} from '../../common/js/ui.js'
	//import {inspector} from '../../inspector/js/inspector.js'



/**
* AREA
*/
export const area = function() {

	this.id

	// element properties declare
	this.model
	this.type
	this.tipo
	this.mode
	this.lang

	this.context
	this.node
	this.ar_instances
	this.status

	return true
}//end area



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	section.prototype.edit 			= render_area.prototype.edit
	section.prototype.list 			= render_area.prototype.list
	section.prototype.render 		= common.prototype.render
	section.prototype.destroy 		= common.prototype.destroy
	section.prototype.refresh 		= common.prototype.refresh



/**
* INIT
* @return bool
*/
section.prototype.init = async function(options) {

	const self = this

	// instance key used vars
	self.model 				= options.model
	self.tipo 				= options.tipo
	self.mode 				= options.mode
	self.lang 				= options.lang

	// DOM
	self.node 				= []

	self.parent 			= options.parent

	self.events_tokens		= []
	self.ar_instances		= []

	self.context 			= options.context || null

	self.type 				= 'area'
	self.label 				= null

	// events subscription
		// area_rendered
			self.events_tokens.push(
				event_manager.subscribe('area_rendered', (active_area) => {
					const debug = document.getElementById("debug")
						  debug.classList.remove("hide")
				})
			)

	// status update
		self.status = 'inited'


	return true
}//end init



/**
* BUILD
* @return promise
*	bool true
*/
section.prototype.build = async function() {
	const t0 = performance.now()

	const self = this

	// status update
		self.status = 'building'

	//// set context and data to current instance
	//	self.context	= self.datum.context.filter(element => element.tipo===self.tipo)
	//
	//// inspector
	//	if (!self.inspector) {
	//		const current_inspector = new inspector()
	//		current_inspector.init({
	//			section_tipo 	: self.section_tipo,
	//			section_id 		: self.section_id
	//		})
	//		current_inspector.build()
	//	}

	// debug
		if(SHOW_DEBUG===true) {
			//console.log("self.context section_group:",self.datum.context.filter(el => el.model==='section_group'));
			console.log("+ Time to build",self.model, ":", performance.now()-t0);
			//load_section_data_debug(self.section_tipo, self.sqo_context, load_section_data_promise)
		}

	// status update
		self.status = 'builded'

	return true
}//end build


