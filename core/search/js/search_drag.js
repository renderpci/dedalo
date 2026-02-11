// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



	/**
	* ON_DRAGSTART
	* Handles the start of a drag operation.
	* Stores the component path and section ID in the dataTransfer object.
	* @param HTMLElement obj - The element being dragged
	* @param DragEvent event - The drag event
	* @return bool
	*/
	export const on_dragstart = function(obj, event) {

		event.stopPropagation();

		const data = JSON.stringify({
			path		: obj.dataset.path,
			section_id	: obj.dataset.section_id
		})

		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/plain', data);

		return true
	}//end ondrag_start


	/**
	* ON_DRAGOVER
	* Handles the dragover event to allow dropping.
	* @param HTMLElement obj - The target element
	* @param DragEvent event - The drag event
	*/
	export const on_dragover = function(obj, event) {
		event.preventDefault();
		event.stopPropagation();

	}//end on_dragover



	/**
	* ON_DRAGLEAVE
	* Handles the dragleave event.
	* @param HTMLElement obj - The element being left
	* @param DragEvent event - The drag event
	*/
	export const on_dragleave = function(obj, event) {

	}//end on_dragleave



	/**
	* ON_DROP
	* Handles the drop event, creating a new search component at the target location.
	* @param HTMLElement obj - The target element
	* @param DragEvent event - The drop event
	* @return bool
	*/
	export const on_drop = function(obj, event) {
		event.preventDefault() // Necessary. Allows us to drop.
		event.stopPropagation()

		const self = this

		const data 		  = event.dataTransfer.getData('text/plain') // element thats move
		const wrap_target = obj // element on user leaves source wrap

		const data_parse = JSON.parse(data)
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

		return true
	}//end on_drop



// @license-end
