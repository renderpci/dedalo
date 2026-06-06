// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_TEST_INFO
* Manages the widget's logic and appearance in client side
*/
export const render_test_info = function() {

	return true
}//end render_test_info



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
render_test_info.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* LIST
* Render node for use in modes: list, list_in_list
* @return HTMLElement wrapper
*/
render_test_info.prototype.list = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_list returns widget wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end list



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	// DocumentFragment
		const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'values_container',
			parent			: fragment
		})

	// values
		const value			= self.value
		const value_length	= value.length

		for (let i = 0; i < value_length; i++) {
			const data_item = value[i]
			const value_element_node = get_value_element(data_item, self)
			values_container.appendChild(value_element_node)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
}//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @param object data_item
* @param object self
* @return HTMLElement li
*/
const get_value_element = (data_item, self) => {

	// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item test_info'
		})

	// widget_id label
		const label = data_item.widget_id || data_item.id || 'test_info'
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: label + ': ',
			parent			: li
		})

	// value
		const value = data_item.value ?? ''
		ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: (typeof value === 'object')
				? JSON.stringify(value)
				: value,
			parent			: li
		})


	return li
}//end get_value_element



// @license-end
