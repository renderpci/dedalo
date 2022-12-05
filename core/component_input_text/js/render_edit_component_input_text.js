/*global */
/*eslint no-undef: "error"*/



// imports
	import {view_default_edit_input_text} from './view_default_edit_input_text.js'
	import {view_line_edit_input_text} from './view_line_edit_input_text.js'
	import {view_text_input_text} from './view_text_input_text.js'
	import {view_mini_input_text} from './view_mini_input_text.js'

/**
* RENDER_EDIT_COMPONENT_INPUT_TEXT
* Manages the component's logic and appearance in client side
*/
export const render_edit_component_input_text = function() {

	return true
}//end render_edit_component_input_text



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_input_text.prototype.edit = async function(options) {

	const self = this

	// view
		const view	= self.context.view || 'default'

	switch(view) {

		case 'mini':
			return view_mini_input_text.render(self, options)

		case 'text':
			return view_text_input_text.render(self, options)

		case 'line':
			return view_line_edit_input_text.render(self, options)

		case 'default':
		default:
			return view_default_edit_input_text.render(self, options)
	}

	return null
}//end edit



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
			// change data
				const changed_data_item = Object.freeze({
					action	: 'update',
					key		: key,
					value	: e.target.value || ''
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
