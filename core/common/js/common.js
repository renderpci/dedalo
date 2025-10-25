// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global SHOW_DEBUG, Promise, DEDALO_ROOT_WEB, JsonView, get_label, SHOW_DEVELOPER, Promise */
/*eslint no-undef: "error"*/



// imports
	import {clone} from '../../common/js/utils/index.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {data_manager} from '../../common/js/data_manager.js'
	import {delete_instance} from '../../common/js/instances.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {get_inserted_rules} from '../../page/js/css.js'
	import {render_relogin} from '../../login/js/render_login.js'
	import {render_server_response_error, render_stream} from '../../common/js/render_common.js'



/**
* COMMON
*/
export const common = function(){

	return true
}//end common



/**
* INIT
* @param object options
* Generic agnostic init function created to preserve calls unity.
* (!) For components, remember to use always common.init()
* @return bool true
*/
common.prototype.init = async function(options) {

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

	// instance key used vars
		self.model			= options.model // structure model like 'component_input_text'
		self.tipo			= options.tipo // structure tipo of current component like 'dd345'
		self.section_tipo	= options.section_tipo // structure tipo like 'oh1'
		self.section_id		= options.section_id // record section_id like 1
		self.mode			= options.mode // current component mode like 'edit'
		self.lang			= options.lang // current component lang like 'lg-nolan'

	// type
		self.type 			= options.type

	// optional vars
		self.context		= options.context	|| null // structure context of current component (include properties, tools, etc.)
		self.data			= options.data		|| null // current specific data of this component
		self.datum			= options.datum		|| null // global data including dependent data (used in portals, etc.)

	// rqo - optional, used to define specific rqo for the instance, used in dd_grid (every dd_grind is loaded with specific rqo)
		self.rqo			= options.rqo

	// properties
		self.properties		= options.properties

	// var containers
		self.events_tokens	= [] // array of events of current component
		self.ar_instances	= [] // array of children instances of current instance (used for autocomplete, etc.)

	// DOM
		self.node			= null // component node place in light DOM

	// view
		self.view			= options.view

	// render_level
		self.render_level	= null

	// caller pointer
		self.caller			= options.caller

	// standalone
		self.standalone		= options.standalone ?? true


	// status update
		self.status = 'initialized'


	return true
}//end common.prototype.init



/**
* BUILD
* Generic agnostic build function created to maintain
* unity of calls.
* (!) For components, remember use always component_common.build()
* @param bool autoload = false
* @return bool
*/
common.prototype.build = async function(autoload=false) {

	const self = this

	// status update
		self.status = 'building'

	// status update
		self.status = 'built'


	return true
}//end common.prototype.build



/**
* SET_CONTEXT_VARS
* Set getters and setter to access context properties
* type, label, tools, fields_separator, permissions
* @return bool true
*/
export const set_context_vars = function(self) {

	if (self.context) {
		self.type			= self.context.type // typology of current instance, usually 'component'
		self.label			= self.context.label // label of current component like 'summary'
		self.tools			= self.context.tools || [] //set the tools of the component
		// self.permissions	= self.context.permissions || 0

		// view. Swaps the value with the context value and makes it a getter/setter of the context value
		// this allow sync self.view and self.context.view after building the instance
			self.view = self.context.view || self.view
			Object.defineProperty(self, 'view', {
				get : function() {
					return self.context.view
						? self.context.view
						: null
				},
				set : function(value) {
					self.context.view = value;
				}
			});

		// properties. Swaps the value with the context value and makes it a getter/setter of the context value
		// this allow sync self.properties and self.context.properties after building the instance
			self.properties = self.context.properties || self.properties
			Object.defineProperty(self, 'properties', {
				get : function() {
					return self.context.properties
						? self.context.properties
						: null
				},
				set : function(value) {
					self.context.properties = value;
				}
			});

			self.permissions = self.context.permissions || self.permissions
			Object.defineProperty(self, 'permissions', {
				get : function() {
					return self.context.permissions
						? self.context.permissions
						: 0
					// return self.context.view || self.view;
				},
				set : function(value) {
					self.context.permissions = value
				}
			});

		// show_interface. object . Defines useful view custom properties to take control
		// of some common component behaviors
		// if show_interface is defined in properties used the definition, else use this default
			const default_show_interface = {
				read_only						: false, // bool false
				save_animation					: true, // bool true
				// buttons_container			: true, // bool false
				value_buttons					: true,  // bool true
				button_add						: true, // bool true (on get_buttons function)
				button_delete					: true, // bool true (trash can)
				button_delete_link				: true, // bool true (modal option to remove portal link only)
				button_delete_link_and_record	: true, // bool true (modal option to remove portal link and his target record)
				button_link						: true, // bool true (portal button to link with another sections)
				button_edit						: false, // bool false. (ex. component_select User profile (dd1725) inside value)
				button_list						: true, // bool true (ex. component_radio_button: to go to target section)
				button_edit_options				: {
					action_mousedown	: 'navigate', // string navigate|open_window (name of function to exec)
					action_contextmenu	: 'open_window' // string open_window (name of function to exec)
				},
				tools							: true, // bool true
				button_external					: false, // bool false
				button_tree						: false, // bool false
				button_fullscreen				: true, // bool false
				button_save						: true, // bool true (used by component_geolocation, text_area...)
				show_autocomplete				: true, // bool true
				show_section_id					: true, // bool true
				list_from_component_data 		: true, // bool true
				label 							: true // bool true
			}
			// set the instance show_interface
			self.show_interface = (!self.context.properties?.show_interface && !self.request_config_object?.show?.interface)
				? default_show_interface
				: (()=>{
					const new_show_interface = (self.context.properties.show_interface)
						? self.context.properties.show_interface
						: self.request_config_object.show.interface
					// add missing keys
					for (const [key, value] of Object.entries(default_show_interface)) {
						if (new_show_interface[key]===undefined) {
							new_show_interface[key] = value
						}
					}

					return new_show_interface
				  })()

		// getters
			// const ar_getters = [
			// 	'type',
			// 	'label',
			// 	'tools',
			// 	'permissions',
			// 	'view'
			// ]
			// const ar_getters_length = ar_getters.length
			// for (let i = 0; i < ar_getters_length; i++) {
			// 	const name = ar_getters[i]
			// 	// if (self[name]) {
			// 	// 	// console.warn('ignored already set context getter assign:', name, self.status, self.model);
			// 	// 	continue;
			// 	// }
			// 	// if (!self.hasOwnProperty(name)) {
			// 		Object.defineProperty(self, name, {
			// 			get : function() {
			// 				return self.context[name];
			// 			},
			// 			set : function(value) {
			// 				return self.context[name] = value;
			// 			}
			// 		});
			// 	// }
			// }
			// console.log('self.label:', self.label, self.model, self.context);
	}

	// rqo_test. Used to simulate component call to API to load data and context
		if (!self.hasOwnProperty('rqo_test')) {
			Object.defineProperty(self, 'rqo_test', {
				get : function() {
					return get_rqo_test(self);
				}
			});
		}


	return true
}//end set_context_vars



/**
* RENDER
* @param object options = {}
* {
*   render_level : level of deep that is rendered (full | content)
* }
* @return HTMLElement|bool node
*	node first DOM node stored in instance 'node' array
*/
common.prototype.render = async function (options={}) {
	// const t0 = performance.now()

	const self = this

	// options
		const render_mode	= options.render_mode || self.mode
		const render_level	= options.render_level || 'full'

	// api_errors case
		if (page_globals.api_errors.length) {

			// debug
			console.warn('))) render page_globals.api_errors:', self.model, page_globals.api_errors);

			// render generic response_error node
			self.node = render_server_response_error(
				page_globals.api_errors
			);

			return self.node
		}

	// context check
		if (self.type==='component' && !self.context) {
			return render_server_response_error([{
				error	: 'invalid context',
				msg		: 'Unable to render component without context',
				trace	: 'common render',
			}])
		}

	// permissions check
		const permissions = parseInt(self.permissions)
		if(parseInt(permissions)<1) {

			const label = (get_label.no_access || 'You don\'t have access here')
						+ ' [' + self.tipo + ']'
			const node = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'no_access',
				inner_html		: label
			})
			self.node = node

			return node
		}

	// status check to prevent duplicated actions
		switch(self.status) {

			case 'built':
				// all is as expected. Continue executing normally
				break;

			case 'rendering':
				console.warn(`Render in progress ignored for ${self.model}. Status: rendering.`);
				return false;

			case 'rendered':
				// if render mode is equal than current already rendered node, return node
				if (self.render_level===render_level) {
					if (self.node) {
						if (self.model!=='component_filter') {
							console.warn(`Render unexpected status. Returning already rendered node (${self.model}).
							Expected status is 'built' but current is: '${clone(self.status)}'`, render_level, self.model, self.id);
						}
						return self.node
					}else{
						console.warn(`Render unexpected status. Rendered node not found but status is rendered:`, self.node, self.id);
						return false
					}
				}
				break;

			default:
				if (self.render_level===render_level) {
					// event_manager.subscribe('built_'+self.id, self.render.edit(options))
					console.warn(`Render illegal status '${self.status}'. Returning 'false'. Expected 'built' current is:`, clone(self.status), render_level, self.model, self.id);
					return false
				}
				break;
		}//end switch status

	// status update
		self.status = 'rendering'

	// fix current render level
		self.render_level = render_level

	// self data verification before render
		//if (typeof self.data==="undefined") {
		//	console.warn("self.data is undefined !! Using default empty value for render");
		//	self.data = {
		//		value : []
		//	}
		//}
		//console.log("typeof self[render_mode]:",typeof self[render_mode], self.model);

	// render mode. Method name is element node like 'edit' or 'list'. If not exists, fallback to 'list'
		const current_render_mode = (typeof self[render_mode]==='function')
			? render_mode
			: 'list'

		// warning when fallback render mode
			if (current_render_mode!==render_mode) {
				console.warn(`Invalid render_mode '${render_mode}', falling back to 'list'.`);
			}

		// render options
			const render_options = Object.assign({
				render_level	: render_level,
				render_mode		: render_mode
			}, options)

		// render function handler check
			if (typeof self[current_render_mode]!=='function') {
				console.warn(`Render function not defined: ${current_render_mode}`);
				return false;
			}

		const node = await self[current_render_mode](render_options);

	// result_node render based in render_level
		const result_node = await (async () => {

			// render_level
			switch(render_level) {

				case 'content': {

					// replace instance content_data node
						const wrapper = self.node

					// current instance content_data node
						const old_content_data_node	= wrapper?.content_data

						// warning if not found
						if (!old_content_data_node) {

							console.error("Invalid content_data pointer node found in render ("+self.model+") :", typeof old_content_data_node, old_content_data_node, self);

							// new warning content_data node is added
								const label = 'Invalid content_data DOM node [' + self.tipo + ']'
								const new_content_data_node = ui.create_dom_element({
									element_type	: 'div',
									class_name		: 'no_access',
									inner_html		: label
								})
								requestAnimationFrame(()=>{
									self.node.appendChild(new_content_data_node)
								})
								// set pointers
								self.node.content_data = new_content_data_node

							return self.node
						}

					// new content data node
						const new_content_data_node = node
							? node // use already calculated node
							: await self[render_mode](render_options);

					// replace
						old_content_data_node.replaceWith(new_content_data_node);
						// set pointers. Update the wrapper pointer to the new content_data node
						self.node.content_data = new_content_data_node

					// return created node (content_data)
					return self.node
				}

				case 'full':
				default:

					// set
						// replaces DOM node if the node exist,
						// ex: when it's called by event that need change data in component (update_data event)
						// and the component need to be rendered in full as in list mode
						if(self.node && node) {
							// DES
								// const parent = self.node.parentNode
								// if (!parent) {
								// 	console.warn('++++++++++++++ NO parent found for self.node:', self.node, ' render_level:', render_level);
								// 	console.warn('++++++++++++++ NO parent found for self:', self);
								// }else{
								// 	// replace
								// 	// parent.replaceChild(
								// 	// 	node, // new node
								// 	// 	self.node // old node
								// 	// )
								// 	self.node.replaceWith(node);
								// }
							if (self.node.nodeType !== Node.ELEMENT_NODE) {
								// console.log('self.node:', self.node);
								// console.log('self.node.nodeType:', self.node.nodeType);
								// console.log('node:', node);
								console.warn('Ignored node replacement for: non ELEMENT_NODE', self.node, 'nodeType:', self.node.nodeType);
							}else{
								self.node.replaceWith(node);
							}
						}
						// set pointers. Update instance node pointer
						self.node = node

					// return the new created node
					return node
			}//end switch(render_level)
		})()//end result_node fn

	// status update
		self.status = 'rendered'

	// event publish
		event_manager.publish('render_'+self.id, result_node)

	// activate_tooltips
		if (self.mode === 'edit') {
			dd_request_idle_callback(
				() => {
					ui.activate_tooltips(result_node)
				}
			)
		}

	// debug
		if(typeof SHOW_DEBUG!=='undefined' && SHOW_DEBUG===true) {
			// const total = (performance.now()-t0).toFixed(3)

			// if (self.model==='section') {
			// 	dd_console(`__Time [common.render] to render section: ${total} ms`,'DEBUG')
			// }else{
			// 	const msg = `__Time [common.render] to render model: ${self.model}, tipo: ${self.tipo}, section_tipo: ${self.section_tipo}, total (ms): `
			// 	if (total>100) {
			// 		console.log(msg, total, self);
			// 	}else{
			// 		// console.log(msg, total);
			// 	}
			// }
		}


	return result_node
}//end render



