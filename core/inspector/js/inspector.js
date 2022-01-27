/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	// import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_inspector} from './render_inspector.js'
	import * as instances from '../../common/js/instances.js'



/**
*  INSPECTOR
*
*/
export const inspector = function() {

	return true
};//end inspector



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	inspector.prototype.edit	= render_inspector.prototype.edit
	inspector.prototype.render	= common.prototype.render
	inspector.prototype.refresh	= common.prototype.refresh
	inspector.prototype.destroy	= common.prototype.destroy


/**
* INIT
* @return bool true
*/
inspector.prototype.init = function(options) {

	const self = this

	self.id				= 'inspector_' + options.section_tipo
	self.model			= 'inspector'
	self.section_tipo	= options.section_tipo
	self.section_id		= options.section_id
	self.mode			= 'edit'
	self.node			= []
	self.caller			= options.caller

	self.events_tokens	= []
	self.ar_instances	= []

	// status update
		self.status = 'initiated'

	return true
};//end init



/**
* BUILD
* @return bool true
*/
inspector.prototype.build = async function() {

	const self = this

	// status update
		self.status = 'building'

	// Noting to do here. Only for live cycle compatibility

	// status update
		self.status = 'builded'

	return true
};//end build


inspector.prototype.get_instance = function(model){

	const self = this

	const instance_options = {
			model 			: model,
			tipo 			: self.caller.context[model],
			section_tipo 	: self.section_tipo,
			section_id		: self.section_id,
			mode			: self.mode
		}

	const instance = instances.get_instance(instance_options)

	return instance
}
