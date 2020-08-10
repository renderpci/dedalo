/**
* Render_component
* Manage the components logic and appearance in client side
*/
var render_component_external = new function() {


	'use strict'


	this.model = "component_external"


	/**
	* LIST
	* Render node for use in list
	* @return DOM node
	*/
	this.list = function(options) {

		// Options vars
			const context 			= options.context
			const data 				= options.data

		// Value as string
			const value_string = data.value.join(' | ')

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
	};//end list



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
	};//end edit



};//end render_component_external
