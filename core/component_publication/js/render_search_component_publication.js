/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL */
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* RENDER_SEARCH_COMPONENT_PUBLICATION
* Manage the components logic and appearance in client side
*/
export const render_search_component_publication = function() {

	return true
}//end render_search_component_publication



/**
* SEARCH
* Render node for use in current mode
* @return DOM node wrapper
*/
render_search_component_publication.prototype.search = async function(options) {

	const self = this

	// options
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = get_content_data(self)
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
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	// short vars
		// const value	= self.data.value
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
			const input_element = get_content_value(i, datalist[i], self)
			content_data.appendChild(input_element)
		}


	return content_data
}//end get_content_data



/**
* GET_CONTENT_VALUE
* Render the current value DOM nodes
* @param int i
* 	Value key
* @param object current_value
* 	Current locator value as:
* 	{type: 'dd151', section_id: '1', section_tipo: 'dd64', from_component_tipo: 'rsc20'}
* @param object self
*
* @return DOM element content_value
*/
const get_content_value = (i, current_value, self) => {

	// short vars
		const value				= self.data.value || []
		const value_length		= value.length
		const datalist_item		= current_value
		const label				= datalist_item.label
		const datalist_value	= Object.assign({
			from_component_tipo : self.tipo
		}, datalist_item.value)

	// content_value
		const content_value = ui.create_dom_element({
			element_type	: 'div',
			class_name		: 'content_value'
		})

	// input_label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			class_name		: 'label',
			inner_html		: label,
			parent			: content_value
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			name			: self.id,
		})
		input_label.prepend(input)

		input.addEventListener('change', function() {

			// changed_data
				const changed_data = Object.freeze({
					action	: 'update',
					key		: i,
					value	: datalist_value
				})

			// update the instance data (previous to save)
				self.update_data_value(changed_data)
			// set data.changed_data. The change_data to the instance
				self.data.changed_data = changed_data
			// publish search. Event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
		})//end change
		content_value.addEventListener('click', function(e) {
			// de-select option
			if (e.altKey===true) {
				e.preventDefault()

				// remove checked state
					input.checked = false

				if (self.data.value.length===0) {
					return true
				}

				// changed_data
					const changed_data = Object.freeze({
						action	: 'update',
						key		: false,
						value	: null
					})

				// update the instance data (previous to save)
					self.update_data_value(changed_data)
				// set data.changed_data. The change_data to the instance
					self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)
			}
		})//end click

	// checked option set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}


	return content_value
}//end get_content_value
