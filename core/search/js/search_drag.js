// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
* SEARCH_DRAG
* Drag-and-drop handlers for the search UI filter builder.
*
* These four functions implement the HTML5 drag-and-drop lifecycle for search
* component widgets (.search_component / .search_group elements) rendered by
* render_search.js.  They are exported here and then assigned to
* search.prototype in search.js so that each search instance inherits them.
*
* Interaction model:
*  - A user drags a search_group or search_component div to a different position
*    in the filter builder.
*  - on_dragstart serialises the element's ontology path (data-path) and row
*    identifier (data-section_id) into the drag payload.
*  - on_dragover prevents the default browser action so the element is a valid
*    drop target.
*  - on_dragleave is a no-op placeholder; kept so the 'dragleave' event listener
*    registered in render_search_group has a valid handler to call.
*  - on_drop deserialises the payload, calls build_search_component on the search
*    instance to create a new filter widget at the target location, then marks the
*    search state as changed.
*
* Data transferred via dataTransfer:
*   { path: string, section_id: string }
*   where `path` is the JSON-stringified array of path items identifying the
*   component in the ontology (set as data-path on the draggable element by
*   build_search_component), and `section_id` is the row identifier used to
*   scope the component's server-side query.
*
* Exports: on_dragstart, on_dragover, on_dragleave, on_drop
*/


	/**
	* ON_DRAGSTART
	* Handles the start of a drag operation on a search widget element.
	*
	* Serialises the draggable element's ontology path and section row ID into a
	* JSON string and stores it in the dataTransfer object under 'text/plain' so
	* that on_drop can reconstruct the component at the drop target.
	*
	* The effectAllowed is set to 'move' to communicate intent to the browser and
	* to enable the CSS :drag cursor on supporting platforms.
	*
	* @param {HTMLElement} obj   - The element being dragged (expected to carry
	*                              data-path and data-section_id dataset attributes).
	* @param {DragEvent}   event - The native dragstart event.
	* @returns {boolean} Always returns true.
	*/
	export const on_dragstart = function(obj, event) {

		event.stopPropagation();

		const data = JSON.stringify({
			path		: obj.dataset.path,
			section_id	: obj.dataset.section_id
		})

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);

		return true;
	}//end on_dragstart


	/**
	* ON_DRAGOVER
	* Handles the dragover event to mark an element as a valid drop target.
	*
	* Calling event.preventDefault() is required by the HTML5 drag-and-drop spec
	* to signal that this element accepts drops; without it, the 'drop' event will
	* never fire.  event.stopPropagation() prevents ancestor elements from also
	* responding to the event and triggering redundant visual feedback.
	*
	* @param {HTMLElement} obj   - The element currently under the dragged item.
	* @param {DragEvent}   event - The native dragover event.
	* @returns {boolean} Always returns false (conventional for dragover handlers).
	*/
	export const on_dragover = function(obj, event) {
		event.preventDefault();
		event.stopPropagation();

		return false;
	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	* Placeholder handler for the dragleave event.
	*
	* The 'dragleave' listener is registered on every search_group element in
	* render_search_group.  This stub ensures the binding does not throw even
	* though no visual state change is currently implemented for dragleave.
	* Future implementations could remove a hover/highlight class added in
	* on_dragover here.
	*
	* @param {HTMLElement} obj - The element that the drag cursor has left.
	* @returns {boolean} Always returns false.
	*/
	export const on_dragleave = function(obj) {

		return false;
	}//end on_dragleave



	/**
	* ON_DROP
	* Handles the drop event by rebuilding a search component at the target element.
	*
	* Deserialises the drag payload (path + section_id) written by on_dragstart,
	* then delegates to search.build_search_component to instantiate and render a
	* new search widget inside the drop target container.  After the component is
	* built, update_state is called with 'changed' so the filter model is marked
	* dirty and the apply button becomes active.
	*
	* Note: this function does NOT remove the original dragged element from its
	* former location — the DOM move / old-element cleanup is expected to be
	* handled separately (e.g. via a 'dragend' handler registered by the caller).
	*
	* 'self' captures `this` at entry.  When these handlers are assigned to
	* search.prototype and called as instance methods, `this` is the search
	* instance, giving access to build_search_component and update_state.
	* The comment "reference to 'search' (non instance)" in the code is
	* misleading — it is in fact the search prototype instance bound by the
	* event listener in render_search_group: `self.on_drop(this, e)`.
	* (!) Do not arrow-function this export; the `this` binding would be lost.
	*
	* @param {HTMLElement} obj   - The drop-target container element (a .search_group
	*                              div or similar parent into which the rebuilt
	*                              component will be appended).
	* @param {DragEvent}   event - The native drop event carrying the serialised
	*                              drag payload in dataTransfer.
	* @returns {boolean} Always returns true.
	*/
	export const on_drop = function(obj, event) {
		event.preventDefault(); // Necessary. Allows us to drop.
		event.stopPropagation();

		const self = this // reference to 'search' (non instance)

		const data 		  = event.dataTransfer.getData('text/plain') // element thats move
		const wrap_target = obj // element on user leaves source wrap

		let data_parse
		try {
			data_parse = JSON.parse(data)
		} catch (error) {
			console.error('on_drop: invalid drag data JSON', data, error)
			return false
		}
		const path = data_parse.path

		const section_id = data_parse.section_id

		// Build component html
		self.build_search_component({
			parent_div		: wrap_target,
			path_plain		: path,
			current_value	: null,
			q_operator		: null,
			section_id		: section_id
		})
		.then(()=>{
			// Update the state and save
			self.update_state({state : 'changed'})
		});

		return true;
	}//end on_drop



// @license-end
