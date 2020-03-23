/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_password = function() {

	return true
}//end render_component_password



/**
* LIST
* Render node for use in list. It shouldn't be use but just in case someone added it to a list the page would work properly
* @return DOM node
*/
render_component_password.prototype.list = async function() {

	const self = this

	// Options vars
		const context 	= self.context
		const data 		= self.data
		const value 	= data.value || []

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = value

	// Set value
		wrapper.textContent = value_string
		wrapper.type = 'password'


	return wrapper
}//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node wrapper
*/
render_component_password.prototype.edit = async function(options={render_level:'full'}) {

	const self = this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})

	// add events
		add_events(self, wrapper)


	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', async (e) => {
			//e.stopPropagation()

			// update
			if (e.target.matches('input[type="password"].password_value')) {

				// Avoid Safari autofill save
				if (!confirm(get_label["seguro"] + " [edit password]")) {
					return false
				}

				// Test password is aceptable string
				const validated = self.validate_password_format(e.target.value)
				ui.component.error(!validated, e.target)

				if (validated) {

					const changed_data = Object.freeze({
						action	: 'update',
						key		: 0,
						value	: (e.target.value.length>0) ? e.target.value : null,
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						//event_manager.publish('update_value_'+self.id, changed_data)
					})

				}

				return true
			}

		}, false)

	return true
}//end add_events


/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const value = self.data.value
	const mode 	= self.mode

	const fragment = new DocumentFragment()

	// inputs container
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// value (input)
		input_element(inputs_container, self)

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.classList.add("nowrap")
			  content_data.appendChild(fragment)


	return content_data
}//end content_data_edit



/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (inputs_container, self) => {

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'password',
			class_name 		: 'password_value',
			value 		 	: 'XXXXXXXXX',
			parent 		 	: li
		})

		input.autocomplete = 'new-password'

	return li
}//end input_element


