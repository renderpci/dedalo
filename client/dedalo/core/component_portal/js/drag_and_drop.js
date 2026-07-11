// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global  */
/*eslint no-undef: "error"*/

// imports
	import {get_all_instances} from '../../common/js/instances.js'


/**
* DRAG_AND_DROP
* Native HTML5 drag-and-drop handlers for `component_portal` list/mosaic views.
*
* Exports six event-handler functions — on_dragstart, on_dragstart_mosaic,
* on_dragover, on_dragleave, on_dragend, and on_drop — that are wired by the
* portal's render layer to the matching DOM drag events.
*
* Two operations are supported:
*   REORDER  — dragging a record within the same portal repositions it by calling
*              `component_portal.prototype.sort_data`, which persists the new order
*              via the change_value → API pipeline.
*   COPY     — dragging a record from one portal to a compatible portal calls
*              `link_record` on the target and `unlink_record` on the source,
*              effectively moving the relation.
*
* Compatibility between portals is governed by `properties.draggable_to`, an
* array of tipo strings (e.g. ['dd1234', 'dd1235']) declared on the source portal.
* A drop is allowed only when the target portal's `tipo` appears in that array, or
* when source and target are the same portal (same-portal reorder always allowed).
*
* The `tmp` module-level object is used as an out-of-band channel to pass
* `transfer_data` to `on_dragover`, because `event.dataTransfer.getData()` is
* blocked by browsers during dragover for security reasons.
*
* Exported symbols:
*   on_dragstart        — list-view drag start (drag icon node)
*   on_dragstart_mosaic — mosaic-view drag start (section record node)
*   on_dragover         — dragover on a drop target node
*   on_dragleave        — dragleave on a drop target node
*   on_dragend          — drag operation ended (cleanup)
*   on_drop             — drop on a target node (commit reorder or copy)
*/



// Temporary object to provide access to `dataTransfer`` object that is not available in all events
	const tmp = {}

/**
* ON_DRAGSTART
* Initialises a drag operation from the list view of a component_portal.
* Serialises the record's locator and position into `event.dataTransfer` as JSON
* text (readable on drop), and also stores it in the `tmp` module object so that
* `on_dragover` can inspect the source tipo without triggering browser security
* restrictions on getData().
*
* Also resizes and reveals all `.drop` overlay nodes so they span their parent
* section-record row, providing visible drop targets across the full grid width.
*
* @param {HTMLElement} node - the drag-handle icon node that received the dragstart event
* @param {DragEvent} event - native browser DragEvent
* @param {Object} options - context injected by the render layer
*   @param {Object} options.locator - full locator object for the dragged record
*   @param {number} options.paginated_key - zero-based position of the record in the current page
*   @param {Object} options.caller - the component_portal instance owning this list
* @returns {boolean} always true
*/
export const on_dragstart = function(node, event, options) {
	event.stopPropagation();

	// transfer_data. Will be necessary the original locator of the section_record and
	// the paginated_key (the position in the array of data)
		const draggable_to = options.caller.properties.draggable_to || []
		const transfer_data = {
			locator			: options.locator,
			paginated_key	: options.paginated_key,
			source_tipo		: options.caller.tipo || null,
			source_id		: options.caller.id || null,
			draggable_to 	: draggable_to
		}
		// console.log('>> on_dragstart transfer_data:', transfer_data);

	// set tmp data to be used by the `dragover`
		tmp.data = transfer_data

	// data. The data will be transfer to drop in text format
		const data = JSON.stringify(transfer_data)

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);


	// style the drag element to be showed in drag mode
		node.classList.add('dragging')
		// node.firstChild.classList.remove('hide')

	// get the content_data of the component_portal, it has the all section records nodes
		const content_data		= options.caller.node.content_data
		const ar_section_record	= content_data.childNodes

	// it's necessary set every drop node with the view boundaries of the grid
	// drop nodes will resize to cover the section_record
		for (let i = ar_section_record.length - 1; i >= 0; i--) {

			const section_record_node	= ar_section_record[i]
			const current_drop			= section_record_node.querySelector('.drop')

			// first node . Get the boundaries of the last node of the section_record
			// drop nodes will be resize with the height of this last_node
				const first_node		= section_record_node.firstChild // usually column 'id'
				const rect_first_node	= first_node.getBoundingClientRect();

			// last_node. Get the boundaries of the last node of the section_record
			// drop nodes will be resize with the height of this last_node
				const last_node			= section_record_node.lastChild // usually column 'remove'
				const rect_last_node	= last_node.getBoundingClientRect();

			// set height and width, width remove the padding of the grid
				const height = Math.round( rect_last_node.height )
				const width	 = Math.round( (rect_last_node.x + rect_last_node.width) - rect_first_node.x )

				current_drop.style.height	= height + 'px'
				current_drop.style.width	= width + 'px'

			// show the drop in DOM
				current_drop.classList.remove('hide')
		}


	return true
}//end on_dragstart