/**
* REFRESH
* Destroy current instance dependencies and build and render again
* (!) Events subscription: Note that events subscription in the build moment, could be duplicated when refresh is done
* @param object options = {}
* @return promise
* 	resolve bool true
*/
common.prototype.refresh = async function(options={}) {
	// const t0 = performance.now()

	const self = this

	// options
		const build_autoload		= options.build_autoload ?? true
		const render_level			= options.render_level ?? 'content' // string full|content
		const destroy				= options.destroy ?? true
		const refresh_id_base_lang	= options.refresh_id_base_lang ?? false
		const tmp_api_response		= options.tmp_api_response ?? null

	// loading css add
		// const nodes_lenght = self.node.length
		// for (let i = nodes_lenght - 1; i >= 0; i--) {
		// 	self.node[i].classList.add('loading')
		// }

	// destroy (dependencies only)
		if (self.status!=='rendered') {
			console.warn("/// destroyed fail (expected status 'rendered') with actual status:", self.model, self.status);
			return false
		}
		// Note: this action takes a insignificant amount of time (0 to 3 ms),
		// it is worth waiting until it is finished to make sure to destroy events safely
		if (destroy===true) {
			await self.destroy(
				false, // bool delete_self
				true, // bool delete_dependencies
				false // bool remove_dom
			)
		}

	// debug
		if(SHOW_DEBUG===true) {
			// console.group("Refresh "+self.model +" "+ (self.tipo ? self.tipo : '') );
			// console.log("+ Time to destroy:", self.model, performance.now()-t0);
			// var t1 = performance.now()
		}

	// tmp_api_response
	// use a injected api_response instead re-call to API when autoload is set to true
	// some cases the actions will get the datum of the component as save new data
	// in those cases inject the api_response into the component to re-use it.
		if(build_autoload && tmp_api_response){
			self.tmp_api_response = tmp_api_response
		}

	// build. Update the instance with new data
		//if (self.status==='destroyed') {
		await self.build( build_autoload ) // default value is true
		//}else{
		//	console.warn("/// build fail with status:", self.model, self.status);
		//	return false
		//}

	// tmp_api_response. Important!
	// delete the tmp_api_response to return to normal build (calling to API)
		if(self.tmp_api_response){
			delete self.tmp_api_response
		}

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("+ Time to build [inside common.refresh]:", self.model, performance.now()-t1);
			// var t2 = performance.now()
		}

	// Render. Only render content_data, not the whole element wrapper
		let result
		if (self.status==='built') {
			await self.render({
				render_level : render_level // Note that default value is 'content'
			})
			if (self.paginator) {
				self.paginator.refresh()
			}
			result = true
		}else{
			console.warn(`[common.refresh] Ignored render '${self.model}' (expected status 'built') with status:`, self.status);
			result = false
		}

	// loading css remove class
		// for (let i = nodes_lenght - 1; i >= 0; i--) {
		// 	self.node[i].classList.remove('loading')
		// }

	// event sync_data_ . Used to update the DOM elements of the instance
	// refresh_id_base_lang. On true, force to refresh components with same 'id_base_lang'
	// @see render_tool_upload.upload_done
		if (refresh_id_base_lang===true) {
			const id_base_lang = self.id_base + '_' + self.lang
			event_manager.publish('sync_data_'+id_base_lang, {
				caller			: self,
				changed_data	: null
			})
		}

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("+ Time to render:", self.model, performance.now()-t2);
			// console.log("+ Time to full refresh:", self.model, performance.now()-t0);
			// console.log("%c+ Time to full refresh:" +" "+ self.model + " " + (performance.now()-t0), "color:#d2f115");
			// console.groupEnd();
		}


	return result
}//end refresh



/**
* DESTROY
* Delete all dependent instances of the section and all events that was created by the instances,
* but does not remove the section instance itself.
* @param bool delete_self = true
* 	On true, Delete self instance events, paginator, services, inspector, filter and instance
* @param bool delete_dependencies = false
* 	On true, Call to destroy all associated instances (ar_instances)
* @param bool remove_dom = false
* 	On true, removes the instance DOM node
* @return object result
*/
common.prototype.destroy = async function(delete_self=true, delete_dependencies=false, remove_dom=false) {

	const self		= this
	const result	= {}

	// delete_dependencies. Destroy all associated instances
		if(delete_dependencies===true) {
			result.delete_dependencies = await do_delete_dependencies(self)
		}

	// delete_self. Destroy self instance
		if(delete_self===true) {
			result.delete_self = await do_delete_self(self)
		}

	// remove_dom. Remove element main DOM node (optional)
		if (remove_dom===true) {
			if(self.node && (self.node.nodeType===Node.ELEMENT_NODE || self.node.nodeType===Node.TEXT_NODE)) {
				// remove DOM node if exists (wrapper)
				try {
					self.node.remove()
				} catch (error) {
					console.error('Error removing node of type: ' + self.node.nodeType, error)
				}
			}
			// reset instance node property value
			self.node = null
		}

	// event publish
		event_manager.publish('destroy_'+self.id)

	// status update
		self.status = 'destroyed'


	return result
}//end destroy



/**
* DO_DELETE_SELF
* Exec the self instance deletion taking into account
* paginator, services, inspector and filter
* @return int
* 	delete_instance from instances returns int 'deleted'
*/
const do_delete_self = async function (self) {

	// delete events. Delete the instance registered events
		const events_tokens	= self.events_tokens || []
		// remove all subscriptions
		const events_tokens_length = events_tokens.length
		for (let i = events_tokens_length - 1; i >= 0; i--) {
			const unsubscribed = event_manager.unsubscribe(events_tokens[i])
			if (unsubscribed) {
				events_tokens.splice(i, 1)
			}
		}

	// destroy paginator
		if(self.paginator){
			await self.paginator.destroy(
				true, // delete_self
				true, // delete_dependencies
				false // remove_dom
			)
			delete self.paginator
		}

	// destroy services
		if (self.services) {
			const services_length = self.services.length
			for (let i = services_length - 1; i >= 0; i--) {
				if(SHOW_DEBUG===true) {
					console.log('removing services:', i, services_length);
				}
				if (typeof self.services[i].destroy==='function') {
					await self.services[i].destroy(
						true, // delete_self
						true, // delete_dependencies
						false // remove_dom
					)
				}
				delete self.services[i]
			}
		}

	// destroy inspector
		if (self.inspector) {
			await self.inspector.destroy(
				true, // delete_self
				true, // delete_dependencies
				false // remove_dom
			)
			delete self.inspector
		}

	// destroy filter
		if (self.filter) {
			await self.filter.destroy(
				true, // delete_self
				true, // delete_dependencies
				false // remove_dom
			)
			delete self.filter
		}

	// Delete instance from global instances register.
	// self.id is equivalent to the intances_map key
	const result = delete_instance( self.id )

	// delete caller instance reference (ar_instances)
		if (self.caller?.ar_instances) {
			const ar_instances_length = self.caller.ar_instances.length
			for (let i = ar_instances_length - 1; i >= 0; i--) {
				const item = self.caller.ar_instances[i]
				if (item.id===self.id) {
					self.caller.ar_instances.splice(i, 1)
					// if(SHOW_DEBUG===true) {
					// 	console.log('))))) deleted caller instance reference:', self.caller.model, self.id);
					// }
					break;
				}
			}
		}


	return result
}//end do_delete_self



/**
* DO_DELETE_DEPENDENCIES
* Remove instance dependencies added in the array 'self.ar_instances'
* @param object self - Element instance
* @return {Promise<boolean>}
* 	`true` if every instance was removed, otherwise `false`.
*/
const do_delete_dependencies = async function (self) {

	// Guard against missing array
	if (!Array.isArray(self.ar_instances)) {
		console.error("Undefined or invalid self.ar_instances:", self);
		return false;
	}

	// remove instances from self ar_instances
		const ar_instances_length = self.ar_instances.length
		for (let i = ar_instances_length - 1; i >= 0; i--) {

			const current_instance = self.ar_instances[i]

			// Skip non‑existing or non‑destroyable instances
			if (!current_instance || current_instance.destroyable === false) {
				continue;
			}

			// destroy instance
			if (typeof current_instance.destroy==='function') {
				try {

					const current_result = await current_instance.destroy(
						true, // delete_self
						true, // delete_dependencies
						false // remove_dom
					);

					self.ar_instances.splice(i, 1); // remove after successful destroy

					if(SHOW_DEBUG===true) {
						console.log('instance to destroy:', current_instance);
					}
				} catch (err) {
					console.error("Error destroying instance:", err, current_instance);
				}
			}else{
				console.error("Ignored instance without 'destroy' method:", self, current_instance);
				console.warn("self.ar_instances:",self.ar_instances);
			}
		}

	// All instances removed? Returns true if self.ar_instances.length is 0.
	const result = self.ar_instances.length === 0;


	return result
}//end do_delete_dependencies



