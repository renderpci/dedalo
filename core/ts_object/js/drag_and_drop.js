// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// imports
	import {get_instance_by_id} from '../../common/js/instances.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {render_children} from './render_ts_object.js'



/**
* ON_DRAGSTART
* Handles term drag start actions
* @param object self
*  ts_object instance
* @param event event
*  mousedown event from dragger HTMLElment
* @return void
*/
export const on_dragstart = function(self, event) {
	event.stopPropagation()

	// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
		const wrap_ts_object = event.target

	// event_handle (it's activated on user mousedown drag icon)
		const event_handle = wrap_ts_object.event_handle

	// if not event_handle
		if (!event_handle) {
			event.preventDefault();
			return
		}

	// if event_handle
		self.source = wrap_ts_object;
		event.dataTransfer.effectAllowed = 'move';

		// event.dataTransfer.setData('text/html', wrap_ts_object.innerHTML);

		const parent_section_tipo	= self.caller.section_tipo
		const parent_section_id		= self.caller.section_id
		const parent_instance_id	= self.caller.id

		// Store JSON string in dataTransfer
		const data = {
			id					: self.id,
			source_type			: 'default',
			moving_section_tipo	: self.section_tipo,
			moving_section_id	: self.section_id,
			parent_section_tipo	: parent_section_tipo,
			parent_section_id	: parent_section_id,
			parent_instance_id	: parent_instance_id
		}
		event.dataTransfer.setData('text/plain', JSON.stringify(data));

	// Fix class var 'old_parent_wrap'
		self.old_parent_wrap = wrap_ts_object.parentNode.parentNode;
		if(!self.old_parent_wrap) {
			console.error("[on_dragstart] Error on set old_parent_wrap");
		}
}//end on_dragstart



/**
* ON_DRAGEND
* Handles term drag end actions
* @param object self
*  ts_object instance
* @param event event
* @return void
*/
export const on_dragend = function(self, event) {
	event.preventDefault()
	event.stopPropagation()

	// target set as false
	self.target = false;

	// source. set as blank
	self.source = null;
}//end on_dragend



