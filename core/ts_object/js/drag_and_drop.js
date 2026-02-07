// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// imports
	import {get_instance_by_id} from '../../common/js/instances.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {find_up_tag} from '../../common/js/utils/util.js'
	import {render_children} from './view_default_edit_ts_object.js'



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

	// if event_handle set to move
	event.dataTransfer.effectAllowed = 'move';

	// Store JSON string in dataTransfer
	const data = {
		source_type			: 'default',
		moving_instance_id	: self.id, // moving instance is self
		parent_instance_id	: self.caller.id // parent is the current caller
	}

	// Transfer data as JSON stringified string
	event.dataTransfer.setData('text/plain', JSON.stringify(data));
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
			const moving_instance_id	= data_transfer_json.moving_instance_id
			const old_parent_id			= data_transfer_json.parent_instance_id

			// Get moving_instance
			const moving_instance = get_instance_by_id( moving_instance_id )
			if (!moving_instance) {
				console.error('[ts_object.on_drop] No moving_instance found in instances map cache.', moving_instance_id);
				return false;
			}

			// Get old_parent_instance
			const old_parent_instance = get_instance_by_id( old_parent_id )
			if (!old_parent_instance) {
				console.error('[ts_object.on_drop] No old_parent_instance found in instances map cache.', old_parent_id);
				return false;
			}

			// swap_parent from self (target_instance)
			// this function already refresh the moving instance to display
			// updated information about order etc.
			const result = await self.swap_parent({
				moving_instance,
				old_parent_instance
			});

			return result
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

				const parent_id = wrap_ts_object.dataset.id
				const parent_instance = get_instance_by_id(parent_id)
				if (!parent_instance) {
					console.error('[ts_object.onDrop] No parent_instance found in instances map cache.', parent_id);
					return false;
				}

				// new_section_id . Generated as response by the trigger add_child
				const new_section_id = response?.result
				if(!new_section_id){
					console.error('[ts_object.onDrop] add_child did not return a new section ID.');
					return false;
				}

				// caller
				const caller_name = data_transfer_json.caller
				if(!caller_name){
					console.error('[ts_object.onDrop] No caller found in data_transfer_json.');
					return false;
				}

				// locator
				const locator = data_transfer_json.locator
				if(!locator){
					console.error('[ts_object.onDrop] No locator found in data_transfer_json.');
					return false;
				}

				// Publish an event to update the component used as term in the new section
				event_manager.publish(`ts_add_child_${caller_name}`, {
					locator			: locator,
					new_ts_section	: {
						section_id : new_section_id,
						section_tipo : section_tipo
					},
					callback : async (api_response) => {
						// Refresh parent_instance to display the newly added child
						dd_request_idle_callback(
							async () => {
								await parent_instance.update_children_state({
									fetch_data: true,
									render: true,
									refresh_content: true,
									show_children: true
								})
							}
						)
					}
				});
			}
		}

	} catch (e) {
		console.error('Failed to parse JSON data:', e);
	}


	return false;
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
	const wrap_ts_object = find_up_tag(event.target, 'wrap_ts_object')
	if (wrap_ts_object.classList.contains('drag_over')) {
		return false
	}

	// dataTransfer
	event.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

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
	const wrap_ts_object = find_up_tag(event.target, 'wrap_ts_object')

	// Remove drag_over class
	if (wrap_ts_object.classList.contains('drag_over')) {
		wrap_ts_object.classList.remove('drag_over')
	}else{
		event.preventDefault();
	}
}//end on_dragleave



// @license-end
