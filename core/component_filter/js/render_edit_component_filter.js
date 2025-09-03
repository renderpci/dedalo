// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {object_to_url_vars, open_window} from '../../common/js/utils/index.js'
	import {view_default_edit_filter} from './view_default_edit_filter.js'
	import {view_line_edit_filter} from './view_line_edit_filter.js'



/**
* RENDER_EDIT_COMPONENT_filter
* Manage the components logic and appearance in client side
*/
export const render_edit_component_filter = function() {

	return true
}//end render_edit_component_filter



/**
* EDIT
* Render node for use in edit
* @param object options
* @return HTMLElement component_wrapper
*/
render_edit_component_filter.prototype.edit = async function(options) {

	const self = this

	// view
		const view = self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_filter.render(self, options)

		case 'print':
			// view print use the same view as default, except it will use read only to render content_value
			// as different view as default it will set in the class of the wrapper
			// sample: <div class="wrapper_component component_input_text oh14 oh1_oh14 edit view_print disabled_component">...</div>
			// take account that to change the css when the component will render in print context
			// for print we need to use read of the content_value and it's necessary force permissions to use read only element render
			self.permissions = 1

		case 'default':
		default:
			return view_default_edit_filter.render(self, options)
	}
}//end edit



/**
* GET_CONTENT_DATA
* Builds and returns the main content data container for the component,
* including a hierarchical tree of its datalist entries rendered as nested DOM nodes.
* This function:
* - Uses the component's `data.datalist` to build a tree structure.
* - Creates a root `<ul>` element inside the component's content data container.
* - Recursively processes each data entry and its children.
* - Appends the resulting DOM nodes to the appropriate branches.
* @param object self
* 	Component instance
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// parent ul
	const ul_branch = ui.create_dom_element({
		element_type	: 'ul',
		class_name		: 'content_value branch',
		parent			: content_data
	})

	// get tree nodes with children recursively
	const get_children_node = function(element) {

		const children_elements = datalist
			.filter(
				el => el.parent &&
				el.parent.section_tipo === element.section_tipo &&
				el.parent.section_id === element.section_id
			)
			.sort((a, b) =>
				(a.order - b.order) || ((a.label || '').localeCompare(b.label || ''))
			);

		const children_elements_len = children_elements.length
		// modify has_children property
		element.has_children = (children_elements_len > 0)

		// element_node
		const element_node = (self.permissions===1)
			? get_input_element_read(element, self)
			: get_input_element(element, self)

		if(children_elements_len > 0) {
			for (let i = 0; i < children_elements_len; i++) {
				const current_child	= children_elements[i]
				const child_node	= get_children_node(current_child)
				element_node.branch.appendChild(child_node)
			}
		}

		return element_node;
	}

	// root nodes
	// Filter projects without parent (root nodes) and sort by order if defined.
	// If not, sort by label alphabetically.
	const root_elements	= datalist
		.filter(el => el.parent === null)
		.sort((a, b) =>
			(a.order - b.order) || ((a.label || '').localeCompare(b.label || ''))
		);

	// Iterate root nodes and get children adding everyone to the parent ul branch.
	const root_elements_len	= root_elements.length
	for (let i = 0; i < root_elements_len; i++) {
		const current_element	= root_elements[i]
		const element_node		= get_children_node(current_element)
		ul_branch.appendChild(element_node)
	}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* Render li node with given element data and value
* @param object element
* 	sample: {type: 'project', label: 'Camino de la Justicia', section_tipo: 'dd153', section_id: '9', value: {…}, …}
* @param object self
* @return HTMLElement li
*/
export const get_input_element = (element, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const label				= element.label || ''
		const section_id		= element.section_id
		const section_tipo		= element.section_tipo
		const datalist_value	= element.value
		if (datalist_value) {
			datalist_value.from_component_tipo = self.tipo
		}

	// li container
		const li_class_name = (element.has_children) ? ' grouper' : ''
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'item_li' + li_class_name
		})

	// input checkbox
		const input_node = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			class_name		: 'item_input',
			parent			: li
		})
		// change event
		const input_change_handler = (e) => {
			e.preventDefault()

			// check all values
				const checked_items = []
				const all_inputs = self.node.content_data.querySelectorAll('.item_input')
				for (let i = 0; i < all_inputs.length; i++) {
					if(all_inputs[i].checked) {
						checked_items.push(all_inputs[i])
					}
				}
				if (checked_items.length<1 && self.mode!=='search') {
					// restore checked
					input_node.checked = true
					alert( get_label.select_one_project || 'You must select at least one project' );
					return
				}

			// common change handler
			self.change_handler({
				datalist_value	: datalist_value,
				action			: (input_node.checked===true) ? 'insert' : 'remove'
			})
		}
		input_node.addEventListener('change', input_change_handler)
		// mousedown event
		const mousedown_handler = (e) => {
			e.stopPropagation()
		}
		input_node.addEventListener('mousedown', mousedown_handler)


	// label
		ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'item_label',
			inner_html		: label,
			title			: 'ID: ' + section_id,
			parent			: li
		})

	// children
		if(element.has_children){

			const key = section_tipo +'_'+ section_id

			// icon_arrow
				const icon_arrow = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'icon_arrow',
					parent 			: li
				})

			// branch
				const branch = ui.create_dom_element({
					element_type	: 'ul',
					class_name		: 'branch',
					parent 			: li
				})
				li.branch = branch

			// collapse_toggle_track
				ui.collapse_toggle_track({
					toggler				: icon_arrow,
					container			: branch,
					collapsed_id		: 'collapsed_component_filter_group_' + key,
					collapse_callback	: () => {
						icon_arrow.classList.remove('up')
					},
					expose_callback		: () => {
						icon_arrow.classList.add('up')
					}
				})
		}

		// checked option set on match
			for (let j = 0; j < value_length; j++) {
				if (value[j] && datalist_value &&
					value[j].section_id===datalist_value.section_id &&
					value[j].section_tipo===datalist_value.section_tipo
					) {
						input_node.checked = 'checked'
				}
			}


	return li
}//end get_input_element