/**
* ON_DRAGSTART_MOSAIC
* Initialises a drag operation from the mosaic view of a component_portal.
* Functionally equivalent to `on_dragstart` but operates on the section-record
* node directly (the draggable tile), rather than a dedicated drag-icon handle.
* Does NOT resize drop overlays — mosaic view manages drop targets differently.
*
* @param {HTMLElement} node - the mosaic tile (section_record node) being dragged
* @param {DragEvent} event - native browser DragEvent
* @param {Object} options - context injected by the render layer
*   @param {Object} options.locator - full locator object for the dragged record
*   @param {number} options.paginated_key - zero-based position of the record in the current page
*   @param {Object} options.caller - the component_portal instance owning this mosaic
* @returns {boolean} always true
*/
export const on_dragstart_mosaic = function(node, event, options) {
	// event.preventDefault();
	event.stopPropagation();

	// will be necessary the original locator of the section_record and the paginated_key (the position in the array of data)
	const draggable_to = options.caller.properties.draggable_to || []

	const transfer_data = {
		locator			: options.locator,
		paginated_key	: options.paginated_key,
		source_tipo		: options.caller.tipo || null,
		source_id		: options.caller.id || null,
		draggable_to 	: draggable_to
	}

	// set tmp data to be used by the `dragover`
		tmp.data = transfer_data

	// the data will be transfer to drop in text format
		const data = JSON.stringify(transfer_data)

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);


	// style the drag element to be showed in drag mode
	node.classList.add('dragging')

	return true
}//end on_dragstart_mosaic



/**
* ON_DRAGOVER
* Fires repeatedly while a dragged element passes over a `.drop` target node.
* Validates that the drag source is compatible with this portal (same portal, or
* the target's tipo appears in the source's `draggable_to` list), then adds the
* visual `dragover` highlight to the node.
*
* Uses `tmp.data` rather than `event.dataTransfer.getData()` because browsers
* block getData() calls during dragover for cross-origin security reasons.
*
* (!) Must call `event.preventDefault()` to signal that this is a valid drop
* target; omitting it causes the browser to reject the subsequent `drop` event.
*
* @param {HTMLElement} node - the `.drop` overlay node currently under the pointer
* @param {DragEvent} event - native browser DragEvent
* @param {Object} options - context injected by the render layer
*   @param {Object} options.caller - the component_portal instance that owns this drop node
* @returns {boolean} true when the drop is permitted; false when rejected
*/
export const on_dragover = function(node, event, options) {
	event.preventDefault();
	event.stopPropagation();

	const self = options.caller || null

	const data			= tmp.data
	const source_tipo	= data.source_tipo;
	const draggable_to	= data.draggable_to;// element that's move

	if(source_tipo !== self.tipo){
	// Check if the node is compatible with the source
		const found = draggable_to.find(el => el === self.tipo)

		if(!found){
			return false
		}
	}

	node.classList.add('dragover')

	return true
}//end on_dragover



/**
* ON_DRAGLEAVE
* Removes the `dragover` visual highlight when the dragged element leaves a
* `.drop` target node. Paired with `on_dragover`.
*
* @param {HTMLElement} node - the `.drop` overlay node the pointer left
* @param {DragEvent} event - native browser DragEvent
* @returns {void}
*/
export const on_dragleave = function(node, event) {
	event.preventDefault()
	event.stopPropagation();

	node.classList.remove('dragover')
}//end on_dragleave



