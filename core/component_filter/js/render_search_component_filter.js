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



/**
* GET_GROUPER_ELEMENT
*	Typology element
* @return dom element li
*/
	// const get_grouper_element = (i, datalist_item, self) => {

	// 	// grouper
	// 		const grouper = ui.create_dom_element({
	// 			element_type	: 'li',
	// 			class_name		: 'grouper',
	// 			data_set		: {
	// 				id		: datalist_item.section_tipo +'_'+ datalist_item.section_id,
	// 				parent	: datalist_item.parent ? (datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id) : ''
	// 			}
	// 		})

	// 	// label
	// 		const grouper_label = ui.create_dom_element({
	// 			element_type	: 'div',
	// 			class_name		: 'grouper_label',
	// 			inner_html		: datalist_item.label,
	// 			parent			: grouper
	// 		})

	// 	return grouper
	// }//end get_grouper_element



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
	// const get_input_element_DES = (i, current_value, self) => {

	// 	const input_id = self.id +"_"+ i + "_" + new Date().getUTCMilliseconds()

	// 	const value				= self.data.value || []
	// 	const value_length		= value.length
	// 	const datalist_item		= current_value
	// 	const datalist_value	= datalist_item.value
	// 	const label				= datalist_item.label
	// 	const section_id		= datalist_item.section_id

	// 	// create li
	// 		const li = ui.create_dom_element({
	// 			element_type	: 'li',
	// 			data_set		: {
	// 				id		: datalist_item.section_tipo +'_'+ datalist_item.section_id,
	// 				parent	: datalist_item.parent ? (datalist_item.parent.section_tipo +'_'+ datalist_item.parent.section_id) : ''
	// 			}
	// 		})

	// 	// input checkbox
	// 		const input = ui.create_dom_element({
	// 			element_type	: 'input',
	// 			type			: 'checkbox',
	// 			class_name		: 'item_input',
	// 			id				: input_id,
	// 			parent			: li
	// 		})
	// 		input.addEventListener('change',function() {

	// 			const action		= (input.checked===true) ? 'insert' : 'remove'
	// 			const changed_key	= self.get_changed_key(action, datalist_value) // find the data.value key (could be different of datalist key)
	// 			const changed_value	= (action==='insert') ? datalist_value : null

	// 			const changed_data_item = Object.freeze({
	// 				action	: action,
	// 				key		: changed_key,
	// 				value	: changed_value
	// 			})

	// 			// update the instance data (previous to save)
	// 				self.update_data_value(changed_data_item)
	// 			// set data.changed_data. The change_data to the instance
	// 				// self.data.changed_data = changed_data
	// 			// publish search. Event to update the dom elements of the instance
	// 				event_manager.publish('change_search_element', self)
	// 		})

	// 		// checked input set on match
	// 			for (let j = 0; j < value_length; j++) {
	// 				if (value[j] && datalist_value &&
	// 					value[j].section_id===datalist_value.section_id &&
	// 					value[j].section_tipo===datalist_value.section_tipo
	// 					) {
	// 						input.checked = 'checked'
	// 				}
	// 			}

	// 	// label
	// 		const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
	// 		const option_label = ui.create_dom_element({
	// 			element_type	: 'label',
	// 			inner_html		: label_string,
	// 			parent			: li
	// 		})
	// 		option_label.setAttribute("for", input_id)


	// 	return li
	// }//end get_input_element



// @license-end
