// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_RADIO_BUTTON
* Manage the components logic and appearance in client side
*/
export const render_search_component_radio_button = function() {

	return true
}//end render_search_component_radio_button



/**
* SEARCH
* Render node for use in search
* @return HTMLElement wrapper
*/
render_search_component_radio_button.prototype.search = async function(options) {

	const self = this

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data_search(self)
		if (render_level==='content') {
			return content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})
		// set pointers
		wrapper.content_data = content_data
		

	return wrapper
}//end search



/**
* GET_CONTENT_DATA_SEARCH
* @param object self
* @return HTMLElement content_data
*/
const get_content_data_search = function(self) {

	// short vars
		const datalist	= self.data.datalist || []

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : false
		})

	// q operator (search only)
		const q_operator		= self.data.q_operator
		const input_q_operator	= ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: content_data
		})
		input_q_operator.addEventListener('change', function() {
			// value
				const value = (input_q_operator.value.length>0) ? input_q_operator.value : null
			// q_operator. Fix the data in the instance previous to save
				self.data.q_operator = value
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})

	// values (inputs)
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element = get_input_element(i, datalist[i], self)
			content_data.appendChild(input_element)
		}


	return content_data
}//end get_content_data_search



/**
* GET_INPUT_ELEMENT_EDIT
* Note that param 'i' is key from datalist, not from component value
* @param int i
* 	datalist key
* @param object datalist_item
* @param object self
* @return HTMLElement content_value
*/
const get_input_element = (i, datalist_item, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const label				= datalist_item.label
		const datalist_value	= datalist_item.value
		if (datalist_value) {
			datalist_value.from_component_tipo = self.tipo
		}

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input radio button
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id,
		})
		input_label.prepend(input)
		input.addEventListener('change', function() {

			// changed_data
				const changed_data_item = Object.freeze({
					action	: 'update',
					key		: 0,
					value	: datalist_value
				})

			// update the instance data (previous to save)
				self.update_data_value(changed_data_item)
			// publish search. Event to update the DOM elements of the instance
				event_manager.publish('change_search_element', self)
		})// end change event
		content_value.addEventListener('click', function(e) {
			e.stopPropagation();
			// de-select option
			if (e.altKey===true) {

				// remove checked state
					input.checked = false

				if (self.data.value.length===0) {
					return true
				}

				// changed_data
					const changed_data_item = Object.freeze({
						action	: 'remove',
						key		: false,
						value	: null
					})

				// update the instance data (previous to save)
					self.update_data_value(changed_data_item)
				// publish search. Event to update the DOM elements of the instance
					event_manager.publish('change_search_element', self)
			}
		})

	// checked input set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}


	return content_value
}//end get_input_element



// @license-end
