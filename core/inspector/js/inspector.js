/*global */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {render_inspector, render_section_info, render_component_info} from './render_inspector.js'
	// import * as instances from '../../common/js/instances.js'



/**
* INSPECTOR
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
* @param object options
* @return bool true
*/
inspector.prototype.init = async function(options) {

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

	// nodes
		self.paginator_container	= null
		self.element_info_container	= null

	// events
		// section render
			self.events_tokens.push(
				event_manager.subscribe('render_' + self.caller.id, fn_update_section_info)
			)
			function fn_update_section_info() {
				render_section_info(self)
			}
		// active_component (when user focus it in DOM)
			self.events_tokens.push(
				event_manager.subscribe('active_component', fn_active_component)
			)
			function fn_active_component(actived_component) {
				render_component_info(self, actived_component)
			}
		// deactivate_component
			self.events_tokens.push(
				event_manager.subscribe('deactivate_component', fn_update_section_info)
			)

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


