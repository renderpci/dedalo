/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// import
	import {ui} from '../../common/js/ui.js'
	import {event_manager} from '../../common/js/event_manager.js'



/**
* RENDER_SEARCH_COMPONENT_SECTION_ID
* Manage the components logic and appearance in client side
*/
export const render_search_component_section_id = function() {

	return true
}//end render_search_component_section_id



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_search_component_section_id.prototype.search = async function(options) {

	const self 	= this

	// options
		const render_level = options.render_level || 'full'

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const content_data = get_content_data_search(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_search(self, {
			content_data : content_data
		})

	// id
		wrapper.id = self.id

	// Events
		add_events(self, wrapper)


	return wrapper
}//end search



/**
* ADD_EVENTS
* @return bool
*/
const add_events = async function(self, wrapper) {

	// change event, for every change the value in the inputs of the component
		wrapper.addEventListener('change', (e) => {

			// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="text"].input_value')) {
				//get the input node that has changed
				const input = e.target
				//the dataset.key has the index of correspondence self.data.value index
				const i 	= input.dataset.key
				// set the selected node for change the css
				self.selected_node = wrapper
				// set the changed_data for replace it in the instance data
				// update_data_value. key is the position in the data array, the value is the new value
				const value = (input.value.length>0) ? input.value : null
				// set the changed_data for update the component data and send it to the server for change when save
				const changed_data = {
					action	: 'update',
					key		: i,
					value	: value
				}
				// update the data in the instance previous to save
				self.update_data_value(changed_data)
				// set the change_data to the instance
				self.data.changed_data = changed_data
				// event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
				return true
			}
		})//end wrapper.addEventListener('change'


	return true
}//end search



/**
* GET_CONTENT_DATA_SEARCH
* @return DOM node content_data
*/
const get_content_data_search = function(self) {

	const value = self.data.value || ['']

	const fragment = new DocumentFragment()


	// values (inputs)
		const inputs_value	= value //(value.length<1) ? [''] : value
		const value_length	= inputs_value.length
		for (let i = 0; i < value_length; i++) {
			const input_node = get_input_element_search(i, inputs_value[i])
			fragment.appendChild(input_node)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)

	return content_data
}//end get_content_data_search



/**
* GET_INPUT_ELEMENT_SEARCH
* @return dom element input
*/
const get_input_element_search = (i, current_value) => {

	// input field
		const input = ui.create_dom_element({
			element_type	: 'input',
			type			: 'text',
			class_name		: 'input_value',
			dataset			: { key : i },
			value			: current_value
		})


	return input
}//end get_input_element_search


