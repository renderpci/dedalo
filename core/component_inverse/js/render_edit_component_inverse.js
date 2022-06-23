// import
	import {ui} from '../../common/js/ui.js'
	// import {common} from '../../common/js/common.js'


/**
* RENDER_EDIT_COMPONENT_INVERSE
* Manage the components logic and appearance in client side
*/
export const render_edit_component_inverse = function() {

	return true
}//end render_edit_component_inverse



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_edit_component_inverse.prototype.edit = function() {

	const self = this

	const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})

	// build values
		const inputs_value = value
		const value_length = inputs_value.length

		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element(i, inputs_value[i])
			inputs_container.appendChild(input_element_node)
		}

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	return wrapper
}//end edit



/**
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (i, current_value) => {

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// span field section_id from related inverse section
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'inverse_show_section_id',
			dataset			: { key : i },
			text_node		: current_value.locator.from_section_id,
			parent			: li
		})

	// build span fields with other values from related inverse section
		const span_datalist_length 	= current_value.datalist.length
		for (let j = 0; j < span_datalist_length; j++) {
			// span_value
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'inverse_show_values',
				text_node		: current_value.datalist[j].label.concat(': ', current_value.datalist[j].value),
				parent			: li
			})

		}

	return li
}//end get_input_element