/**
* CREATE_SOURCE
* @param object self
* 	Element instance (component, section, etc.)
* @return object source
* 	sample
* {
* 	typo			: 'source',
* 	type			: 'component',
* 	action			: 'read',
* 	model			: 'component_text_area',
* 	tipo			: 'rsc17',
* 	section_tipo	: 'rs167',
* 	section_id		: '5',
* 	mode			: 'edit',
* 	lang			: 'lg-eng'
* }
*/
export const create_source = function (self, action) {

	// ddo source
		const source = { // source object
			typo			: 'source',
			type			: self.type,
			action			: action,
			model			: self.model,
			tipo			: self.tipo,
			section_tipo	: self.section_tipo || self.tipo,
			section_id		: self.section_id,
			mode			: self.mode,
			view			: get_view(self), // self.view || self.context?.view || null, // 'default',
			lang			: self.lang
		}

	// add the properties defined by the component instance to be parsed
	// used by component_relation_model to add ar_target_section_tipo into the source to build the read API call.
		if(self.source_add){
			// get all properties defined by component instance
			const add_source_keys = Object.keys(self.source_add)
			const source_keys_len = add_source_keys.length
			for (let i = 0; i < source_keys_len; i++) {
				// assign instance properties to source object.
				source[add_source_keys[i]] = self.source_add[add_source_keys[i]]
			}
		}


	// matrix_id optional (used in time machine mode)
		if (true===self.hasOwnProperty('matrix_id') && self.matrix_id) {
			source.matrix_id = self.matrix_id
		}

	// data_source optional (used in time machine mode). data_source='tm'
		// if (self.context && true===self.context.hasOwnProperty('data_source') && self.context.data_source) {
		if (self.data_source) {
			source.data_source = self.data_source
		}

	// caller_dataframe
		if(self.model==='component_dataframe'){
			source.caller_dataframe = self.caller_dataframe
				? self.caller_dataframe
				: {
					main_component_tipo	: self.caller?.tipo || null,
					section_tipo		: self.section_tipo,
					section_id			: self.section_id,
					section_id_key		: self.data.section_id_key,
					section_tipo_key	: self.data.section_tipo_key
				}
		}


	// properties
		if (self.properties) {
			source.properties = self.properties
		}


	return source
}//end create_source



/**
* GET_VIEW
* Normalized get view from element with context fallback
* @param object self
* @return string|null view
*/
const get_view = function(self) {

	const view = self.view || self.context?.view || null

	return view
}//end get_view



/**
* GET_RQO_TEST
* Build a basic rqo of the component for test and debug purposes.
* It could be copy and paste in the Area Development Playground environment
* Set as a getter during the element build process
* @param object self
* @return object rqo
*/
const get_rqo_test = function(self) {

	const source = create_source(self, 'get_data')

	const rqo = {
		action	: 'read',
		source	: source
	}

	return rqo
}//end get_rqo_test



/**
* LOAD_STYLE
* @param string src
* @return promise
* 	resolve/reject src
*/
common.prototype.load_style = function (src) {

	return new Promise(function(resolve, reject) {

		// check already loaded
			const links 	= document.getElementsByTagName('link');
			const links_len = links.length
			for (let i = links_len - 1; i >= 0; i--) {
				if(links[i].getAttribute('href')===src) {
					resolve(src)
					return
				}
			}

		// DOM tag
			const element 	  = document.createElement('link')
				  element.rel = 'stylesheet'

			element.addEventListener('load', function(e) {
				resolve(src);
			})

			element.addEventListener('error', function(e) {
				reject(src);
			})

			element.href = src

			document.getElementsByTagName('head')[0].appendChild(element)
	})
	.catch(err => { console.error(err) });
}//end load_style



/**
* LOAD_SCRIPT
* @param string src
* @return promise
* 	resolve/reject src
*/
common.prototype.load_script = async function(src, content=null) {

	return new Promise(function(resolve, reject) {

		// check already loaded
			const scripts 	  = document.getElementsByTagName('script');
			const scripts_len = scripts.length
			for (let i = scripts_len - 1; i >= 0; i--) {
				if(scripts[i].getAttribute('src')===src) {
					resolve(src)
					return
				}
			}

		// DOM tag
			const element = document.createElement('script')
			element.setAttribute('defer', 'defer');

			if(content) {
				element.innerHTML = content
			}

			element.addEventListener('load', function(e) {
				resolve(src);
			})

			element.addEventListener('error', function(e) {
				reject(src);
			})

			element.src = src

			document.head.appendChild(element)
	})
	.catch(err => { console.error(err) });
}//end load_script



/**
* GET_COLUMNS
* Resolve the paths into the request_config_object with all dependencies (portal into portals, portals into sections, etc)
* and create the columns to be render by the section or portals
* @return array ar_columns the the specific columns to render into the list, with inverse path format.
*/
	// common.prototype.get_columns_DES = async function(){

	// 	const self = this

	// 	const full_ddo_map = []

	// 	// // get ddo_map from the request_config_object.show, self can be a section or component_portal, and both has request_config_object
	// 	const ddo_map = self.request_config_object.show.ddo_map
	// 	console.log("self:",self.context);
	// 	// get the sub elements with the ddo_map, the method is recursive,
	// 	// it get only the items that don't has relations and is possible get values (component_input_text, component_text_area, compomnent_select, etc )
	// 	const sub_ddo_map = get_sub_ddo_map(self.datum, self.tipo, ddo_map, [])

	// 	full_ddo_map.push(...sub_ddo_map)

	// 	const ar_columns = get_ar_inverted_paths(full_ddo_map)

	// 	return ar_columns
	// }//end get_columns



/**
* GET_COLUMNS
* Resolve the paths into the request_config_object with all dependencies (portal into portals, portals into sections, etc)
* and create the columns to be rendered by the section or portals
* @param object options
* {
* 	context : object instance.context,
* 	datum_context : object instance.datum.context,
* 	ddo_map_sequence : array ['show']
* }
* context:
* 	instance (component, service, etc.) context
* datum_context:
* 	optional parameter send by section, to be used to find the sort-able ddo.
* ddo_map_sequence:
* 	optional parameter to define ddo_map property fallback order
* @see section_record.get_ar_columns_instances_list for a better overview
* @return array columns_map
* 	The the specific columns to render into the list.
*/
export const get_columns_map = function(options) {

	// options
		const context			= options.context
		const datum_context		= options.datum_context
		const ddo_map_sequence	= options.ddo_map_sequence
			? options.ddo_map_sequence // service_autocomplete gives this value as [choose,search,show]
			: context.mode==='search'
				? ['search','show'] // normally portals in search mode
				: ['show'] // default value

	const columns_map = []

	// tipo
		const tipo				= context.tipo
	// request_config. get the request_config with all ddo to use in the columns
		const request_config	= context.request_config || []
	// source_columns_map.  Get the columns_maps defined in the properties and assigned in context in the server or by the client.
		// the columns_maps become as structure to complete with the request_config
		// by default the columns are for every component that has direct link to the component(portal) or section
		// if the portal has more component in deep, it can define as columns in the properties,
		// but by default, the portal will be only one column (with all components joined in the cell).
		const source_columns_map = context.columns_map || []
	// view
		const view			= context.view
		const children_view	= context.children_view || null

	// storage of all ddo_map in flat array, without hierarchy, to find the components easily.
		const full_ddo_map = []
	// set itself as ddo
		full_ddo_map.push(context)

	// ddo_map_sequence. calculate length once
		const ddo_map_sequence_length = ddo_map_sequence.length

	// request_config could be multiple (Dédalo, Zenon, etc), all columns need to be compatible to create
	// the final grid.
		const request_config_length	= request_config.length
		for (let i = 0; i < request_config_length; i++) {

			const request_config_item = request_config[i]

			// ddo_map. Get the ddo map to be used.
			// @see section_record.get_ar_columns_instances_list for a better overview

				// Reference legacy sequence < 30-05-2024
				// const ddo_map = (context.mode !== 'search')
				// 	? request_config_item.show.ddo_map
				// 	: request_config_item.choose && request_config_item.choose.ddo_map && request_config_item.choose.ddo_map.length > 0
				// 		? request_config_item.choose.ddo_map
				// 		: request_config_item.search && request_config_item.search.ddo_map && request_config_item.search.ddo_map.length > 0
				// 			? request_config_item.search.ddo_map
				// 			: request_config_item.show.ddo_map

				const ddo_map = (()=>{
					for (let k = 0; k < ddo_map_sequence_length; k++) {
						const el = ddo_map_sequence[k]
						if (request_config_item[el] && request_config_item[el].ddo_map && request_config_item[el].ddo_map.length > 0) {
							return request_config_item[el].ddo_map
						}
					}
					return []
				})();

			// get the direct components of the caller (component or section)
			const ar_first_level_ddo		= ddo_map.filter(item => item.parent === tipo)
			const ar_first_level_ddo_len	= ar_first_level_ddo.length

			// store the current component in the full ddo map
			full_ddo_map.push(...ddo_map)
			for (let j = 0; j < ar_first_level_ddo_len; j++) {

				const dd_object = ar_first_level_ddo[j]
				// set the view if it is defined in ontology set it else get the parent view
				dd_object.view 	= dd_object.view || children_view || view || null // 'default'

				// if the ddo has a column_id and columns_maps are defined in the properties,
				// get the column as it has defined.
				if (dd_object.column_id && source_columns_map.length > 0){

					// column_exists. If the column has stored by previous ddo, don't touch the array,
					// it's necessary to preserve the order of the columns_map
						const column_exists = columns_map.find(el => el.id === dd_object.column_id)
						if(column_exists) continue

					// check if the ddo has defined the column_id in the columns_map,
					// if not, add new column with the ddo information.
						const found	= source_columns_map.find(el => el.id===dd_object.column_id)
						const column = (found)
							? found
							: {
								id		: dd_object.tipo,
								label	: dd_object.tipo,
								model	: dd_object.model,
								tipo	: dd_object.tipo,
							  }

					// column width set
						column.width = dd_object.width || column.width || null

					dd_object.column_id = column.id
					columns_map.push(column)

				}else{
					// if the ddo don't has column_id and the column_map is not defined in properties,
					// create a new column with the ddo information or join all components in one column
					switch(true){
						// component_portal will join the components that doesn't has columns defined.
						case view && view==='line': {

							// find if the general column was created, if not create new one with the tipo
							// of the component_portal to include all components.
							const found	= columns_map.find(el => el.id===tipo)

							// if the column exist add general column to ddo information,
							// else create the general column and add the id to the component.
							if(found){

								dd_object.column_id = found.id

							}else{
								//create the general column with the tipo of the component_portal
								const column = {
									id		: tipo,
									label	: tipo,
									tipo	: tipo,
									model	: dd_object.model
								}

								columns_map.push(column)
								// set the column_id of the component with the column id
								dd_object.column_id = column.id
							}
							break;
						}
						// in the mosaic case add the in_mosaic: true or false to create the mosaic and
						// the alternative table with all ddo
						case view && view.indexOf('mosaic') !== -1 :
							dd_object.in_mosaic = dd_object.in_mosaic
								? true
								: false
							dd_object.hover 	= dd_object.hover
								? true
								: false

							columns_map.push(
								{
									id			: dd_object.tipo,
									label		: dd_object.tipo,
									in_mosaic	: dd_object.in_mosaic,
									hover		: dd_object.hover,
									tipo		: dd_object.tipo,
									model		: dd_object.model
								}
							)
							dd_object.column_id	= dd_object.tipo
							break;
						// by default every component will create the own column if the column is not defined,
						// this behavior is used by sections.
						default:
							columns_map.push(
								{
									id		: dd_object.tipo,
									label	: dd_object.tipo,
									model	: dd_object.model,
									tipo	: dd_object.tipo
								}
							)

							dd_object.column_id = dd_object.tipo
							break;
					}//end switch
				}//end if (dd_object.column_id && source_columns_map.length > 0)
			}//end for (let j = 0; j < ar_first_level_ddo_len; j++)
		}//end for (let i = 0; i < request_config_length; i++)

	// parse_columns
		// Resolve the label of the all columns recursively, columns could has sub-columns (in the columns_map properties)
		// here will be using the full_ddo_map to find the specific ddo
		function parse_columns(columns_map){

			const columns_map_len = columns_map.length
			for (let i = columns_map_len - 1; i >= 0; i--) {

				const column_item = columns_map[i]

				// all columns has a label property that point to the ddo tipo to use, finding the ddo it is possible obtain the label to use in the column.
				// when the column was built the columns will has tipo, therefore the ddo_object is possible to get from tipo in the column
					const ddo_object = full_ddo_map.find(el => el.tipo===column_item.label || el.tipo===column_item.tipo)

				// add tipo always
					column_item.tipo = ddo_object
						? ddo_object.tipo
						: column_item.label

				// add section_tipo always
					column_item.section_tipo = ddo_object
						? Array.isArray(ddo_object.section_tipo)
							? ddo_object.section_tipo[0]
							: ddo_object.section_tipo
						: null

				// sortable
					const found = datum_context
						? datum_context.find(el => el.tipo===column_item.tipo)
						: false
					column_item.sortable = found
						? found.sortable
						: false

				// model
					column_item.model = found && found.model
						? found.model
						: column_item.model || null

				// width
					column_item.width = column_item.width
						? column_item.width
						: ddo_object && ddo_object.width
							? ddo_object.width
							: null

				// path
					if (column_item.sortable===true) {
						if (!found.path) {
							console.warn('Error. Ignored column_item sortable without path', column_item, ddo_object );
							column_item.sortable = false
						}else{
							column_item.path = found.path
						}
					}

				// check if the ddo has label, if not empty label will set.
					column_item.label = (ddo_object && ddo_object.label)
						? ddo_object.label
						: column_item.label

				// if the columns has sub-columns, begin again.
					if(column_item.columns_map) {
						parse_columns(column_item.columns_map)
					}
			}
		}
		// exec parse_columns of result columns_map
		parse_columns(columns_map)


	// column component_info
		const value_with_parents = full_ddo_map.find(el => el.value_with_parents === true)
		if (value_with_parents) {
			// check if the component with parents has specific column
			// if it has columns add the column with ddinfo after the component with parents
			// else the `ddinfo` will go to the last position
			// is used to put the component_dataframe before the `ddinfo` column
			// or used when the component has more than 1 component with `ddinfo`.
			// See behavior and the ontology definition of `tch555
			const index = columns_map.findIndex(el => el.tipo === value_with_parents.tipo)
			if(index>=0){
				columns_map.splice(index+1,0,{
					id			: 'ddinfo',
					label		: 'Info'
				})
			}else{
				columns_map.push({
					id			: 'ddinfo',
					label		: 'Info'
				})
			}

		}

	// debug
		if(SHOW_DEBUG===true) {
			// console.log("full_ddo_map---------:"+self.tipo,full_ddo_map);
			// console.log("columns_map:",columns_map); // throw 'stop'
		}

	return columns_map
}//end get_columns_map



