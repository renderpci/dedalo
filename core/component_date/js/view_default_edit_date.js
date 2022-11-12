/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {ui} from '../../common/js/ui.js'
	import {
		input_element_date,
		input_element_range,
		input_element_period,
		input_element_time
	} from './render_edit_component_date.js'



/**
* VIEW_DEFAULT_EDIT_DATE
* Manage the components logic and appearance in client side
*/
export const view_default_edit_date = function() {

	return true
}//end view_default_edit_date



/**
* RENDER
* Render node for use in current view
* @param object options
* @return DOM node
*/
view_default_edit_date.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// date_mode . Defined in ontology properties
		const date_mode = self.get_date_mode()

	// load editor files (calendar)
		await self.load_editor()

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data	: content_data,
			buttons			: buttons
		})
	// set pointer to content_data
		wrapper.content_data = content_data

	// set the mode as class to be adapted to specific css
		wrapper.classList.add(date_mode)


	return wrapper
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @param object self
* 	component instance
* @return DOM node content_data
*/
const get_content_data_edit = function(self) {

	const value	= self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : true
		})

	// build values
		const inputs_value	= (value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_edit = get_input_element_edit(i, inputs_value[i], self)
			content_data.appendChild(input_element_edit)
			// set the pointer
			content_data[i] = input_element_edit
		}


	return content_data
}//end get_content_data_edit



/**
* GET_INPUT_ELEMENT_EDIT
* @param int i
* @param object|null current_value
* @param object self
* @return DOM node content_value
*/
export const get_input_element_edit = (i, current_value, self) => {

	const date_mode	= self.get_date_mode()

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		let input_node = ''
		// build date base on date_mode
		switch(date_mode) {

			case 'range':
				input_node = input_element_range(i, current_value, self)
				break;

			case 'period':
				input_node = input_element_period(i, current_value, self)
				break;

			case 'time':
				input_node = input_element_time(i, current_value, self)
				break;

			case 'date':
			default:
				input_node = input_element_date(i, current_value, self)
				break;
		}

	// add input_node to the content_value
		content_value.appendChild(input_node)

	// button remove
		const remove_node = ui.create_dom_element({
			element_type	: 'span',
			class_name		: 'button remove hidden_button',
			parent			: content_value
		})
		remove_node.addEventListener('mouseup', function(){
			// force possible input change before remove
			document.activeElement.blur()

			const current_value = input_node.value ? input_node.value : null

			const changed_data = [Object.freeze({
				action	: 'remove',
				key		: i,
				value	: null
			})]
			self.change_value({
				changed_data	: changed_data,
				label			: current_value,
				refresh			: true
			})
		})

	return content_value
}//end get_input_element_edit



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool	= self.is_inside_tool
	const mode				= self.mode

	const fragment = new DocumentFragment()

	// button add input
		if(mode==='edit') { // && !is_inside_tool
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: fragment
			})
			// event to insert new input
			button_add_input.addEventListener('mouseup', function() {

				const changed_data = [Object.freeze({
					action	: 'insert',
					key		: self.data.value.length,
					value	: null
				})]
				self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})
				.then(()=>{
					const inputs_container = self.node.content_data.inputs_container

					// add new dom input element
					const new_input = get_input_element_edit(changed_data.key, changed_data.value, self)
					inputs_container.appendChild(new_input)
					// set the pointer
					inputs_container[changed_data.key] = new_input
				})
			})
		}

	// buttons tools
		if (!is_inside_tool && mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons
