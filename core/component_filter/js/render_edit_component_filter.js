/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'
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
* @return DOM node
*/
render_edit_component_filter.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_filter.render(self, options)
			break;

		case 'default':
		default:
			return view_default_edit_filter.render(self, options)
	}

	return null
}//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data				= self.data || {}
		const datalist			= data.datalist || []
		// const datalist_length	= datalist.length

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add('nowrap')

		// ul
			const ul_branch = ui.create_dom_element({
				element_type	: 'ul',
				class_name		: 'branch',
				parent			: content_data
			})

		// get tree nodes with children recursively
		const get_children_node = function(element){

			const children_elements = datalist.filter(
				el => el.parent && el.parent.section_tipo === element.section_tipo
				&& el.parent.section_id === element.section_id
			)
			const children_elements_len = children_elements.length

			const has_children = (children_elements_len > 0)
				? true
				: false

			element.has_children = has_children

			const element_node = get_input_element(element, self)

			if(children_elements_len > 0){

				for (let i = 0; i < children_elements_len; i++) {
					const current_child = children_elements[i]
					const child_node = get_children_node(current_child)
					element_node.branch.appendChild(child_node)
				}
			}
			return element_node;
		}

	// root nodes
		const root_elements = datalist.filter(el => el.parent === null)

		const root_elements_len = root_elements.length

		for (let i = 0; i < root_elements_len; i++) {
			const current_element = root_elements[i]
			const element_node = get_children_node(current_element)
			ul_branch.appendChild(element_node)

		}

	return content_data
}//end get_content_data


/**
* GET_INPUT_ELEMENT
* @return DOM node li
*/
const get_input_element = (element, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const datalist_value	= element.value
		const label				= element.label
		const section_id		= element.section_id
		const section_tipo		= element.section_tipo

		const class_list = (element.has_children)
			? 'item_li grouper'
			: 'item_li'
	// create li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: class_list
		})

	// label
		const label_string = (SHOW_DEBUG===true) ? label + ' [' + section_id + ']' : label
		// const class_list = (element.has_children)
		// 	? 'icon_arrow'
		// 	:''

		const label_node = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'item_label',
			inner_html		: label_string,
			parent			: li
		})

	// input checkbox
		const input_node = ui.create_dom_element({
			element_type	: 'input',
			class_name		: 'item_input',
			type			: 'checkbox'
		})
		label_node.prepend(input_node)
		input_node.addEventListener('change',function() {

			const action		= (input_node.checked===true) ? 'insert' : 'remove'
			const changed_key	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
			const changed_value	= (action==='insert') ? datalist_value : null

			const changed_data_item = Object.freeze({
				action	: action,
				key		: changed_key,
				value	: changed_value
			})

			// fix instance changed_data
				self.set_changed_data(changed_data_item)
		})//end change event

		if(element.has_children){

			const key = section_tipo +'_'+ section_id

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
				// branch.appendChild(li)
				li.branch = branch

			// collapse_toggle_track
				ui.collapse_toggle_track({
					header				: icon_arrow,
					content_data		: branch,
					collapsed_id		: 'collapsed_component_filter_group_' + key,
					collapse_callback	: collapse,
					expose_callback		: expose
				})
				function collapse() {
					li.classList.remove('up')
				}
				function expose() {
					li.classList.add('up')
				}
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
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
export const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// button edit (go to target section)
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {

			const target_sections			= self.context.target_sections
			const target_sections_length	= target_sections.length
			for (let i = 0; i < target_sections_length; i++) {

				const item = target_sections[i]

				const label = (SHOW_DEBUG===true)
					? `${item.label} [${item.tipo}]`
					: item.label

				const button_edit = ui.create_dom_element({
					element_type	: 'span',
					class_name		: 'button edit',
					title			: label,
					parent			: fragment
				})
				button_edit.addEventListener("click", function(e){
					e.stopPropagation()
					// navigate link
					event_manager.publish('user_navigation', {
						source : {
							tipo	: item.tipo,
							model	: 'section',
							mode	: 'list'
						}
					})
				})
			}
		}

	// button reset
		const button_reset = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button reset',
			parent			: fragment
		})
		button_reset.addEventListener('click', function() {
			if (self.data.value.length===0) {
				return true
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

	// buttons tools
		if (!is_inside_tool && mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
