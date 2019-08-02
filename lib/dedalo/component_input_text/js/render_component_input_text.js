// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_input_text = function() {
		
	return true
}//end render_component_input_text



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_input_text.prototype.list = async function() {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
	
	// Value as string 
		const value_string = data.value.join(' | ')

	// Node create
		const node = common.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content 	: value_string
		})

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_input_text.prototype.edit = async function() {
	
	const self 	= this	
	const value = self.data.value

	const content_data = await render_content_data(self)

	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)
		
	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, self.selector, update_value)
		)
		function update_value (component) {
			// change the value of the current dom element
			const changed_data = component.data.changed_data
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			changed_node.value = changed_data.value
		}

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, self.selector, add_element)
		)
		function add_element(component) {
			// change the value of the current dom element
			const changed_data 		= component.data.changed_data
			const inputs_container 	= wrapper.querySelector('.inputs_container')
			input_element(changed_data.key, changed_data.value, inputs_container)
		}
		
	// remove element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('remove_element_'+self.id, self.selector, remove_element)
		)
		async function remove_element(instance) {
			// change all elements inside of content_data
			const new_content_data = await render_content_data(instance)
			// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
			wrapper.childNodes[1].replaceWith(new_content_data)
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			e.stopPropagation()

			if (e.target.matches('input[type="text"]')) {
				
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
				self.data.changed_data = {
					key	  : i, 
					value : value
				}
				self.update_data_value()

				// event for save the component
				event_manager.publish('save_component_'+self.id, self)
				// event to update the dom elements of the instance
				event_manager.publish('update_value_'+self.id, self)

				return true
			}
		}, false)
		
	// click event
		wrapper.addEventListener("click", e => {
			e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('.button.add')) {

				// update_data_value. changed_data key is the posistion in the data array, the value is the new value
				self.data.changed_data = {
					key	  : value.length || 1, 
					value : ""
				}
				self.update_data_value()

				// rebuild_nodes. event to render the component again
				event_manager.publish('add_element_'+self.id, self)

				return true
			}

			if (e.target.matches('.button.remove')) {

				// update_data_value.
				self.data.changed_data = {
					key	  : e.target.dataset.key, 
					value : null
				}
				self.update_data_value()

				// rebuild and save the component
				event_manager.publish('remove_element_'+self.id, self)
				event_manager.publish('save_component_'+self.id, self)
				
				return true
			}
		},false)

	// focus event
		wrapper.addEventListener("focus", e => {
			e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('input[type="text"]')) {
			 	event_manager.publish('active_component', self)
			 	
			 	return true
			}
		},true)


	return wrapper
}//end edit



/**
* RENDER_CONTENT_DATA
* @return DOM node content_data
*/
const render_content_data = async function(self) {

	const value = self.data.value

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data","nowrap")
	
	// inputs 
		const inputs_container = common.create_dom_element({
			element_type	: 'ul',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})
	
	// build values
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			input_element(i, inputs_value[i], inputs_container)
		}

	// buttons 
		const buttons_container = common.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})

		// button add input
			const button_add_input = common.create_dom_element({
				element_type	: 'span',
				class_name 		: 'button add',
				parent 			: buttons_container
			})

	return content_data
}//end render_content_data



/**
* INPUT_ELEMENT
* @return dom element li
*/
const input_element = (i, current_value, inputs_container) => {
			
	// li 
		const li = common.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// input field
		const input = common.create_dom_element({
			element_type : 'input',
			type 		 : 'text',
			dataset 	 : { key : i },
			value 		 : current_value ,
			parent 		 : li
		})

	// button remove
		const button_remove = common.create_dom_element({
			element_type	: 'span',
			class_name 		: 'button remove',
			dataset			: { key : i },
			parent 			: li
		})

	return li
}//end input_element


