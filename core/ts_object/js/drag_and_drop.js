// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* DRAG_AND_DROP
* HTML5 drag-and-drop event handlers for the ts_object (thesaurus/ontology) tree.
*
* This module exports five named functions that are wired to the native browser
* drag events on each `wrap_ts_object` DIV inside `render_wrapper` (see
* `view_default_edit_ts_object.js`). Only descriptor nodes (is_descriptor===true)
* receive these listeners; non-descriptor (ND) nodes are excluded at attachment time.
*
* Two drop scenarios are handled by `on_drop`:
*   1. "Default" — inter-thesaurus move: the dragged term's ts_object instance is
*      relocated under a new parent within the same thesaurus/ontology tree by
*      calling `ts_object.prototype.swap_parent`.
*   2. "External caller" — e.g. tool_cataloging drops a cataloguing record onto a
*      thesaurus term node: a new child section is created via
*      `ts_object.prototype.add_child`, then the originating component is updated
*      through an `event_manager.publish` event keyed `ts_add_child_<caller_name>`.
*
* The `event_handle` DOM property is a temporary flag set on the `wrap_ts_object`
* element by the drag-icon `mousedown` listener in `render_wrapper`. It acts as a
* gate in `on_dragstart`: a drag is only initiated when the user presses the
* dedicated drag-handle icon; clicking elsewhere on the term row leaves the
* event_handle null and cancels the drag via `event.preventDefault()`.
*
* Exports: on_dragstart, on_dragend, on_drop, on_dragover, on_dragleave
*/

// imports
	import {get_instance_by_id} from '../../common/js/instances.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {event_manager} from '../../common/js/event_manager.js'
	import {find_up_tag} from '../../common/js/utils/util.js'



