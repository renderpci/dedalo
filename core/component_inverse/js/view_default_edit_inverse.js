// import
	import {ui} from '../../common/js/ui.js'
	// import {common} from '../../common/js/common.js'


/**
* VIEW_DEFAULT_EDIT_INVERSE
* Manage the components logic and appearance in client side
*/
export const view_default_edit_inverse = function() {

	return true
}//end view_default_edit_inverse



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
view_default_edit_inverse.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i])
			content_data.appendChild(content_value)
			// set the pointer
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = (i, current_value) => {

	// short vars
		const locator	= current_value.locator
		const datalist	= current_value.datalist

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// span field section_id from related inverse section
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'inverse_show_section_id',
			text_node		: locator.from_section_id,
			parent			: content_value
		})

	// build span fields with other values from related inverse section
		const span_datalist_length = datalist.length
		for (let j = 0; j < span_datalist_length; j++) {
			// span_value
			const parsed_value = datalist[j].label.concat(': ', datalist[j].value)
			ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'inverse_show_values',
				text_node		: parsed_value,
				parent			: content_value
			})
		}


	return content_value
}//end get_content_value
