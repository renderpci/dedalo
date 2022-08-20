/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_search_component_radio_button
* Manage the components logic and appearance in client side
*/
export const render_search_component_radio_button = function() {

	return true
}//end render_search_component_radio_button



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_search_component_radio_button.prototype.search = async function() {

	const self = this

	// content data
		const content_data = get_content_data_search(self)

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
* @return DOM node content_data
*/
const get_content_data_search = function(self) {

	// fix non value scenarios
	self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// short vars
		const mode		= self.mode
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
			// publish search. Event to update the dom elements of the instance
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
* GET_INPUT_ELEMENT
* @return dom element li
*/
const get_input_element = (i, current_value, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const datalist_item		= current_value
		const label				= datalist_item.label
		// const section_id		= datalist_item.section_id
		const datalist_value	= Object.assign({
			from_component_tipo : self.tipo
		}, datalist_item.value)

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// label
		// const label_string = (SHOW_DEBUG===true) ? (label + ' [' + section_id + ']') : label
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
			name			: 'self.id'
		})
		input_label.prepend(input)
		input.addEventListener('change', function() {

			// changed_data
				const changed_data = Object.freeze({
					action	: 'update',
					key		: 0,
					value	: datalist_value
				})

			// update the instance data (previous to save)
				self.update_data_value(changed_data)
			// set data.changed_data. The change_data to the instance
				self.data.changed_data = changed_data
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})// end change event
		content_value.addEventListener('mousedown', function(e) {
			if (e.altKey===true) {
				e.stopPropagation()
				e.preventDefault()

				// remove checked state
					input.checked = false

				if (self.data.value.length===0) {
					return true
				}

				// changed_data
					const changed_data = Object.freeze({
						action	: 'remove',
						key		: false,
						value	: null
					})
					// value = null

				// update the instance data (previous to save)
					self.change_value({
						changed_data	: changed_data,
						label			: self.get_checked_value_label(),//'All',
						refresh			: false
					})
				// set data.changed_data. The change_data to the instance
					self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
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
