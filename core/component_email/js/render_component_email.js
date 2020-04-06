/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_email = function() {

	return true
}//end render_component_email



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_email.prototype.list = async function() {

	const self = this

	// Options vars
		const context	= self.context
		const data		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// Value as string
		const value_string = data.value.join(self.divisor)

	// Set value
		wrapper.textContent = value_string

	return wrapper
}//end list



/**
* EDIT
* Render node for use in modes: edit, edit_in_list
* @return DOM node
*/
render_component_email.prototype.edit = async function(options={render_level : 'full'}) {

	const self 	= this

	self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	// render_level
		const render_level = options.render_level || 'full'

	// content_data
		const content_data = await get_content_data_edit(self)
		if (render_level==='content') {
			return content_data
		}

	// buttons
		const buttons = get_buttons(self)

	// wrapper. ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data,
			buttons 	 : buttons
		})

	// add events
		add_events(self, wrapper)

	return wrapper
}//end edit



/**
* ADD_EVENTS
*/
const add_events = function(self, wrapper) {

	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {
			// change the value of the current dom element
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			changed_node.value = changed_data.value
		}

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {
			// change the value of the current dom element
			const inputs_container 	= wrapper.querySelector('.inputs_container')
			get_input_element_edit(changed_data.key, changed_data.value, inputs_container, self)
		}

	// remove element, subscription to the events
		//		self.events_tokens.push(
		//			event_manager.subscribe('remove_element_'+self.id, remove_element)
		//		)
		//		async function remove_element(component) {
		//			// change all elements inside of content_data
		//			const new_content_data = await render_content_data(component)
		//			// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
		//			wrapper.childNodes[2].replaceWith(new_content_data)
		//		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			// e.stopPropagation()

			// update
			if (e.target.matches('input[type="text"].input_value')) {
				//console.log("++update e.target:",JSON.parse(JSON.stringify(e.target.dataset.key)));
				//console.log("++update e.target value:",JSON.parse(JSON.stringify(e.target.value)));

				const validated = self.verify_email(e.target.value)
				ui.component.error(!validated, e.target)

				if (validated) {
					const changed_data = Object.freeze({
						action	: 'update',
						key		: JSON.parse(e.target.dataset.key),
						value	: (e.target.value.length>0) ? e.target.value : null,
					})
					self.change_value({
						changed_data : changed_data,
						refresh 	 : false
					})
					.then((save_response)=>{
						// event to update the dom elements of the instance
						event_manager.publish('update_value_'+self.id, changed_data)
					})
				}

				return true
			}
		}, false)

	// click event [click]
		wrapper.addEventListener("click", e => {

			// insert
			if (e.target.matches('.button.add')) {

				const changed_data = Object.freeze({
					action	: 'insert',
					key		: self.data.value.length,//self.data.value.length>0 ? self.data.value.length : 1,
					value	: null
				})
				self.change_value({
					changed_data : changed_data,
					refresh 	 : false
				})
				.then((save_response)=>{
					// event to update the dom elements of the instance
					event_manager.publish('add_element_'+self.id, changed_data)
				})

				return true
			}

			// remove
			if (e.target.matches('.button.remove')) {

				// force possible input change before remove
				document.activeElement.blur()

				const changed_data = Object.freeze({
					action	: 'remove',
					key		: e.target.dataset.key,
					value	: null,
					refresh : true
				})
				self.change_value({
					changed_data : changed_data,
					label 		 : e.target.previousElementSibling.value,
					refresh 	 : true
				})
				.then(()=>{
				})

				return true
			}

			if (e.target.matches('.button.email')) {

				self.send_email(e.target)

				return true

			}

		})

	return true
}//end add_events



/**
* SEARCH
* Render node for use in search
* @return DOM node wrapper
*/
render_component_email.prototype.search = async function() {

	const self 	= this

	// fix non value scenarios
		self.data.value = (self.data.value.length<1) ? [null] : self.data.value

	const content_data = await get_content_data_search(self)

	// ui build_edit returns component wrapper
		const wrapper = ui.component.build_wrapper_edit(self, {
			content_data : content_data
		})

	// id
		wrapper.id = self.id

	// Events

		// change event, for every change the value in the imputs of the component
			wrapper.addEventListener('change', (e) => {
				// e.stopPropagation()

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

			}, false)



	return wrapper
}//end search



/**
* GET_CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const get_content_data_edit = async function(self) {

	const value 		= self.data.value
	const mode 			= self.mode
	const is_inside_tool= self.is_inside_tool

	const fragment = new DocumentFragment()

	// inputs
		const inputs_container = ui.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: fragment
		})

	// build values
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_edit(i, inputs_value[i], inputs_container, self)
		}

	// content_data
		const content_data = ui.component.build_content_data(self)
			  content_data.appendChild(fragment)

	return content_data
}//end render_content_data



/**
* GET_BUTTONS
* @param object instance
* @return DOM node buttons_container
*/
const get_buttons = (self) => {

	const is_inside_tool= self.is_inside_tool
	const mode 			= self.mode

	const fragment = new DocumentFragment()

	// button add input
		if(mode==='edit' || mode==='edit_in_list'){ // && !is_inside_tool
			const button_add_input = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: fragment
			})
		}

	// buttons tools
		if (!is_inside_tool) {
			ui.add_tools(self, fragment)
		}

	// buttons container
		const buttons_container = ui.component.build_buttons_container(self)
		buttons_container.appendChild(fragment)


	return buttons_container
}//end get_buttons



/**
* GET_INPUT_ELEMENT_EDIT
* @return dom element li
*/
const get_input_element_edit = (i, current_value, inputs_container, self) => {

	const mode 				= self.mode
	const is_inside_tool	= self.is_inside_tool

	// li
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// input field
		const input = ui.create_dom_element({
			element_type : 'input',
			type 		 : 'text',
			class_name 	 : 'input_value',
			dataset 	 : { key : i },
			value 		 : current_value,
			parent 		 : li
		})

	// button remove
		if((mode==='edit' || 'edit_in_list') && !is_inside_tool){
			const button_remove = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button remove hidden_button',
				dataset			: { key : i },
				parent 			: li
			})

			// button email
			const button_email = ui.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button email hidden_button',
				dataset			: { key : i },
				parent 			: li
			})
		}

	return li
}//end input_element



/**
* GET_CONTENT_DATA_SEARCH
* @return DOM node content_data
*/
const get_content_data_search = async function(self) {

	const value = self.data.value
	const mode 	= self.mode

	const fragment 			= new DocumentFragment()
	const is_inside_tool 	= ui.inside_tool(self)

	// values (inputs)
		const inputs_value = value//(value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			get_input_element_search(i, inputs_value[i], fragment, self)
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
const get_input_element_search = (i, current_value, inputs_container, self) => {

	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'text',
			class_name 		: 'input_value',
			dataset 	 	: { key : i },
			value 		 	: current_value,
			parent 		 	: inputs_container
		})


	return input
}//end get_input_element_search


