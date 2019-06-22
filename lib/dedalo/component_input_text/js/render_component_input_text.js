/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_input_text = function(options) {

	this.model = "component_input_text"

	this.context 			= options.context
	this.data 				= options.data

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
		const node_type 		= "div"
		const node_class_name 	= this.model + "_edit"

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
}//end edit