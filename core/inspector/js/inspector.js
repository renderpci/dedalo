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

	// safe init double control. To detect duplicated events cases
		if (typeof this.is_init!=='undefined') {
			console.error('Duplicated init for element:', this);
			if(SHOW_DEBUG===true) {
				alert('Duplicated init element');
			}
			return false
		}
		this.is_init = true

	// status update
		self.status = 'initializing'

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

	// fix active service_time_machine
	self.service_time_machine

	// events

		// render_ section
			const render_handler = () => {
				dd_request_idle_callback(
					() => update_section_info(self)
				)
			}
			self.events_tokens.push(
				event_manager.subscribe('render_' + self.caller.id, render_handler)
			)

		// activate_component (when user focus it in DOM)
			const activate_component_handler = (actived_component) => {

				self.actived_component = actived_component
				// selection info. Display current selected component label as 'Description'
				self.selection_info_node.update_label(actived_component)
				// component_info. Render tipo, model, translatable, etc.
				render_component_info(self, actived_component)
				// component_history. Load component history changes list
				dd_request_idle_callback(
					() => load_component_history(self, self.actived_component)
				)
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
									url = DEDALO_CORE_URL + '/ontology/v5/dd_edit.php?terminoID=' + tipo
									break;
								case 'local_ontology_search':
									url = DEDALO_CORE_URL + `/ontology/v5/trigger.dd.php?modo=tesauro_edit&terminoID=${tipo}&accion=searchTSform`
									break;
								case 'master_ontology':
									url = 'https://master.dedalo.dev/dedalo/core/ontology/v5/dd_edit.php?terminoID=' + tipo
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
			self.events_tokens.push(
				event_manager.subscribe('activate_component', activate_component_handler)
			)

		// save. When selected component is saved, update component_history, time_machine_list and activity_info
			const save_handler = (options) => {
				const instance = options.instance
				if (self.actived_component && self.actived_component.id===instance.id) {
					// component_history update changes list if saved is current selected
					dd_request_idle_callback(
						() => load_component_history(self, self.actived_component)
					)
				}
				// time_machine_list update info on every component save
				dd_request_idle_callback(
					() => load_time_machine_list(self)
				)

				// activity_info. render notification bubbles on every component save action
				load_activity_info(self, options)
			}
			self.events_tokens.push(
				event_manager.subscribe('save', save_handler)
			)

		// deactivate_component
			const deactivate_component_handler = () => {
				// note that transition between activate a component after deactivate other
				// is not the desired scenario to update section info. Because this, we wait a while
				// and check if is active some component before fire update_section_info
				setTimeout(function(){
					if (!page_globals.component_active) {
						dd_request_idle_callback(
							() => update_section_info(self)
						)
					}
				}, 250)
			}
			self.events_tokens.push(
				event_manager.subscribe('deactivate_component', deactivate_component_handler)
			)

		// render_component_filter_ (published by render_edit_section_record)
			const render_component_filter_handler = async (filter_instance) => {
				// fix rendered node
				self.component_filter_node = await filter_instance.render()
				// update project_container_body if it is already defined (pagination cases)
				if (self.project_container_body) {
					update_project_container_body(self)
				}
			}
			self.events_tokens.push(
				event_manager.subscribe('render_component_filter_' + self.section_tipo, render_component_filter_handler)
			)

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



/**
* UPDATE_SECTION_INFO
* Updates section information in inspector
* Fired by render_handler and deactivate_component_handler
* @return void
*/
const update_section_info = (self) => {

	// section is inspector caller
	const section = self.caller

	// reset actived_component
	self.actived_component = null

	// update section info
	render_section_info(self)

	// time_machine_list load info
	dd_request_idle_callback(
		() => load_time_machine_list(self)
	)

	// component_history remove content id exists
	dd_request_idle_callback(
		() => load_component_history(self, null)
	)

	// selection info. Display current selected component label as 'Description'
	self.selection_info_node.update_label(section)

	// section_id (updates section id value in inspector paginator if changes)
	if (section.section_id!==self.paginator_container.section_id.innerHTML) {
		self.paginator_container.section_id.innerHTML = section.section_id ?? '';
	}
}//end update_section_info



// @license-end