/**
* ON_DRAGEND
* Cleans up after a drag operation finishes (whether or not a successful drop
* occurred). Removes the `dragging` CSS class from the drag source, resets all
* `.drop` overlay nodes back to zero size, hides them, and clears `tmp.data`.
*
* Called on the original drag source node, NOT on the drop target.
*
* @param {HTMLElement} node - the drag-handle node (same node passed to on_dragstart)
* @param {DragEvent} event - native browser DragEvent
* @param {Object} options - context injected by the render layer
*   @param {Object} options.caller - the component_portal instance that owns this list
* @returns {void}
*/
export const on_dragend = function(node, event, options) {
	event.preventDefault();
	event.stopPropagation();

	// style the drag element to be showed in drag mode
		node.classList.remove('dragging')

	// get content data, it has the section_records nodes with the drop nodes.
	// const content_data		= node.parentNode.parentNode.parentNode
	const content_data		= options.caller.node.content_data
	const ar_section_record	= content_data.childNodes

	for (let i = ar_section_record.length - 1; i >= 0; i--) {

		const section_record_node	= ar_section_record[i]
		const current_drop			= section_record_node.querySelector('.drop')
		// set the drop nodes to the original size and hide it.
		current_drop.style.height	= 0
		current_drop.style.width	= 0
		current_drop.classList.add('hide')
	}

	// clear tmp data
	delete tmp.data
}//end on_dragend



/**
* ON_DROP
* Commits the result of a completed drag-and-drop operation.
*
* Two branches:
*
*   COPY (cross-portal): when `source_tipo !== self.tipo`, the dragged record is
*   being moved from another portal. After verifying compatibility via
*   `draggable_to`, calls `link_record` on this portal and `unlink_record` on
*   the source portal instance (looked up via `get_all_instances`).
*
*   REORDER (same-portal): when source and target are the same portal, computes
*   the absolute `target_key` (accounting for the current paginator offset) and
*   delegates to `self.sort_data`, which persists the new order via the
*   change_value → API pipeline and refreshes the portal view.
*
* The `target_key` sent to the server is offset-adjusted so that the sort
* operation targets the correct absolute position in the full (unpaginated) data
* array, not just the position within the current page.
*
* (!) `event.preventDefault()` is required here to allow the drop to proceed;
* without it the browser may execute its default action (e.g. navigate to the
* drag data as a URL).
*
* @param {HTMLElement} node - the `.drop` overlay node that received the drop
* @param {DragEvent} event - native browser DragEvent
* @param {Object} options - context injected by the render layer
*   @param {number|undefined} options.paginated_key - zero-based position of this drop target in the current page
*   @param {Object} options.caller - the component_portal instance that owns this drop node
* @returns {boolean} true on success; false when the drop is rejected (same position or incompatible portal)
*/
export const on_drop = function(node, event, options) {
	event.preventDefault() // Necessary. Allows us to drop.
	event.stopPropagation()

	// self is the component_portal that call and it has the sort_order function
	const self	= options.caller
	const data	= event.dataTransfer.getData('text/plain');// element that's move

	// remove the drag style
	node.classList.remove('dragover')

	// the drag element will sent the data of the original position, the source_key
	const data_parse = JSON.parse(data)

	// COPY
		// copy data from other portal
		if( data_parse.source_tipo !== self.tipo ){

			// check if the portal is compatible
			// checking properties
			const source_draggable_to = data_parse.draggable_to
			const able_to_drop = source_draggable_to.find(el => el === self.tipo)
			if( !able_to_drop ){
				return false
			}

			// add new locator to the target portal
			self.link_record(data_parse.locator)

			// remove the locator from the source portal
			const source_id		= data_parse.source_id
			const ar_instances	= get_all_instances()

			const source_instance = ar_instances.find(el => el.id === source_id)
			if(source_instance){
				source_instance.unlink_record(data_parse.locator)
			}

			return true
		}

	// REORDER
		// reorder data from the same portal
		// check if the position is the same that the origin
		if(	options.paginated_key === data_parse.paginated_key || typeof options.paginated_key === "undefined"){
			return false
		}

		// set wrapper as loading
			self.node.classList.add('loading')

		// sort data with the old and new position
		// the locator will be checked in server to be sure that the source position
		// is the same that the data in the server, if not the server will send a error
			const offset = self.paginator.offset || 0
			const sort_data_options = {
				value		: data_parse.locator,
				source_key	: data_parse.locator.paginated_key,
				target_key	: options.paginated_key + offset
			}

		// exec async sort_data (call to API)
			self.sort_data(sort_data_options)
			.then(function(){
				// remove wrapper loading
				self.node.classList.remove('loading')
			})


	return true
}//end on_drop



// @license-end
