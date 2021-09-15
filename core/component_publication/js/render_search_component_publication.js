/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
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
};//end render_search_component_publication



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
			content_data	: content_data
		})

	// add events
		add_events(self, wrapper)


	return wrapper
};//end search



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {
	// events delegated

	// click
		wrapper.addEventListener("click", e => {

			if (e.altKey===true) {

				// input. Get the input node that has changed
					const input = e.target

				// remove checked state
					input.checked = false

				// parsed_value
					const parsed_value = null

				// changed_data
					const changed_data = Object.freeze({
						action	: 'update',
						key		: 0,
						value	: parsed_value
					})

				// update the instance data (previous to save)
					self.update_data_value(changed_data)
				// set data.changed_data. The change_data to the instance
					self.data.changed_data = changed_data
				// publish search. Event to update the dom elements of the instance
					event_manager.publish('change_search_element', self)

				return true
			}
		})

	// change
		wrapper.addEventListener("change", e => {

			// value update
				if (e.target.matches('input[type="radio"]')) {



					// input. Get the input node that has changed
						const input = e.target

					// parsed_value
						const parsed_value = JSON.parse(input.value)

					// changed_data
						const changed_data = Object.freeze({
							action	: 'update',
							key		: 0,
							value	: parsed_value
						})

					// update the instance data (previous to save)
						self.update_data_value(changed_data)
					// set data.changed_data. The change_data to the instance
						self.data.changed_data = changed_data
					// publish search. Event to update the dom elements of the instance
						event_manager.publish('change_search_element', self)

					return true
				}

			// q_operator. get the input value of the q_operator
				// q_operator: is a separate operator used with components that is impossible mark the operator in the input_value,
				// like; radio_button, check_box, date, autocomplete, etc
				// (!) Not used in input text
				if (e.target.matches('input[type="text"].q_operator')) {

					// input. Get the input node that has changed
						const input = e.target
					// value
						const value = (input.value.length>0) ? input.value : null
					// q_operator. Fix the data in the instance previous to save
						self.data.q_operator = value
					// publish search. Event to update the dom elements of the instance
						event_manager.publish('change_search_element', self)

					return true
				}
		})



	return true
};//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
	// const DES_get_content_data = function(self) {

	// 	// short vars
	// 		const mode	= self.mode
	// 		const value	= self.data.value || []

	// 	const fragment = new DocumentFragment()

	// 	// inputs_container
	// 		// const inputs_container = ui.create_dom_element({
	// 		// 	element_type	: 'ul',
	// 		// 	class_name 		: 'inputs_container',
	// 		// 	parent 			: fragment
	// 		// })

	// 	// build values
	// 		const inputs_value = (value.length<1) ? [""] : value
	// 		const value_length = inputs_value.length
	// 		for (let i = 0; i < value_length; i++) {
	// 			const input_element = get_input_element(i, inputs_value[i], self)
	// 			fragment.appendChild(input_element)
	// 		}

	// 	// content_data
	// 		const content_data = ui.component.build_content_data(self)
	// 			  content_data.classList.add("nowrap")
	// 			  content_data.appendChild(fragment)


	// 	return content_data
	// };//end get_content_data



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const value		= self.data.value
	const mode		= self.mode
	const datalist	= self.data.datalist

	const fragment = new DocumentFragment()

	// q operator (search only)
		const q_operator		= self.data.q_operator
		const input_q_operator	= ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			value			: q_operator,
			class_name		: 'q_operator',
			parent			: fragment
		})

	// inputs_container ul
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name		: 'inputs_container '+mode,
			parent			: fragment
		})

	// values (inputs)
		const datalist_length = datalist.length
		for (let i = 0; i < datalist_length; i++) {
			const input_element = get_input_element(i, datalist[i], self)
			inputs_container.appendChild(input_element)
		}

	// content_data
		const content_data = ui.component.build_content_data(self, {
			autoload : false
		})
		content_data.appendChild(fragment)


	return content_data
};//end get_content_data



/**
* GET_INPUT_ELEMENT
* @return dom element div_switcher
*/
const get_input_element = (i, current_value, self) => {

	const input_id = self.id +"_"+ i + "_" + new Date().getUTCMilliseconds()

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value
	const label				= datalist_item.label
	const datalist_value	= Object.assign({
								from_component_tipo : self.tipo
							  }, datalist_item.value)

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'radio',
			id				: input_id,
			name			: self.id,
			dataset			: { key : i },
			value			: JSON.stringify(datalist_value),
			parent			: li
		})

	// checked option set on match
		for (let j = 0; j < value_length; j++) {
			if (value[j] && datalist_value &&
				value[j].section_id===datalist_value.section_id &&
				value[j].section_tipo===datalist_value.section_tipo
				) {
					input.checked = 'checked'
			}
		}

	// input_label
		const label_string = (SHOW_DEBUG===true) ? (label + ' [' + datalist_value.section_id + ']') : label
		const input_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label_string,
			parent			: li
		})
		input_label.setAttribute("for", input_id)

	// // div_switcher
	// 	const div_switcher = ui.create_dom_element({
	// 		element_type	: 'label',
	// 		class_name		: 'switcher_publication text_unselectable',
	// 		// parent		: li
	// 	})

	// // input checkbox
	// 	const input = ui.create_dom_element({
	// 		element_type	: 'input',
	// 		type			: 'checkbox',
	// 		// class_name	: 'ios-toggle',
	// 		// id			: input_id,
	// 		dataset			: { key : i },
	// 		value			: JSON.stringify(current_value),
	// 		parent			: div_switcher
	// 	})
	// 	// set checked from current value
	// 	if (current_value.section_id==1) {
	// 		input.setAttribute("checked", true)
	// 	}

	// // switch_label
	// 	const switch_label = ui.create_dom_element({
	// 		element_type	: 'i',
	// 		// class_name	: 'checkbox-label',
	// 		parent			: div_switcher
	// 	})
	// 	// switch_label.setAttribute("for",input_id)

	return li
};//end get_input_element


