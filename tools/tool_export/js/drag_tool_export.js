// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



/**
* DRAG_TOOL_EXPORT
* Drag-and-drop event handlers used by tool_export to manage the user's
* component selection list (the right-hand "columns to export" panel).
*
* There are two distinct drag scenarios, distinguished by the `drag_type`
* field embedded in the dataTransfer payload:
*
*  - 'add'  — a component is dragged from the left-hand section elements list
*              into the user-selection list. `on_dragstart` / `on_drop` handle
*              this path. `on_drop` rebuilds a full `new_ddo` object, deduplicates
*              against `self.ar_ddo_to_export`, delegates DOM insertion to
*              `self.build_export_component`, then syncs `ar_ddo_to_export` and
*              persists via `self.update_local_db_data`.
*
*  - 'sort' — an already-selected export component is dragged within the
*             selection list to reorder columns. The `do_sortable` function in
*             render_tool_export.js wires this path; `on_drop` handles it here
*             by moving the stored `self.dragged` node to the end of the
*             container, then syncing and persisting.
*
* All handlers are attached as prototype methods on `tool_export` (see
* tool_export.js prototype assignments). They therefore receive the tool
* instance as `this` (`self`) when called through those prototype slots.
*
* Exports: on_dragstart, on_dragover, on_dragleave, on_drop
*/



/**
* ON_DRAGSTART
* Encodes the dragged component's path and ddo into the dataTransfer payload
* so that the drop target can identify and reconstruct the component.
*
* Called when the user starts dragging an element from the left-hand section
* elements list. Sets `drag_type = 'add'` so that `on_drop` knows this is a
* new-component drop (as opposed to a reorder within the selection list, which
* sets `drag_type = 'sort'`).
*
* The payload shape stored as 'text/plain' JSON:
*   {
*     drag_type : 'add',
*     path      : Array   // full path from the current section — array of
*                         // {section_tipo, component_tipo} objects built by
*                         // common.calculate_component_path
*     ddo       : Object  // descriptor-data-object from the section elements list
*   }
*
* @param {Object} obj   - the draggable element's dataset proxy; must expose
*                         `.path` (Array) and `.ddo` (Object)
* @param {DragEvent} event - native drag event fired on the draggable element
* @returns {boolean} always true (consumed by the drag API)
*/
export const on_dragstart = function(obj, event) {
	event.stopPropagation();

	const data = {
		drag_type	: 'add',
		path		: obj.path, // full path from current section
		ddo			: obj.ddo
	}
	event.dataTransfer.effectAllowed = 'move';
	event.dataTransfer.setData(
		'text/plain',
		JSON.stringify(data)
	);

	return true
}//end ondrag_start



/**
* ON_DRAGOVER
* Keeps the drop zone active and clears any leftover 'displaced' highlight
* classes from sibling children of the container while the dragged item hovers.
*
* Calls `event.preventDefault()` to allow drops (the browser's default is to
* forbid drops). Sets `dropEffect = 'move'` to show the correct cursor.
*
* The 'displaced' class is applied by the sort-mode `dragenter` handler in
* `do_sortable` (render_tool_export.js) to visually indicate the insertion
* point. Clearing it here prevents stale highlights when the pointer moves
* between siblings without triggering `dragleave`.
*
* @param {HTMLElement} obj   - the container element acting as drop target
* @param {DragEvent} event   - native dragover event
* @returns {void}
*/
export const on_dragover = function(obj, event) {
	event.preventDefault();
	event.stopPropagation();

	event.dataTransfer.dropEffect = 'move';  // See the section on the DataTransfer object.

	// Add dragover class
	// obj.classList.add('dragover')

	const element_children_length = obj.children.length
	for (let i = 0; i < element_children_length; i++) {
		const item = obj.children[i]
		if (item.classList.contains('displaced')) {
			item.classList.remove('displaced')
		}
	}

}//end on_dragover



/**
* ON_DRAGLEAVE
* Removes the 'dragover' highlight from the container when the drag pointer
* exits it without dropping, so the visual cue is cleaned up correctly.
*
* @param {HTMLElement} obj   - the container element acting as drop target
* @param {DragEvent} event   - native dragleave event
* @returns {void}
*/
export const on_dragleave = function(obj, event) {
	event.preventDefault();
	// remove dragover class
	obj.classList.remove('dragover')
}//end on_dragleave



