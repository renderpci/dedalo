/*global */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {common} from '../../common/js/common.js'
	import {
		render_inspector,
		render_section_info,
		load_time_machine_list,
		load_component_history,
		load_activity_info,
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

	self.id								= 'inspector_' + options.section_tipo
	self.model							= 'inspector'
	self.section_tipo					= options.section_tipo
	self.section_id						= options.section_id
	self.mode							= 'edit'
	self.node							= null
	self.caller							= options.caller

	self.actived_component				= null

	self.events_tokens					= []
	self.ar_instances					= []

	// nodes
	self.paginator_container			= null
	self.element_info_container			= null
	self.component_history_container	= null

	// events
		// render_ section
			self.events_tokens.push(
				event_manager.subscribe('render_' + self.caller.id, fn_update_section_info)
			)
			function fn_update_section_info() {
				self.actived_component = null
				render_section_info(self)
				// time_machine_list load info
				load_time_machine_list(self)
				// component_history remove content id exists
				load_component_history(self, null)
			}
		// activate_component (when user focus it in DOM)
			self.events_tokens.push(
				event_manager.subscribe('activate_component', fn_activate_component)
			)
			function fn_activate_component(actived_component) {
				self.actived_component = actived_component
				// component_history load history changes list
				load_component_history(self, actived_component)
			}
		// save. When selected component is saved, update component_history, time_machine_list and activity_info
			self.events_tokens.push(
				event_manager.subscribe('save', fn_save_component)
			)
			function fn_save_component(options) {
				const instance = options.instance
				if (self.actived_component && self.actived_component.id===instance.id) {
					// component_history update changes list if saved is current selected
					load_component_history(self, self.actived_component)
				}
				// time_machine_list update info on every component save
				load_time_machine_list(self)
				// activity_info. render notification bubbles on every component save action
				load_activity_info(self, options)
			}
		// deactivate_component
			self.events_tokens.push(
				event_manager.subscribe('deactivate_component', fn_update_section_info)
			)
		// render_component_filter_ (published by render_edit_section_record)
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
