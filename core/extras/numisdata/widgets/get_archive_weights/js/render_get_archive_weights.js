/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../../../../common/js/ui.js'
	import {event_manager} from '../../../../../common/js/event_manager.js'



/**
* RENDER_GET_ARCHIVE_WEIGHTS
* Manages the component's logic and apperance in client side
*/
export const render_get_archive_weights = function() {

	return true
};//end render_get_archive_weights



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_get_archive_weights.prototype.edit = async function(options) {

	const self = this

	const render_level = options.render_level

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.widget.build_wrapper_edit(self, {
			content_data : content_data
		})


	return wrapper
};//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

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
			get_value_element(i, value[i], values_container, self)
		}

	// content_data
		const content_data = ui.create_dom_element({
			element_type : 'div'
		})
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data_edit



/**
* GET_VALUE_ELEMENT
* @return DOM node li
*/
const get_value_element = (i, current_value, values_container, self) => {

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : values_container
		})

	// iterate object properties
		for (let [label, value] of Object.entries(current_value)) {

			// label
				const span_label = ui.create_dom_element({
					type 		: 'span',
					class_name	: 'label',
					inner_html 	: label,
					parent 		: li
				})

			// value
				const span_value = ui.create_dom_element({
					type 		: 'span',
					class_name	: 'value',
					inner_html 	: JSON.stringify(value),
					parent 		: li
				})
		}
		event_manager.subscribe('update_widget_value_'+self.id, (changed_data) =>{
			console.log("change_data", changed_data);
			span_value.innerHTML = JSON.stringify(changed_data)
		})

	return li
};//end get_value_element
