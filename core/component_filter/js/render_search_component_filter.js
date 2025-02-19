// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {get_input_element} from './render_edit_component_filter.js'



/**
* RENDER_SEARCH_COMPONENT_FILTER
* Manage the components logic and appearance in client side
*/
export const render_search_component_filter = function() {

	return true
}//end render_search_component_filter



/**
* SEARCH
* Render node for use in search
* @return HTMLElement wrapper
*/
render_search_component_filter.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data

	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change',function () {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// ul
		const ul_branch = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'branch',
			parent			: content_data
		})

	// get_children_node. Get tree nodes with children recursively
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
		const root_elements		= datalist.filter(el => el.parent === null)
		const root_elements_len	= root_elements.length
		for (let i = 0; i < root_elements_len; i++) {
			const current_element	= root_elements[i]
			const element_node		= get_children_node(current_element)
			ul_branch.appendChild(element_node)

		}


	return content_data
}//end get_content_data



// @license-end