/**
* GET_INPUT_ELEMENT_READ
* Render li node with given element data and value in read only mode
* @param object element
* 	sample: {type: 'project', label: 'Camino de la Justicia', section_tipo: 'dd153', section_id: '9', value: {…}, …}
* @param object self
* @return HTMLElement li
*/
export const get_input_element_read = (element, self) => {

	// short vars
		const value				= self.data.value || []
		const datalist_value	= element.value
		const label				= element.label || (element.section_tipo+'_'+element.section_id)

	// checked option set on match
		const found = value.find(el => datalist_value &&
			el.section_id===datalist_value.section_id &&
			el.section_tipo===datalist_value.section_tipo
		)

	// li container
		const li_class_name = (element.has_children) ? ' grouper' : ''
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'item_li' + li_class_name
		})

	// label
		if(found){
			// label
				const label_node = ui.create_dom_element({
					element_type	: 'label',
					class_name		: 'item_label',
					inner_html		: label,
					parent			: li
				})

			// icon_node check
				const icon_node = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'icon_button icon check '
				})
				label_node.prepend(icon_node)
		}

	// has_children case
		if(element.has_children) {
			// branch
			const branch = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'branch',
				parent 			: li
			})
			li.branch = branch
		}


	return li
}//end get_input_element_read



/**
* GET_BUTTONS
* @param object self
* @return HTMLElement buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const show_interface = self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// button edit (go to target section: Projects)
		if(show_interface.button_list === true){

			const target_sections			= self.context.target_sections
			const target_sections_length	= target_sections.length
			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				const label = (SHOW_DEBUG===true)
					? `${item.label} [${item.tipo}]`
					: item.label

				const button_list = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button pen',
					title			: label,
					parent			: fragment
				})
				// mousedown event
				const mousedown_handler = (e) => {
					e.stopPropagation()

					// open a new window
					const url = DEDALO_CORE_URL + '/page/?' + object_to_url_vars({
						tipo	: item.tipo,
						mode	: 'list',
						menu	: false
					})
					open_window({
						url		: url,
						name	: 'section_view',
						on_blur : () => {
							// refresh current instance
							self.refresh({
								build_autoload : true
							})
						}
					})
				}
				button_list.addEventListener('mousedown', mousedown_handler)
			}
		}

	// button reset (button_delete)
		if(show_interface.button_delete === true){

			const button_reset = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button reset',
				parent			: fragment
			})
			button_reset.addEventListener('click', function(e) {
				e.stopPropagation()

				if (self.data.value.length===0) {
					return true
				}

				if (!confirm(get_label.sure || 'Sure?')) {
					return
				}

				const changed_data = [Object.freeze({
					action	: 'remove',
					key		: false,
					value	: null
				})]
				self.change_value({
					changed_data	: changed_data,
					label			: 'All',
					refresh			: true
				})

				return true
			})
		}

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// button_fullscreen
		if(show_interface.button_fullscreen === true){
			const button_fullscreen = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button full_screen',
				title			: get_label.full_screen || 'Full screen',
				parent			: fragment
			})
			// click event
			const click_handler = (e) => {
				e.stopPropagation()
				ui.enter_fullscreen(self.node)
			}
			button_fullscreen.addEventListener('click', click_handler)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
