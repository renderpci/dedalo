// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../common/js/ui.js'



/**
* RENDER_GET_COINS_BY_PERIOD
* Manages the component's logic and appearance in client side
*/
export const render_get_coins_by_period = function() {

	return true
}//end render_get_coins_by_period



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
render_get_coins_by_period.prototype.edit = async function(options) {

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
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'values_container',
			parent			: fragment
		})

	// values
		const ipo			= self.ipo
		const ipo_length	= ipo.length

		for (let i = 0; i < ipo_length; i++) {
			const data = self.value.filter(item => item.key === i)
			get_value_element(i, data , values_container, self)
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
* @return HTMLElement DocumentFragment
*/
const get_value_element = (i, data, values_container, self) => {

const fragment = new DocumentFragment()

	// period
	const value = data.find(item => item.id === 'period').value

	for (const [order, period] of Object.entries(value)) {

		// li
		const li = ui.create_dom_element({
			element_type	: 'li',
			class_name		: 'widget_item get_coins_by_period ',
			parent			: values_container
		})

		// label
		const period_label = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'label',
			inner_html		: `${period.label}`,
			parent			: li
		})

		// value
		const period_count = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'value',
			inner_html		: `${period.count}`,
			parent			: li
		})
	}

	return fragment
}//end get_value_element



// @license-end
