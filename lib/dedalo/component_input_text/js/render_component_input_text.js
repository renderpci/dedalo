/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_input_text = function(options) {

	this.model = "component_input_text"

	this.context 			= options.context
	this.data 				= options.data

	this.tipo 				= options.tipo
	this.section_tipo		= options.section_tipo
	this.section_id			= options.section_id
	this.mode 				= options.mode
	this.lang 				= options.lang
	this.section_lang 		= options.section_lang
	this.model 				= options.model

}//end render_component_input_text


/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_input_text.prototype.list = function(options) {

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
render_component_input_text.prototype.edit = function(options) {
	
	const self = this
	
	// Options vars 
		const context 			= self.context
		const data 				= self.data || []
		const value 			= data.value || []
		const label 			= context.label
		const node_type 		= "div"
		const model 			= self.model
		const mode 				= 'edit'
		const node_class_name 	= model + "_" + mode
		const tipo 				= self.tipo
		const section_id 		= self.section_id



	// Value as string
		if (data.length > 0) {
			const value_string = data.value.join(' | ')
		}

	// wrapper
		const wrapper = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'wrapper_component ' + model + ' ' + tipo + ' ' + mode + ' ' + section_id
			})

	// label 
		const component_label = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'label',
				inner_html 		: label,
				parent 			: wrapper
			})

	// content_data 
		const content_data = common.create_dom_element({
				element_type	: 'div',
				class_name		: 'content_data',
				parent 			: wrapper
			})

	// inputs
		const value_length = value.length
		for (var i = 0; i < value_length; i++) {
						
			const input = common.create_dom_element({
				element_type	: 'input',
				type 			: 'text',				
				value 			: value[i],
				parent 			: content_data
			})
			//input.setAttribute('value', value[i]);
		}

	// Debug
		//console.log("++ context", context);
		//console.log("++ data:", data);

	return wrapper
}//end edit