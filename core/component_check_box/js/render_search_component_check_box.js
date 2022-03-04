/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* render_search_component_check_box
* Manage the components logic and appearance in client side
*/
export const render_search_component_check_box = function() {

	return true
};//end render_search_component_check_box



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_search_component_check_box.prototype.search = async function() {

	const self = this

	const content_data = get_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// Events
		add_events(self, wrapper)


	return wrapper
};//end search



/**
* ADD_EVENTS
* @return bool
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the inputs of the component
	wrapper.addEventListener('change', (e) => {
		//e.stopPropagation()

		// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="checkbox"]')) {

				// input. Get the input node that has changed
					const input = e.target

				// parsed_value
					const parsed_value = JSON.parse(input.value)

				const action		= (e.target.checked===true) ? 'insert' : 'remove'
				const changed_key	= self.get_changed_key(action, parsed_value)
				const changed_value	= (action==='insert') ? parsed_value : null

				const changed_data = Object.freeze({
					action	: action,
					key		: changed_key,
					value	: changed_value
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
const get_content_data = function(self) {

	// short vars
		const value		= self.data.value
		const mode		= self.mode
		const datalist	= self.data.datalist

	const fragment = new DocumentFragment()

	// q operator (search only)
		const q_operator = self.data.q_operator
		const input_q_operator = ui.create_dom_element({
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
* @return dom element li
*/
const get_input_element = (i, current_value, self) => {

	const input_id = self.id +"_"+ i + "_" + new Date().getUTCMilliseconds()

	const value				= self.data.value || []
	const value_length		= value.length
	const datalist_item		= current_value // is object as {label, section_id, value}
	const datalist_value	= datalist_item.value // is locator like {section_id:"1",section_tipo:"dd174"}
	const label				= datalist_item.label
	const section_id		= datalist_item.section_id

	// li
		const li = ui.create_dom_element({
			element_type : 'li'
		})

	// input checkbox
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'checkbox',
			id				: input_id,
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

	// label
		const label_string = (SHOW_DEBUG===true) ? label + " [" + section_id + "]" : label
		const option_label = ui.create_dom_element({
			element_type	: 'label',
			inner_html		: label_string,
			parent			: li
		})
		option_label.setAttribute("for", input_id)


	return li
};//end get_input_element


