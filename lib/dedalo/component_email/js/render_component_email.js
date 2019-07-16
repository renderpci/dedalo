// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_email = function(options) {
		
	return true
}//end render_component_email



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_email.prototype.list = async function(options) {

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
* @return DOM node
*/
render_component_email.prototype.edit = async function(options) {
	
	const self  = this
	const value = self.data.value
		
	// Value as string
		if (value.length > 0) {
			const value_string = value.join(' | ')
		}
	
	// content_data
		const content_data = document.createElement("div")
		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length

	// create ul
		const ul = common.create_dom_element({
			element_type	: 'ul',		
			parent 			: content_data
		})	

		for (let i = 0; i < value_length; i++) {
						
		// create li
			const li = common.create_dom_element({
				element_type	: 'li',
				parent 			: ul
			})	

			const input = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				value 			: inputs_value[i],
				parent 			: li
			})
			// change. saves value on change
					input.addEventListener('change', (e) => {
						event_manager.publish('component_save', self)
					}, false)
					
			//TODO -  this element should be assign with a class that css will show as a button wich will open a new email message addressed to the email
			const btn_iri = common.create_dom_element({
				element_type	: 'div',
				text_content	: 'EMAIL',
				parent 			: li
			})
			const btn_iri2 = common.create_dom_element({
				element_type	: 'div',
				text_content	: 'EMAIL DIV2',
				parent 			: li
			})
		
		}
	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(self, content_data)

	return wrapper
}//end edit


