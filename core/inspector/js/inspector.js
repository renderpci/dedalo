// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global */
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {common} from '../../common/js/common.js'
	import {
		render_inspector,
		render_section_info,
		render_component_info,
		load_time_machine_list,
		load_component_history,
		load_activity_info,
		update_project_container_body,
		open_ontology_window
	} from './render_inspector.js'



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
	self.mode							= 'edit'
	self.node							= null
	self.caller							= options.caller // section instance

	self.actived_component				= null

	self.events_tokens					= []
	self.ar_instances					= []

	// nodes
	self.paginator_container			= null
	self.element_info_container			= null
	self.component_history_container	= null

	self.last_docu_type = null

	// events
		// render_ section
			const fn_update_section_info = () => {
				// section is inspector caller
				const section = self.caller
				// reset actived_component
				self.actived_component = null
				// update section info
				render_section_info(self)
				// time_machine_list load info
				load_time_machine_list(self)
				// component_history remove content id exists
				load_component_history(self, null)
				// selection info. Display current selected component label as 'Description'
				self.selection_info_node.update_label(section)
				// section_id (updates section id value in inspector paginator if changes)
				if (section.section_id!==self.paginator_container.section_id.innerHTML) {
					self.paginator_container.section_id.innerHTML = section.section_id ?? '';
				}
			}
			const render_handler = () => {
				dd_request_idle_callback(fn_update_section_info)
			}
			self.events_tokens.push(
				event_manager.subscribe('render_' + self.caller.id, render_handler)
			)
		// activate_component (when user focus it in DOM)
			self.events_tokens.push(
				event_manager.subscribe('activate_component', fn_activate_component)
			)
			function fn_activate_component(actived_component) {
				self.actived_component = actived_component
				// selection info. Display current selected component label as 'Description'
				self.selection_info_node.update_label(actived_component)
				// component_info. Render tipo, model, translatable, etc.
				render_component_info(self, actived_component)
				// component_history. Load component history changes list
				load_component_history(self, actived_component)
				// open ontology window if already open to preserve component selected coherence
				if(SHOW_DEVELOPER===true) {
					setTimeout(function(){
						if (window.docu_window && !window.docu_window.closed) {
							const tipo	= actived_component.tipo
							let url		= null
							switch (self.last_docu_type) {
								case 'docu_link': // web dedalo/ontology
									url = 'https://dedalo.dev/ontology/' + tipo + '?lang=' + page_globals.dedalo_application_lang
									break;
								case 'local_ontology':
									url = DEDALO_CORE_URL + '/ontology/dd_edit.php?terminoID=' + tipo
									break;
								case 'local_ontology_search':
									url = DEDALO_CORE_URL + `/ontology/trigger.dd.php?modo=tesauro_edit&terminoID=${tipo}&accion=searchTSform`
									break;
								case 'master_ontology':
									url = 'https://master.render.es/dedalo/lib/dedalo/ontology/dd_edit.php?terminoID=' + tipo
									break;
							}
							if (url) {
								open_ontology_window(
									self,
									url,
									self.last_docu_type,
									false // focus bool
								)
							}
						}
					}, 1)
				}
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
		self.status = 'initialized'


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



// @license-end