/**
* GET_AR_INVERTED_PATHS
* Resolve the unique and isolated paths into the ddo_map with all dependencies (portal into portals, portals into sections, etc)
* get the path in inverse format, the last in the chain will be the first object [0]
* @return array ar_inverted_paths the the specific paths, with inverse path format.
*/
export const get_ar_inverted_paths = function(full_ddo_map) {

	// get the parents for the column, creating the inverse path
	// (from the last component to the main parent, the column will be with the data of the first item of the column)
	function get_parents(ddo_map, current_ddo) {
		const ar_parents = []
		const parent = ddo_map.find(item => item.tipo === current_ddo.parent)
		if (parent) {
			ar_parents.push(parent)
			ar_parents.push(...get_parents(ddo_map, parent))
		}
		return ar_parents
	}

	// every ddo will be checked if it is a component_portal or if is the last component in the chain
	// set the valid_ddo array with only the valid ddo that will be used.
		const ar_inverted_paths = []
		const ddo_length = full_ddo_map.length
		for (let i = 0; i < ddo_length; i++) {
			const current_ddo = full_ddo_map[i]
			// check if the current ddo has children associated, it's necessary identify the last ddo in the path chain, the last ddo create the column
			// all parents has the link and data to get the data of the last ddo.
			// interview -> people to study -> name
			// «name» will be the column, «interview» and «people under study» has the locator to get the data.
			const current_ar_valid_ddo = full_ddo_map.filter(item => item.parent === current_ddo.tipo)
			if(current_ar_valid_ddo.length !== 0) continue
			const column = []

			// get the path with inverse order
			// people to study -> interview
			const parents = get_parents(full_ddo_map, current_ddo)

			// join all with the inverse format
			// name -> people to study -> interview
			column.push(current_ddo, ...parents)
			ar_inverted_paths.push(column)
		}

	return ar_inverted_paths
}//end get_ar_inverted_paths



// /**
// * GET_SUB_DDO_MAP
// * @param datum self instance_caller datum (section, component_portal) with all context and data of the caller. In the recursion
// * @param caller_tipo tipo from section or portal that call to get the sub_ddo_map
// * @param ddo_map the requested tipos
// * @param sub_ddo used for create the path for the component, path is used to get the full path
// * @return array ar_ddo with all ddo in all portals and sections config_rqo that has dependency of the caller.
// */
	// const get_sub_ddo_map_DES = function(datum, caller_tipo, ddo_map, sub_ddo){

	// 	const ar_ddo = []

	// 	// get the valid ddo_map, only the last ddo in the path will be rendered.
	// 		// function get_last_children(ddo_map, current_ddo) {
	// 		// 	const ar_children = []
	// 		// 	const children = ddo_map.filter(item => item.parent === current_ddo.tipo)

	// 		// 	if(children.length === 0){
	// 		// 		current_ddo.caller_tipo = caller_tipo
	// 		// 		ar_children.push(current_ddo)
	// 		// 	}else{
	// 		// 		for (let i = 0; i < children.length; i++) {
	// 		// 			const valid_child = get_last_children(ddo_map, children[i])[0]
	// 		// 			ar_children.push(valid_child)
	// 		// 		}
	// 		// 	}

	// 		// 	return ar_children;
	// 		// }

	// 	// every ddo will be checked if it is a component_portal or if is the last component in the chain
	// 	// set the valid_ddo array with only the valid ddo that will be used.
	// 		// const ar_valid_ddo = []
	// 		// const ddo_length = ddo_map.length
	// 		// for (let i = 0; i < ddo_length; i++) {
	// 		// 	const current_ddo = ddo_map[i]
	// 		// 	if(current_ddo.parent !== caller_tipo) continue;
	// 		// 	const current_ar_valid_ddo = get_last_children(ddo_map, current_ddo)
	// 		// 	for (let j = 0; j < current_ar_valid_ddo.length; j++) {
	// 		// 		ar_valid_ddo.push(current_ar_valid_ddo[j])
	// 		// 	}
	// 		// }

	// 	// get all children of the current ddo recursively
	// 	// when the section or portal doesn't has data the context will not created
	// 	// in those cases get the sub_ddo with the current ddo_map
	// 		function get_children(ddo_map, parent_ddo) {
	// 			const ar_children = []

	// 			const children = ddo_map.filter(item => item.parent === parent_ddo.tipo)

	// 			for (let i = 0; i < children.length; i++) {
	// 				ar_children.push(children[i])

	// 				const valid_child = get_children(ddo_map, children[i])
	// 				ar_children.push(...valid_child)
	// 			}
	// 			return ar_children;
	// 		}


	// 		for (let i = 0; i < ddo_map.length; i++) {

	// 			const current_ddo = ddo_map[i]

	// 			// skip ddo with parent different from current caller
	// 				if(current_ddo.parent !== caller_tipo) continue;

	// 			// add current_ddo
	// 				ar_ddo.push(current_ddo)


	// 			// context
	// 				const current_context = datum.context.find(item => item.tipo===current_ddo.tipo) //&& item.section_tipo===current_ddo.section_tipo

	// 			// no context case. When context is calculated as subcontext, is associated to data. Therefore, sometimes show->ddo contains more items than
	// 			// the calculated in context (empty portals for example). This is not an error really
	// 				// if (!current_context) {
	// 				// 	console.warn("Skip context not found for current ddo:", current_ddo);
	// 				// 	console.warn("datum.context:", datum.context);
	// 				// 	continue;
	// 				// }

	// 			// request_config_object
	// 				const request_config_object	= (current_context && current_context.request_config)
	// 					? current_context.request_config.find(el => el.api_engine==='dedalo')
	// 					: null




	// 			// add sub_ddo_map
	// 				if(request_config_object && request_config_object.show && request_config_object.show.ddo_map){
	// 					const current_ddo_map	= request_config_object.show.ddo_map
	// 					const sub_ddo_map		= get_sub_ddo_map(datum, current_ddo.tipo, current_ddo_map, [])
	// 					ar_ddo.push(...sub_ddo_map)
	// 				}else{
	// 					const current_ddo_map	= get_children( ddo_map, current_ddo)
	// 					const sub_ddo_map		= get_sub_ddo_map(datum, current_ddo.tipo, current_ddo_map, [])
	// 					ar_ddo.push(...sub_ddo_map)
	// 				}
	// 		}//end for (let i = 0; i < ddo_map.length; i++)


	// 	return ar_ddo
	// }//end build_request_show



