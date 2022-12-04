/*global */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {set_before_unload} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* view_line_edit_input_text
* Manages the component's logic and appearance in client side
*/
export const view_line_edit_input_text = function() {

	return true
}//end view_line_edit_input_text



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
view_line_edit_input_text.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			label 			: null,
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// button_exit_edit
		const button_exit_edit = ui.component.build_button_exit_edit(self)
		content_data.appendChild(button_exit_edit)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}

	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return DOM node content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const mode					= self.mode
		const multi_line			= (self.context.properties && self.context.properties.hasOwnProperty('multi_line'))
			? self.context.properties.multi_line
			: false
		const element_type			= (multi_line===true) ? 'textarea' : 'input'
		const is_inside_tool		= self.is_inside_tool
		// const with_lang_versions	= self.context.properties.with_lang_versions || false

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: element_type,
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value,
			placeholder		: (current_value) ? '' : self.data.fallback_value[i],
			parent			: content_value
		})
		// focus event
			input.addEventListener('focus', function() {
				// force activate on input focus (tabulating case)
				if (!self.active) {
					ui.component.activate(self)
				}
			})

		// keyup event
			input.addEventListener('keyup', function(e) {

				// Enter key force to save changes
					if (e.key==='Enter') {
						e.preventDefault()

						// force to save current input if changed
						if (self.data.changed_data && self.data.changed_data.length>0) {
							// change_value (save data)
							self.change_value({
								changed_data	: self.data.changed_data,
								refresh			: false
							})
						}
						return false
					}

				// change data
					const changed_data_item = Object.freeze({
						action	: 'update',
						key		: i,
						value	: (this.value.length>0) ? this.value : null
					})

				// fix instance changed_data
					self.set_changed_data(changed_data_item)
			})
	return content_value
}//end get_content_value

