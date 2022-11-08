/* global get_label, SHOW_DEBUG */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	import {
		get_input_element_edit
	} from '../../component_date/js/view_default_edit_date.js'



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
* @return DOM node wrapper
*/
render_search_component_date.prototype.search = async function() {

	const self 	= this

	const content_data = get_content_data(self)

	// load editor files (calendar)
		await self.load_editor()

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// set pointer to content_data
		wrapper.content_data = content_data

	return wrapper
}//end search



/**
* GET_CONTENT_DATA
* @return DOM node content_data
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
		input_q_operator.addEventListener('change', function(){
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const inputs_value	= value.length>0 ? value : ['']
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_element_node = get_input_element_edit(i, inputs_value[i], self)
			content_data.appendChild(input_element_node)
			// set the pointer
			content_data[i] = input_element_node
		}


	return content_data
}//end get_content_data