/**
* ON_DRAGSTART
* Initiates a thesaurus term drag operation and serialises the drag payload.
*
* The handler is attached to the `wrap_ts_object` DIV (the outer wrapper of each
* tree row). Because `dragstart` bubbles, `event.target` here IS the
* `wrap_ts_object` element — NOT the inner drag-handle icon that originally fired.
*
* The `event_handle` DOM property acts as a guard: it is set to a truthy value only
* when the user presses the dedicated drag-icon (mousedown in `render_wrapper`).
* If the user drags from anywhere else on the row the property is null/falsy, and
* this handler cancels the operation via `event.preventDefault()` and returns.
*
* When dragging is allowed the payload is JSON-stringified and stored in
* `dataTransfer` as `text/plain`.  The payload shape is:
* ```json
* {
*   "source_type"       : "default",
*   "moving_instance_id": "<ts_object instance id>",
*   "parent_instance_id": "<caller ts_object instance id | undefined>"
* }
* ```
* `parent_instance_id` may be undefined when `self.caller` has no `id` (e.g. the
* dragged node is a root attached directly to an area_thesaurus).
*
* @param {Object}    self  - The ts_object instance being dragged.
* @param {DragEvent} event - Native browser dragstart event fired on the wrap_ts_object DIV.
* @returns {void}
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
		parent_instance_id	: self.caller?.id // parent is the current caller
	}

	// Transfer data as JSON stringified string
	event.dataTransfer.setData('text/plain', JSON.stringify(data));
}//end on_dragstart



/**
* ON_DRAGEND
* Cleans up ts_object drag state when a drag sequence completes.
*
* Called regardless of whether the drop was accepted or cancelled (native browser
* behaviour). Resets the two mutable drag-state properties on the ts_object
* instance so that a subsequent drag always starts from a clean slate:
*   - `self.target` is reset to false (no active drop target)
*   - `self.source` is reset to null (no dragged node)
*
* `event_handle` on the `wrap_ts_object` DOM element is nulled out by the dragend
* listener in `render_wrapper` before this function is called, so no cleanup is
* needed here.
*
* @param {Object}    self  - The ts_object instance whose drag has ended.
* @param {DragEvent} event - Native browser dragend event.
* @returns {void}
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
* Handles a drop event on a thesaurus tree node and dispatches to one of two flows.
*
* This is an async handler because both dispatch paths ultimately await server calls.
* The `wrap_ts_object` parameter is the target element that received the drop — it is
* passed explicitly (not derived from event.target) because the listener in
* `render_wrapper` already holds a stable reference to it.
*
* Flow 1 — default (source_type === 'default'):
*   The dragged term is being re-parented within the same thesaurus/ontology tree.
*   Both the moving instance (`moving_instance_id`) and its old parent instance
*   (`parent_instance_id`) are resolved from the global instances map.  If either
*   lookup fails, the drop is aborted with an error log.
*   `self.swap_parent()` is then called, with `self` acting as the new target parent;
*   it handles the server update, old-parent child list refresh, and new-parent child
*   list update.
*
* Flow 2 — external caller (source_type !== 'default', e.g. tool_cataloging):
*   An external component is dropping an item onto a thesaurus node to create a new
*   child term and link the component to it.  The drop target's `section_tipo`,
*   `section_id`, and `children_tipo` are read from the node's dataset.
*   `self.add_child()` is awaited to create the new section on the server.  If the
*   `data_transfer_json.caller` field is present the handler also resolves the parent
*   instance from `wrap_ts_object.dataset.id`, then publishes an
*   `event_manager` event named `ts_add_child_<caller_name>` with:
*   - `locator`        {Object}   — component locator from the data transfer payload
*   - `new_ts_section` {Object}   — `{section_id, section_tipo}` of the new child
*   - `callback`       {Function} — called by the subscriber; inside it, the parent
*                                   ts_object triggers a children-state refresh via
*                                   `dd_request_idle_callback` to avoid blocking the
*                                   drop animation frame.
*
* The `drag_over` CSS class is removed from `wrap_ts_object` at entry, before any
* async work, so the visual hover highlight is cleared immediately on drop.
*
* (!) The `button_obj` navigation in flow 2 (`wrap_target.firstChild?.firstChild`)
* relies on a stable DOM structure inside the drop target. If `render_wrapper`
* internals change this path will silently return false.
*
* @param {Object}      self           - The ts_object instance acting as the drop target.
* @param {DragEvent}   event          - Native browser drop event.
* @param {HTMLElement} wrap_ts_object - The wrap_ts_object DIV element that received the drop.
* @returns {Promise<boolean>} true on a successful default-flow re-parent; false on any error or unhandled path.
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
* Allows a dragged term to be dropped on the current node and marks it visually.
*
* Called repeatedly while the pointer moves over the target element. The early
* return on `drag_over` already being set avoids redundant classList mutations on
* every pointermove tick, which keeps the handler cheap.
*
* The `find_up_tag` utility walks up the DOM from `event.target` (which may be a
* deeply-nested child of the row) to locate the `wrap_ts_object` ancestor.
*
* `event.preventDefault()` is required by the HTML5 drag-and-drop spec to signal
* that this element accepts drops; without it, the browser will show a "not allowed"
* cursor and `on_drop` will never fire.
*
* @param {Object}    self  - The ts_object instance over which the pointer is moving.
* @param {DragEvent} event - Native browser dragover event.
* @returns {void|boolean} Returns false early when drag_over is already active (no-op).
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
* Removes the visual drop-target highlight when the drag pointer exits the node.
*
* The `drag_over` CSS class is removed unconditionally when the pointer truly leaves
* the `wrap_ts_object` element.  If the class was not present (e.g. the leave fired
* for a child element that did not trigger `on_dragover`), the handler falls back to
* `event.preventDefault()` to stay in a consistent drag-protocol state.
*
* (!) `dragleave` fires for EVERY child boundary crossing, not only when the pointer
* exits the outer wrapper.  Calling `find_up_tag` here re-anchors the check to the
* `wrap_ts_object` ancestor so that crossing inner borders does not spuriously strip
* the highlight.  A full enter/leave counter-based solution is not used; the current
* approach is "good enough" for the thesaurus tree row size.
*
* @param {Object}    self  - The ts_object instance the pointer is leaving.
* @param {DragEvent} event - Native browser dragleave event.
* @returns {void}
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
