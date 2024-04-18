// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global, page_globals, get_label */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {get_fallback_value} from '../../common/js/common.js'
	import {change_handler, remove_handler} from './render_edit_component_input_text.js'


/**
* view_colorpicker_edit_input_text
* Manages the component's logic and appearance in client side
*/
export const view_colorpicker_edit_input_text = function() {

	return true
}//end view_colorpicker_edit_input_text



/**
* RENDER
* Render node for use in current view
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_colorpicker_edit_input_text.render = async function(self, options) {

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
		// set pointers
		wrapper.content_data = content_data


	return wrapper
}//end render



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// values (inputs)
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length

		for (let i = 0; i < value_length; i++) {
			// get the content_value
			const content_value = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			// set the pointer
			content_data[i] = content_value
			// add node to content_data
			content_data.appendChild(content_value)
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* Creates the current input text node
* @param int i
* @param string current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const multi_line = (self.context.properties && self.context.properties.hasOwnProperty('multi_line'))
			? self.context.properties.multi_line
			: false
		const with_lang_versions	= self.context.properties.with_lang_versions || false
		const default_color			= '#f78a1c';

	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

		// color picker
			// content_value node
		const color_picker_container = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'color_picker_container'
		})

		const color_picker = ui.create_dom_element({
			element_type	: 'input',
			type			: 'color',
			id 				: 'color_picker',
			name 			: 'color_picker',
			class_name		: 'color_picker',
			value			: current_value || default_color,
			parent			: color_picker_container
		})
		color_picker.addEventListener("change", function(e){
			input.value = e.target.value;

		});
		color_picker.addEventListener('input', function(e){
			input.value = e.target.value;

			// change data
				const changed_data_item = Object.freeze({
					action	: 'update',
					key		: 0,
					value	: e.target.value || ''
				})

			// fix instance changed_data
				self.set_changed_data(changed_data_item)
		});
		content_value.appendChild(color_picker_container)


	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			value			: current_value || default_color,
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

		// click event. Capture event propagation
			input.addEventListener('click', (e) => {
				e.stopPropagation()
			})

		// mousedown event. Capture event propagation
			input.addEventListener('mousedown', (e) => {
				e.stopPropagation()
			})

		// change event
			input.addEventListener('change', function(e) {
				change_handler(e, i, self)
				color_picker.value = e.target.value;
			})


	return content_value
}//end get_content_value



/**
* GET_CONTENT_VALUE_READ
* Creates the current value DOM node
* @param int i
* @param string current_value
* @param object self
* @return HTMLElement content_value
*/
const get_content_value_read = (i, current_value, self) => {

	const data				= self.data || {}
	const fallback_value	= data.fallback_value || []
	const final_value		= get_fallback_value([current_value], fallback_value)


	// content_value node
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// color
		const color_read = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'color_read',
			parent 			: content_value
		})
		color_read.style.background = final_value;

	// text_value node
		const text_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'text_value read_only',
			inner_html		: final_value,
			parent 			: content_value
		})


	return content_value
}//end get_content_value_read



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	const fragment = new DocumentFragment()

	// buttons tools
		if(self.show_interface.tools === true){
			ui.add_tools(self, fragment)
		}//end add tools

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
