// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// imports
	import {dd_request_idle_callback} from '../../common/js/events.js'



/**
* ON_DRAGSTART
* Handles term drag start actions
* @param object self
*  ts_object instance
* @param event event
* @return void
*/
export const on_dragstart = function(self, event) {
	event.stopPropagation()

	// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
		const wrap_ts_object = self.find_up_tag(event.srcElement, 'wrap_ts_object')

	// wrap_ts_object ondrop set as null
		wrap_ts_object.ondrop = null

	// if handle
		if (self.handle) {
			event.stopPropagation();
			self.source = wrap_ts_object;
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/html', wrap_ts_object.innerHTML);
		}else{
			event.preventDefault();
		}

	// Fix class var 'old_parent_wrap'
		self.old_parent_wrap = wrap_ts_object.parentNode.parentNode;
		if(!self.old_parent_wrap) {
			console.log("[on_dragstart] Error on find old_parent_wrap");
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

	if(SHOW_DEBUG===true) {
		// console.log("))))) ts_object.on_dragend event", event);
	}

	// target set as false
	self.target = false;

	// source. set as blank
	self.source = null;
}//end on_dragend



/**
* ON_DROP
* Handles term drop actions
* @param object self
*  ts_object instance
* @param event event
* @return bool
*/
export const on_drop = async function(self, event) {
	event.preventDefault();
	event.stopPropagation();

	// wrap_ts_object. Find parent wrapper. Note that 'ts_object' is not an instance
		const wrap_ts_object = self.find_up_tag(event.srcElement, 'wrap_ts_object')

	// Remove drag_over class
		wrap_ts_object.classList.remove('drag_over')

	// wraps
		const wrap_source	= self.source // element that's move (global var defined at 'on_drag_mousedown')
		const wrap_target	= wrap_ts_object // element on user leaves source wrap
		if (wrap_source === wrap_target) {
			console.warn("[ts_object.on_drop] Unable self drop (2) wrap_source is equal wrap_target");
			return false;
		}

	// div_children
		let div_children	= null
		const nodes			= wrap_target.children // childNodes
		const nodes_len		= nodes.length
		for (let i = nodes_len - 1; i >= 0; i--) {
			if (nodes[i].dataset.role === 'children_container'){
				div_children = nodes[i]; break;
			}
		}
		if (div_children===null) {
			console.warn("[ts_object.on_drop] Unable self drop (3) div_children not found in nodes:",nodes);
			return false;
		}

	// data_transfer_json case
	// used by tool_cataloging to add data to the ts
		const data_transfer_json = event.dataTransfer.getData("text/plain")
		if (data_transfer_json && data_transfer_json.length>0) {
			// parse from event.dataTransfer
				const data_obj = JSON.parse(data_transfer_json)

			// add children, create new section and his node in the tree
			// go deep in the tree to point base to get back into the wrap by the add_child method
			// (it will use parentNode.parentNode to find the wrap)
				const button_obj = wrap_target.firstChild.firstChild
				// set mode to button for add_child
				button_obj.dataset.mode = self.is_root( wrap_target.dataset.section_tipo ) // hierarchy1
					? 'add_child_from_hierarchy'
					: 'add_child';
				// request to create the section and node
				self.add_child(button_obj)
				.then(function(response){

					// callback
					if (data_obj.caller) {

						// new_section_id . Generated as response by the trigger add_child
							const new_section_id = response.result

						// short vars
							const section_tipo	= wrap_target.dataset.section_tipo
							const children_tipo	= wrap_target.dataset.children_tipo

						// fire the event to update the component used as term in the new section
							event_manager.publish('ts_add_child_' + data_obj.caller, {
								locator			: data_obj.locator,
								new_ts_section	: {
									section_id		: new_section_id,
									section_tipo	: section_tipo
								},
								callback : function() {

									// link_children_element. list_thesaurus_element of current wrapper
									const link_children_element = self.get_link_children_from_wrap(wrap_target)
									if(!link_children_element) {
										console.warn("[tool_cataloging.set_new_thesaurus_value] Error on find link_children_element 'link_childrens'");
										return false
									}

									// self.update_arrow_state(link_children_element, true)

								// refresh children container
									self.get_children(
										link_children_element,
										null, // object|null pagination
										true // bool clean_children_container
									)
									render_children({
										link_children_element		: link_children_element,
										section_tipo				: section_tipo,
										section_id					: new_section_id,
										pagination					: null,
										clean_children_container	: true,
										children_tipo				: children_tipo
									})
									.then(function(){
										// update parent arrow button
										 // self.update_arrow_state(link_children_element, true)
										self.update_arrow_state(link_children_element, false)
									})

								}
							})
					}//end if (data_obj.caller)
				})

			return true // stop execution here
		}

	// element_children target/source
		const element_children_target	= self.get_link_children_from_wrap(wrap_target)
		const element_children_source	= self.get_link_children_from_wrap(self.old_parent_wrap)

	// check nodes
		if ( !div_children || !wrap_source ) {
			console.error('"Error on append child":', wrap_source, div_children);
			return false
		}

	// add node
		div_children.appendChild(wrap_source)

	// Update parent data (returns a promise after HTTP request finish)
		// const response = await self.update_parent_data(wrap_source)

		// Old parent wrap (previous parent)
			const old_parent_wrap = self.old_parent_wrap
			if (!old_parent_wrap) {
				console.error("[ts_object.update_parent_data] Error on find old_parent_wrap");
				return false
			}

		// parent wrap (current drooped new parent)
			const parent_wrap = wrap_source.parentNode.parentNode;
			if(!parent_wrap) {
				console.error("[ts_object.update_parent_data] Error on find parent_wrap");
				return false
			}

		// If old and new wrappers are the same, no is necessary update data
			if (old_parent_wrap===parent_wrap) {
				console.error("[ts_object.update_parent_data] New target and old target elements are the same. No is necessary update data");
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

		const response = await self.update_parent_data({
			section_id				: section_id,
			section_tipo			: section_tipo,
			old_parent_section_id	: old_parent_section_id,
			old_parent_section_tipo	: old_parent_section_tipo,
			new_parent_section_id	: new_parent_section_id,
			new_parent_section_tipo	: new_parent_section_tipo
		})

	// Updates element_children_target
		// self.update_arrow_state(element_children_target, true) // Not necessary ?

	// Updates element_children_source
		self.update_arrow_state(element_children_source, false)

	// hilite moved term. wait 200 ms to allow arrow state update
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
			console.log("))))) [on_drop self.update_parent_data] response", response)
			console.log("))))) [self.on_drop] Finish on_drop 3");
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
