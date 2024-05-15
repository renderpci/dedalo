// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global  */
/*eslint no-undef: "error"*/



// imports
	// import {event_manager} from '../../common/js/event_manager.js'
	// import {when_in_viewport} from '../../common/js/events.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_content_value_read,
		render_input_element_date,
		render_input_element_range,
		render_input_element_time_range,
		render_input_element_period,
		render_input_element_time
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
* @param object self
* @param object options
* @return HTMLElement wrapper
*/
view_default_edit_date.render = async function(self, options) {

	// render_level
		const render_level = options.render_level || 'full'

	// date_mode . Defined in ontology properties
		const date_mode = self.get_date_mode()

	// load editor files (calendar)
		await self.load_editor()

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = (self.permissions > 1)
			? get_buttons(self)
			: null

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
}//end render



/**
* GET_CONTENT_DATA
* @param object self
* 	component instance
* @return HTMLElement content_data
*/
export const get_content_data = function(self) {

	// short vars
		const data	= self.data || {}
		const value	= data.value || []

	// content_data
		const content_data = ui.component.build_content_data(self)

	// build values
		const input_nodes = []
		const inputs_value	= (value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_edit = (self.permissions===1)
				? get_content_value_read(i, inputs_value[i], self)
				: get_content_value(i, inputs_value[i], self)
			content_data.appendChild(input_element_edit)
			// set pointers
			content_data[i] = input_element_edit
			input_nodes.push(input_element_edit)
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* @param int i
* @param object|null current_value
* @param object self
* @return HTMLElement content_value
*/
export const get_content_value = (i, current_value, self) => {

	// date mode
		const date_mode	= self.get_date_mode()

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		const input_node = ((date_mode)=>{

			// build date base on date_mode
			switch(date_mode) {
				case 'range':
					return render_input_element_range(i, current_value, self)

				case 'time_range':
					return render_input_element_time_range(i, current_value, self)

				case 'period':
					return render_input_element_period(i, current_value, self)

				case 'time':
					return render_input_element_time(i, current_value, self)

				case 'date':
				default:
					return render_input_element_date(i, current_value, self)
			}
		})(date_mode)

	// set class selector
		content_value.classList.add(date_mode)

	// add input_node to the content_value
		content_value.appendChild(input_node)


	return content_value
}//end get_content_value



/**
* GET_BUTTONS
* @param object instance
* @return HTMLElement buttons_container
*/
const get_buttons = (self) => {

	// short vars
		const data				= self.data || {}
		const value				= data.value || []
		const show_interface	= self.show_interface

	// fragment
		const fragment = new DocumentFragment()

	// button add input
		if(show_interface.button_add === true){

			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name		: 'button add',
				title			: get_label.new || 'New',
				parent			: fragment
			})
			// event to insert new input
			button_add_input.addEventListener('mouseup', function(e) {
				e.stopPropagation()

				const changed_data = [Object.freeze({
					action	: 'insert',
					key		: value.length,
					value	: null
				})]
				self.change_value({
					changed_data	: changed_data,
					refresh			: true
				})
			})
		}

	// buttons tools
		if(show_interface.tools === true){
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



// @license-end
