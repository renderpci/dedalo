/*global */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {
		render_inspector,
		render_section_info,
		render_component_info,
		update_project_container_body
	} from './render_inspector.js'
	// import * as instances from '../../common/js/instances.js'



/**
* INSPECTOR
*/
export const inspector = function() {

	return true
}//end inspector



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
	self.node			= null
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
		// activate_component (when user focus it in DOM)
			self.events_tokens.push(
				event_manager.subscribe('activate_component', fn_activate_component)
			)
			function fn_activate_component(actived_component) {
				render_component_info(self, actived_component)
			}
		// deactivate_component
			self.events_tokens.push(
				event_manager.subscribe('deactivate_component', fn_update_section_info)
			)
		// render_component_filter (published by render_edit_section_record)
			self.events_tokens.push(
				event_manager.subscribe('render_component_filter_' + self.section_tipo, fn_render_filter)
			)
			async function fn_render_filter(filter_instance) {
				// fix rendered node
				self.component_filter_node = await filter_instance.render()
				// update project_container_body if it is already defined (pagination cases)
				if (self.project_container_body) {
					update_project_container_body(self)
				}
			}

	// status update
		self.status = 'initiated'


	return true
}//end init



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
		self.status = 'built'

	return true
}//end build


