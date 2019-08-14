// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
*/
export const render_component_json = function(options) {

	return true
}//end render_component_json



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_json.prototype.list = function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		
	// Value as string
		const value_string = JSON.stringify(data.value)

	// Node create
		const node = common.create_dom_element({
			element_type	: "div",
			class_name		: self.model + '_list ' + self.tipo,
			text_content 	: value_string
		})

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return node
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_json.prototype.edit = function(options) {
	
	const self = this
	
	// Options vars 
		const context 			= self.context
		const data 				= self.data || []
		const value 			= data.value || []
		const label 			= context.label		
		const model 			= self.model
		const mode 				= 'edit'
		const tipo 				= context.tipo
		const section_id 		= data.section_id
		const id 				= self.id || 'id is not set'

	// content_data	
		const content_data = document.createElement("div")
		
		// create ul
		const ul = common.create_dom_element({
			element_type	: 'ul',		
			parent 			: content_data
		})	

		const inputs_value = (value.length<1) ? [''] : value
		const value_length = inputs_value.length
		for (let i = 0; i < value_length; i++) {
						
			// create li
			const li = common.create_dom_element({
				element_type	: 'li',
				parent 			: ul
			})	

			const textarea = common.create_dom_element({
				element_type	: 'div',
				contenteditable	: true,				
				text_content 	: JSON.stringify(inputs_value[i]),
				parent 			: li
			})

			const btn_save = common.create_dom_element({
				element_type	: 'div',				
				text_content	: 'SAVE',
				parent 			: li
			})
			const json_editor = common.create_dom_element({
				element_type	: 'div',				
				text_content	: 'JSON',
				parent 			: li
			})		
		}

	// ui build_edit returns component wrapper 
		const wrapper = ui.component.build_edit(self, content_data)


	return wrapper
}//end edit


