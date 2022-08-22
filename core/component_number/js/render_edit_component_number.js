 /*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {set_before_unload} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_edit_component_number
* Manage the components logic and appearance in client side
*/
export const render_edit_component_number = function() {

	return true
}//end render_edit_component_number



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_edit_component_number.prototype.edit = async function(options) {

	const self 	= this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
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
		input.addEventListener('change', function() {

			const safe_value = (this.value.length>0)
				? self.fix_number_format(this.value)
				: null

			// change data
			const changed_data = Object.freeze({
				action	: 'update',
				key		: i,
				value	: safe_value
			})
			self.change_value({
				changed_data	: changed_data,
				refresh			: false
			})
		})//end change
		input.addEventListener('keyup', function(e) {
			// page unload event
				if (e.key!=='Enter') {
					const key				= i
					const original_value	= self.db_data.value[key]
					const new_value			= this.value
					// set_before_unload (bool)
					set_before_unload(new_value!==original_value)
				}
		})//end keyup

	// button remove
		const mode				= self.mode
		const is_inside_tool	= self.is_inside_tool
		if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool) {

			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button remove hidden_button',
				parent			: content_value
			})
			button_remove.addEventListener('mouseup', function() {
				// force possible input change before remove
				document.activeElement.blur()

				const current_value = input.value ? input.value : null

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: i,
					value	: null
				})
				self.change_value({
					changed_data	: changed_data,
					label			: current_value,
					refresh			: true
				})
			})
		}//end if((mode==='edit' || mode==='edit_in_list') && !is_inside_tool)


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const is_inside_tool	= self.is_inside_tool
		const mode				= self.mode

	// DOM fragment
		const fragment = new DocumentFragment()

	// button add input
		if(mode==='edit' || mode==='edit_in_list') { // && !is_inside_tool

			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				parent			: fragment
			})
			button_add_input.addEventListener('mouseup', function() {

				const changed_data = Object.freeze({
					action	: 'insert',
					key		: self.data.value.length,
					value	: null
				})
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
		if (!is_inside_tool) {
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