/**
* BUILD_RQO
*/
	// common.prototype.build_rqo_DES = async function(dd_request_type, request_config, action){

	// 	const self = this

	// 	// create a new one

	// 	switch (dd_request_type) {

	// 		case 'show':
	// 			return rqo

	// 		case 'search':
	// 			return build_request_search(self, request_config, action)

	// 		case 'select':
	// 			return build_request_select(self, request_config, action)
	// 			break;
	// 	}
	// }//end build_rqo



/**
* BUILD_RQO_SHOW
* @param object _request_config_object
* @param string action
* 	e.g. 'get_data'
* @param bool add_show = false
* @return object rqo
*/
common.prototype.build_rqo_show = async function(_request_config_object, action, add_show=false){

	const self = this

	// clone request_config_object
		const request_config_object = clone(_request_config_object)

	// source. build new one with source of the instance caller (self)
		const source = create_source(self, action)

	// sqo_config
		const sqo_config = request_config_object && request_config_object.show && request_config_object.show.sqo_config
			? request_config_object.show.sqo_config
			: false

	// sqo with fallback to sqo_config
		const sqo = request_config_object && request_config_object.sqo
			? request_config_object.sqo
			: sqo_config
				? sqo_config
				: {}

	// without sqo info case
		if (!sqo) {
			// build a minimal rqo without sqo
			const rqo = {
				id		: self.id,
				action	: 'read',
				source	: source
			}
			return rqo
		}

	// ar_sections. Get ar_sections from sqo and map to string from object
		const ar_sections = (sqo && sqo.section_tipo)
			? sqo.section_tipo.map(el => el.tipo ? el.tipo : el)
			: sqo_config && sqo_config.section_tipo
				? sqo_config.section_tipo.map(el => el.tipo ? el.tipo : el)
				: [self.section_tipo]

		sqo.section_tipo = ar_sections

	// pagination
	// Get the limit, offset, full count, and filter by locators.
	// When these options comes with the sqo it passed to the final sqo, if not, it get the show.sqo_config parameters
	// and finally if the request_config_object don't has sqo or sqo_config, set the default parameter to each.
		// sqo.limit
		if (sqo.limit===undefined) {
			sqo.limit = (sqo_config && sqo_config.limit!==undefined)
				? sqo_config.limit
				// : self.mode==='edit' ? 1 : null; // force to generate default limit from server (!)
				: null
		}
		// sqo.offset
		if (sqo.offset===undefined) {
			sqo.offset = (sqo_config && sqo_config.offset!==undefined)
				? sqo_config.offset
				: null;
		}

	// filter_by_locators
		const filter_by_locators = (sqo.filter_by_locators)
			? sqo.filter_by_locators
			: (sqo_config && sqo_config.filter_by_locators)
				? sqo_config.filter_by_locators
				: null
		if (filter_by_locators) {
			sqo.filter_by_locators = filter_by_locators
		}else if(self.section_id && self.section_tipo){
			sqo.filter_by_locators = [{
				section_tipo	:self.section_tipo,
				section_id		: self.section_id
			}]
		}

	// sqo clean
		delete sqo.generated_time

	// build the rqo
		const rqo = {
			id		: self.id,
			action	: 'read',
			source	: source,
			sqo		: sqo
		}

		if (add_show===true) {
			if (request_config_object.show) {
				rqo.show = request_config_object.show
			}
			// console.warn("added rqo.show:", self.tipo, self.mode, rqo.show);
		}


	return rqo
}//end build_rqo_show



/**
* BUILD_RQO_SEARCH
* Used from portal to autocomplete
* @return object rqo
*/
common.prototype.build_rqo_search = async function(request_config_object, action){

	const self = this

	// build new one with source of the instance caller (self)
		const source	= create_source(self, action);

	// get the operator to use into the filter free
		const operator	= request_config_object.search && request_config_object.search.sqo_config && request_config_object.search.sqo_config.operator
			? request_config_object.search.sqo_config.operator
			: '$or'

	// sqo. Set the sqo_config into a checked variable, get the sqo_config for search or show
		const sqo_config = request_config_object.search && request_config_object.search.sqo_config
			? request_config_object.search.sqo_config
			: request_config_object.show && request_config_object.show.sqo_config
				? request_config_object.show.sqo_config
				: {}

	// get the ar_sections
		const ar_sections = request_config_object.sqo && request_config_object.sqo.section_tipo
			? request_config_object.sqo.section_tipo.map(el => el.tipo ? el.tipo : el)
			: ( sqo_config.section_tipo)
					? sqo_config.section_tipo.map(el => el.tipo ? el.tipo : el)
					: [self.section_tipo]

	// limit and offset
	// check if limit and offset exist in choose, if not get from search.sqo_config, if not, get from show.sqo_config else fixed value
		const choose_limit_default = 25
		const limit	= request_config_object.choose && request_config_object.choose.sqo_config && (request_config_object.choose.sqo_config.limit || request_config_object.choose.sqo_config.limit==0)
			? request_config_object.choose.sqo_config.limit
			: ((sqo_config.limit || sqo_config.limit==0)
				? sqo_config.limit
				: choose_limit_default)
		const offset = request_config_object.choose && request_config_object.choose.sqo_config && request_config_object.choose.sqo_config.offset
			? request_config_object.choose.sqo_config.offset
			: (sqo_config.offset)
				? sqo_config.offset
				: 0

	// sqo. new sqo_search
		const sqo = {
			mode					: self.mode,
			section_tipo			: ar_sections,
			filter					: {[operator]:[]},
			offset					: offset,
			limit					: limit,
			full_count				: false,
			allow_sub_select_by_id	: true
		}

	// children_recursive
		if(request_config_object.sqo.children_recursive){
			sqo.children_recursive = request_config_object.sqo.children_recursive
		}


	// FILTER_FREE
	// the filter will be used to set the q with all paths to use to search.
		const filter_free			= {}
			  filter_free[operator] = []

		// create the paths for use into filter_free
		// get the ddo_map to use for the paths in search or show or create new one with the caller
			const search_ddo_map = request_config_object.search && request_config_object.search.ddo_map
				? request_config_object.search.ddo_map
				: request_config_object.show && request_config_object.show.ddo_map
					? request_config_object.show.ddo_map
					: [{
						section_tipo	: self.section_tipo,
						component_tipo	: self.tipo,
						model			: self.model,
						parent			: 'self',
						mode			: 'list'
					}]

			if (search_ddo_map) {
				// get the sub elements with the ddo_map, the method is recursive,
				// it get only the items that don't has relations and is possible get values (component_input_text, component_text_area, compomnent_select, etc )
				const ar_paths = get_ar_inverted_paths(search_ddo_map)
				// change the order of the paths to correct order for sqo and set all ddo to 'list' mode
				const paths_length = ar_paths.length
				paths: for (let i = 0; i < paths_length; i++) {
					const current_path = ar_paths[i]
					const current_path_length = current_path.length
					// reverse path and set the list
					const new_path = []
					ddo: for (let j = current_path_length - 1; j >= 0; j--) {
						// Dataframe nodes are outside the portal sqo (it has his own sqo) and need to be excluded
						if(current_path[j].model==='component_dataframe'){continue paths}
						// create a copy of the current ddo, it ensure that the original path is not touched
						const current_ddo = clone(current_path[j])
						current_ddo.mode = 'list' // enable lang fallback value
						if(Array.isArray(current_ddo.section_tipo)){
							current_ddo.section_tipo = current_ddo.section_tipo[0]
						}
						current_ddo.component_tipo	= current_ddo.tipo
						new_path.push(current_ddo)
					}
					//add the path to the filter_free with the operator
					filter_free[operator].push({
						q		: '',
						path	: new_path
					})
				}
			}


	// fixed_filter
		const fixed_filter	= request_config_object.sqo && request_config_object.sqo.fixed_filter
			? request_config_object.sqo.fixed_filter
			: false

	// fixed_filter
		if(request_config_object.sqo.fixed_children_filter){
			sqo.fixed_children_filter = request_config_object.sqo.fixed_children_filter
		}

	// filter_by_list if exists
		const filter_by_list = request_config_object.sqo && request_config_object.sqo.filter_by_list
			? request_config_object.sqo.filter_by_list
			: false

	// value_with_parents
		// const value_with_parents = sqo_config.value_with_parents
		// 	? sqo_config.value_with_parents
		// 	: false

	// fields_separator
		const fields_separator = request_config_object.choose && request_config_object.choose.fields_separator
				? request_config_object.choose.fields_separator
				: request_config_object.show && request_config_object.show.fields_separator
					? request_config_object.show.fields_separator
					: ', '


	// optional configuration to use when the search will be built
		const sqo_options = {
			filter_free		: filter_free,
			fixed_filter	: fixed_filter,
			filter_by_list	: filter_by_list,
			operator		: operator
		}

	// DDO_MAP
	// get the ddo_map to show the components, if is set choose get it, if not get the search.ddo_map if not get the show.ddo_map
		const ddo_map = request_config_object.choose && request_config_object.choose.ddo_map
			? request_config_object.choose.ddo_map
			: search_ddo_map

	// columns. get the sub elements with the ddo_map, the method is recursive,
	// it get only the items that don't has relations and is possible get values (component_input_text, component_text_area, compomnent_select, etc )
		const columns = get_ar_inverted_paths(ddo_map)

	// rqo. Build the request query object
		const rqo = {
			id			: self.id,
			action		: 'read',
			source		: source,
			show		: {
				ddo_map					: ddo_map,
				// value_with_parents	: value_with_parents,
				fields_separator		: fields_separator,
				columns					: columns
			},
			sqo			: sqo,
			sqo_options	: sqo_options
		}


	return rqo
}//end build_rqo_search



