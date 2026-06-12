// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {dd_request_idle_callback} from '../../common/js/events.js'
	import {get_all_instances} from '../../common/js/instances.js'
	import {render_delete_record_dialog} from './render_ts_dialogs.js'



/**
* RENDER_ID_COLUMN
* Creates the id nodes like:
* <div class="id_column_content">
*  <a class="id_column_link ts_object_add" title="add"><div class="ts_object_add_icon"></div></a>
*  <div class="id_column_link ts_object_drag" title="drag"><div class="ts_object_drag_icon"></div></div>
*  <a class="id_column_link ts_object_delete" title="delete"><div class="ts_object_delete_icon"></div></a>
*  <a class="id_column_link ts_object_order_number"><span> 1</span></a>
*  <a class="id_column_link ts_object_edit" title="edit"><div class="ts_object_section_id_number"><span> 15</span></div><div class="ts_object_edit_icon"></div></a>
* </div>
* @param object self ts_object instance
* @return HTMLElement id_column_content
*/
export const render_id_column = function(self) {

	// short vars
		const section_tipo		= self.section_tipo
		const section_id		= self.section_id
		const is_descriptor		= self.is_descriptor
		const is_indexable		= self.is_indexable
		const mode				= self.mode
		const virtual_order		= self.virtual_order
		const is_root_node		= self.is_root_node
		const thesaurus_mode	= self.thesaurus_mode

	// id column container
		const id_column_content = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'id_column_content'
		})
	switch(thesaurus_mode) {

		case 'relation': {
			// hierarchy_node cannot be used as related  and not index-able too
			if ( is_indexable===false ) break;

			// link_related
				const link_related = ui.create_dom_element({
					element_type	: 'a',
					class_name		: 'id_column_link ts_object_related',
					title_label		: 'add',
					parent			: id_column_content
				})
				const current_label_term = self.data.ar_elements.find(el => el.type==='term')
				link_related.data = {
					section_tipo	: self.section_tipo,
					section_id		: self.section_id,
					label			: current_label_term ? current_label_term.value : ''
				}
				// click event
				const click_handler = (e) => {
					e.stopPropagation()

					// source window. Could be different than current (like iframe)
						// const source_window = window.opener || window.parent
						// if (source_window===null) {
						// 	console.warn("[link_term] Error on find window.opener / parent")
						// 	return false
						// }

					// publish event link_term
						if (!self.linker) {
							console.warn(`Error. self.linker is not defined.
								Please set ts_object linker property with desired target component portal:`, self);
							return false
						}
						// linker id. A component_portal instance is expected as linker
						const linker_id = self.linker.id
						// source_window.event_manager.publish('link_term_' + linker_id,
						const window_base = !self.linker.caller
							? window.opener // case DS opening new window
							: window // default case (indexation)
						window_base.event_manager.publish('link_term_' + linker_id, {
							section_tipo	: self.section_tipo,
							section_id		: self.section_id,
							label			: current_label_term ? current_label_term.value : ''
						})
				}
				link_related.addEventListener('click', click_handler)
			// related icon
				ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button arrow_link',
					parent			: link_related
				})
			break;
		}

		default: {

			// ADD . button + add element
				if (self.permissions_button_new>=2 && is_descriptor) {
					const link_add = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_add',
						title_label		: 'add',
						parent			: id_column_content
					})
					// click event
					const add_click_handler = async function(e) {
						e.stopPropagation()

						if (!confirm(get_label.sure || 'Sure?')) {
							return
						}

						// mode set in dataset
							link_add.dataset.mode = 'add_child'

						// add_child
							const response = await self.add_child()

						// new_section_id . Generated as response by the trigger add_child
							const new_section_id = response.result
							if (!new_section_id) {
								return
							}

						// pagination. Built by value: never mutate the cached
						// self.children_data.pagination object
							const pagination = self.children_data?.pagination
								? { limit: 0, offset: 0 }
								: null

						// children_data - get_children_data from API
							const children_data = await self.get_children_data({
								pagination	: pagination,
								children	: null,
								cache		: false // Forces call API again
							})
							if (!children_data) {
								// error case
								console.warn("[ts_object.render_children] Error, children_data is null");
								return false
							}

						// Update self children data
							self.children_data = children_data

						// refresh children container
							self.render_children({
								clean_children_container : true,
								children_data : children_data
							})
							.then(function(result){
								// result could be an array of children_container nodes or bool false
								// Open editor in new window
								if (result) {
									// edit call
									self.open_record(
										new_section_id, // section_id
										section_tipo // section_tipo
									);
								}
							})
					}
					link_add.addEventListener('click', add_click_handler)

					// add_icon_link_add
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'ts_object_add_icon',
						parent			: link_add
					})
				}//end if (self.permissions_button_new>=2)

			// MOVE DRAG . button drag element
				if (self.permissions_button_new>=2 && is_descriptor && !is_root_node) {
					const dragger = ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'id_column_link ts_object_drag',
						title_label		: 'drag',
						parent			: id_column_content
					})
					// mousedown event
					const mousedown_handler = (e) => {
						e.stopPropagation()

						const wrapper = self.node
						// event_handle. set with event value
						wrapper.event_handle = e
						// activate draggable
						wrapper.draggable = true
					}
					dragger.addEventListener('mousedown', mousedown_handler)
					// mouseup event . Reverts mousedown wrapper draggable set
					const mouseup_handler = (e) => {
						e.stopPropagation()
						const wrapper = self.node
						// event_handle. set with event value
						wrapper.event_handle = null
						// deactivate draggable
						wrapper.draggable = false
					}
					dragger.addEventListener('mouseup', mouseup_handler)

					// drag icon
					ui.create_dom_element({
						element_type	: 'div',
						class_name		: 'ts_object_drag_icon',
						parent			: dragger
					})
				}

			// DELETE . button delete element
				if (self.permissions_button_delete>=2) {
					const link_delete = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_delete',
						title_label		: 'delete',
						parent			: id_column_content
					})
					// click event
					const click_handler = (e) => {
						e.stopPropagation()
						// delete record using wrapper data
						render_delete_record_dialog({
							self					: self,
							section_id				: section_id,
							section_tipo			: section_tipo,
							has_descriptor_children	: self.has_descriptor_children
						})
					}
					link_delete.addEventListener('click', click_handler)

					// delete icon
					ui.create_dom_element({
						element_type    : 'div',
						class_name		: 'ts_object_delete_icon',
						parent			: link_delete
					 })
				}//end if (self.permissions_button_delete>=2)

			// ORDER number element
				if (self.permissions_button_new>=2 && is_descriptor && mode!=='search' && !is_root_node) {
					const order_number_link = ui.create_dom_element({
						element_type	: 'a',
						class_name		: 'id_column_link ts_object_order_number',
						text_node		: virtual_order,
						parent			: id_column_content
					})
					// Set pointer
					self.order_number_link = order_number_link
					// click event
					const click_handler = (e) => {
						e.stopPropagation()
						render_order_form({
							self				: self,
							order_number_link	: order_number_link
						})
					}
					order_number_link.addEventListener('click', click_handler)
				}

			// EDIT . button edit element
				const link_edit = ui.create_dom_element({
					element_type	: 'a',
					class_name		: 'id_column_link ts_object_edit',
					title_label		: 'edit',
					parent			: id_column_content
				})
				// mousedown event
				const mousedown_handler = (e) => {
					e.stopPropagation()

					// Get hierarchy1 from 'area_thesaurus' caller data value
					if(self.data?.ar_elements?.length === 0) {
						const value = self.caller?.data?.[0]?.value || []
						const hierarchy1 = value.find(item => item.target_section_tipo === self.section_tipo)
						if(hierarchy1) {
							self.open_record(
								hierarchy1.section_id,
								hierarchy1.section_tipo
							)
						}
						return
					}

					// edit call
					self.open_record(
						self.section_id,
						self.section_tipo
					)
				}
				link_edit.addEventListener('mousedown', mousedown_handler)

				// section_id number
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'ts_object_section_id_number',
					text_node		: self.section_id,
					parent			: link_edit
				})
				// edit icon
				ui.create_dom_element({
					element_type	: 'div',
					class_name		: 'ts_object_edit_icon',
					parent			: link_edit
				})

			break;
		}
	}//end switch(self.thesaurus_mode)


	return id_column_content
}//end render_id_column



