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
		
	
	// inputs 
		const inputs_container = common.create_dom_element({
			element_type	: 'div',
			class_name 		: 'inputs_container',
			parent 			: content_data
		})

		const add_input_node = (i) => {

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
					event_manager.subscribe('update_dom_'+self.id+'_'+i, (value) => {
						// change the value of the current dom element
						input.value = value
					})	

				// change. saves value on change the value
					input.addEventListener('change', (e) => {
						// set the selected node for change the css
						//self.selected_node = input
						self.selected_node = wrapper
						// set the changed_data for replace it in the instance data
						let value = null
						
						if (input.value.length>0) {
							value = input.value
						}
						self.changed_data = { key	: i, 
											  value : value }
						// event for save the component
						event_manager.publish('component_save_'+self.id, self)
						//event to update the dom elements of the instance
						event_manager.publish('update_dom_'+self.id+'_'+i, input.value)
					}, false)
				
				// focus. activate on focus the element with mouse click or tab
					input.addEventListener('focus', (e) => {						
						//self.selected_node = e.target
						self.selected_node = wrapper
						event_manager.publish('component_active', self)
					}, false)
				
				// click. only prevent click propagation to wrapper 
					input.addEventListener('click', (e) => {
						e.stopPropagation()
					}, false)
		}//end add_input_node
	
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			add_input_node(i)
		}


	// butons 
		const buttons_container = common.create_dom_element({
			element_type	: 'div',
			class_name 		: 'buttons_container',
			parent 			: content_data
		})

		const add_button_remove = (i) => {
			const remove_input = common.create_dom_element({
					element_type	: 'input',
					type 			: 'button',
					class_name 		: 'link css_input_text_add',
					parent 			: buttons_container
				})
				remove_input.addEventListener("click",function(e){
					const input_to_remove = inputs_container.querySelector("input[name='"+ i + "']")
					if (input_to_remove) {
						input_to_remove.remove()
						this.remove()
						//delete inputs_value[i]

						self.selected_node = wrapper
						self.changed_data = { key	: i,
											  value : null }
						event_manager.publish('component_save_'+self.id, self)
							console.log("inputs_value:",inputs_value);
					}
				},false)
		}//end add_button_remove

		// button +
			const add_input = common.create_dom_element({
					element_type	: 'input',
					type 			: 'button',
					class_name 		: 'link css_input_text_add',
					parent 			: buttons_container
				})
				add_input.addEventListener("click", (e) => {
					// new input
					//const new_input 		= inputs_container.lastChild.cloneNode()
					//	  new_input.name  	= parseInt(new_input.name) + 1
					//	  new_input.value 	= ""
					//inputs_container.appendChild(new_input)

					const last_input = inputs_container.lastChild.cloneNode()
					const i = parseInt(last_input.name) + 1

					add_input_node(i)
					add_button_remove(i)
				})
		
		// buttons remove
			for (let i = 1; i < value_length; i++) {
				add_button_remove(i)
			}


	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)	

			
	return wrapper
}//end edit