/**
* BUILD_REQUEST_SHOW
* @return array dd_request
*/
	// const build_request_show_OLD = function(self, request_config, action){

	// 	const dd_request = []

	// 	// source . auto create
	// 		const source = create_source(self, action);
	// 		dd_request.push(source)

	// 	// empty request_config cases
	// 		if(!request_config) {
	// 			return dd_request;
	// 		}

	// 	// // direct request ddo if exists
	// 		// 	const ar_requested_ddo = request_config.filter(item => item.typo==='ddo')
	// 		// 	if (ar_requested_ddo.length>0) {
	// 		// 		for (let i = 0; i < ar_requested_ddo.length; i++) {
	// 		// 			dd_request.push(ar_requested_ddo[i])
	// 		// 		}
	// 		// 	}

	// 	// sqo. add request sqo if exists
	// 		const request_sqo = request_config.find(item => item.typo==='sqo')
	// 		if (request_sqo) {
	// 			dd_request.push(request_sqo)
	// 		}

	// 	// rqo. If don't has rqo, return the source only
	// 		const rqo = request_config.filter(item => item.typo==='rqo')
	// 		if(rqo.length < 1){
	// 			return dd_request;
	// 		}

	// 	// ddo. get the global request_ddo storage, ddo_storage is the centralized storage for all ddo in section
	// 		// const request_ddo_object	= self.datum.context.find(item => item.typo==='request_ddo')
	// 		// const all_request_ddo		= request_ddo_object.value
	// 		const all_request_ddo = self.datum
	// 			? (self.datum.context ? self.datum.context : [])
	// 			: []

	// 		const rqo_length				= rqo.length
	// 		const all_request_ddo_length	= all_request_ddo.length
	// 		const ar_sections				= []
	// 		const request_ddo				= []

	// 		if(self.model==='section'){

	// 			// rqo loop
	// 				for (let i = 0; i < rqo_length; i++) {

	// 					const current_rqo	= rqo[i]
	// 					const sections		= current_rqo.section_tipo
	// 					const show			= current_rqo.show

	// 					// get sections
	// 						ar_sections.push(...sections)

	// 					// value_with_parents
	// 						if(show.value_with_parents){
	// 							dd_request.push({
	// 								typo	: 'value_with_parents',
	// 								value	: show.value_with_parents
	// 							})
	// 						}

	// 					// fields_separator
	// 						if(show.fields_separator){
	// 							dd_request.push({
	// 								typo	: 'fields_separator',
	// 								value	: show.fields_separator
	// 							})
	// 						}
	// 				}

	// 			// all_request_ddo loop
	// 				for (let i = 0; i < all_request_ddo_length; i++) {

	// 					const ddo = all_request_ddo[i]
	// 					// if(ddo.tipo === self.tipo && ddo.section_tipo === self.section_tipo && self.model==='section') continue
	// 					ddo.config_type = 'show'
	// 					request_ddo.push( ddo )
	// 				}

	// 		}else{

	// 			//set the context of the component in the request_ddo
	// 			request_ddo.push(self.context)
	// 			for (let i = 0; i < rqo_length; i++) {

	// 				const current_rqo		= rqo[i]
	// 				const operator			= current_rqo.show.sqo_config.operator || '$and'
	// 				const sections			= current_rqo.section_tipo

	// 				const sections_length	= sections.length
	// 				// show
	// 				const show				= current_rqo.show
	// 				const ddo_map			= show.ddo_map
	// 				const ddo_map_length	= ddo_map.length
	// 				//get sections
	// 				for (let j = 0; j < sections_length; j++) {
	// 					ar_sections.push(sections[j])
	// 					// get the fpath array
	// 					for (let k = 0; k < ddo_map_length; k++) {

	// 						const f_path = typeof ddo_map[k].tipo!=='undefined'
	// 							? ['self', ddo_map[k].tipo]
	// 							: typeof ddo_map[k].f_path!=='undefined'
	// 								? ddo_map[k].f_path
	// 								: ['self', ddo_map[k]]
	// 						const f_path_length = f_path.length

	// 						// get the current item of the fpath
	// 						for (let l = 0; l < f_path_length; l++) {
	// 							const item = f_path[l]==='self'
	// 								? sections[j]
	// 								: f_path[l]
	// 							const exist = request_ddo.find(ddo => ddo.tipo===item && ddo.section_tipo===sections[j])

	// 							if(!exist){
	// 								const ddo = all_request_ddo.find(ddo => ddo.tipo===item && ddo.section_tipo===sections[j])

	// 								if(ddo){
	// 									ddo.config_type = 'show'
	// 									request_ddo.push(ddo)
	// 								}
	// 							}
	// 						}
	// 					}
	// 				}

	// 				//value_with_parents
	// 				if(show.value_with_parents){
	// 					dd_request.push({
	// 						typo : 'value_with_parents',
	// 						value : show.value_with_parents
	// 					})
	// 				}

	// 				//fields_separator
	// 				if(show.fields_separator){
	// 					dd_request.push({
	// 						typo : 'fields_separator',
	// 						value : show.fields_separator
	// 					})
	// 				}
	// 			}
	// 		}//end 	if(self.model==='section')

	// 		// set the selected ddos into new request_ddo for do the call with the selection
	// 		dd_request.push({
	// 			typo : 'request_ddo',
	// 			value : request_ddo
	// 		})

	// 	// first rqo show
	// 		const first_rqo_show = rqo[0].show

	// 	// get the limit and offset
	// 		const limit	= (first_rqo_show.sqo_config.limit)
	// 			? first_rqo_show.sqo_config.limit
	// 			: 10
	// 		const offset = (first_rqo_show.sqo_config.offset)
	// 			? first_rqo_show.sqo_config.offset
	// 			: 0

	// 	// sqo
	// 		const sqo = {
	// 			typo				: 'sqo',
	// 			section_tipo		: ar_sections,
	// 			filter				: null,
	// 			limit				: limit,
	// 			offset				: offset,
	// 			select				: [],
	// 			full_count			: false,
	// 			filter_by_locators	: null
	// 		}
	// 		dd_request.push(sqo)

	// 		//add the full rqo to the dd_request
	// 		dd_request.push(rqo[0])

	// 	// debug
	// 		if(SHOW_DEBUG===true) {
	// 			// console.log("// dd_request [build_request_show]", dd_request);
	// 		}


	// 	return dd_request
	// }//end build_request_show



/**
* BUILD_REQUEST_SEARCH
* @return array dd_request
*/
	// const build_request_search_OLD = function(self, request_config, action){

	// 	const dd_request	= []
	// 	const ar_sections	= []

	// 	const rqo = request_config.filter(item => item.typo==='rqo')

	// 	// get the global request_ddo storage, ddo_storage is the centralized storage for all ddo in section.
	// 	// const all_request_ddo	= self.datum.context.find(item => item.typo==='request_ddo').value
	// 	const all_request_ddo	= self.datum.context

	// 	const rqo_length	= rqo.length
	// 	// const operator	= self.context.properties.source.operator || '$and'
	// 	const request_ddo 		= []

	// 	for (let i = 0; i < rqo_length; i++) {

	// 		const current_rqo		= rqo[i]
	// 		const operator			= current_rqo.search.sqo_config.operator || '$and'
	// 		const sections			= current_rqo.section_tipo
	// 		const sections_length	= sections.length
	// 		const sqo_search		= []

	// 		// source . auto create
	// 			const source = create_source(self, action)
	// 			sqo_search.push(source)


	// 		const fixed_filter	= current_rqo.fixed_filter
	// 		const filter_free	= {}
	// 			  filter_free[operator] = []

	// 		// type add
	// 		sqo_search.push({
	// 			typo	: 'search_engine',
	// 			value	: current_rqo.search_engine
	// 		})

	// 		// search
	// 		const search			= current_rqo.search
	// 		const ddo_map			= search.ddo_map
	// 		const ddo_map_length	= ddo_map.length

	// 		//get sections
	// 		for (let j = 0; j < sections_length; j++) {
	// 			const section_ddo = all_request_ddo.find(ddo => ddo.tipo===sections[j]  && ddo.section_tipo===sections[j])
	// 			request_ddo.push(section_ddo)

	// 			// get the fpath array
	// 			for (let k = 0; k < ddo_map_length; k++) {

	// 				const f_path		= typeof ddo_map[k].f_path!=='undefined' ? ddo_map[k].f_path :  ['self', ddo_map[k]]
	// 				const f_path_length	= f_path.length
	// 				const ar_paths		= []

	// 				// get the current item of the fpath
	// 				for (let l = 0; l < f_path_length; l++) {
	// 					if(l % 2 !== 0){

	// 						const item = f_path[l]
	// 						const section_tipo = (f_path[l-1]==='self')
	// 							? sections[j]
	// 							: f_path[l-1]

	// 						const ddo = all_request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===section_tipo )
	// 						if (ddo) {
	// 							ddo.mode = 'list' // enable lang fallback value
	// 							request_ddo.push(ddo)
	// 							const path = {
	// 								section_tipo	: section_tipo,
	// 								component_tipo	: item,
	// 								model			: ddo.model
	// 							}
	// 							ar_paths.push(path)
	// 						}
	// 					}
	// 				}

	// 				filter_free[operator].push({
	// 					q		: '',
	// 					path	: ar_paths
	// 				})
	// 			}
	// 		}
	// 		// fixed_filter
	// 		if (fixed_filter) {
	// 			sqo_search.push({
	// 				typo : 'fixed_filter',
	// 				value : fixed_filter
	// 			})
	// 		}

	// 		// filter_free
	// 		if (filter_free) {
	// 			sqo_search.push({
	// 				typo 		: 'filter_free',
	// 				value 		: filter_free,
	// 				operator 	: operator
	// 			})
	// 		}

	// 		// filter_by_list if exists
	// 		const filter_by_list = current_rqo.filter_by_list
	// 		if (filter_by_list) {
	// 			sqo_search.push({
	// 				typo : 'filter_by_list',
	// 				value : filter_by_list
	// 			})
	// 		}

	// 		// limit and offset
	// 			// check if limit and offset exist in select
	// 			const limit	= current_rqo.select && current_rqo.select.sqo_config && current_rqo.select.sqo_config.limit
	// 				? current_rqo.select.sqo_config.limit
	// 				: (search.sqo_config.limit)
	// 					? search.sqo_config.limit
	// 					: current_rqo.show.sqo_config.limit
	// 			const offset = current_rqo.select && current_rqo.select.sqo_config && current_rqo.select.sqo_config.offset
	// 				? current_rqo.select.sqo_config.offset
	// 				: search.sqo_config.offset

	// 		// sqo_search
	// 		sqo_search.push({
	// 			typo			: 'sqo',
	// 			section_tipo	: sections,
	// 			filter			: {[operator]:[]},
	// 			offset			: offset || 0,
	// 			limit			: limit || 10,
	// 			select			: [],
	// 			full_count		: false
	// 		})

	// 		// if(current_rqo.select){
	// 		// 	const select = self.build_rqo('select', request_config, 'get_data')
	// 		// 	const ddo_select = select.filter(item => item.typo === 'ddo')
	// 		// 	sqo_search.push(...ddo_select)
	// 		// 	console.log("ddo_select", sqo_search);
	// 		// }

	// 		//value_with_parents
	// 		if(search.value_with_parents){
	// 			sqo_search.push({
	// 				typo : 'value_with_parents',
	// 				value : search.value_with_parents
	// 			})
	// 		}

	// 		//fields_separator
	// 		if(search.fields_separator){
	// 			sqo_search.push({
	// 				typo : 'fields_separator',
	// 				value : search.fields_separator
	// 			})
	// 		}

	// 		// set the selected ddos into new request_ddo for do the call with the selection
	// 		sqo_search.push({
	// 			typo : 'request_ddo',
	// 			value : request_ddo
	// 		})


	// 		// add group
	// 		dd_request.push(sqo_search)
	// 	}//end for (let i = 0; i < length; i++)


	// 	return dd_request
	// }//end build_request_search



