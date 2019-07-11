// imports
	import event_manager from '../../page/js/page.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manages the component's logic and apperance in client side
*/
export const render_component_image = function(component) {

	return true
}//end render_component_image



/**
* LIST
* Render node for use in list
* @return DOM node
*/
render_component_image.prototype.list = function(options) {

		const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "img"
		const node_class_name 	= this.model + "_list"

	// url 	
		const value 			= data.value
		const quality 			= "1.5MB"
		const url_object 		= value.filter(item => item.quality===quality)[0]
		const url 				= (typeof url_object==="undefined") ? DEDALO_LIB_BASE_URL + "/themes/default/0.jpg" : url_object.url

	// Node create
		//const node = common.create_dom_element({
		//	element_type	: node_type,
		//	class_name		: node_class_name,
		//	src 			: url
		//})

		const node = common.create_dom_element({
			element_type	: "div",
			class_name		: node_class_name,
			style 			: {
				"background-image" : "url("+url+")"
			}
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
render_component_image.prototype.edit = function(options) {
		
	const self = this

	// Options vars 
		const context 			= self.context
		const data 				= self.data
		const node_type 		= "img"
		const node_class_name 	= this.model + "_edit"
	
	// url 	
		const value 			= data.value
		const quality 			= "1.5MB"
		const url_object 		= value.filter(item => item.quality===quality)[0]
		const url 				= (typeof url_object==="undefined") ? DEDALO_LIB_BASE_URL + "/themes/default/0.jpg" : url_object.url

	// Node create
		//const node = common.create_dom_element({
		//	element_type	: node_type,
		//	class_name		: node_class_name,
		//	src 			: url
		//})
		const content_data = document.createElement("div")

		const image_div = common.create_dom_element({
			element_type	: "div",
			class_name		: node_class_name,
			style 			: {
				"background-image" : "url("+url+")"
			},
			parent 			: content_data
		})

	// ui build_edit returns component wrapper 
		const wrapper =	ui.component.build_edit(self, content_data)

		
	return wrapper
}//end edit