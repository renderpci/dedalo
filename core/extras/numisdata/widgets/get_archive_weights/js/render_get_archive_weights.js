// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../../common/js/ui.js'
	import {event_manager} from '../../../../../common/js/event_manager.js'



/**
* RENDER_GET_ARCHIVE_WEIGHTS
* Manages the component's logic and appearance in client side
*/
export const render_get_archive_weights = function() {

	return true
}//end render_get_archive_weights



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return HTMLElement wrapper
*/
render_get_archive_weights.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	// sort vars
		const value = self.value

	const fragment = new DocumentFragment()

	// values container
		const values_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'values_container',
			parent 			: fragment
		})

	// values
		const value_length = value.length
		for (let i = 0; i < value_length; i++) {
			const value_element = get_value_element(i, value[i], self)
			values_container.appendChild(value_element)
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
* @return HTMLElement li
*/
const get_value_element = (i, current_value, self) => {

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// iterate object properties
		let span_value
		for (let [label, value] of Object.entries(current_value)) {

			// label
				ui.create_dom_element({
					type		: 'span',
					class_name	: 'label',
					inner_html	: label,
					parent		: li
				})

			// value
				span_value = ui.create_dom_element({
					type		: 'span',
					class_name	: 'value',
					inner_html	: JSON.stringify(value),
					parent		: li
				})
		}
		// event update_widget_value_
		const update_widget_value_handler = (changed_data) => {
			if (span_value) {
				span_value.innerHTML = JSON.stringify(changed_data)
			}
		}
		self.events_tokens.push(
			event_manager.subscribe('update_widget_value_'+self.id, update_widget_value_handler)
		)


	return li
}//end get_value_element




// @license-end