/**
* ON_DRAGEND
* (!) Commented-out handler — kept for future reference.
* If re-enabled, it would mirror on_dragleave by removing the 'dragover'
* class on the container when the drag operation ends (whether or not a
* drop occurred). Currently drag-end cleanup is handled by the inline
* 'dragend' listener inside do_sortable in render_tool_export.js.
*/
	// export const on_dragend = function(obj, event) {
	// 	event.preventDefault();
	// 	// remove dragover class
	// 	obj.classList.remove('dragover')
	// }//end on_dragend



/**
* ON_DROP
* Handles a drop on the user-selection list container. Branches on `drag_type`
* to serve two distinct use-cases:
*
*  1. 'sort' (reorder within selection list)
*     The dragged node is stored on `self.dragged` by the 'dragstart' listener
*     in do_sortable (render_tool_export.js). On drop it is appended to the end
*     of the container, marked active, and the in-memory `ar_ddo_to_export`
*     array is rebuilt from DOM order via `self.sync_ar_ddo_to_export` and
*     then persisted via `self.update_local_db_data`.
*
*     (!) Note: sort-mode appends to the END of the list rather than inserting
*     before the hovered sibling. Precise positional insertion for sort-mode is
*     handled by the per-element 'drop' listener inside do_sortable, not here.
*     This branch is only reached when the drop lands on the container itself
*     (not on a child export_component element).
*
*  2. 'add' (new component from the section elements list)
*     Reads `path` and `ddo` from the payload, builds a stable `id` via
*     `self.compose_id`, and short-circuits if that id is already present in
*     `self.ar_ddo_to_export` (deduplication). Otherwise, constructs a clean
*     `new_ddo` object — stripping any extra keys from the source ddo and
*     replacing `ddo.path` with the full multi-hop `path` from the payload —
*     then delegates DOM construction to `self.build_export_component`, appends
*     the returned node, clears displaced highlights, syncs the array, and persists.
*
* The `new_ddo` object shape built for the 'add' path:
*   {
*     id           : string  // composed from path + lang; see compose_id
*     tipo         : string  // ontology tipo of the component
*     section_tipo : string  // ontology tipo of the owning section
*     model        : string  // JS class name, e.g. 'component_input_text'
*     parent       : string  // parent tipo (used for relational components)
*     lang         : string  // language code, e.g. 'lg-eng'
*     mode         : string  // render mode, e.g. 'edit'
*     label        : string  // human-readable column label
*     path         : Array   // full path of {section_tipo, component_tipo} hops
*   }
*
* @param {HTMLElement} container - the drop-zone container (user_selection_list)
* @param {DragEvent} event       - native drop event
* @returns {boolean|void} true on success; void when deduplicated or async branch pending
*/
export const on_drop = function(container, event) {
	event.preventDefault() // Necessary. Allows us to drop.
	event.stopPropagation()

	container.classList.remove('dragover')

	const self = this

	// data transfer
		const data			= event.dataTransfer.getData('text/plain');// element that move
		const parsed_data	= JSON.parse(data)

		if (parsed_data.drag_type!=='add') {

			const dragged = self.dragged

			const user_selection_list = container

			// move DOM node to the end, then derive order from the DOM
			user_selection_list.appendChild(dragged)

			dragged.classList.add('active')

			// Update the ddo_export from the new DOM order
				self.sync_ar_ddo_to_export()

				// save local db data
				self.update_local_db_data()
			return true
		}

	// short vars
		const path	= parsed_data.path
		const ddo	= parsed_data.ddo
		const id	= self.compose_id(ddo, path)

	// rebuild ddo
		const new_ddo = {
			id				: id,
			tipo			: ddo.tipo,
			section_tipo	: ddo.section_tipo,
			model			: ddo.model,
			parent			: ddo.parent,
			lang			: ddo.lang,
			mode			: ddo.mode,
			label			: ddo.label,
			path			: path // full path from current section replaces ddo single path
		}

	// exists
		const found = self.ar_ddo_to_export.find(el => el.id===new_ddo.id)
		if (found) {
			console.log('Ignored already included item ddo:', found);
			return
		}

	// Build component html
		self.build_export_component(new_ddo)
		.then((export_component_node)=>{

			const user_selection_list = container

			// add DOM node
			user_selection_list.appendChild(export_component_node)

			// reset
			const element_children_length = user_selection_list.children.length
			for (let i = 0; i < element_children_length; i++) {
				const item = user_selection_list.children[i]
				if (item.classList.contains('displaced')) {
					item.classList.remove('displaced')
				}
			}

			// Update the ddo_export from the new DOM order
			self.sync_ar_ddo_to_export()

			// save local db data
			self.update_local_db_data()
		})


	return true
}//end on_drop



// @license-end
