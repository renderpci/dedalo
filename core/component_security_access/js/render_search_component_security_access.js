/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'
	// import {data_manager} from '../../common/js/data_manager.js'



/**
* RENDER_SEARCH_COMPONENT_SECURITY_ACCESS
* Manages the component's logic and apperance in client side
*/
export const render_search_component_security_access = function() {

	return true
};//end render_search_component_security_access



/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_search_component_security_access.prototype.search = async function() {

	const self 	= this

	const content_data = get_content_data(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})
		wrapper.id = self.id

	// Events
		add_events(self, wrapper)


	return wrapper
};//end search



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			e.stopPropagation()

			// input_value. The standard input for the value of the component
			if (e.target.matches('input[type="text"].input_value')) {
				//get the input node that has changed
				const input = e.target
				//the dataset.key has the index of correspondence self.data.value index
				const i 	= input.dataset.key
				// set the selected node for change the css
				self.selected_node = wrapper
				// set the changed_data for replace it in the instance data
				// update_data_value. key is the posistion in the data array, the value is the new value
				const value = (input.value.length>0) ? input.value : null
				// set the changed_data for update the component data and send it to the server for change when save
				const changed_data = {
					action	: 'update',
					key	  	: i,
					value 	: value
				}
				// update the data in the instance previous to save
				self.update_data_value(changed_data)
				// set the change_data to the instance
				self.data.changed_data = changed_data
				// event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
				return true
			}

			// q_operator. get the input value of the q_operator
			// q_operator: is a separate operator used with components that is impossible mark the operator in the input_value,
			// like; radio_button, check_box, date, autocomplete, etc
			if (e.target.matches('input[type="text"].q_operator')) {
				//get the input node that has changed
				const input = e.target
				// set the changed_data for replace it in the instance data
				// update_data_value. key is the posistion in the data array, the value is the new value
				const value = (input.value.length>0) ? input.value : null
				// update the data in the instance previous to save
				self.data.q_operator = value
				// event to update the dom elements of the instance
				event_manager.publish('change_search_element', self)
				return true
			}
		}, false)//end wrapper.addEventListener('change'


	return true
};//end add_events



/**
* GET_CONTENT_DATA
* @return DOM node content_data
*/
const get_content_data = function(self) {

	const value				= self.data.value
	const datalist			= self.data.datalist
	// const mode			= self.mode
	// const is_inside_tool	= self.is_inside_tool

	const fragment = new DocumentFragment()

	ui.create_dom_element({
		element_type	: 'span',
		class_name		: '',
		inner_html		: 'Working here! (search mode)',
		parent			: fragment
	})

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
};//end get_content_data