/**
* RENDER_ORDER_FORM
* Creates an `<input>` that temporarily replaces the “order number” link.
* When the user changes the value and presses **Enter** (or blurs the field)
* the new order is saved, the children are re‑ordered and the original
* link is shown again.
* @param object options
* {
* 	self : object - ts_object instance,
* 	order_number_link: HTMLElement
* }
* @return bool
*/
const render_order_form = function(options) {

	// options
	const {
		self,
		order_number_link
	} = options

	// Check mandatory order_number_link
	if (!order_number_link) {
		return false
	}

	// Remove all previous inputs
	document.querySelectorAll('input.input_order').forEach(node => node.remove())

	// Current value (old)
	const old_value = Number(self.virtual_order) || 0

	// input. Create a input to contain the current order value
	const input = document.createElement('input')
	input.classList.add('id_column_link','input_order')
	input.value = old_value

	// keydown event - prevent the event from bubbling up (e.g. to the tree view click)
	const keydown_handler = (e) => {
		e.stopPropagation()
		// Blur on Escape key to cancel the edit
		if (e.key === 'Escape') {
			input.blur()
		}
	}
	input.addEventListener('keydown', keydown_handler);

	// change handler – called when the user presses Enter
	const change_handler = async () => {

		const wrapper = self.node

		wrapper.classList.add('loading')

		// save order. Note that this function do not await the
		// API request for performance. If the request fails,
		// a error notification is displayed at top
		await self.save_order( input.value )

		wrapper.classList.remove('loading');
		input.blur();

		// Re-order the children_container nodes
		// The nodes are ordered manually (avoiding use 'render_children') to
		// preserve the already open children ODM nodes.
		const order_children	= self.caller.children_data.ar_children_data
		const children_list		= [...self.caller.children_container.childNodes]

		for (const item of order_children) {

			// Find wrapper into the parent children_container
			const found_wrapper = children_list.find(el => {
				return  el.dataset.section_tipo===item.section_tipo &&
						el.dataset.section_id==item.section_id;
			});

			if (!found_wrapper) continue;

			// Move wrapper node to the end of the container in each
			// iteration to ends matching the order of the children data (order_children).
			self.caller.children_container.appendChild(found_wrapper)

			// Instance refresh. Force instance to update order value link
			// without render their children nodes
			const instance = get_all_instances().find(el =>
				el.section_id===item.section_id &&
				el.section_tipo===item.section_tipo &&
				el.model==='ts_object'
			);
			if (instance) {
				await instance.refresh({
					render_level	: 'content',
					destroy			: false,
					build_autoload	: false
				})
			}
		}

		// hilite current term
		dd_request_idle_callback(()=>{
			// hilite
			self.hilite_element(self.term_node)
		})
	}
	input.addEventListener('change', change_handler);

	// blur event – hide the input and show the original link
	const blur_handler = (e) => {
		e.stopPropagation()
		// Remove the unnecessary input field node
		input.remove()
		// Display the hidden order link
		order_number_link.classList.remove('hide')
	}
	input.addEventListener('blur', blur_handler);

	// Insert the input into the DOM

	// Add input element after the order_number_link
	order_number_link.parentNode.insertBefore(input, order_number_link.nextSibling);

	// Hide order_number_link
	order_number_link.classList.add('hide')

	// Focus and select new input element
	input.focus();
	input.select();


	return true
}//end render_order_form



// @license-end
