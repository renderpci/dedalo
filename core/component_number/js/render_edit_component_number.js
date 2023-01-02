/* global get_label, page_globals, SHOW_DEBUG, flatpickr */
/*eslint no-undef: "error"*/



// imports
	import {set_before_unload} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {view_default_edit_number} from './view_default_edit_number.js'
	import {view_line_edit_number} from './view_line_edit_number.js'
	import {view_mini_number} from './view_mini_number.js'


/**
* RENDER_EDIT_COMPONENT_NUMBER
* Manage the components logic and appearance in client side
*/
export const render_edit_component_number = function() {

	return true
}//end render_edit_component_number



/**
* EDIT
* Render node for use in edit
* @param object options
* @return DOM node
*/
render_edit_component_number.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'line':
			return view_line_edit_number.render(self, options)

		case 'mini':
			return view_mini_number.render(self, options)

		case 'default':
		default:
			return view_default_edit_number.render(self, options)
	}

	return null
}//end edit



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
export const get_content_data_edit = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build values
		const inputs_value	= (value.length<1) ? [null] : value // force one empty input at least
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const content_value = get_content_value(i, inputs_value[i], self)
			content_data.appendChild(content_value)
			// set pointers
			content_data[i] = content_value
		}


	return content_data
}//end get_content_data_edit



/**
* GET_CONTENT_VALUE
* @return DOM element content_value
*/
const get_content_value = (i, current_value, self) => {

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'number',
			class_name		: 'input_value',
			value			: current_value,
			parent			: content_value
		})
		input.addEventListener('keyup', function(e) {
			// page unload event
			keyup_handler(e, i, self)
		})//end keyup
		input.step = self.get_steps()

	// button remove
		const mode				= self.mode
		const is_inside_tool	= self.is_inside_tool
		if((mode==='edit') && !is_inside_tool) {

			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			button_remove.addEventListener('mouseup', function() {
				// force possible input change before remove
				document.activeElement.blur()

				const current_value = input.value ? input.value : null

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
		}//end if((mode==='edit') && !is_inside_tool)


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
export const get_buttons = (self) => {

	// short vars
		const is_inside_tool	= self.is_inside_tool
		const mode				= self.mode

	// DOM fragment
		const fragment = new DocumentFragment()

	// button add input
		if(!is_inside_tool) {

			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				parent			: fragment
			})
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
					const input_node = self.node.content_data[changed_data.key].querySelector('input')
					if (input_node) {
						input_node.focus()
					}
				})
			})
		}

	// buttons tools
		if (!is_inside_tool && mode==='edit') {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
			// buttons_container.appendChild(fragment)

	// buttons_fold (allow sticky position on large components)
		const buttons_fold = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'buttons_fold',
			parent			: buttons_container
		})
		buttons_fold.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* KEYUP_HANDLER
* Store current value in self.data.changed_data
* If key pressed is 'Enter', force save the value
* @param event e
* @param int key
* @param object self
* @return bool
*/
export const keyup_handler = function(e, key, self) {
	e.preventDefault()

	// Enter key force to save changes
		if (e.key==='Enter') {

			// force to save current input if changed
				const changed_data = self.data.changed_data || []
				// change_value (save data)
				self.change_value({
					changed_data	: changed_data,
					refresh			: false
				})
		}else{

			const safe_value = (e.target.value.length>0)
				? self.fix_number_format(e.target.value)
				: null

			e.target.value = safe_value

			// change data
				const changed_data_item = Object.freeze({
					action	: 'update',
					key		: key,
					value	: safe_value || ''
				})

			// fix instance changed_data
				self.set_changed_data(changed_data_item)
		}


	return true
}//end keyup_handler



/**
* REMOVE_HANDLER
* Handle button remove actions
* @param DOM  node input
* @param int key
* @param object self
* @return promise response
*/
export const remove_handler = function(input, key, self) {

	// force possible input change before remove
		document.activeElement.blur()

	// value
		const current_value = input.value ? input.value : null

	// changed_data
		const changed_data = [Object.freeze({
			action	: 'remove',
			key		: key,
			value	: null
		})]

	// change_value. Returns a promise that is resolved on api response is done
		const response = self.change_value({
			changed_data	: changed_data,
			label			: current_value,
			refresh			: true
		})


	return response
}//end remove_handler
