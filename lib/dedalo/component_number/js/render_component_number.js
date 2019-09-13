// import
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'
	import {common} from '../../common/js/common.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_number = function() {

	return true
}//end render_component_number



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_number.prototype.list = async function() {

	const self = this

	// Options vars 
		const context 	= self.context
		const data 		= self.data
	
	// Value as string
		const value_string = data.value.join(' | ')

	// Node create
		const node = ui.create_dom_element({
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
render_component_number.prototype.edit = async function() {
	
	const self 	= this
	const value = self.data.value || []

	const content_data = await render_content_data(self)

	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)

		
	// update value, subscription to the changes: if the dom input value was changed, observers dom elements will be changed own value with the observable value
		self.events_tokens.push(
			event_manager.subscribe('update_value_'+self.id, update_value)
		)
		function update_value (changed_data) {

			// change the value of the current dom element
			const changed_node = wrapper.querySelector('input[data-key="'+changed_data.key+'"]')
			//if (changed_node) {
			changed_node.value = changed_data.value
			//}
		}

	// add element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('add_element_'+self.id, add_element)
		)
		function add_element(changed_data) {

			// change the value of the current dom element
			const inputs_container 	= wrapper.querySelector('.inputs_container')
			input_element(changed_data.key, changed_data.value, inputs_container)
		}

	// remove element, subscription to the events
		self.events_tokens.push(
			event_manager.subscribe('remove_element_'+self.id, remove_element)
		)
		async function remove_element(component) {

			// change all elements inside of content_data
			const new_content_data = await render_content_data(component)
			// replace the content_data with the refresh dom elements (imputs, delete buttons, etc)
			wrapper.childNodes[2].replaceWith(new_content_data)
		}

	// change event, for every change the value in the imputs of the component
		wrapper.addEventListener('change', (e) => {
			e.stopPropagation()

			if (e.target.matches('input[type="number"]')) {
				
				//get the input node that has changed
				const input = e.target
				//the dataset.key has the index of correspondence self.data.value index
				const i 	= input.dataset.key
				// set the selected node for change the css
				self.selected_node = wrapper
				// set the changed_data for replace it in the instance data
				// update_data_value. key is the posistion in the data array, the value is the new value				
				const value = (input.value.length>0) ? self.fix_number_format(input.value) : null
				//change the input node with the resolved value (parsed by Number())
				input.value = value
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

				// event for save the component
				self.save(changed_data).then(api_response =>{
					// event to update the dom elements of the instance
					event_manager.publish('update_value_'+self.id, changed_data)
				})
				
				return true
			}
		}, false)

	// click event
		wrapper.addEventListener("click", e => {
			e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper
			console.log("self.data:",self.data);

			if (e.target.matches('.button.add')) {	
				// update_data_value. changed_data key is the posistion in the data array, the value is the new value
				const changed_data = {
					action	: 'insert',
					key	  	: self.data.value.length || 0, 
					value 	: ""
				}
				self.data.changed_data = changed_data
				// update the data in the instance previous to save
				self.update_data_value(changed_data)

				// rebuild_nodes. event to render the component again
				self.save(changed_data).then(api_response =>{
					// event to update the dom elements of the instance
					event_manager.publish('add_element_'+self.id, changed_data)						
				})
				

				return true
			}

			if (e.target.matches('.button.remove')) {

				// update_data_value.
				const changed_data = {
					action	: 'remove',
					key	  	: e.target.dataset.key, 
					value 	: null
				}
				self.data.changed_data = changed_data

				// update the data in the instance previous to save
				self.update_data_value(changed_data)

				// rebuild and save the component
				self.save(changed_data).then(api_response =>{
					event_manager.publish('remove_element_'+self.id, self)
				})
				//event_manager.publish('save_component_'+self.id, self)
				
				return true
			}
		},false)

	// focus event
		wrapper.addEventListener("focus", e => {
			e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('input[type="number"]')) {
				//e.preventDefault()
				// set the button_remove associated to the input selected to visible
			 	const button_remove = e.target.parentNode.querySelector('.remove')
			 	button_remove.classList.remove("hidden2")
			 	//button_remove.style.visibility='visible';
			 	//button_remove.style.display='inline-block';
			 	//button_remove.hidden = false
			 	event_manager.publish('active_component', self)
			}
		},true)

	// blur event
		wrapper.addEventListener("blur", e => {
			e.stopPropagation()

			// selected_node. fix selected node
			self.selected_node = wrapper

			if (e.target.matches('input[type="number"]')) {
				//e.preventDefault()		 	
			 	const button_remove = e.target.parentNode.querySelector('.remove')
			 	button_remove.classList.add("hidden2")
			 	//button_remove.style.visibility='hidden';
			 	//button_remove.hidden = true	
		
			 	return true
			}
		},true)			
		
	return wrapper
}//end edit

/**
* SEARCH
* Render node for use in edit
* @return DOM node wrapper
*/
render_component_number.prototype.search = async function() {
	
	const self 	= this	
	const value = self.data.value || []

	const content_data = await render_content_data(self)

	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)

		wrapper.id = self.id

	return wrapper

}

/**
* RENDER_CONTENT_DATA
* @return DOM node content_data
*/
const render_content_data = async function(self) {

	const value = self.data.value || []

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data","nowrap")

	// inputs 
		const inputs_container = ui.create_dom_element({
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
		const buttons_container = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})

		// button add input
			const button_add_input = ui.create_dom_element({
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
		const li = ui.create_dom_element({
			element_type : 'li',
			parent 		 : inputs_container
		})

	// input field
		const input = ui.create_dom_element({
			element_type 	: 'input',
			type 		 	: 'number',
			dataset 	 	: { key : i },
			value 		 	: current_value,
			parent 		 	: li
		})

	// button remove
		//const button_remove = ui.create_dom_element({
		//	element_type	: 'span',
		//	class_name 		: 'button remove display_none',
		//	dataset			: { key : i },
		//	parent 			: li
		//})
		const button_remove = ui.create_dom_element({
			element_type	: 'div',
			class_name 		: 'button remove hidden2',
			dataset			: { key : i },
			inner_html 		: "pepe",
			parent 			: li
		})
		button_remove.addEventListener("click", (e) => {
			console.log("Pepe:",e);
		})

	return li
}//end input_element


