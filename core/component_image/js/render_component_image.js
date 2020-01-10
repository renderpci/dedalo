/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {event_manager} from '../../common/js/event_manager.js'
	import {ui} from '../../common/js/ui.js'



/**
* Render_component
* Manage the components logic and appearance in client side
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
		const context 	= self.context
		const data 		= self.data

	// wrapper
		const wrapper = ui.component.build_wrapper_list(self, {
			autoload : false
		})

	// url
		const value 			= data.value
		const quality 			= "1.5MB"
		const url_object 		= value.filter(item => item.quality===quality)[0]
		const url 				= (typeof url_object==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : url_object.url

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			parent 			: wrapper
		})

	//const image_div = ui.create_dom_element({
	//	element_type	: "div",
	//	//class_name		: node_class_name,
	//	style 			: {
	//		"background-image" : "url("+url+")"
	//	},
	//	parent 			: wrapper
	//})


	return wrapper
}//end list



/**
* EDIT
* Render node for use in edit
* @return DOM node
*/
render_component_image.prototype.edit = async function(options) {

	const self = this


	const render_level 	= options.render_level

	// content_data
		const current_content_data = await content_data_edit(self)
		if (render_level==='content') {
			return current_content_data
		}

	// ui build_edit returns component wrapper
		const wrapper =	ui.component.build_wrapper_edit(self, {
			content_data : current_content_data
		})


	return wrapper
}//end edit



/**
* CONTENT_DATA_EDIT
* @return DOM node content_data
*/
const content_data_edit = async function(self) {

	const fragment = new DocumentFragment()

	// url
		const value 			= self.data.value
		const quality 			= "1.5MB"
		const url_object 		= value.filter(item => item.quality===quality)[0]
		const url 				= (typeof url_object==="undefined") ? DEDALO_CORE_URL + "/themes/default/0.jpg" : url_object.url

	// image
		const image = ui.create_dom_element({
			element_type	: "img",
			src 			: url,
			class_name 		: 'image',
			parent 			: fragment
		})
		image.setAttribute("tabindex", 0)

	// tools
		// if (!ui.inside_tool(self)) {
		// 	const tools = self.tools
		// 	const tools_length = tools.length

		// 	for (let i = 0; i < tools_length; i++) {
		// 		if(tools[i].show_in_component){
		// 			buttons_container.appendChild( ui.tool.build_tool_button(tools[i], self) );
		// 		}
		// 	}
		// }

	// content_data
		const content_data = document.createElement("div")
			  content_data.classList.add("content_data", self.type)
		content_data.appendChild(fragment)



	return content_data
}//end content_data_edit


