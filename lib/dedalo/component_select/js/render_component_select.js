/**
* Render_component
* Manages the component's logic and apperance in client side
*/
var render_component_select = new function() {


	'use strict'


	this.model = "component_select"


	/**
	* LIST
	* Render node for use in list
	* @return DOM node
	*/
	this.list = function(options) {

		// Options vars 
			const context 			= options.context
			const data 				= options.data
			const node_type 		= "div"
			const node_class_name 	= this.model + "_list"
		
		// Value as string 
			const value = data.value

		// select object in array
			const value_item = value.reduce(function(carry, item){
				if (item.selected===true) {
					return item
				}
				return carry
			},{})
			const value_string = value_item.label || ''
		
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
	this.edit = function(options) {
		
		// Options vars 
			const context 			= options.context
			const data 				= options.data
			const node_type 		= "div"
			const node_class_name 	= this.model + "_edit"
		
		// Value as string 
			const value_string = "Hello world " + this.model

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



}//end render_component_select