/**
* BUILD_REQUEST_SELECT
* @return array dd_request
*/
	// const build_request_select_OLD = function(self, request_config, action){

	// 	const dd_request = []

	// 	// source . auto create
	// 		const source = create_source(self, action);
	// 		dd_request.push(source)

	// 	// empty request_config cases
	// 		if(!request_config) {
	// 			return dd_request;
	// 		}

	// 	// // direct request ddo if exists
	// 	// 	const ar_requested_ddo = request_config.filter(item => item.typo==='ddo')
	// 	// 	if (ar_requested_ddo.length>0) {
	// 	// 		for (let i = 0; i < ar_requested_ddo.length; i++) {
	// 	// 			dd_request.push(ar_requested_ddo[i])
	// 	// 		}
	// 	// 	}

	// 	// direct request sqo if exists
	// 		const request_sqo = request_config.find(item => item.typo==='sqo')
	// 		if (request_sqo) {
	// 			dd_request.push(request_sqo)
	// 		}

	// 	// rqo. If don't has rqo, return the source only
	// 		const rqo = request_config.filter(item => item.typo==='rqo')
	// 		if(rqo.length < 1){
	// 			return dd_request;
	// 		}

	// 	// ddo. get the global request_ddo storage, ddo_storage is the centralized storage for all ddo in section
	// 		// const request_ddo_object	= self.datum.context.find(item => item.typo==='request_ddo')
	// 		// const all_request_ddo			= request_ddo_object.value
	// 		const all_request_ddo		= self.datum.context

	// 		const request_ddo 			= []
	// 		// const instance_ddo 			= self.context
	// 		// 		instance_ddo.config_type = 'show'
	// 		// request_ddo.push(instance_ddo)

	// 		const rqo_length	= rqo.length
	// 		const ar_sections	= []
	// 		for (let i = 0; i < rqo_length; i++) {

	// 			const current_rqo		= rqo[i]
	// 			const sections			= current_rqo.section_tipo

	// 			const sections_length	= sections.length
	// 			// select
	// 			const select			= current_rqo.select
	// 			const ddo_map			= select.ddo_map

	// 			const ddo_map_length	= ddo_map.length
	// 			//get sections
	// 			for (let j = 0; j < sections_length; j++) {
	// 				ar_sections.push(sections[j])
	// 				// get the fpath array
	// 				for (let k = 0; k < ddo_map_length; k++) {

	// 					const f_path = typeof ddo_map[k].f_path!=='undefined' ? ddo_map[k].f_path : ['self', ddo_map[k]]
	// 					const f_path_length = f_path.length

	// 					// get the current item of the fpath
	// 					for (let l = 0; l < f_path_length; l++) {
	// 						const item = f_path[l]==='self'
	// 							? sections[j]
	// 							: f_path[l]
	// 						const exist = request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===sections[j])

	// 						if(!exist){
	// 							const ddo = all_request_ddo.find(ddo => ddo.tipo===item  && ddo.section_tipo===sections[j])

	// 							if(ddo){
	// 								ddo.config_type = 'show'
	// 								const select_ddo = clone(ddo)
	// 								select_ddo.parent = sections[j]
	// 								request_ddo.push(select_ddo)
	// 							}
	// 						}
	// 					}
	// 				}
	// 			}
	// 			//value_with_parents
	// 			if(select.value_with_parents){
	// 				dd_request.push({
	// 					typo : 'value_with_parents',
	// 					value : select.value_with_parents
	// 				})
	// 			}

	// 			//fields_separator
	// 			if(select.fields_separator){
	// 				dd_request.push({
	// 					typo : 'fields_separator',
	// 					value : select.fields_separator
	// 				})
	// 			}
	// 		}

	// 		// set the selected ddos into new request_ddo for do the call with the selection
	// 		dd_request.push({
	// 			typo : 'request_ddo',
	// 			value : request_ddo
	// 		})

	// 	return dd_request
	// }//end build_request_show



/**
* LOAD_DATA_DEBUG
* Render main page data using a JSON viewer
* @param object section instance self
* @param promise load_data_promise
* 	API request response from current section/area
* @param object rqo_show_original
* 	Request query object sent to the API by current section/area
* @return HTMLElement document fragment
*/
export const load_data_debug = async function(self, load_data_promise, rqo_show_original) {

	// only works if debug mode is active
		if(SHOW_DEBUG===false) {
			return false
		}

	// check caller instance is section or are
		if (self.type!=='section' && self.type!=='area') {
			return false
		}

	// dd_request
		const response		= await load_data_promise
		const dd_request	= self.dd_request

	// load_data_promise response check
		if (response.result===false) {
			console.error('API EXCEPTION:',response.msg);
			return false
		}

	// console.log("["+self.model+".load_data_debug] on render event response:",response, " API TIME: "+response.debug.real_execution_time)
	// console.log("["+self.model+".load_data_debug] context:",response.result.context)
	// console.log("["+self.model+".load_data_debug] data:",response.result.data)

	// fragment
		const fragment = new DocumentFragment();

		// request to API
			// const sqo	= dd_request_show_original.find(el => el.typo==='sqo') || null
			// const sqo	= rqo_show_original.sqo
			// const request_pre	= ui.create_dom_element({
			// 	element_type	: 'pre',
			// 	text_content	: "dd_request sent to API: \n\n" + JSON.stringify(rqo_show_original, null, "  ") + "\n\n\n\n" + "dd_request new built: \n\n" + JSON.stringify(dd_request, null, "  "),
			// 	parent			: fragment
			// })

		// rqo_show_original
			// const rqo_show_original_pre	= ui.create_dom_element({
			// 	element_type	: 'pre',
			// 	text_content	: "rqo_show_original: \n",
			// 	parent			: fragment
			// })
			// render_tree_data(rqo_show_original, rqo_show_original_pre)

		// response_debug
			const combi = {
				'debug'					: response.debug,
				'rqo_show_original'		: rqo_show_original,
				'elements_css_object'	: get_inserted_rules()
			};
			const response_debug_pre = ui.create_dom_element({
				element_type	: 'pre',
				text_content	: "response_debug: \n",
				parent			: fragment
			})
			render_tree_data(combi, response_debug_pre)

		// dd_request
			if (dd_request) {
				const dd_request_pre	= ui.create_dom_element({
					element_type	: 'pre',
					text_content	: "dd_request: \n",
					parent			: fragment
				})
				render_tree_data(dd_request, dd_request_pre)
			}

		// context
			const context_pre = ui.create_dom_element({
				element_type	: 'pre',
				text_content	: "context: \n", // + JSON.stringify(response.result.context, null, "  "),
				parent			: fragment
			})
			render_tree_data(response.result.context, context_pre)

		// data
			const data_pre = ui.create_dom_element({
				element_type	: 'pre',
				text_content	: "data: \n", // + JSON.stringify(response.result.data, null, "  "),
				parent			: fragment
			})
			render_tree_data(response.result.data, data_pre)

	// time
		// const time_info = "" +
		// 	"Total time: " + response.debug.real_execution_time +
		// 	"<br>Context exec_time: " + response.result.debug.context_exec_time +
		// 	"<br>Data exec_time: " + response.result.debug.data_exec_time  + "<br>"

		// const time_info_pre = ui.create_dom_element({
		// 	element_type : "pre",
		// 	class_name   : "total_time",
		// 	id   		 : "total_time",
		// 	inner_html   : time_info,
		// 	parent 		 : fragment
		// })

	// debug node container
		// const debug = document.getElementById("debug")
		// // debug.classList.add("hide")

		// // clean
		// 	while (debug.firstChild) {
		// 		debug.removeChild(debug.firstChild)
		// 	}

		// debug.appendChild(fragment)

		// // show
		// 	debug.classList.remove("hide")

	return fragment
}//end load_data_debug



/**
* RENDER_TREE_DATA
* Load once jsonview lib js/css files and render the request data into the target node
* @param JSON data
* @param DOM node target_node
* @return promise
*/
export const render_tree_data = async function(data, target_node) {

	// load dependencies js/css
		const load_promises = []

	// css file load
		const lib_css_file = DEDALO_ROOT_WEB + '/lib/json-view/jsonview.bundle.css'
		load_promises.push( common.prototype.load_style(lib_css_file) )

	// js module import
		// const load_promise = import('../../../lib/json-view/jsonview.bundle.js') // used minified version for now
		const lib_js_file = DEDALO_ROOT_WEB + '/lib/json-view/jsonview.bundle.js'
		load_promises.push( common.prototype.load_script(lib_js_file) )

	// await all promises are done. It not means that lib is available, only started the load
		await Promise.all(load_promises)

	// if is not available, wait to finish load and try again
		if (typeof JsonView==='undefined') {
			return new Promise(function(resolve){
				setTimeout(function(){
					resolve( render_tree_data(data, target_node) )
				}, 500)
			})
		}

	// tree
		const tree = JsonView.createTree(data);

	// render
		const result = JsonView.render(tree, target_node);

	// open main_children level
		function open_main_children(tree) {

			// open all nodes
				JsonView.expandChildren(tree);

			// open only first levels
				// JsonView.traverseTree(tree, function(node) {
				// 	if (node.depth<3) {
				// 		JsonView.showNodeChildren(node)
				// 		node.isExpanded = true;
				// 		// node.el.classList.remove('hide');
				// 		const icon = node.el.querySelector('.fas');
				// 		if (icon) {
				// 			icon.classList.replace('fa-caret-right', 'fa-caret-down');
				// 		}
				// 	}
				// });

			return
		}
		open_main_children(tree);

	return result
}//end render_tree_data



/**
* LOAD_DATA_FROM_DATUM
* Get and set current element data from current datum (used on build components and sections)
* when not already loaded data is available (injected on init for example)
* @return mixed self.data
*/
common.prototype.load_data_from_datum = function() {

	const self = this

	// load data from datum (use on build only)
		if (!self.data) {
			self.data = self.datum
				? self.datum.filter(el => el.tipo===self.tipo && el.section_tipo===self.section_tipo && el.section_id==self.section_id)
				: {
					tipo			: self.tipo,
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					value			: [],
					fallback_value	: [""]
				  }
		}

	return self.data
}//end load_data_from_datum



/**
* REMOVE_NON_INIT_EVENTS
* Applied in build moment to prevent duplicate events on refresh
* @return array delete_events
*/
	// export const remove_non_init_events = function(self) {

	// 	return true;

	// 	// const events_tokens			= self.events_tokens || []
	// 	// const events_tokens_init	= self.events_tokens_init || null
	// 	// const delete_events			= events_tokens_init && events_tokens_init.length>0
	// 	// 	? (() =>{
	// 	// 		// delete only non init tokens
	// 	// 		for (let i = 0; i < events_tokens.length; i++) {
	// 	// 			const token = events_tokens[i] // token name
	// 	// 			// console.warn("++++++ token",token)
	// 	// 			if( events_tokens_init.indexOf(token)===-1 ) {
	// 	// 				event_manager.unsubscribe(token)
	// 	// 					console.log("removed event not in events_tokens_init. token:", token, self.id);
	// 	// 			}
	// 	// 		}
	// 	// 	  })()
	// 	// 	: null // events_tokens.map(current_token => event_manager.unsubscribe(current_token)) // remove all

	// 	// return delete_events
	// }//end remove_non_init_events



