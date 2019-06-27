// import
	import {ui} from '/dedalo/lib/dedalo/common/js/ui.js'

/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_email = function(options) {

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

}//end render_component_email

/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_email.prototype.list = function(options) {

	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "div"
		const node_class_name 	= this.model + "_list"
	
	// Value as string 
		const value_string = data.value.join(' | ')

	// Node create
		const node = common.create_dom_element({
			element_type	: node_type,
			class_name		: node_class_name,
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
render_component_email.prototype.edit = function(options) {
	
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

			const input = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',
				value 			: inputs_value[i],
				parent 			: li
			})
		
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

	return wrapper
}//end edit