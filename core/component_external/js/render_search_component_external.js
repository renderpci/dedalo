// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_external
* Manage the components logic and appearance in client side
*/
export const render_search_component_external = function() {

	return true
}//end render_search_component_external



/**
* SEARCH
* Render node for use in search
* @return HTMLElement wrapper
*/
render_search_component_external.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

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
* @param object self
* @return HTMLElement content_data
*/
const get_content_data = function(self) {

	// short vars
		const data = self.data || {}

	// content_data
		const content_data = ui.component.build_content_data(self)

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change',function () {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// value
		const value = data.entries[0] || ''
		const input_value = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: value,
			class_name		: 'value',
			parent			: content_data
		})
		input_value.addEventListener('change',function () {
			// value
				const value = (input_value.value.length>0) ? input_value.value : null
			// value. Fix the data in the instance previous to save
				self.data.entries = [value]
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})


	return content_data
}//end get_content_data



// @license-end
