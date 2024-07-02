// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_SELECT
* Manages the component's logic and appearance in client side
*/
export const render_search_component_select = function() {

	return true
}//end render_search_component_select



/**
* SEARCH
* Render node for use in current mode
* @return HTMLElement wrapper
*/
render_search_component_select.prototype.search = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
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
		const value		= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value.length>0 ? value : [null]
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* 	Value key like 0
* @param object|null current_value
* 	Current locator value as {section_id: '2', section_tipo: 'rsc740'}
* @param object self
* 	Component instance pointer
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const data		= self.data || {}
		const datalist	= data.datalist || []
		// add empty option at beginning of the datalist array
		const empty_option = {
			label	: '',
			value	: null
		}
		datalist.unshift(empty_option);

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_value
		})
		// change event
			const change_handler = () => {
				// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
				// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
				// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
			}
			input_q_operator.addEventListener('change', change_handler)

	// select
		const select = ui.create_dom_element({
			element_type	: 'select',
			class_name		: 'select',
			parent			: content_value
		})
		// click event
			select.addEventListener('click', function(e) {
				e.stopPropagation()
			})
		// change event
			select.addEventListener('change', function(){

				const parsed_value = (select.value.length>0) ? JSON.parse(select.value) : null

				const changed_data_item = Object.freeze({
					action	: (parsed_value != null) ? 'update' : 'remove',
					key		: (parsed_value != null) ? i : false,
					value	: parsed_value
				})

				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// set data.changed_data. The change_data to the instance
					// self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)
			})//end event change

	// select options
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {

			const datalist_item = datalist[i]

			const current_section_id = typeof datalist_item.section_id!=="undefined"
				? datalist_item.section_id
				: null

			const current_label = (SHOW_DEBUG===true)
				? datalist_item.label + (current_section_id ? " [" + current_section_id + "]" : '')
				: datalist_item.label

			const datalist_value = datalist_item.value
			if (datalist_value) {
				datalist_value.from_component_tipo = self.tipo
			}

			const option = ui.create_dom_element({
				element_type	: 'option',
				value			: JSON.stringify(datalist_value),
				inner_html		: current_label,
				parent			: select
			})
			// selected options set on match
			if (current_value && datalist_item.value &&
				current_value.section_id===datalist_item.value.section_id &&
				current_value.section_tipo===datalist_item.value.section_tipo
				) {
				option.selected = true
			}
		}//end for (let i = 0; i < datalist_length; i++)


	return content_value
}//end get_content_value



// @license-end
