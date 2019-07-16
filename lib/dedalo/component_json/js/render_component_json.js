// import
	import {ui} from '../../common/js/ui.js'

/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_json = function(options) {

	this.context 			= options.context
	this.data 				= options.data

	this.tipo 				= options.tipo
	this.section_tipo		= options.section_tipo
	this.section_id			= options.section_id
	this.mode 				= options.mode
	this.lang 				= options.lang
	this.section_lang 		= options.section_lang
	this.model 				= options.model
	this.id 				= options.id

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

	// Value as string
		if (data.length > 0) {
			const value_string = value.join(' | ')
		}

	// wrapper 
		const wrapper = ui.component.build_wrapper({
			id 		: id,
			tipo 	: tipo,
			model 	: model,
			mode 	: mode
		})

	// label 
		const component_label = ui.component.build_label({			
			mode 	: mode,
			label 	: label,
			parent 	: wrapper
		})

	// content_data	
		const content_data = ui.component.build_content_data({		
			parent : wrapper
		})
		
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

	return wrapper
}//end edit