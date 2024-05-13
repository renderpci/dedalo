// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/* global  */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		render_input_element_range,
		render_input_element_period,
		render_input_element_time,
		render_input_element_date
	} from './render_edit_component_date.js'



/**
* RENDER_SEARCH_COMPONENT_DATE
* Manage the components logic and appearance in client side
*/
export const render_search_component_date = function() {

	return true
}//end render_search_component_date



/**
* SEARCH
* Render node for use in search
* @return HTMLElement wrapper
*/
render_search_component_date.prototype.search = async function(options) {

	const self 	= this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
		if (render_level==='content') {
			return content_data
		}

	// load editor files (calendar)
		await self.load_editor()

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

	const value	= self.data.value

	// content_data
		const content_data = ui.component.build_content_data(self, {})

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('focus', function() {
			// force activate on input focus (tabulating case)
			if (!self.active) {
				ui.component.activate(self)
			}
		})
		input_q_operator.addEventListener('click', function(e) {
			e.stopPropagation();
		})
		input_q_operator.addEventListener('mousedown', function(e) {
			e.stopPropagation();
		})
		input_q_operator.addEventListener('change', function(){
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator	= value
				self.q_operator			= value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const inputs_value	= value || []
		const value_length	= inputs_value.length || 1
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data



/**
* GET_INPUT_ELEMENT
* @param int i
* @param object|null current_value
* @param object self
* @return HTMLElement content_value
*/
const get_input_element = (i, current_value, self) => {

	const date_mode	= self.get_date_mode()

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input node
		const input_node = (() => {
			// build date input  base don date_mode
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
		})()

	// add input_node to the content_value
		content_value.appendChild(input_node)


	return content_value
}//end get_input_element



// @license-end