/**
* ON_DROP
* Handles term drop actions
* Note that they can be handled in two ways:
* 	1 . Using event.dataTransfer (tool_cataloging and similar)
* 	2 . Thesaurus within (dragging normal thesaurus terms between them) - Default
* @param object self
*  ts_object pointer (not instance fro now)
* @param event event
* 	drag event
* @para HTMLElement wrap_ts_object
* 	Thesaurus dropped wrapper (see ts_object.render_wrapper)
* @return bool
* 	True on success
*/
export const on_drop = async function(self, event, wrap_ts_object) {
	event.preventDefault();
	event.stopPropagation();

	// Remove 'drag_over' class from the target element.
	wrap_ts_object.classList.remove('drag_over');

	try {

		const data_transfer_string	= event.dataTransfer.getData('text/plain');
		const data_transfer_json	= JSON.parse(data_transfer_string);

		if (data_transfer_json.source_type === 'default') {

			// default scenario, dragging from self thesaurus / ontology

			// data_transfer vars
			const moving_instance_id		= data_transfer_json.id
			const moving_section_tipo		= data_transfer_json.moving_section_tipo
			const moving_section_id			= data_transfer_json.moving_section_id
			const old_parent_section_tipo	= data_transfer_json.parent_section_tipo
			const old_parent_section_id		= data_transfer_json.parent_section_id
			const old_parent_id				= data_transfer_json.parent_instance_id

			// target instance vars
			const target_instance			= self
			const new_parent_section_tipo	= target_instance.section_tipo
			const new_parent_section_id		= target_instance.section_id

			// Validate source.  Don't proceed if source is the same as target.
			if (target_instance.section_tipo === moving_section_tipo && target_instance.section_id == moving_section_id) {
				console.warn('[ts_object.on_drop] Invalid drop: source and target are the same.');
				return false;
			}

			// children_container. Find the container for children within the target.
			const children_container = target_instance.children_container
			// If no children container, log an error and stop.
			if (!children_container) {
				console.warn('[ts_object.on_drop] No children_container found in target instance:', target_instance);
				return false;
			}

			// update_parent_data. Call API to update parent data
			const update_parent_data_options = {
				section_id				: moving_section_id,
				section_tipo			: moving_section_tipo,
				old_parent_section_id	: old_parent_section_id,
				old_parent_section_tipo	: old_parent_section_tipo,
				new_parent_section_id	: new_parent_section_id,
				new_parent_section_tipo	: new_parent_section_tipo
			}
			const response = await self.update_parent_data(update_parent_data_options)
			if (!response.result) {
				console.error('[ts_object.on_drop] Error on update_parent_data response:', response);
				return false;
			}

			// Get moving_instance
			const moving_instance = get_instance_by_id(moving_instance_id)
			if (!moving_instance) {
				console.error('[ts_object.on_drop] No moving_instance found in instances map cache.', moving_instance_id);
				return false;
			}

			// update moving instance caller.
			// It is important to allow the term to be moved again without causing any inconsistencies.
			moving_instance.caller = self

			// Move moving node from old parent to the new parent (current dropped)
			self.children_container.appendChild(moving_instance.node);

			// hilite moved term. Allows arrow state update
			dd_request_idle_callback(
				() => {
					// hilite term node
					const element = moving_instance.term_node
					if (element) {
						self.hilite_element(element)
					}
				}
			)

			// Get old_parent_instance
			const old_parent_instance = get_instance_by_id(old_parent_id)
			if (!old_parent_instance) {
				console.error('[ts_object.on_drop] No old_parent_instance found in instances map cache.', old_parent_id);
				return false;
			}
			// update_arrow_state. If the instance has no children, then the arrow icon should be hidden.
			old_parent_instance.update_arrow_state(false)

		}else{

			// tool_cataloging and similar using event dataTransfer case

			const wrap_target = self.node

			// short vars
			const section_id	= wrap_target.dataset.section_id
			const section_tipo	= wrap_target.dataset.section_tipo
			const children_tipo	= wrap_target.dataset.children_tipo

			// Find the button that triggers adding a child.
			// add children, create new section and his node in the tree
			// go deep in the tree to point base to get back into the wrap by the add_child method
			// (it will use parentNode.parentNode to find the wrap)
			const button_obj = wrap_target.firstChild?.firstChild
			if (!button_obj) {
				console.warn('[ts_object.onDrop] Could not find the add child button in the target.');
				return false;
			}
			// Set the mode for adding the child, based on whether it's a root element.
			button_obj.dataset.mode = self.is_root( section_tipo ) // hierarchy1
				? 'add_child_from_hierarchy'
				: 'add_child';

			// Initiate the add_child operation.
			const response = await self.add_child({
				section_tipo	: section_tipo,
				section_id		: section_id
			});

			 // Handle the response from add_child. Caller e.g. 'tool_cataloging'
			if (data_transfer_json.caller) {

				// new_section_id . Generated as response by the trigger add_child
				const new_section_id = response?.result
				if(!new_section_id){
					console.error('[ts_object.onDrop] add_child did not return a new section ID.');
					return false;
				}

				// Publish an event to update the component used as term in the new section
				event_manager.publish(`ts_add_child_${data_transfer_json.caller}`, {
					locator			: data_transfer_json.locator,
					new_ts_section	: {
						section_id : new_section_id,
						section_tipo : section_tipo
					},
					callback : async () => {

						// link_children_element. list_thesaurus_element of current wrapper
						const link_children_element = self.get_link_children_from_wrap(wrap_target)
						if(!link_children_element) {
							console.warn('[ts_object.on_drop] Error finding link_children_element');
							return false
						}

						// children_data - render_children_data from API
						const children_data = await self.get_children_data({
							section_tipo	: section_tipo,
							section_id		: section_id,
							children_tipo	: children_tipo,
							pagination		: null,
							children		: link_children_element.children_list
						})
						if (!children_data) {
							// error case
							console.warn("Error, children_data is null");
							return false
						}

						// Refresh children elements by API call
						await render_children({
							self						: self,
							link_children_element		: link_children_element,
							clean_children_container	: true,
							children_data				: children_data
						})

						// save_opened_elements
						dd_request_idle_callback(
							() => {
								self.save_opened_elements(link_children_element,'add')
							}
						)

						// update parent arrow button
						self.update_arrow_state(link_children_element, false)

						// hilite added term. Allows arrow state update
						dd_request_idle_callback(
							() => {
								const wrapper = wrap_target.querySelector(`.wrap_ts_object[data-section_id="${new_section_id}"][data-section_tipo="${section_tipo}"]`)
								if (!wrapper) {
									console.error('Error finding wrapper');
									return
								}
								const element = wrapper.querySelector('.list_thesaurus_element[data-type="term"]')
								if (element) {
									self.hilite_element(element)
								}
							}
						)
					}
				});
			}
		}


	} catch (e) {
		console.error('Failed to parse JSON data:', e);
	}


	if (typeof calasparra==="undefined") {
		return
	}


	// Wrappers. Source and target wrappers.  wrap_source is set during 'dragstart'.
		const wrap_source	= self.source || null // element that's move (global var defined at 'on_drag_mousedown')
		const wrap_target	= wrap_ts_object // element on user leaves source wrap


		console.log('++ self:', self);
		console.log('++ event:', event);
		console.log('++ wrap_ts_object:', wrap_ts_object);

		// console.log('wrap_source:', wrap_source);
		// console.log('wrap_source2 node:', self.node);
		// console.log('wrap_source3 source:', self.source);
		// console.log('wrap_target:', wrap_target);

		// Validate source and target.  Don't proceed if source is missing or the same as target.
		if (wrap_source === wrap_target) {
			console.warn('[ts_object.on_drop] Invalid drop: source and target are the same.');
			return false;
		}

	// div_children. Find the container for children within the target.
		const div_children = Array.from(wrap_target.children).find(
			node => node.dataset?.role === 'children_container'
		);
		// If no children container, log an error and stop.
		if (!div_children) {
			console.warn('[ts_object.on_drop] No children_container found in target:', wrap_target.children);
			return false;
		}

	// Handle external data transfer (e.g., from tool_cataloging).
	// (!) Used by tool_cataloging to add data to the ts
	const data_transfer_json = event.dataTransfer.getData('text/plain')
	if (data_transfer_json && data_transfer_json.length>0) {


	}else{

		// Internal drag and drop (within the thesaurus) default case.

		// check basic nodes
			if ( !div_children || !wrap_source ) {
				console.error('"Error appending child":', wrap_source, div_children);
				return false
			}

		// add node. Move the dragged element to the new parent's children container.
		// If pagination button 'show_more' already exists, add it before it.
			const button_show_more = div_children.querySelector('.button.show_more')
			if (button_show_more) {
				div_children.insertBefore(wrap_source, button_show_more);
			}else{
				div_children.appendChild(wrap_source)
			}

		// Update parent data (returns a promise after HTTP request finish)

			// Old parent wrap (previous parent)
				const old_parent_wrap = self.old_parent_wrap
				if (!old_parent_wrap) {
					console.error("[ts_object.on_drop] Error finding old_parent_wrap");
					return false
				}
				// Prevent move hierarchy root nodes
				if (old_parent_wrap.classList.contains('hierarchy_root_node')) {
					return false
				}
				console.log('+++ old_parent_wrap:', old_parent_wrap);

			// parent wrap (current drooped new parent)
				const parent_wrap = wrap_source.parentNode.parentNode;
				if(!parent_wrap) {
					console.error("[ts_object.on_drop] Error finding parent_wrap");
					return false
				}
				console.log('+++ parent_wrap:', parent_wrap);

			// If old and new wrappers are the same, no is necessary update data
				if (old_parent_wrap === parent_wrap) {
					console.error("[ts_object.on_drop] New target and old target elements are the same. It is not necessary to update the data");
					return false
				}

		// short vars
			const section_id				= wrap_source.dataset.section_id
			const section_tipo				= wrap_source.dataset.section_tipo
			// old parent
			const old_parent_section_id		= old_parent_wrap.dataset.section_id
			const old_parent_section_tipo	= old_parent_wrap.dataset.section_tipo
			// new parent
			const new_parent_section_id		= parent_wrap.dataset.section_id
			const new_parent_section_tipo	= parent_wrap.dataset.section_tipo

			console.log('+++ update_parent_data options:', {
				section_id				: section_id,
				section_tipo			: section_tipo,
				old_parent_section_id	: old_parent_section_id,
				old_parent_section_tipo	: old_parent_section_tipo,
				new_parent_section_id	: new_parent_section_id,
				new_parent_section_tipo	: new_parent_section_tipo
			});

		// update_parent_data. Call API to update parent data
			const response = await self.update_parent_data({
				section_id				: section_id,
				section_tipo			: section_tipo,
				old_parent_section_id	: old_parent_section_id,
				old_parent_section_tipo	: old_parent_section_tipo,
				new_parent_section_id	: new_parent_section_id,
				new_parent_section_tipo	: new_parent_section_tipo
			})

		// Updates link_children_source. Updates source arrow when an element is removed
			const link_children_source = self.get_link_children_from_wrap(self.old_parent_wrap)
			self.update_arrow_state(
				link_children_source,
				false // toggle
			)

		// Updates target children. Updates target arrow when an element is added
			const link_children_target	= self.get_link_children_from_wrap(wrap_target)
			const children_container	= self.get_my_parent_container(link_children_target, 'children_container')
			if (children_container.classList.contains('js_first_load')) {
				// updates target children when arrow is closed
				const link_children_element	= link_children_target
				const wrapper				= wrap_target
				children_container.classList.remove('js_first_load');
				link_children_element.firstChild.classList.add('ts_object_children_arrow_icon_open', 'arrow_spinner');

				// children_data - render_children_data from API
				const children_data = await self.get_children_data({
					section_tipo	: wrapper.dataset.section_tipo,
					section_id		: wrapper.dataset.section_id,
					children_tipo	: wrapper.dataset.children_tipo,
					pagination		: null,
					children		: link_children_element.children_list
				})
				if (!children_data) {
					// error case
					console.warn("[ts_object.render_children] Error, children_data is null");
					return false
				}

				// Refresh children elements by API call
				await render_children({
					self						: self,
					link_children_element		: link_children_element,
					clean_children_container	: true, // bool clean_children_container
					children_data				: children_data
				});

				// save_opened_elements
				dd_request_idle_callback(
					() => {
						self.save_opened_elements(link_children_element,'add')
					}
				)
			}else{
				// updates target children when arrow is open
				self.update_arrow_state(
					link_children_target,
					false // toggle
				)
			}

		// hilite moved term. Allows arrow state update
			dd_request_idle_callback(
				() => {
					const element = wrap_source.querySelector('.list_thesaurus_element[data-type="term"]')
					if (element) {
						self.hilite_element(element)
					}
				}
			)

		// debug
			if(SHOW_DEBUG===true) {
				console.log("))))) [ts_object.on_drop] response", response)
				console.log("))))) [ts_object.on_drop] Finish on_drop 3");
			}
	}


	return true;
}//end on_drop



/**
* ON_DRAGOVER
* Handles term drag over actions
* @param object self
*  ts_object instance
* @param event event
* @return void
*/
export const on_dragover = function(self, event) {
	event.preventDefault();
	event.stopPropagation();

	// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
	const wrap_ts_object = self.find_up_tag(event.target, 'wrap_ts_object')
	if (wrap_ts_object.classList.contains('drag_over')) {
		return false
	}

	// dataTransfer
	event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

	// Add drag_over class
	wrap_ts_object.classList.add('drag_over')
}//end on_dragover



/**
* ON_DRAGLEAVE
* Handles term drag leave actions
* @param object self
*  ts_object instance
* @param event event
* @return void
*/
export const on_dragleave = function(self, event) {
	event.stopPropagation();

	// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
	const wrap_ts_object = self.find_up_tag(event.target, 'wrap_ts_object')

	// Remove drag_over class
	if (wrap_ts_object.classList.contains('drag_over')) {
		wrap_ts_object.classList.remove('drag_over')
	}else{
		event.preventDefault();
	}
}//end on_dragleave



// @license-end
