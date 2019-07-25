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

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("nowrap")
		
	
	// inputs 
		const inputs_container = common.create_dom_element({
			element_type	: 'div',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})
		/*
		const input_node = (i) => {
			// inputs for every value of the component
				const input = common.create_dom_element({
					element_type	: 'input',
					type 			: 'text',
					name 			: i+"",
					value 			: inputs_value[i],
					parent 			: inputs_container
				})
			
			// events 
				// update_dom. subscribe to 'update_dom': if the dom was changed by other dom elements the value will be changed
					// event_manager.subscribe('update_dom_'+self.id+'_'+i, (value) => {
					// 	// change the value of the current dom element
					// 	input.value = value
					// })	

				// change. saves value on change the value
					// input.addEventListener('change', (e) => {
					// 	// set the selected node for change the css
					// 	//self.selected_node = input
					// 	self.selected_node = wrapper
					// 	// set the changed_data for replace it in the instance data
					// 	let value = null
					// 	
					// 	if (input.value.length>0) {
					// 		value = input.value
					// 	}
					// 	self.data.changed_data = { key	: i, 
					// 						  value : value }
					// 	// key is the posistion in the data array, the value is the new value
					// 	self.update_data_value()
					// 	// event for save the component
					// 	event_manager.publish('component_save_'+self.id, self)
					// 	// event to update the dom elements of the instance
					// 	event_manager.publish('update_dom_'+self.id+'_'+i, input.value)
					// }, false)
				
				// focus. activate on focus the element with mouse click or tab
					// input.addEventListener('focus', (e) => {
					// 	event_manager.publish('component_active', self)
					// }, false)				
		}//end input_node
		*/
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			//input_node(i)
			common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				name 			: i+"",
				value 			: inputs_value[i],
				parent 			: inputs_container
			})
		}


	// butons 
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
	
		// button remove input
			for (let i = 1; i < value_length; i++) {
				common.create_dom_element({
					element_type	: 'span',
					class_name 		: 'button remove',
					dataset			: { key : i },
					parent 			: buttons_container
				})
			}


	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)


	// delegated events
		// click
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
					event_manager.publish('rebuild_nodes_'+self.id, self)

					return true
				}

				if (e.target.matches('.button.remove')) {

					// update_data_value.
					self.data.changed_data = {
						key	: e.target.dataset.key, 
						value : null
					}
					self.update_data_value()

					// rebuild and save the component
					event_manager.publish('rebuild_nodes_'+self.id, self)
					event_manager.publish('component_save_'+self.id, self)
					
					return true
				}
			},false)
		// change
			wrapper.addEventListener("change", e => {
				e.stopPropagation()

				// selected_node. fix selected node
				self.selected_node = wrapper

				if (e.target.matches('input[type="text"]')) {

					const input = e.target
					const i 	= input.name

					// set the changed_data for replace it in the instance data
					let value = null
					if (input.value.length>0) {
						value = input.value
					}

					// key is the posistion in the data array, the value is the new value
					self.data.changed_data = {
						key	: i, 
						value : value
					}
					self.update_data_value()

					// event for save the component
					event_manager.publish('rebuild_nodes_'+self.id, self)
					event_manager.publish('component_save_'+self.id, self)
					// event to update the dom elements of the instance
					//event_manager.publish('update_dom_'+self.id+'_'+i, input.value)
					
					return true
				}
			},false)
		// focus
			wrapper.addEventListener("focus", e => {
				e.stopPropagation()

				// selected_node. fix selected node
				self.selected_node = wrapper

				if (e.target.matches('input[type="text"]')) {
				 	event_manager.publish('component_active', self)
				 	
				 	return true
				}
			},true)
	

	return wrapper
}//end edit


