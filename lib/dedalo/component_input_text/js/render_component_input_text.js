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
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
			
			// inputs 
				const input = common.create_dom_element({
					element_type	: 'input',
					type 			: 'text',
					value 			: inputs_value[i],
					parent 			: content_data
				})
				//input.setAttribute("value",inputs_value[i])
			
			// events 
				// change. saves value on change
					input.addEventListener('change', (e) => {
						event_manager.publish('component_save', self)
					}, false)
				// focus. activate on focus with tab
					input.addEventListener('focus', (e) => {
						event_manager.publish('component_active', self)
					}, false)
				// click. only prevent click propagation to wrapper 
					input.addEventListener('click', (e) => {
						e.stopPropagation()
					}, false)
		}

	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(self, content_data)

			
	return wrapper
}//end edit