/**
* GET_SECTION_ELEMENTS_CONTEXT
* Call to dd_core_api to obtain the list of components associated to current options section_tipo
* @param object options
* {
* 	section_tipo: string
* 	ar_components_exclude: array
* 	use_real_sections: bool
* 	skip_permissions: bool = false
* }
* @return promise components
* 	Array of section components
*/
common.prototype.get_section_elements_context = async function(options) {

	const self = this

	// section_tipo (string|array)
		const section_tipo			= options.section_tipo
		const ar_components_exclude	= options.ar_components_exclude
		const use_real_sections		= options.use_real_sections
		const skip_permissions		= options.skip_permissions ?? false;

	// check self.components_list
		if (!self.components_list) {
			self.components_list = []
			console.error('Forced add missing self.components_list:', self.components_list);
		}

	// components
		const get_components = async () => {
			if (self.components_list[section_tipo]) {

				return self.components_list[section_tipo]

			}else{

				const source = create_source(self, null)

				// load data
					const rqo = {
						action			: 'get_section_elements_context',
						prevent_lock	: true,
						source			: source,
						options			: {
							context_type			: 'simple',
							ar_section_tipo			: section_tipo,
							use_real_sections		: use_real_sections,
							ar_components_exclude	: ar_components_exclude,
							skip_permissions		: skip_permissions
						}
					}

					// cache_handler. Cache section elements API response for speed.
					const cache_handler = (section_tipo)
						? {
							handler	: 'localdb',
							id		: 'section_cache_elements_context_' + section_tipo + '_' + window.page_globals?.dedalo_application_lang
						  }
						  : null;

					const api_response = await data_manager.request({
						body			: rqo,
						cache_handler	: cache_handler
					})

				// fix
					self.components_list[section_tipo] = api_response.result

				return api_response.result
			}
		}
		const components = get_components()


	return components
}//end get_section_elements_context



/**
* CALCULATE_COMPONENT_PATH
* Resolve component full search path. Used to build json_search_object and
* create later the filters and selectors for search
* @param object element
*	Contains all component data collected from trigger
* @param array path
*	Contains all paths prom previous click loads
* @return array component_path
*	Array of objects
*/
common.prototype.calculate_component_path = function(component_context, path) {

	if (!Array.isArray(path)) {
		console.log("[calculate_component_path] Fixed bad path as array! :", path);
		path = []
	}

	const calculate_component_path = []

	// Add current path data
	const path_len = path.length
	for (let i = 0; i < path_len; i++) {
		calculate_component_path.push(path[i])
	}

	// Add component path data
	calculate_component_path.push({
		section_tipo			: component_context.section_tipo,
		component_tipo			: component_context.tipo,
		ar_target_section_tipo	: component_context.ar_target_section_tipo,
		model					: component_context.model,
		name					: component_context.label.replace(/<[^>]+>/g, '')
	})

	return calculate_component_path
}//end calculate_component_path



/**
* VALIDATE_TIPO
* 	Validate tipo format by regex
* @param string tipo
* @return bool result
*/
export const validate_tipo = function(tipo) {

	if (!tipo) {
		return false
	}

	const regex	= /^[a-z]{2,}[0-9]{1,}$/;
	const res	= regex.exec(tipo)

	const result = (res && res[0]) ? true : false

	return result
}//end validate_tipo



/**
* GET_FALLBACK_VALUE
* Get the fallback values when the current language version of the data is missing
* @return array fallback_result
* 	Values data with fallback
*/
export const get_fallback_value = function(value, fallback_value) {

	const fallback_result	= []
	const value_length		= (value.length===0)
		? 1
		: value.length

	for (let i = 0; i < value_length; i++) {

		if(value[i]){

			fallback_result.push(value[i])

		}else{

			const marked_value = (fallback_value && fallback_value[i])
				? '<mark>'+fallback_value[i]+'</mark>'
				: ''

			fallback_result.push(marked_value)
		}
	}


	return fallback_result
}//end get_fallback_value



/**
* PUSH_BROWSER_HISTORY
* Unified way to update page navigation history state
* @param object options
* {
*	event_in_history: bool
* 	source: object {model: section,...}
* 	sqo: object|null
* 	titles: string "section_rsc176_rsc176_list_lg-eng",
* 	url: string "?tipo=rsc176&mode=list"
* }
* @return bool
*/
export const push_browser_history = function(options) {

	// options
		const source			= options.source
		const sqo				= options.sqo
		const event_in_history	= options.event_in_history ?? false
		const title				= options.title || ''
		const url				= options.url || ''

	// state
		const state = Object.freeze({
			user_navigation_options : {
				source				: source, // object
				sqo					: sqo, // object
				event_in_history	: event_in_history // bool
			}
		})

	// history push. Adds an entry to the browser's session history stack.
		history.pushState(
			state, // object state
			title, // string unused (only Safari)
			url // string url optional
		)
		if(SHOW_DEBUG===true) {
			console.log("[common.push_browser_history] -> navigation history state push:", state, title, url);
		}


	return true
}//end push_browser_history



/**
* BUILD_AUTOLOAD
* Unified way to manage section, area and portals build API request
* @param object self
* 	Instance of area, section, component_portal
* @return bool
*/
export const build_autoload = async function(self) {

	// load context and data
		const api_response = self.tmp_api_response || await data_manager.request({
			body : self.rqo
		})

	// debug last server error. Only for development
		if(SHOW_DEVELOPER===true || SHOW_DEBUG===true) {
			if (api_response.errors?.length) {
				console.error(`${self.model} build api_response with errors:`, JSON.parse( JSON.stringify(api_response) ) );
			}else{
				console.log(`${self.model} build api_response:`, JSON.parse( JSON.stringify(api_response) ) );
			}
			if (api_response && api_response.dedalo_last_error) {
				console.error('SERVER: api_response.dedalo_last_error:', api_response.dedalo_last_error);
				// // notification.
				// // Fires a notification event that is listened by page and rendered in bubbles_notification_container
				// if (api_response.dedalo_last_error) {
				// 	event_manager.publish('notification', {
				// 		msg			: api_response.dedalo_last_error,
				// 		type		: 'error',
				// 		remove_time	: 10000 // 10 secs
				// 	})
				// }
			}
		}

	// response check
		if (!api_response || !api_response.result) {

			// previous_status
				const previous_status = 'initialized'

			// error
				const error = api_response.error
					? api_response.error
					: api_response.errors
						? api_response.errors[0] || null
						: null

			// custom behaviors
				switch (error) {
					case 'not_logged':
						// display login window
						await render_relogin({
							on_success : async function(){

								// login success actions

								self.status = previous_status

								const unsaved_data = typeof window.unsaved_data!=='undefined'
									? window.unsaved_data
									: false

								// login success actions
								if (unsaved_data===false) {
									await self.build(true)
									await self.render({
										render_level	: 'full', // content|full
										render_mode		: self.mode
									})
								}
							}
						})
						break;

					default:
						// notification.
						// Fires a notification event that is listened by page and rendered in bubbles_notification_container
						event_manager.publish('notification', {
							msg			: api_response.msg || error,
							type		: 'error',
							remove_time	: 30000 // 30 secs
						})
						break;
				}

			// status update
				self.status = previous_status // 'initialized' or 'rendered'

			return false
		}//end if (!api_response || !api_response.result)


	return api_response
}//end build_autoload



/**
* SET_ENVIRONMENT
* Set global environment vars to window global vars
* Substitution for old file 'environment.js.php'
* @todo Unify all vars into a window.dd_environment unique object ?
* @param object api_response_environment
*  Usually API response environment result
* {
* 	get_label: string (object stringified)
*	page_globals: object {dedalo_application_lang: "lg-eng", ...}
* 	plain_vars: object {DEDALO_CORE_URL:"/v6/core", ...}
* }
* @return void
*/
export const set_environment = function (api_response_environment) {

	// set vars as global
	for (const [key, value] of Object.entries(api_response_environment)) {
		switch (key) {
			case 'plain_vars':
				// assign one by one
				for (const property in value) {
					window[property] = value[property]
				}
				break;

			case 'page_globals':
				// assign to existing object
				page_globals = Object.assign(page_globals, value);
				break;

			case 'get_label':
				// value is already server parsed JSON value
				get_label = value;
				break;

			default:
				// set whole value
				window[key] = value
				break;
		}
	}
}//end set_environment



/**
* UPDATE_PROCESS_STATUS
* Call to work API and get the current process status.
* Once read, update the container info about.
* @param string id - Unique identifier for the process.
* @param string|number pid - Process ID.
* @param string pfile - Path to the process file.
* @param HTMLElement container - The DOM element to update with status info.
* @param number update_rate = 1000 - Rate in milliseconds for server updates.
* @param function callback - Optional callback function to execute when the stream finishes.
* @return void
*/
export const update_process_status = function (id, pid, pfile, container, update_rate=1000, callback) {

	// Validate essential parameters
	if (!container || !(container instanceof HTMLElement)) {
		console.error('Error: "container" must be a valid HTMLElement.');
		return;
	}
	if (typeof id !== 'string' || (typeof pid !== 'string' && typeof pid !== 'number') || typeof pfile !== 'string') {
		console.error('Error: Invalid id, pid, or pfile types.');
		return;
	}
	if (typeof update_rate !== 'number' || update_rate <= 0) {
		console.warn('Warning: Invalid update_rate. Using default 1000ms.');
		update_rate = 1000;
	}

	if(SHOW_DEBUG===true) {
		console.log(`Initiating process status update for ID: ${id}, PID: ${pid}`);
	}

	// get_process_status from API and returns a SEE stream
	data_manager.request_stream({
		body : {
			dd_api		: 'dd_utils_api',
			action		: 'get_process_status',
			update_rate	: update_rate, // int milliseconds
			options		: {
				pid		: pid,
				pfile	: pfile
			}
		}
	})
	.then((stream) => {

		if (!stream) {
			console.error('Error: data_manager.request_stream did not return a valid stream.');
			return;
		}

		// render base nodes and set functions to manage
		// the stream reader events
		const render_stream_response = render_stream({
			container		: container,
			id				: id,
			pid				: pid,
			pfile			: pfile,
			display_json	: true
		})

		// on_read event (called on every chunk from stream reader)
		const on_read = (sse_response) => {
			// fire update_info_node on every reader read chunk
			render_stream_response.update_info_node(sse_response)
		}

		// on_done event (called once at finish or cancel the stream read)
		const on_done = () => {

			// is triggered at the reader's closing
			render_stream_response.done()

			// optional callback on done
			if (callback && typeof callback === 'function') {
				callback()
			}
		}

		// read stream. Creates ReadableStream that fire
		// 'on_read' function on each stream chunk at update_rate
		// (1 second default) until stream is done (PID is no longer running)
		data_manager.read_stream(stream, on_read, on_done)
	})
	.catch(function(error) {
		console.error(`Stream request for ID: ${id}, PID: ${pid} failed:`, error);
	});
}//end update_process_status



// @license-end
