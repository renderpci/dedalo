// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'



/**
* RENDER_SEARCH_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_search_component_section_id = function() {

	return true
}//end render_search_component_section_id



/**
* SEARCH
* Render node for use in current mode
* @param object options
* @return HTMLElement wrapper
*/
render_search_component_section_id.prototype.search = async function(options) {

	const self 	= this

	// options
		const render_level = options.render_level || 'full'

	// fix non value scenarios
		// self.data.value = (self.data.value.length<1) ? [null] : self.data.value

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
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	const value = self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element_search(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT_SEARCH
* Note that this component it's editable only in search mode
* @param int i
* 	Value key number
* @param string current_value
* @param object self
* 	Current component instance pointer
* @return DOM element input
*/
const get_input_element_search = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value,
			parent			: content_value
		})

		// paste event
			const paste_handler = (e) => {
				e.preventDefault();

				const paste = (e.clipboardData || window.clipboardData).getData("text");
				if (paste) {

					const beats = paste.split('\n')
					const beats_length = beats.length

					if (beats_length<2) {
						e.target.value = value;
						return
					}

					const parts = []
					for (let i = 0; i < beats_length; i++) {
						const item = beats[i]
						if (item && item.length) {
							const el = parseInt(item.trim())
							if (el && el>0) {
								parts.push(el)
							}
						}
					}

					// change \n by , (paste list of section_id from import cases)
					const value = parts.join(',')

					e.target.value = value;
				}
			}
			input.addEventListener('paste', paste_handler)

		// change event
			const change_handler = () => {
				// parsed_value
					const parsed_value = (input.value.length>0) ? input.value : null

				// changed_data
					const changed_data_item = Object.freeze({
						action	: 'update',
						key		: i,
						value	: parsed_value
					})

				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// set data.changed_data. The change_data to the instance
					// self.data.changed_data = changed_data
				// publish search. Event to update the DOM elements of the instance
					event_manager.publish('change_search_element', self)
			}
			input.addEventListener('change', change_handler)


	return content_value
}//end get_input_element_search




// @license-end
