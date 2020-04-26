/**
* Render_component
* Manages the component's logic and apperance in client side
*/
var render_component_image = new function() {


	'use strict'


	this.model = "component_image"


	/**
	* LIST
	* Render node for use in list
	* @return DOM node
	*/
	this.list = function(options) {

		// Options vars
			const context 			= options.context
			const data 				= options.data
			const node_type 		= "img"
			const node_class_name 	= this.model + "_list"

		// url
			const value 			= data.value
			const quality 			= "1.5MB"
			const url_object 		= value.filter(item => item.quality===quality)[0]
			let url 				= (typeof url_object==="undefined") ? DEDALO_LIB_BASE_URL + "/themes/default/0.jpg" : url_object.url
			// remote images case
			if (url.indexOf('gallica')!==-1) {
				url = url + '.highres'
			}

		// Node create
			const node = common.create_dom_element({
				element_type	: node_type,
				class_name		: node_class_name,
				src 			: url
			})

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



}//end render_component_image
